// РУЗ САФУ (ruz.narfu.ru): поиск группы, разбор страницы расписания, iCal, страница преподавателя.
// Перенесено из Shared/Ruz.swift один в один.
import { safu } from './bridge'
import { kv } from './kv'
import { startOfDay, monday as mondayOf, moscowDate, DAY, pad } from './date'

export type RuzEvent = {
  start: number
  end: number
  subject: string
  kind: string
  teacher: string
  room: string
  address: string
  note: string
}

export const eventId = (e: RuzEvent) => `${Math.floor(e.start / 1000)}-${e.subject}-${e.room}`

export type RuzResult = { events: RuzEvent[]; method: string; notice?: string }

export const squeeze = (s: string) => s.replace(/\s+/g, ' ').trim()

// ---------- разбор текста пары ----------

export const EventText = {
  kinds: [
    'Лабораторная работа', 'Лабораторные работы', 'Лабораторные занятия', 'Лабораторное занятие',
    'Практическое занятие', 'Практические занятия', 'Дифференцированный зачет', 'Зачет с оценкой',
    'Курсовое проектирование', 'Контрольная работа', 'Консультация', 'Экзамен', 'Семинар',
    'Лекции', 'Лекция', 'Зачет', 'Зачёт'
  ],

  shortKind(k: string) {
    const l = k.toLowerCase()
    if (l.startsWith('лекц')) return 'Лекция'
    if (l.startsWith('практ')) return 'Практика'
    if (l.startsWith('лаб')) return 'Лабораторная'
    return k
  },

  parseLocation(raw: string): { room: string; address: string } {
    const t = squeeze(raw)
    const i = t.indexOf('ауд.')
    if (i < 0) return { room: '', address: t }
    const rest = t.slice(i + 4).trim()
    const comma = rest.indexOf(',')
    if (comma >= 0) return { room: rest.slice(0, comma).trim(), address: rest.slice(comma + 1).trim() }
    return { room: rest, address: '' }
  },

  subjectMarkers: ['ссылка на курс', 'курс лекций', 'http', 'подгруппа', 'поток ', 'онлайн-курс', 'ссылка', 'платформе sakai'],

  cleanSubject(raw: string): { subject: string; extra: string } {
    const t = squeeze(raw)
    const low = t.toLowerCase()
    let cut = -1
    for (const m of EventText.subjectMarkers) {
      const i = low.indexOf(m)
      if (i >= 0 && (cut < 0 || i < cut)) cut = i
    }
    if (cut < 0) return { subject: t, extra: '' }
    const subject = t.slice(0, cut).replace(/^[ ,;:\-–—]+|[ ,;:\-–—]+$/g, '')
    return { subject, extra: squeeze(t.slice(cut)) }
  },

  parse(raw: string) {
    const p = { kind: 'Занятие', subject: '', teacher: '', room: '', address: '', note: '' }
    let t = squeeze(raw)
    for (const k of EventText.kinds) {
      if (t.toLowerCase().startsWith(k.toLowerCase())) {
        p.kind = EventText.shortKind(k)
        t = t.slice(k.length).trim()
        break
      }
    }
    const ai = t.indexOf('ауд.')
    if (ai >= 0) {
      const loc = EventText.parseLocation(t.slice(ai))
      p.room = loc.room
      p.address = loc.address
      t = t.slice(0, ai).trim()
    }
    // Преподаватель — последние скобки с инициалами: «( Яковленкова А.О.)»
    const parens = [...t.matchAll(/\(([^()]*)\)/g)]
    const m = [...parens].reverse().find(x => /[А-ЯЁ]\./.test(x[1]))
    if (m && m.index !== undefined) {
      p.teacher = squeeze(m[1])
      p.subject = squeeze(t.slice(0, m.index))
      p.note = squeeze(t.slice(m.index + m[0].length))
    } else {
      p.subject = t
    }
    const cleaned = EventText.cleanSubject(p.subject)
    p.subject = cleaned.subject
    if (cleaned.extra) p.note = squeeze(cleaned.extra + ' ' + p.note)
    return p
  }
}

// ---------- клиент ----------

export const RUZ_BASE = 'https://ruz.narfu.ru/'

