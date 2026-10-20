// API мини-приложения. Каждый запрос подписан Telegram (initData) — так сервер знает, кто это.
import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import { InputFile, InlineKeyboard } from 'grammy'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UserRow, HomeworkRow } from './db'
import { type Hub, UserError } from './hub'
import { parsePhotos } from './homework'
import { checkInitData } from './auth'
import { esc } from './bot/render'
import { subjectsOf, dueOptions, recentSlot } from './schedule'
import type { Me, HomeworkInput, GroupInfo, Slot, Settings } from '../shared/types'
import { subjectKey } from '../shared/pretty'
import { DAY, startOfDay } from '../shared/dates'

export type ApiConfig = {
  token: string
  dataDir: string
  storageChat: number | null   // куда складывать фото из приложения (чтобы получить file_id); null — в личку автору
  devUser: boolean             // разработка без Telegram: все запросы — от демо-пользователя
}

type Env = { Variables: { user: UserRow } }

export function createApi(hub: Hub, cfg: ApiConfig) {
  const store = hub.store
  const ruz = store.ruz
  const app = new Hono<Env>()

  app.onError((e, c) => {
    if (e instanceof UserError) return c.json({ error: e.message }, 400)
    if (e instanceof HTTPException) return c.json({ error: e.message }, e.status)
    hub.log('api', e)
    return c.json({ error: 'Что-то сломалось на сервере. Попробуй ещё раз.' }, 500)
  })

  app.use('*', async (c, next) => {
    const auth = c.req.header('authorization') ?? ''
    const raw = auth.startsWith('tma ') ? auth.slice(4) : ''
    const data = checkInitData(raw, cfg.token)
    if (data) c.set('user', store.touch(data.user))
    else if (cfg.devUser) c.set('user', store.touch({ id: 1, first_name: 'Демо', last_name: 'Студент', username: 'demo' }))
    else throw new HTTPException(401, { message: 'Открой приложение из Telegram' })
    await next()
  })

  const me = (c: Context<Env>) => store.user(c.get('user').id)!
  const groupOf = (u: UserRow) => {
    if (!u.group_id) throw new UserError('Сначала выбери группу')
    return u.group_id
  }
  const json = async <T>(c: Context<Env>): Promise<T> => { try { return await c.req.json<T>() } catch { throw new UserError('Неверный запрос') } }
  const visible = (u: UserRow, h: HomeworkRow | undefined): h is HomeworkRow =>
    !!h && (h.group_id === u.group_id || h.author_id === u.id || store.isAdmin(u.id))
  const info = (g: { id: string; number: string; title: string; course: number | null; institution: number }): GroupInfo =>
    ({ id: g.id, number: g.number, title: g.title, course: g.course, institution: g.institution, school: ruz.schoolName(g.institution) })

  // ---------- кто я ----------

  app.get('/me', c => {
    const u = me(c)
    const out: Me = {
      id: u.id, name: store.name(u), role: u.role, verified: !!u.verified, group: store.groupInfo(u.group_id),
      lecturer: u.lecturer_id ? { id: u.lecturer_id, name: u.lecturer_name } : null,
      moderator: store.isModerator(u.id, u.group_id), admin: store.isAdmin(u.id), settings: store.settings(u),
      bot: hub.cfg.bot, members: u.group_id ? store.memberCount(u.group_id) : 0
    }
    return c.json(out)
  })

  app.post('/register', async c => {
    const u = me(c)
    const b = await json<{ role: 'student' | 'teacher'; groupId?: string; lecturerId?: string }>(c)
    if (b.role === 'student') {
      const g = b.groupId ? ruz.group(b.groupId) : undefined
      if (!g) throw new UserError('Такой группы нет в РУЗ')
      store.setStudent(u.id, g.id)
    } else if (b.role === 'teacher') {
      const l = b.lecturerId ? ruz.lecturer(b.lecturerId) : undefined
      if (!l) throw new UserError('Не нашёл преподавателя в РУЗ')
      store.setTeacher(u.id, l.id, l.name)
      if (!store.user(u.id)!.verified) {
        for (const a of store.admins) {
          hub.send(a, `👩‍🏫 Новый преподаватель (из приложения): <b>${esc(l.name)}</b>\n${esc(store.name(u))}${u.username ? ' @' + esc(u.username) : ''} · id ${u.id}`,
            new InlineKeyboard().text('✅ Подтвердить', `tv:${u.id}:1`).text('❌ Это не он', `tv:${u.id}:0`))
        }
      }
    } else throw new UserError('Неверная роль')
    return c.json({ ok: true })
  })

  app.patch('/settings', async c => {
    store.saveSettings(me(c).id, await json<Partial<Settings>>(c))
    return c.json(store.settings(me(c)))
  })

  // ---------- справочник РУЗ ----------

  app.get('/groups', async c => {
    const q = (c.req.query('q') ?? '').trim()
    let list = ruz.searchGroups(q)
    const digits = q.replace(/\D/g, '')
    if (!list.length && digits.length >= 6) list = await ruz.findGroup(digits)
    return c.json(list.map(info))
  })

  app.get('/schools', c => c.json(ruz.schools()))

  app.get('/schools/:id/groups', async c => {
    const inst = Number(c.req.param('id'))
    let list = ruz.groupsOf(inst)
    if (!list.length) { await ruz.loadGroups(inst).catch(() => []); list = ruz.groupsOf(inst) }
    return c.json(list.map(info))
  })

  app.get('/lecturers', c => c.json(ruz.searchLecturers(c.req.query('q') ?? '', 20)))

  // ---------- расписание ----------

  async function mySlots(u: UserRow): Promise<Slot[]> {
    if (u.role === 'teacher' && u.lecturer_id) return hub.lecturerSlots(u.lecturer_id)
    return u.group_id ? hub.groupSlots(u.group_id) : []
  }

  /** Пары с числом ДЗ, которые к ним сдавать */
  app.get('/schedule', async c => {
    const u = me(c)
    const from = startOfDay(Date.now()) + Number(c.req.query('offset') ?? 0) * DAY
    const days = Math.min(21, Math.max(1, Number(c.req.query('days') ?? 7)))
    const slots = (await mySlots(u)).filter(s => s.start >= from && s.start < from + days * DAY)
    const hw = u.group_id ? store.dueBetween(u.group_id, from, from + days * DAY) : []
    for (const s of slots) s.hw = hw.filter(h => Math.abs(h.due - s.start) < 90_000 && subjectKey(h.subject) === subjectKey(s.subject)).length
    return c.json(slots)
  })

  app.get('/subjects', async c => {
    const u = me(c)
    const groups = (c.req.query('groups') ?? '').split(',').filter(Boolean)
    const slots = u.role === 'teacher' ? (await mySlots(u)).filter(s => !groups.length || s.groups?.some(g => groups.includes(g))) : await mySlots(u)
    return c.json(subjectsOf(slots))
  })

  /** Варианты срока: к следующей паре, к следующей практике, через одну, завтра, через неделю */
  app.get('/due', async c => {
    const u = me(c)
    const subject = c.req.query('subject') ?? ''
    const groups = (c.req.query('groups') ?? '').split(',').filter(Boolean)
    let slots = await mySlots(u)
    if (u.role === 'teacher') {
      slots = slots.filter(s => s.groups?.some(g => groups.includes(g)))
      if (!slots.length && groups[0]) {
        const g = (await ruz.findGroup(groups[0]))[0]
        if (g) slots = await hub.groupSlots(g.id)
      }
    }
    const recent = recentSlot(slots, subject)
    const anchor = Number(c.req.query('anchor')) || recent?.start || Date.now()
    const kind = c.req.query('kind') ?? recent?.kind ?? ''
    return c.json({ anchor, kind, options: dueOptions(slots, subject, anchor, kind) })
  })

  /** Пары преподавателя рядом с сегодня: к ним задают ДЗ */
  app.get('/teacher/pairs', async c => {
    const u = me(c)
    if (u.role !== 'teacher' || !u.lecturer_id) return c.json([])
    const now = Date.now()
    const slots = (await hub.lecturerSlots(u.lecturer_id)).filter(s => s.groups?.length && s.start > now - 7 * DAY && s.start < now + 14 * DAY)
    return c.json(slots)
  })

  // ---------- ДЗ ----------

  app.get('/homework', c => {
    const u = me(c)
    const scope = c.req.query('scope') ?? 'up'
    let rows: HomeworkRow[]
    if (u.role === 'teacher') rows = store.byAuthor(u.id, 200)
    else if (scope === 'archive') rows = store.archive(groupOf(u), 200)
    else if (scope === 'trash') {
      if (!store.isModerator(u.id, u.group_id)) throw new UserError('Корзина — только для старост')
      rows = store.trash(groupOf(u))
    } else rows = store.upcoming(groupOf(u))
    const done = store.doneSet(u.id, rows.map(r => r.id))
    return c.json(rows.map(r => store.dto(r, u, done.has(r.id))))
  })

  app.get('/homework/:id', c => {
    const u = me(c)
    const h = store.hw(Number(c.req.param('id')))
    if (!visible(u, h)) throw new HTTPException(404, { message: 'Такого ДЗ нет' })
    return c.json({ hw: store.dto(h, u), history: store.history(h.id) })
  })

  app.post('/homework', async c => {
    const u = me(c)
    const b = await json<HomeworkInput>(c)
    let groups: string[]
    if (u.role === 'teacher') {
      groups = []
      for (const n of b.groups ?? []) { const g = (await ruz.findGroup(n))[0]; if (g) groups.push(g.id) }
      if (!groups.length) throw new UserError('Выберите группы')
    } else groups = [groupOf(u)]
    const input = clean(b)
    if (typeof input.due !== 'number') throw new UserError('Выбери срок')
    const rows = hub.add(u, { ...input, subject: input.subject ?? '', text: input.text ?? '', rule: input.rule ?? 'date' }, groups)
    return c.json(store.dto(rows[0], u))
  })

  app.patch('/homework/:id', async c => {
    const u = me(c)
    const b = await json<Partial<HomeworkInput>>(c)
    const [h] = hub.edit(u, Number(c.req.param('id')), clean(b))
    return c.json(store.dto(h, u))
  })

  app.delete('/homework/:id', c => {
    const u = me(c)
    const [h] = hub.remove(u, Number(c.req.param('id')), true)
    return c.json(store.dto(h, u))
  })

  app.post('/homework/:id/restore', c => {
    const u = me(c)
    const [h] = hub.remove(u, Number(c.req.param('id')), false)
    return c.json(store.dto(h, u))
  })

  app.post('/homework/:id/done', async c => {
    const u = me(c)
    const h = store.hw(Number(c.req.param('id')))
    if (!visible(u, h)) throw new HTTPException(404, { message: 'Такого ДЗ нет' })
    const b = await json<{ done: boolean }>(c)
    return c.json({ done: hub.toggle(u, h.id, !!b.done) })
  })

  // ---------- фото ----------

  app.post('/homework/:id/photos', bodyLimit({ maxSize: 12 * 1024 * 1024, onError: () => { throw new UserError('Фото больше 12 МБ') } }), async c => {
    const u = me(c)
    const h = store.hw(Number(c.req.param('id')))
    if (!h || !store.canEdit(u, h)) throw new UserError('Добавлять фото может автор или староста')
    if (parsePhotos(h.photos).length >= 10) throw new UserError('Не больше 10 фото')
    const body = await c.req.parseBody()
    const file = body.photo
    if (!(file instanceof File) || !file.type.startsWith('image/')) throw new UserError('Нужна картинка')
    const buf = Buffer.from(await file.arrayBuffer())
    // Telegram хранит фото сам: отправляем его в служебный чат (или автору) и запоминаем file_id
    const m = await hub.api.sendPhoto(cfg.storageChat ?? u.id, new InputFile(buf, file.name || 'photo.jpg'), {
      caption: `📎 Фото к ДЗ «${h.subject}»`, disable_notification: true
    })
    const fileId = m.photo?.at(-1)?.file_id
    if (!fileId) throw new UserError('Telegram не принял фото')
    const rows = store.addPhotos(h.id, [fileId])
    hub.changed(rows)
    return c.json(store.dto(rows.find(r => r.id === h.id) ?? rows[0], u))
  })

  app.delete('/homework/:id/photos/:index', c => {
    const u = me(c)
    const h = store.hw(Number(c.req.param('id')))
    if (!h || !store.canEdit(u, h)) throw new UserError('Удалять фото может автор или староста')
    const rows = store.removePhoto(h.id, Number(c.req.param('index')))
    hub.changed(rows)
    return c.json(store.dto(rows.find(r => r.id === h.id) ?? rows[0], u))
  })

  const photoDir = join(cfg.dataDir, 'photos')

  app.get('/photo/:ref', async c => {
    const u = me(c)
    const [hwId, index] = c.req.param('ref').split('-').map(Number)
    const h = store.hw(hwId)
    if (!visible(u, h)) throw new HTTPException(404, { message: 'Нет фото' })
    const fileId = parsePhotos(h.photos)[index]
    if (!fileId) throw new HTTPException(404, { message: 'Нет фото' })
    const path = join(photoDir, createHash('sha1').update(fileId).digest('hex') + '.jpg')
    let buf: Buffer
    try { buf = await readFile(path) } catch {
      const f = await hub.api.getFile(fileId)
      const res = await fetch(`https://api.telegram.org/file/bot${cfg.token}/${f.file_path}`)
      if (!res.ok) throw new HTTPException(502, { message: 'Telegram не отдал фото' })
      buf = Buffer.from(await res.arrayBuffer())
      await mkdir(photoDir, { recursive: true })
      await writeFile(path, buf)
    }
    return c.body(new Uint8Array(buf), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=604800, immutable' })
  })

  return app
}

/** Только известные поля и в разумных пределах */
function clean<T extends Partial<HomeworkInput>>(b: T): HomeworkInput {
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const out: Partial<HomeworkInput> = {
    subject: s(b.subject, 200), text: s(b.text, 3000), due: n(b.due), rule: b.rule === 'pair' || b.rule === 'date' ? b.rule : undefined,
    anchor: n(b.anchor), skip: n(b.skip) !== undefined ? Math.max(0, Math.min(5, Math.round(b.skip!))) : undefined,
    matchKind: s(b.matchKind, 40), dueKind: s(b.dueKind, 40), dueRoom: s(b.dueRoom, 60),
    dueEstimated: typeof b.dueEstimated === 'boolean' ? b.dueEstimated : undefined,
    important: typeof b.important === 'boolean' ? b.important : undefined,
    groups: Array.isArray(b.groups) ? b.groups.filter(g => typeof g === 'string').slice(0, 20) : undefined
  }
  for (const k of Object.keys(out) as (keyof HomeworkInput)[]) if (out[k] === undefined) delete out[k]
  return out as HomeworkInput
}
