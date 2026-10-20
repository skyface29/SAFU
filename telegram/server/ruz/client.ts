// РУЗ для всего вуза: справочник школ и групп, расписание групп и преподавателей.
// Всё кешируется в базе, запросы к ruz.narfu.ru идут по очереди и с паузой — сайт вуза не нагружаем.
import type { DB, GroupRow } from '../db'
import { startOfDay, addDays, monday, DAY } from '../../shared/dates'
import {
  type RuzEvent, type RuzGroup, RUZ_BASE, institutions as KNOWN_INSTITUTIONS, timetableURL, lecturerURL,
  parseHTML, icsLinks, parseICS, sameGroup, lecturerLinks, nameKey, sameLecturer, weekLinks,
  parseLecturerPage, parseGroups, parseInstitutions, eventId
} from './parse'

export type Fetcher = (url: string) => Promise<string>

export const UA = 'Mozilla/5.0 (compatible; ArktikaBot/1.0; +https://github.com/skyface29/safu)'

/** Обычный запрос по сети: UTF-8, а если не вышло — windows-1251 (как в Арктике для Windows) */
export const netFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25_000) })
  const buf = Buffer.from(await res.arrayBuffer())
  if (!res.ok && !buf.length) throw new Error(`HTTP ${res.status}`)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1251').decode(buf) }
}

const SCHOOL_NAMES = new Map(KNOWN_INSTITUTIONS)

export class Ruz {
  private queue: Promise<unknown> = Promise.resolve()
  private last = 0
  private inflight = new Map<string, Promise<RuzEvent[]>>()
  private directoryAt = 0

  constructor(private db: DB, private fetcher: Fetcher = netFetcher, private gap = 350) {}

  /** Запросы к РУЗ — строго по одному, с паузой между ними */
  text(url: string): Promise<string> {
    const run = async () => {
      const wait = this.last + this.gap - Date.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      try { return await this.fetcher(url) } finally { this.last = Date.now() }
    }
    const p = this.queue.then(run, run)
    this.queue = p.catch(() => undefined)
    return p
  }

  // ---------- школы и группы ----------

  schoolName(id: number): string {
    const r = this.db.get<{ name: string }>('SELECT name FROM institutions WHERE id = ?', id)
    return SCHOOL_NAMES.get(id) ?? r?.name ?? `Школа ${id}`
  }

  schools(): { id: number; name: string }[] {
    const rows = this.db.all<{ id: number; name: string }>(
      'SELECT i.id, i.name FROM institutions i WHERE EXISTS (SELECT 1 FROM groups g WHERE g.institution = i.id) ORDER BY i.name')
    if (rows.length) return rows.map(r => ({ id: r.id, name: SCHOOL_NAMES.get(r.id) ?? r.name }))
    return KNOWN_INSTITUTIONS.map(([id, name]) => ({ id, name }))
  }

  async loadInstitutions(): Promise<{ id: number; name: string }[]> {
    let list: { id: number; name: string }[] = []
    try { list = parseInstitutions(await this.text(RUZ_BASE)) } catch { /* нет связи */ }
    if (!list.length) list = KNOWN_INSTITUTIONS.map(([id, name]) => ({ id, name }))
    this.db.tx(() => {
      for (const i of list) this.db.run('INSERT INTO institutions(id, name) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name', i.id, i.name)
    })
    return list
  }

  async loadGroups(institution: number): Promise<RuzGroup[]> {
    const list = parseGroups(await this.text(`${RUZ_BASE}?groups&institution=${institution}`))
    const now = Date.now()
    this.db.tx(() => {
      for (const g of list) {
        this.db.run(`INSERT INTO groups(id, number, title, course, institution, updated) VALUES(?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET number = excluded.number, title = excluded.title, course = excluded.course,
          institution = excluded.institution, updated = excluded.updated`, g.id, g.number, g.title, g.course, institution, now)
      }
    })
    return list
  }

  /** Все группы вуза: школы со стартовой страницы РУЗ и группы каждой школы */
  async refreshDirectory(): Promise<number> {
    this.directoryAt = Date.now()
    let total = 0
    for (const inst of await this.loadInstitutions()) {
      try { total += (await this.loadGroups(inst.id)).length } catch { /* школа недоступна — в другой раз */ }
    }
    // РУЗ не ответил — попробуем при следующем запуске задачи, а не через неделю
    if (total) this.db.kvSet('directory.at', Date.now())
    return total
  }

  group(id: string): GroupRow | undefined {
    return this.db.get<GroupRow>('SELECT * FROM groups WHERE id = ?', id)
  }

  groupsByNumber(number: string): GroupRow[] {
    return this.db.all<GroupRow>('SELECT * FROM groups WHERE number = ? ORDER BY institution', number)
  }

