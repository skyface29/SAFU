// Telegram-бот: регистрация (студент — группа из РУЗ, преподаватель — себя из РУЗ), запись ДЗ в пару сообщений,
// списки с отметками «сделано», чаты групп (привязка, ДЗ прямо из чата, вечерние сводки).
import { Bot, Context, InlineKeyboard, Keyboard, GrammyError } from 'grammy'
import type { HomeworkRow, UserRow, ChatRow, GroupRow } from '../db'
import { type Hub, UserError } from '../hub'
import { parsePhotos } from '../homework'
import type { DueOption, Slot } from '../../shared/types'
import { subjectsOf, recentSlot, dueOptions, dueHint } from '../schedule'
import { matchSubject, splitQuick, firstWord, groupNumberIn, lecturerIdIn } from './text'
import * as render from './render'
import { esc } from './render'
import { parseDay, startOfDay, addDays, endOfDay, plural, relDay, hm, dayMon, WEEKDAYS_SHORT, DAY } from '../../shared/dates'
import { subjectKey, kindStyle } from '../../shared/pretty'

export type Ctx = Context & { user: UserRow }

type Draft = {
  groups: string[]         // id групп РУЗ
  numbers: string[]        // их номера — для пар преподавателя
  source: 'group' | 'lecturer'
  subject: string
  text: string
  photos: string[]
  anchor: number
  givenKind: string
  important: boolean
  subjects: string[]       // кнопки выбора предмета
  pairs?: { subject: string; kind: string; start: number; groups: string[] }[]
  options?: DueOption[]
  due?: DueOption
  edit?: number            // правим существующее ДЗ, а не создаём
}

type State =
  | { step: 'group' }
  | { step: 'lecturer' }
  | { step: 'subject' | 'text' | 'due' | 'date' | 'confirm'; draft: Draft }
  | { step: 'teacher-groups'; draft: Draft }
  | { step: 'edit-text'; hw: number }

const ANON_ADMIN = 1087968824 // «Анонимный администратор» группы

const MENU_STUDENT = new Keyboard().text('📋 ДЗ').text('🌙 На завтра').row().text('➕ Записать ДЗ').text('⚙️ Настройки').resized().persistent()
const MENU_TEACHER = new Keyboard().text('📋 Мои задания').text('📅 Мои пары').row().text('➕ Задать ДЗ').text('⚙️ Настройки').resized().persistent()