export const institutions: [number, string][] = [
  [3, 'ВШИТАС'], [15, 'Высшая инженерная школа'], [1, 'ВШ естественных наук'],
  [4, 'ВШ соц.-гум. наук'], [28, 'ВШ экономики и права'], [12, 'ВШ энергетики'],
  [13, 'ВШ педагогики и физкультуры'], [36, 'ВШ рыболовства']
]

export const timetableURL = (groupID: string) => `${RUZ_BASE}?timetable&group=${groupID}`
export const lecturerURL = (id: string) => `${RUZ_BASE}?timetable&lecturer=${id}`

export const ruzConfig = { timeout: 25_000, useICS: true }

export async function fetchText(url: string, timeout = ruzConfig.timeout): Promise<string> {
  const r = await safu.net.fetch({ url, timeout })
  if (!r.ok && !r.text) throw new Error(r.error || `HTTP ${r.status}`)
  return r.text
}

export function decodeEntities(s: string): string {
  const map: Record<string, string> = {
    '&nbsp;': ' ', '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'",
    '&laquo;': '«', '&raquo;': '»', '&ndash;': '–', '&mdash;': '—', '&apos;': "'"
  }
  let r = s
  for (const [k, v] of Object.entries(map)) r = r.split(k).join(v)
  return r.replace(/&#(\d+);/g, (_m, n) => { try { return String.fromCodePoint(Number(n)) } catch { return _m } })
}

export const stripTags = (s: string) => squeeze(decodeEntities(s.replace(/<[^>]+>/g, ' ')))

export function htmlToText(html: string): string {
  let s = html
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(div|p|li|tr|h[1-6]|ul|table|section)>/gi, '\n')
  s = s.replace(/<[^>]+>/g, ' ')
  s = decodeEntities(s)
  s = s.replace(/[ \t ]+/g, ' ')
  s = s.replace(/\s*\n\s*/g, '\n')
  return s
}

function stripTrailingPairNumbers(text: string): string {
  let t = text.trim()
  for (;;) {
    const m = /\s+[1-8]$/.exec(t)
    if (!m) break
    const before = t.slice(0, m.index)
    if (before.endsWith('.') || before.endsWith(',') || before.toLowerCase().endsWith('корп')) break
    t = before.trim()
  }
  return t
}

export function parseHTML(html: string): RuzEvent[] {
  let src = html
  const dm = /понедельник|вторник|среда|четверг|пятница|суббота/i.exec(html)
  if (dm) src = html.slice(Math.max(0, dm.index - 1500))
  const text = htmlToText(src)
  const days = [...text.matchAll(/(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье),?\s*(\d{2})\.(\d{2})\.(\d{4})/gi)]
  const out: RuzEvent[] = []
  days.forEach((d, i) => {
    const from = d.index! + d[0].length
    const to = i + 1 < days.length ? days[i + 1].index! : text.length
    if (to <= from) return
    const block = text.slice(from, to)
    const day = Number(d[2]) || 1, month = Number(d[3]) || 1, year = Number(d[4]) || 2026
    const evs = [...block.matchAll(/(?:^|\s)([1-8])\s+(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g)]
    evs.forEach((m, j) => {
      const tFrom = m.index! + m[0].length
      const tTo = j + 1 < evs.length ? evs[j + 1].index! : block.length
      if (tTo <= tFrom) return
      const body = stripTrailingPairNumbers(squeeze(block.slice(tFrom, tTo).replace(/\n/g, ' ')))
      if (body.length <= 2) return
      const start = moscowDate(year, month, day, Number(m[2]) || 8, Number(m[3]) || 0)
      const end = moscowDate(year, month, day, Number(m[4]) || 9, Number(m[5]) || 35)
      const p = EventText.parse(body)
      out.push({ start, end, subject: p.subject, kind: p.kind, teacher: p.teacher, room: p.room, address: p.address, note: p.note })
    })
  })
  return out
}

export function icsLinks(html: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    let href = decodeEntities(m[1])
    const l = href.toLowerCase()
    if (!(l.includes('ical') || l.includes('.ics') || l.includes('calendar') || l.startsWith('webcal'))) continue
    if (l.startsWith('webcal://')) href = 'https://' + href.slice('webcal://'.length)
    let abs: string
    if (/^http/i.test(href)) abs = href
    else if (href.startsWith('//')) abs = 'https:' + href
    else if (href.startsWith('/')) abs = 'https://ruz.narfu.ru' + href
    else abs = RUZ_BASE + href
    if (!seen.has(abs)) { seen.add(abs); out.push(abs) }
  }
  return out
}

