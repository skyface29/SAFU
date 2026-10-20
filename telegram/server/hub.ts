// Связующее звено: ДЗ записали в боте или в мини-приложении — разослать группе, обновить посты в чатах,
// подвинуть сроки за парами, вечером напомнить, что сдавать завтра.
import { GrammyError, InlineKeyboard, type Api } from 'grammy'
import type { ChatRow, HomeworkRow, UserRow } from './db'
import { type Store, parsePhotos } from './homework'
import type { HomeworkInput, Slot } from '../shared/types'
import { toSlots } from './schedule'
import * as render from './bot/render'
import { addDays, startOfDay, ymd, dayTime, DAY } from '../shared/dates'

/** Ошибка, которую можно показать человеку как есть */
export class UserError extends Error {}

export type HubConfig = {
  bot: string          // username бота без @
  webappUrl: string    // https://… мини-приложения (пусто — без кнопок приложения)
  appName: string      // короткое имя мини-приложения из BotFather (/newapp) — для ссылок из групп
}

type Job = () => Promise<void>

export class Hub {
  private jobs: Job[] = []
  private running = false
  private chatGap = new Map<number, number>()
  log: (msg: string, e?: unknown) => void = (m, e) => console.warn(m, e ?? '')

  constructor(readonly store: Store, readonly api: Api, readonly cfg: HubConfig) {}

  // ---------- ссылки ----------

  /** Открыть ДЗ: из лички — мини-приложение, из группы — ссылкой */
  appLink(start = ''): string {
    if (this.cfg.appName) return `https://t.me/${this.cfg.bot}/${this.cfg.appName}${start ? `?startapp=${start}` : ''}`
    return `https://t.me/${this.cfg.bot}${start ? `?start=${start}` : ''}`
  }

  botLink(start = '') { return `https://t.me/${this.cfg.bot}${start ? `?start=${start}` : ''}` }

  webapp(path = '') { return this.cfg.webappUrl ? this.cfg.webappUrl.replace(/\/$/, '') + path : '' }

  /** Кнопки под карточкой ДЗ в личке */
  dmKeyboard(h: HomeworkRow, done: boolean): InlineKeyboard {
    const kb = new InlineKeyboard()
    if (h.deleted) return kb
    kb.text(done ? '↩️ Не сделано' : '✅ Сделано', `d:${h.id}`).text('⋯ Ещё', `h:${h.id}`)
    const url = this.webapp(`/?hw=${h.id}`)
    kb.row().text('📋 Все ДЗ', 'l:up')
    if (url) kb.webApp('📱 Открыть', url)
    return kb
  }

  /** Кнопки под постом ДЗ в чате группы */
  chatKeyboard(h: HomeworkRow): InlineKeyboard {
    const kb = new InlineKeyboard()
    if (h.deleted) return kb
    return kb.url('✅ Отметить у себя', this.botLink(`hw${h.id}`)).url('📱 Все ДЗ', this.appLink())
  }

  // ---------- расписание ----------

  async groupSlots(groupId: string, maxAge?: number): Promise<Slot[]> {
    return toSlots(await this.store.ruz.groupSchedule(groupId, maxAge))
  }

  async lecturerSlots(lecturerId: string, maxAge?: number): Promise<Slot[]> {
    return toSlots(await this.store.ruz.lecturerSchedule(lecturerId, maxAge))
  }

  /** Свежее расписание группы → сроки «к паре» переезжают, группе сообщаем */
  async refreshGroup(groupId: string, maxAge = 3 * 3600_000): Promise<number> {
    const slots = await this.groupSlots(groupId, maxAge)
    const moved = this.store.reconcile(groupId, slots)
    for (const m of moved) await this.shifted(m.row, m.before)
    return moved.length
  }

  // ---------- рассылка ----------

  private enqueue(job: Job) {
    this.jobs.push(job)
    if (!this.running) void this.drain()
  }

  private async drain() {
    this.running = true
    while (this.jobs.length) {
      const job = this.jobs.shift()!
      try { await job() } catch (e) { this.log('рассылка', e) }
      // ~25 сообщений в секунду — с запасом до лимита Telegram (30/с)
      await new Promise(r => setTimeout(r, 40))
    }
    this.running = false
  }

  /** Сколько сообщений ещё в очереди — для тестов и /stats */
  pending() { return this.jobs.length + (this.running ? 1 : 0) }

  async idle() { while (this.pending()) await new Promise(r => setTimeout(r, 20)) }

  private async groupPace(chatId: number) {
    // в группы — не чаще раза в 3 секунды (лимит Telegram — 20 сообщений в минуту)
    if (chatId > 0) return
    const wait = (this.chatGap.get(chatId) ?? 0) + 3000 - Date.now()
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    this.chatGap.set(chatId, Date.now())
  }