  /** Поиск по номеру: «1516» → все группы, номер которых начинается так */
  searchGroups(q: string, limit = 30): GroupRow[] {
    const digits = q.replace(/\D/g, '')
    if (digits.length >= 2) {
      return this.db.all<GroupRow>('SELECT * FROM groups WHERE number LIKE ? ORDER BY length(number), number LIMIT ?', `${digits}%`, limit)
    }
    const words = q.trim().toLowerCase()
    if (words.length < 3) return []
    return this.db.all<GroupRow>('SELECT * FROM groups WHERE lower(title) LIKE ? ORDER BY number LIMIT ?', `%${words}%`, limit)
  }

  groupsOf(institution: number, course?: number): GroupRow[] {
    if (course) return this.db.all<GroupRow>('SELECT * FROM groups WHERE institution = ? AND course = ? ORDER BY number', institution, course)
    return this.db.all<GroupRow>('SELECT * FROM groups WHERE institution = ? ORDER BY course, number', institution)
  }

  /** Найти группу по номеру; если в справочнике нет — обновить его (не чаще раза в 10 минут) */
  async findGroup(number: string): Promise<GroupRow[]> {
    const have = this.groupsByNumber(number)
    if (have.length) return have
    if (Date.now() - this.directoryAt < 10 * 60_000) return []
    await this.refreshDirectory()
    return this.groupsByNumber(number)
  }

  // ---------- преподаватели ----------

  rememberLecturers(html: string) {
    const found = lecturerLinks(html)
    if (!found.length) return
    const now = Date.now()
    this.db.tx(() => {
      for (const l of found) {
        this.db.run('INSERT INTO lecturers(id, name, surname, updated) VALUES(?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, surname = excluded.surname, updated = excluded.updated',
          l.id, l.name, nameKey(l.name).surname, now)
      }
    })
  }

  lecturer(id: string): { id: string; name: string } | undefined {
    return this.db.get<{ id: string; name: string }>('SELECT id, name FROM lecturers WHERE id = ?', id)
  }

  /** «Иванов», «Иванов И.И.», «иванов иван» → подходящие преподаватели из справочника */
  searchLecturers(q: string, limit = 12): { id: string; name: string }[] {
    const key = nameKey(q)
    if (key.surname.length < 2) return []
    const rows = this.db.all<{ id: string; name: string }>('SELECT id, name FROM lecturers WHERE surname LIKE ? ORDER BY name LIMIT 200', `${key.surname}%`)
    return rows.filter(r => !key.initials.length || sameLecturer(r.name, q)).slice(0, limit)
  }

  lecturerCount(): number {
    return this.db.get<{ n: number }>('SELECT count(*) AS n FROM lecturers')?.n ?? 0
  }

  // ---------- расписание ----------

  cached(owner: string): { events: RuzEvent[]; fetched: number; error: string } | null {
    const r = this.db.get<{ events: string; fetched: number; error: string }>('SELECT events, fetched, error FROM schedules WHERE owner = ?', owner)
    if (!r) return null
    try { return { events: JSON.parse(r.events) as RuzEvent[], fetched: r.fetched, error: r.error } } catch { return null }
  }

  private save(owner: string, fresh: RuzEvent[]) {
    const merged = mergeEvents(this.cached(owner)?.events ?? [], fresh)
    this.db.run(`INSERT INTO schedules(owner, events, fetched, tried, error) VALUES(?, ?, ?, ?, '')
      ON CONFLICT(owner) DO UPDATE SET events = excluded.events, fetched = excluded.fetched, tried = excluded.tried, error = ''`,
      owner, JSON.stringify(merged), Date.now(), Date.now())
    return merged
  }

  private failed(owner: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    this.db.run(`INSERT INTO schedules(owner, events, fetched, tried, error) VALUES(?, '[]', 0, ?, ?)
      ON CONFLICT(owner) DO UPDATE SET tried = excluded.tried, error = excluded.error`, owner, Date.now(), msg)
  }

  /** Пары группы: из кеша, если свежий; иначе из РУЗ. Нет связи — отдаём то, что было */
  groupSchedule(groupId: string, maxAge = 3 * 3600_000): Promise<RuzEvent[]> {
    return this.load(`g:${groupId}`, maxAge, () => this.fetchGroup(groupId))
  }

  lecturerSchedule(lecturerId: string, maxAge = 3 * 3600_000): Promise<RuzEvent[]> {
    return this.load(`l:${lecturerId}`, maxAge, () => this.fetchLecturer(lecturerId))
  }