/** iCal должен совпадать со страницей группы в общие дни: иначе это чужой календарь */
export function sameGroup(page: RuzEvent[], ics: RuzEvent[]): boolean {
  if (!page.length) return true
  const pageDays = new Set(page.map(e => startOfDay(e.start)))
  const key = (e: RuzEvent) => `${Math.floor(e.start / 1000)}|${e.subject.toLowerCase().slice(0, 12)}`
  const pageKeys = new Set(page.map(key))
  const shared = ics.filter(e => pageDays.has(startOfDay(e.start)))
  if (shared.length < 2) return true
  const match = shared.filter(e => pageKeys.has(key(e))).length
  return match / shared.length >= 0.5
}

export async function findGroupID(number: string, institution: number, searchAll = true): Promise<string | null> {
  const order = [institution, ...(searchAll ? institutions.map(i => i[0]).filter(i => i !== institution) : [])]
  for (const inst of order) {
    const html = await fetchText(`${RUZ_BASE}?groups&institution=${inst}`)
    const id = extractGroupID(html, number)
    if (id) return id
  }
  return null
}

export function extractGroupID(html: string, number: string): string | null {
  const ms = [...html.matchAll(/group=(\d+)/g)]
  for (let i = 0; i < ms.length; i++) {
    const from = ms[i].index! + ms[i][0].length
    const to = i + 1 < ms.length ? ms[i + 1].index! : Math.min(html.length, from + 600)
    if (to <= from) continue
    if (stripTags(html.slice(from, to)).includes(number)) return ms[i][1]
  }
  return null
}

export async function loadGroup(groupID: string): Promise<RuzResult> {
  const html = await fetchText(timetableURL(groupID))
  rememberLecturers(html)
  const page = parseHTML(html)
  let extra: RuzEvent[] = []
  if (ruzConfig.useICS) {
    for (const link of icsLinks(html).slice(0, 2)) {
      let text = ''
      try { text = await fetchText(link) } catch { continue }
      if (!text.includes('BEGIN:VCALENDAR')) continue
      const ics = parseICS(text)
      if (ics.length && !sameGroup(page, ics)) break
      if (ics.length) {
        const pageDays = new Set(page.map(e => startOfDay(e.start)))
        if (page.length) {
          const lo = startOfDay(Math.min(...page.map(e => e.start)))
          const hi = startOfDay(Math.max(...page.map(e => e.start)))
          extra = ics.filter(e => { const d = startOfDay(e.start); return (d < lo || d > hi) && !pageDays.has(d) })
        } else {
          extra = ics
        }
        break
      }
    }
  }
  const events = [...page, ...extra]
  let notice: string | undefined
  if (!events.length) {
    if (html.toLowerCase().includes('modeus')) notice = 'В РУЗ пока нет пар для этой группы. Нажми «Обновить», чтобы проверить ещё раз.'
    else if (html.includes('отсутствуют')) notice = 'В РУЗ пока нет пар на эти недели.'
  }
  const method = page.length ? 'страница РУЗ' : extra.length ? 'iCal' : 'страница РУЗ'
  return { events, method, notice }
}

const fmtDate = (t: number, kind: 'dmy' | 'ymd') => {
  // РУЗ живёт по Москве
  const d = new Date(t + 3 * 3600_000)
  const dd = pad(d.getUTCDate()), mm = pad(d.getUTCMonth() + 1), yy = d.getUTCFullYear()
  return kind === 'dmy' ? `${dd}.${mm}.${yy}` : `${yy}-${mm}-${dd}`
}