  private failed(chatId: number, e: unknown) {
    if (e instanceof GrammyError && (e.error_code === 403 || /chat not found|kicked|deactivated/i.test(e.description))) {
      if (chatId > 0) this.store.markBlocked(chatId)
      else this.store.db.run('UPDATE chats SET active = 0 WHERE id = ?', chatId)
      return
    }
    if (e instanceof GrammyError && /not modified/i.test(e.description)) return
    this.log(`сообщение в ${chatId}`, e)
  }

  /** Отправить карточку ДЗ и запомнить сообщение, чтобы потом обновлять его при правках */
  private post(h: HomeworkRow, chatId: number, text: string, kb: InlineKeyboard) {
    this.enqueue(async () => {
      await this.groupPace(chatId)
      try {
        const m = await this.api.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } })
        this.store.db.run('INSERT OR REPLACE INTO posts(hw_id, chat_id, message_id) VALUES(?, ?, ?)', h.id, chatId, m.message_id)
      } catch (e) { this.failed(chatId, e) }
    })
  }

  send(chatId: number, text: string, kb?: InlineKeyboard) {
    this.enqueue(async () => {
      await this.groupPace(chatId)
      try { await this.api.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } }) } catch (e) { this.failed(chatId, e) }
    })
  }

  private chatsOf(groupId: string): ChatRow[] {
    return this.store.db.all<ChatRow>('SELECT * FROM chats WHERE group_id = ? AND active = 1', groupId)
  }

  /** Обновить все разосланные карточки этого ДЗ (в личках — со своей отметкой «сделано») */
  private refreshPosts(h: HomeworkRow) {
    const posts = this.store.db.all<{ chat_id: number; message_id: number }>('SELECT chat_id, message_id FROM posts WHERE hw_id = ?', h.id)
    for (const p of posts) {
      this.enqueue(async () => {
        const dm = p.chat_id > 0
        const done = dm && this.store.isDone(p.chat_id, h.id)
        const text = render.card(this.store, h, { done, title: dm ? undefined : this.chatTitle(h) })
        try {
          await this.api.editMessageText(p.chat_id, p.message_id, text, {
            parse_mode: 'HTML', reply_markup: dm ? this.dmKeyboard(h, done) : this.chatKeyboard(h), link_preview_options: { is_disabled: true }
          })
        } catch (e) {
          if (e instanceof GrammyError && /message to edit not found|can't be edited/i.test(e.description)) {
            this.store.db.run('DELETE FROM posts WHERE hw_id = ? AND chat_id = ?', h.id, p.chat_id)
          } else this.failed(p.chat_id, e)
        }
      })
    }
  }

  private chatTitle(h: HomeworkRow) { return h.author_teacher ? '🆕 <b>Задание от преподавателя</b>' : '🆕 <b>Новое ДЗ</b>' }

  // ---------- записать, изменить, удалить (общая дорога для бота и мини-приложения) ----------

  private recent = new Map<number, number[]>()

  /** Новое ДЗ в одну или несколько групп (преподаватель — на поток). Ошибка — понятным текстом */
  add(author: UserRow, input: HomeworkInput, groupIds: string[], opts: { photos?: string[]; exceptChat?: number; viaChat?: boolean } = {}): HomeworkRow[] {
    const now = Date.now()
    const groups = [...new Set(groupIds.filter(Boolean))]
    if (!groups.length) throw new UserError('Не выбрана группа')
    // из чата группы записывать может любой его участник — чат привязал админ
    if (!opts.viaChat) for (const g of groups) if (!this.store.canAdd(author, g)) throw new UserError('Записывать ДЗ можно только своей группе')
    if (!input.subject?.trim()) throw new UserError('Не указан предмет')
    if (!input.text?.trim() && !opts.photos?.length) throw new UserError('Пустое задание: напиши, что задали, или пришли фото')
    if (!(input.due > now - 2 * DAY && input.due < now + 400 * DAY)) throw new UserError('Странный срок — выбери дату ещё раз')
    const times = (this.recent.get(author.id) ?? []).filter(t => now - t < 3600_000)
    if (times.length >= 40 && !this.store.isAdmin(author.id)) throw new UserError('Слишком много ДЗ за час — попробуй позже')
    this.recent.set(author.id, [...times, now])
    let rows = this.store.create(author, input, groups)
    if (opts.photos?.length) rows = this.store.addPhotos(rows[0].id, opts.photos)
    this.created(rows, author, opts)
    return rows
  }

  edit(user: UserRow, id: number, patch: Partial<HomeworkInput>): HomeworkRow[] {
    const row = this.store.hw(id)
    if (!row || row.deleted) throw new UserError('Такого ДЗ уже нет')
    if (!this.store.canEdit(user, row)) throw new UserError('Править может автор или староста группы')
    if (patch.due !== undefined && !(patch.due > Date.now() - 30 * DAY && patch.due < Date.now() + 400 * DAY)) throw new UserError('Странный срок')
    if (patch.text !== undefined && !patch.text.trim() && !parsePhotos(row.photos).length) throw new UserError('Пустое задание')
    const rows = this.store.update(user, id, patch)
    this.changed(rows)
    return rows
  }

  remove(user: UserRow, id: number, deleted = true): HomeworkRow[] {
    const row = this.store.hw(id)
    if (!row) throw new UserError('Такого ДЗ нет')
    if (!this.store.canEdit(user, row)) throw new UserError('Удалить может автор или староста группы')
    const rows = this.store.setDeleted(user, id, deleted)
    this.changed(rows)
    return rows
  }

  /** Отметка «сделано» — своя у каждого; карточка в личке обновляется */
  toggle(user: UserRow, id: number, value?: boolean): boolean {
    const done = value ?? !this.store.isDone(user.id, id)
    this.store.setDone(user.id, id, done)
    return done
  }

  // ---------- события ДЗ ----------

  /** Новое ДЗ: всем из группы в личку (кроме автора) и в привязанные чаты */
  created(rows: HomeworkRow[], author: UserRow, opts: { exceptChat?: number } = {}) {
    for (const h of rows) {
      const title = this.chatTitle(h)
      for (const u of this.store.members(h.group_id)) {
        if (u.id === author.id || u.blocked || !u.notify_new) continue
        this.post(h, u.id, render.card(this.store, h, { title }), this.dmKeyboard(h, false))
      }
      for (const c of this.chatsOf(h.group_id)) {
        if (!c.post_new || c.id === opts.exceptChat) continue
        this.post(h, c.id, render.card(this.store, h, { title }), this.chatKeyboard(h))
      }
    }
  }

  /** Правка, удаление, возврат из корзины — карточки у всех обновляются на месте */
  changed(rows: HomeworkRow[]) {
    for (const h of rows) this.refreshPosts(h)
  }

  /** Сообщение из чата группы, которое бот уже отправил сам (ответ на /add), — тоже обновлять при правках */
  remember(hwId: number, chatId: number, messageId: number) {
    this.store.db.run('INSERT OR REPLACE INTO posts(hw_id, chat_id, message_id) VALUES(?, ?, ?)', hwId, chatId, messageId)
  }

  /** РУЗ перенёс пару — срок сдвинулся */
  async shifted(h: HomeworkRow, before: number) {
    this.refreshPosts(h)
    const text = `⏰ <b>Срок ДЗ сдвинулся</b>\n${render.esc(h.subject)}: пару перенесли с ${render.esc(dayTime(before))}.\nТеперь сдавать: <b>${render.esc(render.dueLine(h))}</b>`
    for (const u of this.store.members(h.group_id)) {
      if (u.blocked || !u.notify_shift || this.store.isDone(u.id, h.id)) continue
      this.send(u.id, text, this.dmKeyboard(h, false))
    }
  }

  // ---------- вечерние напоминания ----------

  /** Раз в несколько минут: кому пора — сводка «на завтра» (у каждого свой час) */
  eveningTick(now = Date.now()) {
    const hour = new Date(now).getHours()
    const today = ymd(now)
    const from = startOfDay(addDays(now, 1)), to = startOfDay(addDays(now, 2))
    const users = this.store.db.all<UserRow>(`SELECT * FROM users WHERE role = 'student' AND group_id IS NOT NULL AND notify_evening = 1
      AND blocked = 0 AND evening_hour <= ? AND last_evening != ?`, hour, today)
    const byGroup = new Map<string, HomeworkRow[]>()
    for (const u of users) {
      this.store.db.run('UPDATE users SET last_evening = ? WHERE id = ?', today, u.id)
      // опоздали больше чем на 2 часа (бот был выключен) — сегодня уже не шлём
      if (hour - u.evening_hour > 2) continue
      let rows = byGroup.get(u.group_id!)
      if (!rows) { rows = this.store.dueBetween(u.group_id!, from, to); byGroup.set(u.group_id!, rows) }
      const done = this.store.doneSet(u.id, rows.map(r => r.id))
      if (!rows.length || rows.every(r => done.has(r.id))) continue
      const kb = new InlineKeyboard().text('📋 Все ДЗ', 'l:up')
      const url = this.webapp('/')
      if (url) kb.webApp('📱 Открыть', url)
      this.send(u.id, render.evening(rows, done), kb)
    }
    if (hour < 20) return
    const chats = this.store.db.all<ChatRow>(`SELECT * FROM chats WHERE group_id IS NOT NULL AND active = 1 AND evening = 1 AND last_evening != ?`, today)
    for (const c of chats) {
      this.store.db.run('UPDATE chats SET last_evening = ? WHERE id = ?', today, c.id)
      if (hour > 22) continue
      const rows = byGroup.get(c.group_id!) ?? this.store.dueBetween(c.group_id!, from, to)
      if (!rows.length) continue
      this.send(c.id, render.evening(rows, new Set(), false), new InlineKeyboard().url('📱 Все ДЗ', this.appLink()))
    }
  }
}