  private load(owner: string, maxAge: number, fetchFresh: () => Promise<RuzEvent[]>): Promise<RuzEvent[]> {
    const c = this.cached(owner)
    if (c && Date.now() - c.fetched < maxAge) return Promise.resolve(c.events)
    const tried = this.db.get<{ tried: number }>('SELECT tried FROM schedules WHERE owner = ?', owner)?.tried ?? 0
    // после ошибки повторяем не чаще раза в 5 минут
    if (c && c.error && Date.now() - tried < 5 * 60_000) return Promise.resolve(c.events)
    let p = this.inflight.get(owner)
    if (!p) {
      p = fetchFresh()
        .then(fresh => this.save(owner, fresh))
        .catch(e => { this.failed(owner, e); return c?.events ?? [] })
        .finally(() => this.inflight.delete(owner))
      this.inflight.set(owner, p)
    }
    return p
  }

  /** Страница группы + iCal (если он про ту же группу) + следующая неделя, если её нет */
  private async fetchGroup(groupId: string): Promise<RuzEvent[]> {
    const html = await this.text(timetableURL(groupId))
    this.rememberLecturers(html)
    const page = parseHTML(html)
    let extra: RuzEvent[] = []
    for (const link of icsLinks(html).slice(0, 2)) {
      let text = ''
      try { text = await this.text(link) } catch { continue }
      if (!text.includes('BEGIN:VCALENDAR')) continue
      const ics = parseICS(text)
      if (ics.length && !sameGroup(page, ics)) break
      const pageDays = new Set(page.map(e => startOfDay(e.start)))
      extra = ics.filter(e => !pageDays.has(startOfDay(e.start)))
      break
    }
    let events = [...page, ...extra]
    const nextMonday = monday(Date.now()) + 7 * DAY
    if (!events.some(e => e.start >= nextMonday)) {
      const next = weekLinks(html, 'group', groupId).find(w => monday(w.date) === nextMonday)
      if (next) {
        try {
          const h = await this.text(next.url)
          this.rememberLecturers(h)
          events = events.concat(parseHTML(h).filter(e => e.start >= nextMonday))
        } catch { /* следующая неделя — по возможности */ }
      }
    }
    return events
  }

  /** Пары преподавателя по всему вузу: эта неделя и две следующих */
  private async fetchLecturer(id: string, weeks = 3): Promise<RuzEvent[]> {
    const html = await this.text(lecturerURL(id))
    this.rememberLecturers(html)
    let all = parseLecturerPage(html)
    const thisMonday = monday(Date.now())
    const covered = new Set(all.map(e => monday(e.start)))
    const targets = weekLinks(html, 'lecturer', id)
      .filter(l => { const m = monday(l.date); return m > thisMonday && m < thisMonday + weeks * 7 * DAY && !covered.has(m) })
      .filter((l, i, arr) => arr.findIndex(x => monday(x.date) === monday(l.date)) === i)
    for (const t of targets.slice(0, weeks)) {
      try { all = all.concat(parseLecturerPage(await this.text(t.url))) } catch { /* по возможности */ }
    }
    return all
  }

  /** Ночной обход: страницы групп, чтобы знать всех преподавателей вуза (для регистрации преподавателей) */
  async crawlLecturers(limit = 400): Promise<number> {
    const cursor = this.db.kvGet<string>('crawl.cursor', '')
    const rows = this.db.all<{ id: string }>('SELECT id FROM groups WHERE id > ? ORDER BY id LIMIT ?', cursor, limit)
    for (const r of rows) {
      try { this.rememberLecturers(await this.text(timetableURL(r.id))) } catch { /* дальше */ }
      this.db.kvSet('crawl.cursor', r.id)
    }
    if (rows.length < limit) this.db.kvSet('crawl.cursor', '')
    return rows.length
  }
}

/** Свежие пары заменяют сегодняшние и будущие дни; прошлое остаётся (по нему считаем ритм пар) */
export function mergeEvents(old: RuzEvent[], fresh: RuzEvent[], now = Date.now()): RuzEvent[] {
  if (!fresh.length) return old
  const today = startOfDay(now)
  const freshDays = new Set(fresh.map(e => startOfDay(e.start)))
  const upcoming = fresh.filter(e => e.start >= today)
  const lo = upcoming.length ? Math.max(today, startOfDay(Math.min(...upcoming.map(e => e.start)))) : null
  const hi = upcoming.length ? addDays(startOfDay(Math.max(...upcoming.map(e => e.start))), 1) : null
  const kept = old.filter(e => {
    const day = startOfDay(e.start)
    if (freshDays.has(day)) return false
    if (day < today) return true
    return !(lo != null && hi != null && e.start >= lo && e.start < hi)
  })
  const seen = new Set<string>()
  const out: RuzEvent[] = []
  for (const e of [...kept, ...fresh]) { const k = eventId(e); if (!seen.has(k)) { seen.add(k); out.push(e) } }
  const cutoff = now - 150 * DAY
  return out.filter(e => e.start > cutoff).sort((a, b) => a.start - b.start)
}