/** Загрузить конкретную неделю (для архива прошлых недель) */
export async function loadWeek(groupID: string, monday: number): Promise<RuzEvent[]> {
  let html = ''
  try { html = await fetchText(timetableURL(groupID)) } catch { return [] }
  const candidates: string[] = []
  const linkRe = new RegExp(`href\\s*=\\s*["']([^"']*group=${groupID}[^"']*)["']`, 'gi')
  for (const m of html.matchAll(linkRe)) {
    const href = decodeEntities(m[1])
    const dm = /([A-Za-z_]+)=(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})/.exec(href)
    if (dm) {
      candidates.push(`${RUZ_BASE}?timetable&group=${groupID}&${dm[1]}=${fmtDate(monday, dm[2].includes('-') ? 'ymd' : 'dmy')}`)
      break
    }
  }
  for (const name of ['date', 'week', 'start']) {
    for (const f of ['dmy', 'ymd'] as const) candidates.push(`${RUZ_BASE}?timetable&group=${groupID}&${name}=${fmtDate(monday, f)}`)
  }
  const weekEnd = monday + 7 * DAY
  const seen = new Set<string>()
  for (const c of candidates) {
    if (seen.has(c)) continue
    seen.add(c)
    let page = ''
    try { page = await fetchText(c) } catch { continue }
    const events = parseHTML(page).filter(e => e.start >= monday && e.start < weekEnd)
    if (events.length) return events
  }
  return []
}

// ---------- iCalendar ----------

function icsUnescape(s: string) {
  return squeeze(s.replace(/\\n/g, ' ').replace(/\\N/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'))
}

function icsDate(value?: string, params?: string): number | null {
  if (!value) return null
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h = '0', mi = '0', s = '0'] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(x => x)
  if (m[7] === 'Z') return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  // TZID: РУЗ отдаёт Europe/Moscow; другие зоны встречаются редко — считаем по Москве
  void params
  return moscowDate(+y, +mo, +d, +h, +mi) + (+s) * 1000
}

export function parseICS(raw: string): RuzEvent[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/\n /g, '').replace(/\n\t/g, '')
  const out: RuzEvent[] = []
  let cur: Record<string, string> | null = null
  for (const line of text.split('\n')) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT') {
      if (cur) { const e = icsEvent(cur); if (e) out.push(e) }
      cur = null
    } else if (cur) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const keyPart = line.slice(0, idx)
      const name = keyPart.split(';')[0]
      cur[name] = line.slice(idx + 1)
      cur[name + '#params'] = keyPart
    }
  }
  return out
}

function icsEvent(c: Record<string, string>): RuzEvent | null {
  const start = icsDate(c.DTSTART, c['DTSTART#params'])
  if (start == null) return null
  const end = icsDate(c.DTEND, c['DTEND#params']) ?? start + 95 * 60_000
  const summary = icsUnescape(c.SUMMARY || '')
  const location = icsUnescape(c.LOCATION || '')
  const description = icsUnescape(c.DESCRIPTION || '')
  const p = EventText.parse(summary)
  if (location) {
    const loc = EventText.parseLocation(location)
    if (!p.room) p.room = loc.room
    if (!p.address) p.address = loc.address
  }
  if (!p.teacher) {
    const m = /[А-ЯЁ][а-яё-]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]?\.?/.exec(description)
    if (m) p.teacher = m[0]
  }
  if (!p.note) p.note = description
  return { start, end, subject: p.subject, kind: p.kind, teacher: p.teacher, room: p.room, address: p.address, note: p.note }
}

// ---------- преподаватели ----------

export type RuzLecturer = { id: string; name: string }
const LECTURERS_KEY = 'ruz.lecturers'

export function lecturerLinks(html: string): RuzLecturer[] {
  const out: RuzLecturer[] = []
  const seen = new Set<string>()
  const re = /<a\b[^>]*href\s*=\s*["']([^"']*lecturer=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    const id = m[2]
    const name = stripTags(m[3])
    if (name.length <= 2 || !/[А-ЯЁ]/.test(name)) continue
    const k = id + '|' + name
    if (!seen.has(k)) { seen.add(k); out.push({ id, name }) }
  }
  return out
}

export function rememberLecturers(html: string) {
  const found = lecturerLinks(html)
  if (!found.length) return
  const map = { ...kv.get<Record<string, string>>(LECTURERS_KEY, {}) }
  let changed = false
  for (const l of found) if (map[l.name] !== l.id) { map[l.name] = l.id; changed = true }
  if (changed) kv.set(LECTURERS_KEY, map)
}