export function setupBot(bot: Bot<Ctx>, hub: Hub) {
  const store = hub.store
  const ruz = store.ruz

  // ---------- состояние диалога (на 30 минут) ----------

  const states = new Map<number, { s: State; at: number }>()
  const getState = (id: number): State | null => {
    const x = states.get(id)
    if (!x || Date.now() - x.at > 30 * 60_000) { states.delete(id); return null }
    return x.s
  }
  const setState = (id: number, s: State) => states.set(id, { s, at: Date.now() })
  const clear = (id: number) => states.delete(id)

  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) ctx.user = store.touch(ctx.from)
    await next()
  })

  const isPrivate = (ctx: Ctx) => ctx.chat?.type === 'private'
  const menu = (u: UserRow) => (u.role === 'teacher' ? MENU_TEACHER : MENU_STUDENT)
  const html = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } }
  const fresh = (ctx: Ctx) => store.user(ctx.from!.id)!

  async function safe(ctx: Ctx, fn: () => Promise<unknown>) {
    try { await fn() } catch (e) {
      if (e instanceof UserError) { await (ctx.callbackQuery ? ctx.answerCallbackQuery({ text: e.message, show_alert: true }) : ctx.reply(`⚠️ ${e.message}`)) ; return }
      if (e instanceof GrammyError && /not modified/i.test(e.description)) { if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {}); return }
      throw e
    }
  }

  // ---------- регистрация ----------

  async function askRole(ctx: Ctx) {
    await ctx.reply(
      '👋 Привет! Я бот домашки САФУ.\n\n<b>Один записал — у всей группы появилось.</b> Сроки сами встают к следующей паре по РУЗ и переезжают, если пару перенесут. Вечером напомню, что сдавать завтра.\n\nКто ты?',
      { ...html, reply_markup: new InlineKeyboard().text('🎓 Я студент', 'reg:s').text('👩‍🏫 Я преподаватель', 'reg:t') })
  }

  async function askGroup(ctx: Ctx) {
    setState(ctx.from!.id, { step: 'group' })
    await ctx.reply('Напиши номер своей группы — например, <b>151621</b>.', { ...html, reply_markup: new InlineKeyboard().text('🏫 Выбрать по школе', 'sch') })
  }

  async function askLecturer(ctx: Ctx) {
    setState(ctx.from!.id, { step: 'lecturer' })
    await ctx.reply('Напишите фамилию и инициалы, как в РУЗ, — например, <b>Иванов И.И.</b>\nМожно прислать ссылку на своё расписание в ruz.narfu.ru.', html)
  }

  async function joinGroup(ctx: Ctx, g: GroupRow) {
    const u = ctx.user
    store.setStudent(u.id, g.id)
    clear(u.id)
    const info = store.groupInfo(g.id)!
    const members = store.memberCount(g.id)
    const active = store.upcoming(g.id).length
    const lines = [
      `✅ Готово! Ты в группе <b>${esc(g.number)}</b> · ${esc(info.school)}${g.course ? `, ${g.course} курс` : ''}.`,
      members > 1 ? `Здесь уже ${members} ${plural(members, 'человек', 'человека', 'человек')} из группы.` : 'Ты первый из группы — позови остальных 👇',
      active ? `Задано: ${active} ${plural(active, 'задание', 'задания', 'заданий')} — /dz` : '',
      '',
      '<b>Как записать ДЗ:</b> просто напиши мне, например «<i>Матан: № 5, 6, стр. 45</i>», или пришли фото доски с подписью. Я спрошу, когда сдавать, и разошлю всей группе.',
      '',
      `Позвать ребят: ${hub.botLink(`g${g.number}`)}`
    ].filter((l, i, a) => l || a[i - 1])
    await ctx.reply(lines.join('\n'), { ...html, reply_markup: menu(fresh(ctx)) })
  }

  async function handleGroupNumber(ctx: Ctx, text: string) {
    const number = groupNumberIn(text)
    if (!number) return ctx.reply('Нужен номер группы цифрами — например, 151621.')
    await ctx.replyWithChatAction('typing')
    const found = await ruz.findGroup(number)
    if (!found.length) return ctx.reply(`Группу ${number} не нашёл в РУЗ 😕 Проверь номер или выбери по школе.`, { reply_markup: new InlineKeyboard().text('🏫 Выбрать по школе', 'sch') })
    if (found.length === 1) return joinGroup(ctx, found[0])
    const kb = new InlineKeyboard()
    for (const g of found) kb.text(`${g.number} · ${ruz.schoolName(g.institution)}`, `g:${g.id}`).row()
    await ctx.reply('Нашлось несколько — какая твоя?', { reply_markup: kb })
  }

  async function handleLecturer(ctx: Ctx, text: string) {
    const id = lecturerIdIn(text)
    if (id) {
      await ctx.replyWithChatAction('typing')
      const slots = await hub.lecturerSlots(id)
      if (!slots.length) return ctx.reply('По этой ссылке в РУЗ нет пар. Проверьте ссылку или напишите фамилию.')
      return confirmLecturer(ctx, id, ruz.lecturer(id)?.name ?? text.replace(/https?:\S+/g, '').trim() ?? 'Преподаватель')
    }
    const list = ruz.searchLecturers(text)
    if (!list.length) {
      const n = ruz.lecturerCount()
      return ctx.reply(n
        ? 'Не нашёл в РУЗ 😕 Напишите фамилию как в расписании или пришлите ссылку на свою страницу в ruz.narfu.ru.'
        : 'Справочник преподавателей ещё собирается. Пришлите ссылку на своё расписание в ruz.narfu.ru — найду сразу.')
    }
    if (list.length === 1) return confirmLecturer(ctx, list[0].id, list[0].name)
    const kb = new InlineKeyboard()
    for (const l of list) kb.text(l.name, `lt:${l.id}`).row()
    await ctx.reply('Выберите себя:', { reply_markup: kb })
  }

  async function confirmLecturer(ctx: Ctx, id: string, name: string) {
    const u = ctx.user
    store.setTeacher(u.id, id, name)
    clear(u.id)
    const slots = await hub.lecturerSlots(id)
    const groups = [...new Set(slots.flatMap(s => s.groups ?? []))].slice(0, 12)
    const me = fresh(ctx)
    await ctx.reply([
      `✅ Здравствуйте, <b>${esc(name)}</b>!`,
      groups.length ? `Нашёл ваши пары у групп: ${groups.join(', ')}.` : 'Пар на ближайшие недели в РУЗ пока нет.',
      '',
      'Задать ДЗ — «➕ Задать ДЗ»: выберите пару, напишите задание, и оно появится у всех студентов этих групп. Видно, сколько человек уже сделали.',
      me.verified ? '' : '\nОтметка «👩‍🏫 от преподавателя» появится после короткой проверки — обычно в течение дня.'
    ].join('\n'), { ...html, reply_markup: menu(me) })
    if (!me.verified) {
      for (const a of store.admins) {
        hub.send(a, `👩‍🏫 Новый преподаватель: <b>${esc(name)}</b> (РУЗ ${esc(id)})\nTelegram: ${esc(store.name(me))}${me.username ? ' @' + esc(me.username) : ''} · id ${me.id}`,
          new InlineKeyboard().text('✅ Подтвердить', `tv:${me.id}:1`).text('❌ Это не он', `tv:${me.id}:0`))
      }
    }
  }

  bot.callbackQuery('reg:s', async ctx => { await ctx.answerCallbackQuery(); await askGroup(ctx) })
  bot.callbackQuery('reg:t', async ctx => { await ctx.answerCallbackQuery(); await askLecturer(ctx) })

  bot.callbackQuery('sch', async ctx => {
    await ctx.answerCallbackQuery()
    const kb = new InlineKeyboard()
    ruz.schools().forEach((s, i) => { kb.text(s.name.length > 40 ? s.name.slice(0, 39) + '…' : s.name, `sc:${s.id}`); if (i % 2) kb.row() })
    await ctx.editMessageText('Выбери школу:', { reply_markup: kb })
  })

  bot.callbackQuery(/^sc:(\d+)$/, async ctx => {
    await ctx.answerCallbackQuery()
    const inst = Number(ctx.match[1])
    let groups = ruz.groupsOf(inst)
    if (!groups.length) { await ruz.loadGroups(inst).catch(() => []); groups = ruz.groupsOf(inst) }
    const courses = [...new Set(groups.map(g => g.course ?? 0))].sort()
    const kb = new InlineKeyboard()
    for (const c of courses) kb.text(c ? `${c} курс` : 'Другие', `sk:${inst}:${c}`)
    kb.row().text('← Школы', 'sch')
    await ctx.editMessageText(`${ruz.schoolName(inst)} — какой курс?`, { reply_markup: kb })
  })

  bot.callbackQuery(/^sk:(\d+):(\d+)$/, async ctx => {
    await ctx.answerCallbackQuery()
    const inst = Number(ctx.match[1]), course = Number(ctx.match[2])
    const groups = ruz.groupsOf(inst).filter(g => (g.course ?? 0) === course).slice(0, 96)
    const kb = new InlineKeyboard()
    groups.forEach((g, i) => { kb.text(g.number, `g:${g.id}`); if (i % 4 === 3) kb.row() })
    kb.row().text('← Курсы', `sc:${inst}`)
    await ctx.editMessageText('Твоя группа:', { reply_markup: kb })
  })

  bot.callbackQuery(/^g:(\d+)$/, async ctx => {
    await ctx.answerCallbackQuery()
    const g = ruz.group(ctx.match[1])
    if (g) await joinGroup(ctx, g)
  })

  bot.callbackQuery(/^lt:(\d+)$/, async ctx => {
    await ctx.answerCallbackQuery()
    const l = ruz.lecturer(ctx.match[1])
    if (l) await confirmLecturer(ctx, l.id, l.name)
  })

  bot.callbackQuery(/^tv:(\d+):([01])$/, async ctx => {
    if (!store.isAdmin(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Только для администратора' })
    const id = Number(ctx.match[1]), ok = ctx.match[2] === '1'
    const t = store.user(id)
    store.verifyTeacher(id, ok)
    await ctx.answerCallbackQuery({ text: ok ? 'Подтверждён' : 'Отклонён' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    await ctx.reply(`${ok ? '✅ Подтверждён' : '❌ Отклонён'}: ${esc(t?.lecturer_name ?? String(id))}`, html)
    hub.send(id, ok ? '✅ Профиль преподавателя подтверждён — ваши задания теперь с отметкой «👩‍🏫 от преподавателя».' : 'Профиль преподавателя не подтвердили. Если это ошибка — напишите разработчику: @skf29. Начать заново: /start')
  })

  // ---------- /start ----------

  bot.command('start', async ctx => {
    const p = ctx.match.trim()
    if (!isPrivate(ctx)) {
      const g = /^g(\d{4,7})$/.exec(p)
      if (g) return bindChat(ctx, g[1])
      return ctx.reply('Я здесь! Привязать чат к группе: /group 151621 · Задано: /dz')
    }
    const u = ctx.user
    clear(u.id)
    const hw = /^hw(\d+)$/.exec(p)
    if (hw && u.role) return showCard(ctx, Number(hw[1]))
    const g = /^g(\d{4,7})$/.exec(p)
    if (g && u.role !== 'teacher') {
      const found = await ruz.findGroup(g[1])
      if (found.length === 1) return joinGroup(ctx, found[0])
    }
    if (!u.role) return askRole(ctx)
    if (u.role === 'student' && !u.group_id) return askGroup(ctx)
    const name = u.role === 'teacher' ? u.lecturer_name : u.first_name
    await ctx.reply(`С возвращением, ${esc(name)}! ${u.role === 'teacher' ? 'Задать ДЗ — «➕ Задать ДЗ».' : 'Что задано — /dz, записать — просто напиши задание.'}`, { ...html, reply_markup: menu(u) })
  })

  bot.command('help', async ctx => {
    if (!isPrivate(ctx)) {
      return ctx.reply([
        '<b>Бот домашки в чате группы</b>',
        '/group 151621 — привязать чат к группе (админ чата)',
        '/add Матан: № 5, 6 — записать ДЗ (срок — к следующей паре)',
        'Ответьте на сообщение с заданием или фото командой /add Матан — запишу его',
        '/dz — что задано, /zavtra — на завтра',
        '/starosta — ответом на сообщение: назначить старосту (может править любые ДЗ)',
        '/evening off — не присылать вечернюю сводку, /post off — не присылать новые ДЗ'
      ].join('\n'), html)
    }
    await ctx.reply([
      '<b>Что я умею</b>',
      '✍️ Напиши задание — «Матан: № 5, 6, стр. 45» или фото доски с подписью — и я разошлю его группе. Срок сам встанет к следующей паре.',
      '📋 /dz — всё, что задано, с отметками «сделано»',
      '🌙 /zavtra — что сдавать завтра',
      '🗂 /archive — что задавали раньше',
      '👥 /invite — ссылка для группы',
      '⚙️ /settings — уведомления',
      '🔁 /group — сменить группу',
      '',
      'В чате группы: добавь меня и напиши /group 151621 — новые ДЗ будут приходить туда.',
      '',
      'Бот сделан в Арктике — приложении для студентов САФУ. Вопросы: @skf29'
    ].join('\n'), html)
  })

  bot.command('privacy', ctx => ctx.reply([
    '<b>Что бот хранит</b>',
    '• Ваш Telegram id, имя и @username — чтобы подписывать, кто записал ДЗ.',
    '• Группу (или ФИО преподавателя из РУЗ) и настройки уведомлений.',
    '• Записанные ДЗ, фото к ним (в самом Telegram) и отметки «сделано».',
    'Расписание берётся из открытого РУЗ САФУ. Пароли, почта и сайты вуза боту не нужны и не передаются. Данные не продаются и никому не передаются.',
    'Удалить себя: /forget'
  ].join('\n'), html))

  bot.command('forget', async ctx => {
    if (!isPrivate(ctx)) return
    const id = ctx.from!.id
    store.db.run('DELETE FROM done WHERE user_id = ?', id)
    store.db.run('DELETE FROM moderators WHERE user_id = ?', id)
    store.db.run(`UPDATE users SET role = NULL, group_id = NULL, lecturer_id = NULL, lecturer_name = '', first_name = '', last_name = '', username = '', blocked = 1 WHERE id = ?`, id)
    clear(id)
    await ctx.reply('Готово: профиль удалён. Записанные вами ДЗ остались у группы без имени. Вернуться — /start', { reply_markup: { remove_keyboard: true } })
  })

  // ---------- группа и настройки ----------

  bot.command(['group', 'bind'], async ctx => {
    if (isPrivate(ctx)) {
      if (ctx.user.role === 'teacher') return ctx.reply('Вы зарегистрированы как преподаватель. Сменить на студента — /start после /forget.')
      if (ctx.match.trim()) return handleGroupNumber(ctx, ctx.match)
      return askGroup(ctx)
    }
    await bindChat(ctx, ctx.match)
  })

  async function settingsView(u: UserRow) {
    const g = store.groupInfo(u.group_id)
    const s = store.settings(u)
    const on = (b: boolean) => (b ? 'вкл' : 'выкл')
    const text = [
      '⚙️ <b>Настройки</b>',
      u.role === 'teacher' ? `Преподаватель: ${esc(u.lecturer_name)}${u.verified ? ' ✅' : ' (на проверке)'}` : g ? `Группа: <b>${esc(g.number)}</b> · ${esc(g.school)}` : 'Группа не выбрана',
      '',
      u.role !== 'teacher' ? `🔔 Новые ДЗ группы — ${on(s.notifyNew)}` : '',
      u.role !== 'teacher' ? `🌙 Вечером «что завтра» — ${on(s.notifyEvening)}, в ${s.eveningHour}:00` : '',
      u.role !== 'teacher' ? `⏰ Пару перенесли — ${on(s.notifyShift)}` : ''
    ].filter(Boolean).join('\n')
    const kb = new InlineKeyboard()
    if (u.role !== 'teacher') {
      kb.text(`🔔 Новые ДЗ: ${on(s.notifyNew)}`, 's:new').row()
        .text(`🌙 Вечером: ${on(s.notifyEvening)}`, 's:eve').text('−1 ч', 's:h-').text('+1 ч', 's:h+').row()
        .text(`⏰ Перенос пары: ${on(s.notifyShift)}`, 's:shift').row()
        .text('🔁 Сменить группу', 's:group')
    }
    return { text, kb }
  }

  bot.command('settings', async ctx => {
    if (!isPrivate(ctx)) return
    const v = await settingsView(ctx.user)
    await ctx.reply(v.text, { ...html, reply_markup: v.kb })
  })

  bot.callbackQuery(/^s:(new|eve|shift|h-|h\+|group)$/, async ctx => {
    const u = ctx.user
    const s = store.settings(u)
    const k = ctx.match[1]
    if (k === 'group') { await ctx.answerCallbackQuery(); return askGroup(ctx) }
    if (k === 'new') s.notifyNew = !s.notifyNew
    if (k === 'eve') s.notifyEvening = !s.notifyEvening
    if (k === 'shift') s.notifyShift = !s.notifyShift
    if (k === 'h-') s.eveningHour = Math.max(15, s.eveningHour - 1)
    if (k === 'h+') s.eveningHour = Math.min(23, s.eveningHour + 1)
    store.saveSettings(u.id, s)
    await ctx.answerCallbackQuery()
    const v = await settingsView(fresh(ctx))
    await safe(ctx, () => ctx.editMessageText(v.text, { ...html, reply_markup: v.kb }))
  })

  bot.command('invite', async ctx => {
    const u = ctx.user
    const g = store.groupInfo(u.group_id)
    if (!g) return ctx.reply('Сначала выбери группу: /group')
    const link = hub.botLink(`g${g.number}`)
    const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Домашка группы ${g.number} — в одном месте. Записал один — видят все 📚`)}`
    await ctx.reply(`Ссылка для группы ${esc(g.number)}:\n${link}\n\nПо ней сразу попадают в твою группу. А ещё меня можно добавить в чат группы — новые ДЗ будут приходить туда.`,
      { ...html, reply_markup: new InlineKeyboard().url('📤 Отправить ребятам', share).row().url('➕ Добавить в чат группы', `https://t.me/${hub.cfg.bot}?startgroup=g${g.number}`) })
  })

  bot.command('stats', async ctx => {
    if (!store.isAdmin(ctx.from!.id)) return
    const s = store.stats()
    await ctx.reply(`👥 ${s.users} (преподавателей ${s.teachers}) · групп ${s.groups} · чатов ${s.chats}\n📚 ДЗ всего ${s.homework}, за неделю ${s.week}\n🏫 групп в справочнике ${store.db.get<{ n: number }>('SELECT count(*) AS n FROM groups')?.n}, преподавателей ${ruz.lecturerCount()}`)
  })

  // ---------- списки ----------

  type Scope = 'up' | 'tm' | 'ar'

  function listRows(u: UserRow, scope: Scope): HomeworkRow[] {
    if (!u.group_id) return []
    if (scope === 'tm') { const from = startOfDay(addDays(Date.now(), 1)); return store.dueBetween(u.group_id, from, from + DAY) }
    if (scope === 'ar') return store.archive(u.group_id, 20)
    return store.upcoming(u.group_id)
  }

  function listView(u: UserRow, scope: Scope) {
    const rows = listRows(u, scope)
    const done = store.doneSet(u.id, rows.map(r => r.id))
    const g = store.groupInfo(u.group_id)
    const titles: Record<Scope, string> = { up: `📋 <b>Домашка ${esc(g?.number ?? '')}</b>`, tm: '🌙 <b>На завтра</b>', ar: '🗂 <b>Что задавали раньше</b>' }
    const empty = scope === 'tm' ? 'На завтра ничего не задано 🎉' : scope === 'ar' ? 'Пока пусто.' : 'Ничего не задано 🎉\nЗаписать: просто напиши мне задание.'
    const text = render.list(scope === 'ar' ? [...rows].reverse() : rows, done, titles[scope], { links: true, empty })
    const kb = new InlineKeyboard()
    if (scope !== 'ar') for (const h of rows.slice(0, 14)) kb.text(render.button(h, done.has(h.id)), `t:${h.id}:${scope}`).row()
    kb.text(scope === 'up' ? '🔄 Обновить' : '📋 Все', 'l:up').text('🌙 Завтра', 'l:tm').text('🗂 Архив', 'l:ar')
    const url = hub.webapp('/')
    if (url) kb.row().webApp('📱 Открыть приложение', url)
    return { text, kb }
  }

  function teacherView(u: UserRow) {
    const rows = store.byAuthor(u.id, 30)
    if (!rows.length) return { text: '📋 Вы пока не задавали ДЗ через бота.\nЗадать — «➕ Задать ДЗ».', kb: new InlineKeyboard().text('➕ Задать ДЗ', 'add') }
    const out = ['📋 <b>Ваши задания</b>']
    for (const h of rows) {
      const d = store.dto(h, u)
      out.push('', `<b>${esc(h.subject)}</b> · ${esc(d.groups.join(', '))}`, `   ${esc(render.dueLine(h))}`, `   ✅ сделали ${d.doneCount} из ${d.memberCount} в боте  /h${h.id}`)
    }
    const kb = new InlineKeyboard().text('➕ Задать ДЗ', 'add').text('🔄', 'l:up')
    const url = hub.webapp('/')
    if (url) kb.row().webApp('📱 Открыть приложение', url)
    return { text: out.join('\n').slice(0, 4000), kb }
  }

  async function sendList(ctx: Ctx, scope: Scope) {
    const u = ctx.user
    if (!u.role) return askRole(ctx)
    if (!isPrivate(ctx)) return chatList(ctx, scope === 'tm')
    const v = u.role === 'teacher' ? teacherView(u) : listView(u, scope)
    await ctx.reply(v.text, { ...html, reply_markup: v.kb })
  }

  bot.command(['dz', 'hw', 'list'], ctx => sendList(ctx, 'up'))
  bot.command(['zavtra', 'tomorrow'], ctx => sendList(ctx, 'tm'))
  bot.command('archive', ctx => sendList(ctx, 'ar'))
  bot.hears(['📋 ДЗ', '📋 Мои задания'], ctx => sendList(ctx, 'up'))
  bot.hears('🌙 На завтра', ctx => sendList(ctx, 'tm'))
  bot.hears('⚙️ Настройки', async ctx => { const v = await settingsView(ctx.user); await ctx.reply(v.text, { ...html, reply_markup: v.kb }) })

  bot.callbackQuery(/^l:(up|tm|ar)$/, async ctx => {
    await ctx.answerCallbackQuery()
    const u = ctx.user
    const v = u.role === 'teacher' ? teacherView(u) : listView(u, ctx.match[1] as Scope)
    await safe(ctx, () => ctx.editMessageText(v.text, { ...html, reply_markup: v.kb }))
  })

  bot.callbackQuery(/^t:(\d+):(up|tm|ar)$/, async ctx => {
    const u = ctx.user
    const id = Number(ctx.match[1])
    const h = store.hw(id)
    if (!h || h.group_id !== u.group_id) return ctx.answerCallbackQuery({ text: 'Это ДЗ уже не в твоей группе' })
    const done = hub.toggle(u, id)
    await ctx.answerCallbackQuery({ text: done ? '✅ Сделано!' : 'Снял отметку' })
    const v = listView(u, ctx.match[2] as Scope)
    await safe(ctx, () => ctx.editMessageText(v.text, { ...html, reply_markup: v.kb }))
  })

  // ---------- карточка ДЗ ----------

  function cardKeyboard(u: UserRow, h: HomeworkRow): InlineKeyboard {
    const kb = new InlineKeyboard()
    if (h.deleted) return store.canEdit(u, h) ? kb.text('↩️ Вернуть', `ur:${h.id}`) : kb
    if (u.role === 'student') kb.text(store.isDone(u.id, h.id) ? '↩️ Не сделано' : '✅ Сделано', `d:${h.id}`)
    if (store.canEdit(u, h)) kb.row().text('✏️ Текст', `et:${h.id}`).text('📅 Срок', `ed:${h.id}`).text(h.important ? '❕ Не важно' : '❗️ Важно', `im:${h.id}`).row().text('🗑 Удалить', `rm:${h.id}`)
    const url = hub.webapp(`/?hw=${h.id}`)
    if (url) kb.row().webApp('📱 В приложении', url)
    return kb
  }

  function cardText(u: UserRow, h: HomeworkRow) {
    const d = store.dto(h, u)
    const extra: string[] = []
    if (d.groups.length > 1) extra.push(`👥 Группы: ${esc(d.groups.join(', '))}`)
    if (d.memberCount) extra.push(`✅ Сделали: ${d.doneCount} из ${d.memberCount}`)
    if (d.editedBy) extra.push(`✏️ Правил(а): ${esc(d.editedBy)}`)
    return [render.card(store, h, { done: d.done }), ...extra].join('\n')
  }

  async function showCard(ctx: Ctx, id: number) {
    const u = ctx.user
    const h = store.hw(id)
    const visible = h && (h.group_id === u.group_id || h.author_id === u.id || store.isAdmin(u.id) || (u.role === 'teacher' && h.author_teacher))
    if (!h || !visible) return ctx.reply('Такого ДЗ не нашёл.')
    const photos = parsePhotos(h.photos)
    if (photos.length === 1) await ctx.replyWithPhoto(photos[0]).catch(() => {})
    else if (photos.length > 1) await ctx.replyWithMediaGroup(photos.slice(0, 10).map(p => ({ type: 'photo' as const, media: p }))).catch(() => {})
    await ctx.reply(cardText(u, h), { ...html, reply_markup: cardKeyboard(u, h) })
  }

  bot.hears(/^\/h(\d+)(@\w+)?$/, ctx => showCard(ctx, Number(ctx.match[1])))
  bot.callbackQuery(/^h:(\d+)$/, async ctx => { await ctx.answerCallbackQuery(); await showCard(ctx, Number(ctx.match[1])) })

  bot.callbackQuery(/^d:(\d+)$/, async ctx => {
    const u = ctx.user
    const id = Number(ctx.match[1])
    const h = store.hw(id)
    if (!h) return ctx.answerCallbackQuery({ text: 'Это ДЗ удалили' })
    const done = hub.toggle(u, id)
    await ctx.answerCallbackQuery({ text: done ? '✅ Сделано!' : 'Снял отметку' })
    // в карточке из рассылки — короткие кнопки, в полной — полные
    const full = ctx.callbackQuery.message?.reply_markup?.inline_keyboard.some(r => r.some(b => 'callback_data' in b && b.callback_data?.startsWith('et:')))
    const text = full ? cardText(u, h) : render.card(store, h, { done, title: ctx.callbackQuery.message?.text?.startsWith('🆕') ? (h.author_teacher ? '🆕 <b>Задание от преподавателя</b>' : '🆕 <b>Новое ДЗ</b>') : undefined })
    await safe(ctx, () => ctx.editMessageText(text, { ...html, reply_markup: full ? cardKeyboard(u, h) : hub.dmKeyboard(h, done) }))
  })

  bot.callbackQuery(/^im:(\d+)$/, ctx => safe(ctx, async () => {
    const h = store.hw(Number(ctx.match[1]))
    if (!h) return
    const [n] = hub.edit(ctx.user, h.id, { important: !h.important })
    await ctx.answerCallbackQuery({ text: n.important ? '❗️ Помечено важным' : 'Снята отметка «важно»' })
    await ctx.editMessageText(cardText(ctx.user, n), { ...html, reply_markup: cardKeyboard(ctx.user, n) }).catch(() => {})
  }))

  bot.callbackQuery(/^rm:(\d+)$/, ctx => safe(ctx, async () => {
    const [n] = hub.remove(ctx.user, Number(ctx.match[1]), true)
    await ctx.answerCallbackQuery({ text: 'Удалено — можно вернуть' })
    await ctx.editMessageText(cardText(ctx.user, n), { ...html, reply_markup: cardKeyboard(ctx.user, n) }).catch(() => {})
  }))

  bot.callbackQuery(/^ur:(\d+)$/, ctx => safe(ctx, async () => {
    const [n] = hub.remove(ctx.user, Number(ctx.match[1]), false)
    await ctx.answerCallbackQuery({ text: 'Вернул' })
    await ctx.editMessageText(cardText(ctx.user, n), { ...html, reply_markup: cardKeyboard(ctx.user, n) }).catch(() => {})
  }))

  bot.callbackQuery(/^et:(\d+)$/, async ctx => {
    const h = store.hw(Number(ctx.match[1]))
    if (!h || !store.canEdit(ctx.user, h)) return ctx.answerCallbackQuery({ text: 'Править может автор или староста' })
    await ctx.answerCallbackQuery()
    setState(ctx.user.id, { step: 'edit-text', hw: h.id })
    await ctx.reply(`Пришли новый текст задания по «${esc(h.subject)}». Сейчас:\n<code>${esc(h.text.slice(0, 1000))}</code>`, { ...html, reply_markup: new InlineKeyboard().text('❌ Отмена', 'x') })
  })

  bot.callbackQuery(/^ed:(\d+)$/, async ctx => {
    const u = ctx.user
    const h = store.hw(Number(ctx.match[1]))
    if (!h || !store.canEdit(u, h)) return ctx.answerCallbackQuery({ text: 'Править может автор или староста' })
    await ctx.answerCallbackQuery()
    const draft = draftFrom(u, h)
    await askDue(ctx, draft)
  })

  function draftFrom(u: UserRow, h: HomeworkRow): Draft {
    const rows = store.batchRows(h)
    return {
      groups: rows.map(r => r.group_id), numbers: rows.map(r => ruz.group(r.group_id)?.number ?? ''), source: u.role === 'teacher' && u.lecturer_id ? 'lecturer' : 'group',
      subject: h.subject, text: h.text, photos: [], anchor: h.anchor, givenKind: h.match_kind, important: !!h.important, subjects: [], edit: h.id
    }
  }

  // ---------- запись ДЗ ----------

  async function draftSlots(u: UserRow, d: Draft): Promise<Slot[]> {
    if (d.source === 'lecturer' && u.lecturer_id) {
      const nums = new Set(d.numbers)
      return (await hub.lecturerSlots(u.lecturer_id)).filter(s => s.groups?.some(g => nums.has(g)))
    }
    return d.groups[0] ? hub.groupSlots(d.groups[0]) : []
  }

  async function startAdd(ctx: Ctx, init: { text?: string; photos?: string[] } = {}) {
    const u = ctx.user
    if (!u.role) return askRole(ctx)
    if (u.role === 'teacher') return teacherAdd(ctx, init)
    if (!u.group_id) return askGroup(ctx)
    const slots = await hub.groupSlots(u.group_id)
    const subjects = subjectsOf(slots)
    const draft: Draft = {
      groups: [u.group_id], numbers: [], source: 'group', subject: '', text: init.text ?? '', photos: init.photos ?? [],
      anchor: Date.now(), givenKind: '', important: false, subjects: subjects.map(s => s.subject)
    }
    if (draft.text) {
      const q = splitQuick(draft.text) ?? firstWord(draft.text)
      const m = q && matchSubject(q.subject, draft.subjects)
      if (q && m) { draft.text = q.text; return pickSubject(ctx, draft, m) }
    }
    setState(u.id, { step: 'subject', draft })
    const kb = new InlineKeyboard()
    subjects.slice(0, 12).forEach((s, i) => { kb.text(`${s.recent ? '🔸 ' : ''}${s.subject}`, `as:${i}`); if (i % 2) kb.row() })
    kb.row().text('❌ Отмена', 'x')
    const ask = draft.text || draft.photos.length ? 'Записать как ДЗ? По какому предмету?' : 'По какому предмету ДЗ?'
    await ctx.reply(`${ask}${subjects.length ? '' : '\n\nНапиши название предмета.'}${subjects.length > 12 ? '\nНет в списке — напиши название.' : ''}`, { reply_markup: kb })
  }

  async function teacherAdd(ctx: Ctx, init: { text?: string; photos?: string[] }) {
    const u = ctx.user
    const slots = u.lecturer_id ? await hub.lecturerSlots(u.lecturer_id) : []
    const now = Date.now()
    const seen = new Set<string>()
    const pairs = slots
      .filter(s => s.groups?.length && s.start > now - 7 * DAY && s.start < now + 7 * DAY)
      .sort((a, b) => score(a) - score(b))
      .filter(s => { const k = subjectKey(s.subject) + '|' + s.groups!.join(','); if (seen.has(k)) return false; seen.add(k); return true })
      .slice(0, 10)
      .map(s => ({ subject: s.subject, kind: s.kind, start: s.start, groups: s.groups! }))
    function score(s: Slot) { return s.start <= now && now - s.end < 3 * 3600_000 ? -1e13 : Math.abs(s.start - now) }
    const draft: Draft = {
      groups: [], numbers: [], source: 'lecturer', subject: '', text: init.text ?? '', photos: init.photos ?? [],
      anchor: now, givenKind: '', important: false, subjects: [], pairs
    }
    setState(u.id, { step: 'subject', draft })
    const kb = new InlineKeyboard()
    pairs.forEach((p, i) => kb.text(`${p.subject} · ${p.groups.join(', ')} · ${WEEKDAYS_SHORT[new Date(p.start).getDay()]} ${dayMon(p.start)} ${hm(p.start)}`, `ap:${i}`).row())
    kb.text('✏️ Другая группа', 'ag').text('❌ Отмена', 'x')
    await ctx.reply(pairs.length ? 'К какой паре задание? Оно появится у всех студентов этих групп.' : 'Пар на неделе в РУЗ не нашёл. Напишите номер группы.', { reply_markup: kb })
    if (!pairs.length) setState(u.id, { step: 'teacher-groups', draft })
  }

  async function pickSubject(ctx: Ctx, draft: Draft, subject: string) {
    const u = ctx.user
    draft.subject = subject
    const slot = recentSlot(await draftSlots(u, draft), subject)
    if (slot && !draft.givenKind) { draft.anchor = slot.start; draft.givenKind = slot.kind }
    if (!draft.text && !draft.photos.length) {
      setState(u.id, { step: 'text', draft })
      return ctx.reply(`Что задали по «${esc(subject)}»? Напиши одним сообщением — можно фото доски с подписью.`, { ...html, reply_markup: new InlineKeyboard().text('❌ Отмена', 'x') })
    }
    return askDue(ctx, draft)
  }

  async function askDue(ctx: Ctx, draft: Draft) {
    const u = ctx.user
    const slots = await draftSlots(u, draft)
    draft.options = dueOptions(slots, draft.subject, draft.anchor, draft.givenKind)
    setState(u.id, { step: 'due', draft })
    const kb = new InlineKeyboard()
    draft.options.forEach((o, i) => kb.text(`${o.label} — ${o.hint.split(' · ').slice(0, o.rule === 'pair' ? 2 : 1).join(' · ')}`, `ad:${i}`).row())
    kb.text('📅 Своя дата', 'ad:date').text('❌ Отмена', 'x')
    const pairs = draft.options.filter(o => o.rule === 'pair').length
    await ctx.reply(`Когда сдавать «${esc(draft.subject)}»?${pairs ? '' : '\n\nПар по этому предмету в РУЗ впереди не нашёл — выбери дату.'}`, { ...html, reply_markup: kb })
  }

  function preview(u: UserRow, d: Draft): HomeworkRow {
    const due = d.due!
    return {
      id: 0, group_id: d.groups[0] ?? '', subject: d.subject, text: d.text, due: due.due, rule: due.rule, anchor: d.anchor, skip: due.skip,
      match_kind: due.matchKind, due_kind: due.kind, due_room: due.room, due_estimated: due.estimated ? 1 : 0, shift_note: '',
      important: d.important ? 1 : 0, photos: JSON.stringify(d.photos), author_id: u.id, author_teacher: u.role === 'teacher' && u.verified ? 1 : 0,
      edited_by: null, batch: '', created: Date.now(), updated: Date.now(), deleted: 0
    }
  }

  const confirmTimers = new Map<number, ReturnType<typeof setTimeout>>()

  /** Подтверждение — с паузой, чтобы альбом из нескольких фото дал одно сообщение, а не пять */
  function askConfirm(ctx: Ctx, draft: Draft, delay = 0) {
    const u = ctx.user
    setState(u.id, { step: 'confirm', draft })
    clearTimeout(confirmTimers.get(u.id))
    confirmTimers.set(u.id, setTimeout(() => {
      confirmTimers.delete(u.id)
      const st = getState(u.id)
      if (st?.step !== 'confirm') return
      const d = st.draft
      const who = d.source === 'lecturer' ? `у студентов групп ${d.numbers.join(', ')}` : 'у всей группы'
      const kb = new InlineKeyboard().text('✅ Сохранить', 'ok').text(d.important ? '❕ Не важно' : '❗️ Важно', 'imp').row()
        .text('✏️ Текст', 'etd').text('📅 Срок', 'edd').text('❌ Отмена', 'x')
      ctx.reply(`Проверь — после сохранения появится ${who}:\n\n${render.card(store, preview(fresh(ctx), d))}`, { ...html, reply_markup: kb }).catch(e => hub.log('подтверждение', e))
    }, delay))
  }

  bot.hears(['➕ Записать ДЗ', '➕ Задать ДЗ'], ctx => startAdd(ctx))
  bot.command('add', async ctx => {
    if (!isPrivate(ctx)) return chatAdd(ctx)
    await startAdd(ctx, ctx.match.trim() ? { text: ctx.match.trim() } : {})
  })
  bot.callbackQuery('add', async ctx => { await ctx.answerCallbackQuery(); await startAdd(ctx) })

  bot.callbackQuery('x', async ctx => {
    clear(ctx.user.id)
    await ctx.answerCallbackQuery({ text: 'Отменил' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
  })

  bot.callbackQuery(/^as:(\d+)$/, async ctx => {
    const st = getState(ctx.user.id)
    await ctx.answerCallbackQuery()
    if (st?.step !== 'subject') return ctx.reply('Это старое меню — начни заново: «➕ Записать ДЗ».')
    const s = st.draft.subjects[Number(ctx.match[1])]
    if (s) { await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {}); await pickSubject(ctx, st.draft, s) }
  })

  bot.callbackQuery(/^ap:(\d+)$/, async ctx => {
    const st = getState(ctx.user.id)
    await ctx.answerCallbackQuery()
    if (st?.step !== 'subject' || !st.draft.pairs) return ctx.reply('Это старое меню — начните заново: «➕ Задать ДЗ».')
    const p = st.draft.pairs[Number(ctx.match[1])]
    if (!p) return
    const groups = await resolveNumbers(p.groups)
    if (!groups.length) return ctx.reply('Не нашёл эти группы в справочнике РУЗ. Попробуйте позже.')
    const d = st.draft
    d.groups = groups.map(g => g.id)
    d.numbers = groups.map(g => g.number)
    if (p.start <= Date.now()) { d.anchor = p.start; d.givenKind = p.kind }
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    await pickSubject(ctx, d, p.subject)
  })

  bot.callbackQuery('ag', async ctx => {
    const st = getState(ctx.user.id)
    await ctx.answerCallbackQuery()
    if (!st || !('draft' in st)) return
    setState(ctx.user.id, { step: 'teacher-groups', draft: st.draft })
    await ctx.reply('Напишите номера групп через запятую — например, 151621, 151622.')
  })

  async function resolveNumbers(numbers: string[]): Promise<GroupRow[]> {
    const out: GroupRow[] = []
    for (const n of numbers) { const g = (await ruz.findGroup(n))[0]; if (g) out.push(g) }
    return out
  }

  bot.callbackQuery(/^ad:(\d+|date)$/, async ctx => {
    const st = getState(ctx.user.id)
    await ctx.answerCallbackQuery()
    if (st?.step !== 'due') return ctx.reply('Это старое меню — начни заново.')
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    if (ctx.match[1] === 'date') {
      setState(ctx.user.id, { step: 'date', draft: st.draft })
      return ctx.reply('Напиши дату: «25.10», «пятница», «завтра». Можно со временем: «25.10 10:10».')
    }
    const o = st.draft.options?.[Number(ctx.match[1])]
    if (!o) return
    st.draft.due = o
    await afterDue(ctx, st.draft)
  })

  async function afterDue(ctx: Ctx, d: Draft) {
    if (d.edit) {
      const o = d.due!
      clear(ctx.user.id)
      const [n] = hub.edit(ctx.user, d.edit, { due: o.due, rule: o.rule, skip: o.skip, matchKind: o.matchKind, dueKind: o.kind, dueRoom: o.room, dueEstimated: o.estimated })
      return ctx.reply(`📅 Срок изменён — у всех обновится.\n\n${cardText(ctx.user, n)}`, { ...html, reply_markup: cardKeyboard(ctx.user, n) })
    }
    askConfirm(ctx, d)
  }

  /** «25.10», «пятница 12:00» → срок; если в этот день есть пара предмета — к её началу */
  async function dateOption(u: UserRow, d: Draft, raw: string): Promise<DueOption | null> {
    const tm = /(\d{1,2})[:.](\d{2})\s*$/.exec(raw.trim())
    const dayPart = tm && raw.trim().length > tm[0].length ? raw.trim().slice(0, -tm[0].length).trim() : raw
    const day = parseDay(dayPart)
    if (day == null) return null
    let due = endOfDay(day), kind = '', room = ''
    if (tm) { const t = new Date(day); t.setHours(+tm[1], +tm[2], 0, 0); due = t.getTime() }
    else {
      const k = subjectKey(d.subject)
      const pair = (await draftSlots(u, d)).find(s => s.start >= day && s.start < day + DAY && subjectKey(s.subject) === k)
      if (pair) { due = pair.start; kind = pair.kind; room = pair.remote ? 'дистант' : pair.room }
    }
    if (due < Date.now() - 3600_000) return null
    return { id: 'custom', label: 'Своя дата', hint: dueHint(due, kind, room), due, rule: 'date', skip: 0, matchKind: '', kind, room, estimated: false }
  }

  bot.callbackQuery('ok', ctx => safe(ctx, async () => {
    const u = fresh(ctx)
    const st = getState(u.id)
    if (st?.step !== 'confirm') return ctx.answerCallbackQuery({ text: 'Уже сохранено или устарело' })
    const d = st.draft
    const o = d.due!
    const rows = hub.add(u, {
      subject: d.subject, text: d.text, due: o.due, rule: o.rule, anchor: d.anchor, skip: o.skip, matchKind: o.matchKind,
      dueKind: o.kind, dueRoom: o.room, dueEstimated: o.estimated, important: d.important
    }, d.groups, { photos: d.photos })
    clear(u.id)
    await ctx.answerCallbackQuery({ text: '✅ Записал!' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    const h = rows[0]
    const members = rows.reduce((n, r) => n + store.memberCount(r.group_id), 0) - (u.role === 'student' ? 1 : 0)
    const chats = rows.reduce((n, r) => n + (store.db.get<{ n: number }>('SELECT count(*) AS n FROM chats WHERE group_id = ? AND active = 1 AND post_new = 1', r.group_id)?.n ?? 0), 0)
    const reach = [members > 0 ? `${members} ${plural(members, 'человек', 'человека', 'человек')} в боте` : '', chats ? `${chats === 1 ? 'чат группы' : `${chats} чата`}` : ''].filter(Boolean).join(' и ')
    const tail = reach ? `Увидят: ${reach}.` : 'Из группы в боте пока только ты — позови ребят: /invite'
    await ctx.reply(`✅ <b>Записал!</b> ${tail}\n\n${cardText(u, h)}`, { ...html, reply_markup: cardKeyboard(u, h) })
  }))

  bot.callbackQuery('imp', async ctx => {
    const st = getState(ctx.user.id)
    if (st?.step !== 'confirm') return ctx.answerCallbackQuery()
    st.draft.important = !st.draft.important
    await ctx.answerCallbackQuery({ text: st.draft.important ? '❗️ Важное' : 'Обычное' })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    askConfirm(ctx, st.draft)
  })

  bot.callbackQuery('etd', async ctx => {
    const st = getState(ctx.user.id)
    await ctx.answerCallbackQuery()
    if (st?.step !== 'confirm') return
    setState(ctx.user.id, { step: 'text', draft: { ...st.draft, text: '' } })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    await ctx.reply('Напиши задание заново:')
  })

  bot.callbackQuery('edd', async ctx => {
    const st = getState(ctx.user.id)
    await ctx.answerCallbackQuery()
    if (st?.step !== 'confirm') return
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    await askDue(ctx, st.draft)
  })

  bot.hears('📅 Мои пары', async ctx => {
    const u = ctx.user
    if (u.role !== 'teacher' || !u.lecturer_id) return
    const slots = (await hub.lecturerSlots(u.lecturer_id)).filter(s => s.end > Date.now() && s.start < Date.now() + 7 * DAY)
    if (!slots.length) return ctx.reply('На неделе пар в РУЗ нет.')
    const out = ['📅 <b>Ваши пары на неделю</b>']
    let day = -1
    for (const s of slots.slice(0, 40)) {
      if (startOfDay(s.start) !== day) { day = startOfDay(s.start); out.push('', `<b>${esc(relDay(s.start).replace(/^./, c => c.toUpperCase()))}</b>`) }
      out.push(`${hm(s.start)} ${kindStyle(s.kind).emoji} ${esc(s.subject)} · ${esc((s.groups ?? []).join(', '))}${s.room ? ` · ауд. ${esc(s.room)}` : ''}`)
    }
    await ctx.reply(out.join('\n').slice(0, 4000), { ...html, reply_markup: new InlineKeyboard().text('➕ Задать ДЗ', 'add') })
  })

  // ---------- текст и фото в личке ----------

  const largest = (ctx: Ctx) => ctx.message?.photo?.at(-1)?.file_id

  bot.on('message:photo', async (ctx, next) => {
    if (!isPrivate(ctx)) return next()
    const u = ctx.user
    const file = largest(ctx)!
    const caption = ctx.message.caption?.trim() ?? ''
    const st = getState(u.id)
    if (st && 'draft' in st && (st.step === 'text' || st.step === 'confirm')) {
      const d = st.draft
      d.photos = [...d.photos, file].slice(0, 10)
      if (caption && !d.text.includes(caption)) d.text = d.text ? `${d.text}\n${caption}` : caption
      if (st.step === 'text') return askDue(ctx, d)
      return askConfirm(ctx, d, 900)
    }
    if (st?.step === 'subject') {
      st.draft.photos = [...st.draft.photos, file].slice(0, 10)
      if (caption) st.draft.text = st.draft.text ? `${st.draft.text}\n${caption}` : caption
      return
    }
    if (!u.role) return askRole(ctx)
    await startAdd(ctx, { text: caption, photos: [file] })
  })

  bot.on('message:text', async (ctx, next) => {
    if (!isPrivate(ctx)) return next()
    const u = ctx.user
    const text = ctx.message.text.trim()
    if (text.startsWith('/')) return ctx.reply('Не знаю такой команды. Что умею — /help')
    const st = getState(u.id)
    if (!st) {
      if (!u.role) return askRole(ctx)
      if (u.role === 'student' && !u.group_id) return askGroup(ctx)
      return startAdd(ctx, { text })
    }
    switch (st.step) {
      case 'group': return handleGroupNumber(ctx, text)
      case 'lecturer': return handleLecturer(ctx, text)
      case 'subject': {
        const m = matchSubject(text, st.draft.subjects) ?? text.slice(0, 120)
        return pickSubject(ctx, st.draft, m.length > 1 ? m.charAt(0).toUpperCase() + m.slice(1) : m)
      }
      case 'teacher-groups': {
        const nums = text.match(/\d{4,7}/g) ?? []
        const groups = await resolveNumbers(nums)
        if (!groups.length) return ctx.reply('Не нашёл такие группы в РУЗ. Напишите номера цифрами, через запятую.')
        const d = st.draft
        d.groups = groups.map(g => g.id)
        d.numbers = groups.map(g => g.number)
        d.source = 'group'
        const subjects = subjectsOf(await hub.groupSlots(d.groups[0]))
        d.subjects = subjects.map(s => s.subject)
        setState(u.id, { step: 'subject', draft: d })
        const kb = new InlineKeyboard()
        subjects.slice(0, 12).forEach((s, i) => { kb.text(s.subject, `as:${i}`); if (i % 2) kb.row() })
        return ctx.reply(`Группы: ${d.numbers.join(', ')}. По какому предмету? Можно написать название.`, { reply_markup: kb.row().text('❌ Отмена', 'x') })
      }
      case 'text': {
        st.draft.text = text
        return askDue(ctx, st.draft)
      }
      case 'due':
      case 'date': {
        const o = await dateOption(u, st.draft, text)
        if (!o) return ctx.reply('Не понял дату 🤔 Напиши, например, «25.10», «пятница» или «завтра».')
        st.draft.due = o
        return afterDue(ctx, st.draft)
      }
      case 'confirm': {
        st.draft.text = text
        return askConfirm(ctx, st.draft)
      }
      case 'edit-text': {
        clear(u.id)
        return safe(ctx, async () => {
          const [n] = hub.edit(u, st.hw, { text })
          await ctx.reply(`✏️ Исправил — у всех обновится.\n\n${cardText(u, n)}`, { ...html, reply_markup: cardKeyboard(u, n) })
        })
      }
    }
  })

  // ---------- чаты групп ----------

  const chatRow = (id: number) => store.db.get<ChatRow>('SELECT * FROM chats WHERE id = ?', id)

  function upsertChat(id: number, title: string, active = true) {
    store.db.run(`INSERT INTO chats(id, title, active, created) VALUES(?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, active = excluded.active`, id, title, active ? 1 : 0, Date.now())
  }

  async function isChatAdmin(ctx: Ctx): Promise<boolean> {
    if (ctx.from?.id === ANON_ADMIN) return true
    try {
      const m = await ctx.getChatMember(ctx.from!.id)
      return m.status === 'creator' || m.status === 'administrator'
    } catch { return false }
  }

  async function bindChat(ctx: Ctx, arg: string) {
    const chat = ctx.chat!
    const number = groupNumberIn(arg)
    const row = chatRow(chat.id)
    if (!number) {
      const cur = row?.group_id ? ruz.group(row.group_id)?.number : null
      return ctx.reply(cur ? `Чат привязан к группе ${cur}. Перепривязать: /group 151621` : 'Напишите номер группы: /group 151621')
    }
    if (!(await isChatAdmin(ctx))) return ctx.reply('Привязать чат к группе может админ чата.')
    const found = await ruz.findGroup(number)
    if (!found.length) return ctx.reply(`Группу ${number} не нашёл в РУЗ 😕`)
    const g = found[0]
    upsertChat(chat.id, 'title' in chat ? chat.title ?? '' : '')
    store.db.run('UPDATE chats SET group_id = ?, added_by = ?, active = 1 WHERE id = ?', g.id, ctx.from!.id, chat.id)
    if (ctx.from!.id !== ANON_ADMIN) {
      store.addModerator(g.id, ctx.from!.id, null)
      const u = ctx.user
      if (!u.role) store.setStudent(u.id, g.id)
    }
    const active = store.upcoming(g.id).length
    await ctx.reply([
      `✅ Чат привязан к группе <b>${esc(g.number)}</b>.`,
      'Сюда буду присылать новые ДЗ, а в 20:00 — что сдавать завтра.',
      'Записать ДЗ прямо отсюда: <code>/add Матан: № 5, 6</code> или ответом на сообщение с заданием — <code>/add Матан</code>.',
      active ? `Уже задано: ${active} — /dz` : '',
      '',
      'Чтобы отмечать сделанное и получать напоминания лично — нажмите кнопку 👇'
    ].filter((l, i, a) => l || a[i - 1]).join('\n'), { ...html, reply_markup: new InlineKeyboard().url('📚 Подключиться', hub.botLink(`g${g.number}`)) })
  }

  async function chatList(ctx: Ctx, tomorrow: boolean) {
    const row = chatRow(ctx.chat!.id)
    if (!row?.group_id) return ctx.reply('Сначала привяжите чат к группе: /group 151621')
    const from = startOfDay(addDays(Date.now(), 1))
    const rows = tomorrow ? store.dueBetween(row.group_id, from, from + DAY) : store.upcoming(row.group_id)
    const g = ruz.group(row.group_id)
    const text = tomorrow ? render.evening(rows, new Set(), false) : render.list(rows, new Set(), `📋 <b>Домашка ${esc(g?.number ?? '')}</b>`)
    await ctx.reply(text, { ...html, reply_markup: new InlineKeyboard().url('✅ Отмечать у себя', hub.botLink(`g${g?.number ?? ''}`)).url('📱 Приложение', hub.appLink()) })
  }

  /** /add в чате группы: «/add Матан: № 5» или ответом на сообщение «/add Матан». Срок — к следующей паре */
  async function chatAdd(ctx: Ctx) {
    const row = chatRow(ctx.chat!.id)
    if (!row?.group_id) return ctx.reply('Сначала привяжите чат к группе: /group 151621')
    const groupId = row.group_id
    let u = ctx.user
    if (!u.role) { store.setStudent(u.id, groupId); u = fresh(ctx) }
    const reply = ctx.message?.reply_to_message
    const args = (ctx.match as string).trim()
    const replied = reply ? (reply.text ?? reply.caption ?? '').trim() : ''
    const photos = reply?.photo ? [reply.photo.at(-1)!.file_id] : []
    const slots = await hub.groupSlots(groupId)
    const subjects = subjectsOf(slots).map(s => s.subject)
    let subject: string | null = null, text = ''
    if (reply) {
      subject = matchSubject(args, subjects)
      text = replied
      if (!subject) { const q = splitQuick(replied); const m = q && matchSubject(q.subject, subjects); if (q && m) { subject = m; text = q.text } }
    } else {
      const q = splitQuick(args)
      subject = q ? matchSubject(q.subject, subjects) : null
      text = q?.text ?? ''
    }
    if (!subject || (!text && !photos.length)) {
      const list = subjects.slice(0, 15).join(', ')
      return ctx.reply(`Формат: <code>/add Предмет: что задали</code>\nили ответом на сообщение с заданием: <code>/add Предмет</code>${list ? `\n\nПредметы группы: ${esc(list)}` : ''}`, html)
    }
    const slot = recentSlot(slots, subject)
    const anchor = slot?.start ?? Date.now()
    const o = dueOptions(slots, subject, anchor, slot?.kind ?? '')[0]
    await safe(ctx, async () => {
      const [h] = hub.add(u, {
        subject, text, due: o.due, rule: o.rule, anchor, skip: o.skip, matchKind: o.matchKind, dueKind: o.kind, dueRoom: o.room, dueEstimated: o.estimated
      }, [groupId], { photos, exceptChat: ctx.chat!.id, viaChat: true })
      const m = await ctx.reply(render.card(store, h, { title: '✅ <b>Записал</b>' }), {
        ...html, reply_parameters: ctx.message ? { message_id: ctx.message.message_id, allow_sending_without_reply: true } : undefined,
        reply_markup: chatAddKeyboard(h)
      })
      hub.remember(h.id, ctx.chat!.id, m.message_id)
    })
  }

  const chatAddKeyboard = (h: HomeworkRow) => hub.chatKeyboard(h).row().text('📅 Другой срок', `cd:${h.id}`)

  bot.callbackQuery(/^cd:(\d+)$/, async ctx => {
    const h = store.hw(Number(ctx.match[1]))
    if (!h || !store.canEdit(ctx.user, h)) return ctx.answerCallbackQuery({ text: 'Срок меняет тот, кто записал, или староста', show_alert: true })
    await ctx.answerCallbackQuery()
    const opts = dueOptions(await hub.groupSlots(h.group_id), h.subject, h.anchor, h.match_kind)
    const kb = new InlineKeyboard()
    opts.forEach((o, i) => kb.text(`${o.label} — ${o.hint.split(' · ')[0]}`, `cs:${h.id}:${i}`).row())
    await ctx.editMessageReplyMarkup({ reply_markup: kb.text('← Назад', `cb:${h.id}`) })
  })

  bot.callbackQuery(/^cb:(\d+)$/, async ctx => {
    await ctx.answerCallbackQuery()
    const h = store.hw(Number(ctx.match[1]))
    if (h) await ctx.editMessageReplyMarkup({ reply_markup: chatAddKeyboard(h) }).catch(() => {})
  })

  bot.callbackQuery(/^cs:(\d+):(\d+)$/, ctx => safe(ctx, async () => {
    const h = store.hw(Number(ctx.match[1]))
    if (!h) return ctx.answerCallbackQuery()
    const o = dueOptions(await hub.groupSlots(h.group_id), h.subject, h.anchor, h.match_kind)[Number(ctx.match[2])]
    if (!o) return ctx.answerCallbackQuery()
    hub.edit(ctx.user, h.id, { due: o.due, rule: o.rule, skip: o.skip, matchKind: o.matchKind, dueKind: o.kind, dueRoom: o.room, dueEstimated: o.estimated })
    await ctx.answerCallbackQuery({ text: `Срок: ${o.hint}` })
  }))

  bot.command('starosta', async ctx => {
    if (isPrivate(ctx)) {
      const u = ctx.user
      if (!u.group_id) return ctx.reply('Сначала выбери группу: /group')
      const mods = store.moderators(u.group_id).map(id => store.name(store.user(id)))
      return ctx.reply(`Старосты группы могут править и удалять любые ДЗ группы.\n${mods.length ? `Сейчас: ${mods.join(', ')}` : 'Пока никого.'}\n\nСтаростой становится админ чата группы, который привязал чат (/group), или тот, кого админ отметит в чате командой /starosta ответом на его сообщение.`)
    }
    const row = chatRow(ctx.chat!.id)
    if (!row?.group_id) return ctx.reply('Сначала привяжите чат: /group 151621')
    if (!(await isChatAdmin(ctx))) return ctx.reply('Назначать старост может админ чата.')
    const target = ctx.message?.reply_to_message?.from
    if (!target || target.is_bot) return ctx.reply('Ответьте этой командой на сообщение человека, которого назначаете старостой.')
    store.touch(target)
    store.addModerator(row.group_id, target.id, ctx.from!.id)
    await ctx.reply(`✅ ${esc(target.first_name)} теперь может править любые ДЗ группы.`, html)
  })

  bot.command(['evening', 'post'], async ctx => {
    if (isPrivate(ctx)) return ctx.reply('Это для чата группы. Свои уведомления — /settings')
    const row = chatRow(ctx.chat!.id)
    if (!row?.group_id) return ctx.reply('Сначала привяжите чат: /group 151621')
    if (!(await isChatAdmin(ctx))) return ctx.reply('Это меняет админ чата.')
    const on = !/off|выкл|нет|0/i.test(ctx.match as string)
    const col = ctx.message?.text?.startsWith('/evening') ? 'evening' : 'post_new'
    store.db.run(`UPDATE chats SET ${col} = ? WHERE id = ?`, on ? 1 : 0, row.id)
    await ctx.reply(col === 'evening' ? (on ? '🌙 Вечерняя сводка включена.' : 'Вечерняя сводка выключена.') : (on ? '🆕 Новые ДЗ буду присылать.' : 'Новые ДЗ больше не присылаю (список — /dz).'))
  })

  bot.on('my_chat_member', async ctx => {
    const chat = ctx.chat
    const status = ctx.myChatMember.new_chat_member.status
    const was = ctx.myChatMember.old_chat_member.status
    if (chat.type === 'private') { if (status === 'kicked') store.markBlocked(chat.id); return }
    if (chat.type === 'channel') return
    if (status === 'member' || status === 'administrator') {
      upsertChat(chat.id, chat.title ?? '')
      if (was === 'left' || was === 'kicked') {
        await ctx.reply('Привет! Я бот домашки САФУ 📚\n\nАдмин чата, привяжите группу: <code>/group 151621</code>\nПосле этого новые ДЗ будут приходить сюда, а записать задание можно прямо из чата: <code>/add Матан: № 5, 6</code>', html).catch(() => {})
      }
    } else if (status === 'left' || status === 'kicked') {
      store.db.run('UPDATE chats SET active = 0 WHERE id = ?', chat.id)
    }
  })

  bot.on('message:migrate_to_chat_id', ctx => {
    const to = ctx.message.migrate_to_chat_id
    store.db.tx(() => {
      store.db.run('DELETE FROM chats WHERE id = ?', to)
      store.db.run('UPDATE chats SET id = ? WHERE id = ?', to, ctx.chat.id)
      store.db.run('DELETE FROM posts WHERE chat_id = ?', ctx.chat.id)
    })
  })

  bot.catch(err => hub.log('бот', err.error))
}

/** Команды в меню «/» */
export async function setCommands(bot: Bot<Ctx>) {
  await bot.api.setMyCommands([
    { command: 'dz', description: 'Что задано' },
    { command: 'zavtra', description: 'Что сдавать завтра' },
    { command: 'add', description: 'Записать ДЗ' },
    { command: 'archive', description: 'Что задавали раньше' },
    { command: 'invite', description: 'Позвать группу' },
    { command: 'settings', description: 'Уведомления' },
    { command: 'group', description: 'Сменить группу' },
    { command: 'help', description: 'Что умеет бот' }
  ], { scope: { type: 'all_private_chats' } })
  await bot.api.setMyCommands([
    { command: 'dz', description: 'Что задано' },
    { command: 'zavtra', description: 'Что сдавать завтра' },
    { command: 'add', description: 'Записать ДЗ: /add Матан: № 5' },
    { command: 'group', description: 'Привязать чат к группе: /group 151621' },
    { command: 'help', description: 'Как пользоваться' }
  ], { scope: { type: 'all_group_chats' } })
}