export function nameKey(s: string): { surname: string; initials: string[] } {
  const parts = s.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/i).filter(Boolean)
  if (!parts.length) return { surname: '', initials: [] }
  return { surname: parts[0], initials: parts.slice(1).map(p => p[0]).slice(0, 2) }
}

export function sameLecturer(a: string, b: string): boolean {
  const x = nameKey(a), y = nameKey(b)
  if (!x.surname || x.surname !== y.surname) return false
  const n = Math.min(x.initials.length, y.initials.length)
  return x.initials.slice(0, n).join('') === y.initials.slice(0, n).join('')
}

export function knownLecturerID(name: string): string | null {
  const map = kv.get<Record<string, string>>(LECTURERS_KEY, {})
  if (map[name]) return map[name]
  const c = new Set(Object.entries(map).filter(([k]) => sameLecturer(k, name)).map(([, v]) => v))
  return c.size === 1 ? [...c][0] : null
}

export function weekLinks(html: string, key: string, id: string): { date: number; url: string }[] {
  const out: { date: number; url: string }[] = []
  const seen = new Set<string>()
  const re = new RegExp(`href\\s*=\\s*["']([^"']*${key}=${id}\\b[^"']*)["']`, 'gi')
  for (const m of html.matchAll(re)) {
    const href = decodeEntities(m[1])
    const dm = /=(\d{2})\.(\d{2})\.(\d{4})|=(\d{4})-(\d{2})-(\d{2})/.exec(href)
    if (!dm) continue
    const date = dm[1] ? moscowDate(+dm[3], +dm[2], +dm[1], 0, 0) : moscowDate(+dm[4], +dm[5], +dm[6], 0, 0)
    let abs: string
    if (/^http/i.test(href)) abs = href
    else if (href.startsWith('/')) abs = 'https://ruz.narfu.ru' + href
    else abs = RUZ_BASE + href
    if (seen.has(abs)) continue
    seen.add(abs)
    out.push({ date, url: abs })
  }
  return out.sort((a, b) => a.date - b.date)
}

export async function findLecturerID(name: string, groupID: string): Promise<string | null> {
  const known = knownLecturerID(name)
  if (known) return known
  let html = ''
  try { html = await fetchText(timetableURL(groupID)) } catch { return null }
  rememberLecturers(html)
  const k2 = knownLecturerID(name)
  if (k2) return k2
  for (const w of weekLinks(html, 'group', groupID).slice(0, 3)) {
    try { rememberLecturers(await fetchText(w.url)) } catch { continue }
    const k3 = knownLecturerID(name)
    if (k3) return k3
  }
  return null
}

/** В строке пары у преподавателя вместо ФИО — «Группа "151512"» или «Поток "151612, 151613"» */
export function lecturerEvent(e: RuzEvent): RuzEvent {
  const r = { ...e }
  let groups: string[] = []
  const marker = /(?<![А-Яа-яЁё])(?:Группы|Группа|Потоки|Поток)\s*[«"“„]([^»"”“]+)[»"”“]/g
  const take = (s: string) => {
    let t = s
    for (const m of [...t.matchAll(marker)].reverse()) {
      groups.push(...m[1].split(/[,;]/).map(squeeze).filter(Boolean))
      t = t.slice(0, m.index) + ' ' + t.slice(m.index! + m[0].length)
    }
    return squeeze(t)
  }
  r.subject = take(r.subject).replace(/^[ ,;:\-–—]+|[ ,;:\-–—]+$/g, '')
  r.note = take(r.note)
  if (!groups.length) {
    const plain = /(?<![А-Яа-яЁё])(?:Группы|Группа|Потоки|Поток)\s+((?:\d{4,}[ ,;]*)+)/g
    for (const src of [r.subject, r.note]) {
      for (const m of src.matchAll(plain)) groups.push(...(m[1].match(/\d{4,}/g) || []))
    }
    if (groups.length) {
      r.subject = squeeze(r.subject.replace(plain, ' '))
      r.note = squeeze(r.note.replace(plain, ' '))
    }
  }
  const uniq = [...new Set(groups)]
  if (uniq.length) r.teacher = (uniq.length === 1 ? 'Группа ' : 'Группы ') + uniq.join(', ')
  return r
}

export const parseLecturerPage = (html: string) => parseHTML(html).map(lecturerEvent)

export function cachedLecturer(id: string): { events: RuzEvent[]; at: number } | null {
  return kv.get<{ events: RuzEvent[]; at: number } | null>(`lecturer.${id}`, null)
}

/** Все пары преподавателя по всему вузу: текущая неделя и ещё несколько вперёд */
export async function loadLecturer(id: string, weeks = 4): Promise<RuzEvent[]> {
  const html = await fetchText(lecturerURL(id))
  rememberLecturers(html)
  let all = parseLecturerPage(html)
  const thisMonday = mondayOf(Date.now())
  const covered = new Set(all.map(e => mondayOf(e.start)))
  const lastMonday = thisMonday + weeks * 7 * DAY
  const seenWeeks = new Set<number>()
  const targets = weekLinks(html, 'lecturer', id).filter(l => {
    const m = mondayOf(l.date)
    if (!(m >= thisMonday && m < lastMonday && !covered.has(m))) return false
    if (seenWeeks.has(m)) return false
    seenWeeks.add(m)
    return true
  })
  if (targets.length) {
    const more = await Promise.all(targets.slice(0, weeks).map(t => fetchText(t.url).then(parseLecturerPage).catch(() => [] as RuzEvent[])))
    all = all.concat(...more)
  }
  const seen = new Set<string>()
  const result = all.filter(e => { const k = eventId(e); if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => a.start - b.start)
  if (result.length) kv.set(`lecturer.${id}`, { events: result, at: Date.now() })
  return result
}

// ---------- список групп высшей школы ----------

export type RuzGroup = { id: string; number: string; title: string; course: number | null }

export function parseGroups(html: string): RuzGroup[] {
  const heads: { pos: number; course: number }[] = []
  for (const re of [/(\d)\s*курс/gi, /course[_-]?(\d)/gi]) {
    for (const m of html.matchAll(re)) {
      const c = Number(m[1])
      if (c >= 1 && c <= 6) heads.push({ pos: m.index!, course: c })
    }
  }
  heads.sort((a, b) => a.pos - b.pos)
  const links = [...html.matchAll(/group=(\d+)/g)]
  const seen = new Set<string>()
  const out: RuzGroup[] = []
  links.forEach((m, i) => {
    const id = m[1]
    if (seen.has(id)) return
    const from = m.index! + m[0].length
    const to = i + 1 < links.length ? links[i + 1].index! : Math.min(html.length, from + 600)
    if (to <= from) return
    let raw = html.slice(from, from + Math.min(to - from, 600))
    const gt = raw.indexOf('>')
    if (gt >= 0) raw = raw.slice(gt + 1)
    const end = raw.toLowerCase().indexOf('</a>')
    if (end >= 0) raw = raw.slice(0, end)
    const text = decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim()
    const nm = /\b(\d{6})\b/.exec(text) || /\b(\d{4,7})\b/.exec(text)
    if (!nm) return
    const number = nm[1]
    const title = text.replace(number, '').replace(/^[\s\-–—,.:()]+|[\s\-–—,.:()]+$/g, '')
    const course = [...heads].reverse().find(h => h.pos < m.index!)?.course ?? null
    seen.add(id)
    out.push({ id, number, title, course })
  })
  return out.sort((a, b) => (a.course ?? 9) - (b.course ?? 9) || a.number.localeCompare(b.number))
}

export async function loadGroups(institution: number, force = false): Promise<RuzGroup[]> {
  const key = `ruz.groups.${institution}`
  const box = kv.get<{ at: number; groups: RuzGroup[] } | null>(key, null)
  if (!force && box && Date.now() - box.at < 7 * DAY && box.groups.length) return box.groups
  const list = parseGroups(await fetchText(`${RUZ_BASE}?groups&institution=${institution}`))
  if (list.length) kv.set(key, { at: Date.now(), groups: list })
  return list
}

/** Все институты и филиалы со стартовой страницы РУЗ */
export async function allInstitutions(): Promise<number[]> {
  try {
    const html = await fetchText(RUZ_BASE)
    const ids = [...new Set([...html.matchAll(/institution=(\d+)/g)].map(m => Number(m[1])))]
    if (ids.length) return ids
  } catch { /* нет связи */ }
  return institutions.map(i => i[0])
}
