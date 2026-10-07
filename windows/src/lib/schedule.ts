// Расписание: данные, движок пар по дням, звонки, адреса корпусов, подгруппы, журнал замен.
// Перенесено из Shared/Schedule.swift, Shared/KindStyle.swift, Sources/Extras.swift.
import { type RuzEvent, EventText, eventId } from './ruz'
import { startOfDay, addDays, monday, weekKey, weekday, DAY, shortDayTime, hm } from './date'
import { uid } from './kv'

// ---------- модель ----------

export type Lesson = {
  id: string
  subject: string
  kind: string
  weekday: number   // 1 = пн … 6 = сб
  pair: number
  parity: number    // 0 — каждую неделю, 1 — нечётная, 2 — чётная
  room: string
  building: string
  teacher: string
}

export const LESSON_KINDS = ['Лекция', 'Практика', 'Лабораторная', 'Семинар', 'Физкультура', 'Другое']

export type Building = { id: string; name: string; address: string }

export type ScheduleData = {
  lessons: Lesson[]
  buildings: Building[]
  semesterStart: number
  history: Record<string, Lesson[]>
  source: number          // 0 — вручную, 1 — РУЗ
  ruzGroupNumber: string
  ruzInstitution: number
  ruzGroupID: string
  ruzEvents: RuzEvent[]
  lastSync: number | null
  syncInfo: string
  teacherPrefs: Record<string, string>
}

export const defaultBuildings = (): Building[] => [
  { id: uid(), name: 'А-НСД17', address: 'наб. Северной Двины, д. 17 (главный корпус)' }
]

export function defaultSemesterStart(now = new Date()): number {
  const y = now.getFullYear(), m = now.getMonth() + 1
  if (m >= 9) return new Date(y, 8, 1).getTime()
  if (m >= 2) return new Date(y, 1, 9).getTime()
  return new Date(y - 1, 8, 1).getTime()
}

export function emptySchedule(): ScheduleData {
  return {
    lessons: [], buildings: defaultBuildings(), semesterStart: defaultSemesterStart(), history: {},
    source: 0, ruzGroupNumber: '', ruzInstitution: 3, ruzGroupID: '', ruzEvents: [],
    lastSync: null, syncInfo: '', teacherPrefs: {}
  }
}

export function academicWeek(start: number, now = Date.now()): number | null {
  const days = Math.round((monday(now) - monday(start)) / DAY)
  const w = Math.floor(days / 7) + 1
  return w >= 1 && w <= 30 ? w : null
}

export const usesRuz = (d: ScheduleData) => d.source === 1

export function teacherPref(d: ScheduleData, subject: string): string | null {
  const s = subject.toLowerCase()
  for (const [k, v] of Object.entries(d.teacherPrefs || {})) {
    if (!v.trim()) continue
    const key = k.toLowerCase()
    if (s === key || s.startsWith(key) || key.startsWith(s)) return v
  }
  return null
}

/** Вливаем свежие пары из РУЗ. Прошлое не стирается целыми неделями; сегодня и будущее заменяются — так ловятся отмены */
export function mergeRuz(d: ScheduleData, fresh: RuzEvent[]): ScheduleData {
  if (!fresh.length) return d
  const today = startOfDay(Date.now())
  const freshDays = new Set(fresh.map(e => startOfDay(e.start)))
  const upcoming = fresh.filter(e => e.start >= today)
  let lo: number | null = null, hi: number | null = null
  if (upcoming.length) {
    lo = Math.max(today, startOfDay(Math.min(...upcoming.map(e => e.start))))
    hi = addDays(startOfDay(Math.max(...upcoming.map(e => e.start))), 1)
  }
  const result = d.ruzEvents.filter(e => {
    const day = startOfDay(e.start)
    if (freshDays.has(day)) return false
    if (day < today) return true
    if (lo != null && hi != null && e.start >= lo && e.start < hi) return false
    return true
  })
  const seen = new Set<string>()
  for (const e of fresh) { const k = eventId(e); if (!seen.has(k)) { seen.add(k); result.push(e) } }
  const cutoff = Date.now() - 6 * 365 * DAY
  return { ...d, ruzEvents: result.filter(e => e.start > cutoff).sort((a, b) => a.start - b.start) }
}

/** Добавить пары прошлых дней из архива — только за те дни, которых в памяти нет совсем */
export function restorePast(d: ScheduleData, archived: RuzEvent[]): { data: ScheduleData; added: number } {
  if (!archived.length) return { data: d, added: 0 }
  const today = startOfDay(Date.now())
  const have = new Set(d.ruzEvents.map(e => startOfDay(e.start)))
  const missing = archived.filter(e => { const day = startOfDay(e.start); return day < today && !have.has(day) })
  if (!missing.length) return { data: d, added: 0 }
  return { data: { ...d, ruzEvents: [...d.ruzEvents, ...missing].sort((a, b) => a.start - b.start) }, added: missing.length }
}

export function activeLessons(d: ScheduleData, day: number): Lesson[] {
  const key = weekKey(day)
  if (key < weekKey(Date.now()) && d.history[key]) return d.history[key]
  return d.lessons
}

// ---------- звонки ----------

export const BELLS: [number, number, number, number][] = [
  [8, 20, 9, 55], [10, 10, 11, 45], [12, 0, 13, 35], [14, 30, 16, 5], [16, 15, 17, 50], [18, 0, 19, 35], [19, 45, 21, 20]
]

export function pairFor(t: number): number {
  const d = new Date(t)
  const m = d.getHours() * 60 + d.getMinutes()
  let best = 1, bestDiff = Infinity
  BELLS.forEach((b, i) => { const diff = Math.abs(b[0] * 60 + b[1] - m); if (diff < bestDiff) { bestDiff = diff; best = i + 1 } })
  return best
}

export function bellLabel(pair: number): string {
  const t = BELLS[pair - 1]
  if (!t) return ''
  return `${t[0]}:${String(t[1]).padStart(2, '0')}–${t[2]}:${String(t[3]).padStart(2, '0')}`
}

export function bellInterval(pair: number, day: number): [number, number] | null {
  const t = BELLS[pair - 1]
  if (!t) return null
  const s = new Date(day); s.setHours(t[0], t[1], 0, 0)
  const e = new Date(day); e.setHours(t[2], t[3], 0, 0)
  return [s.getTime(), e.getTime()]
}

// ---------- тип пары: цвет и значок ----------

export type KindStyle = { label: string; color: string; icon: string }

export function kindStyle(kind: string): KindStyle {
  const k = (kind || '').toLowerCase()
  if (k.startsWith('лекц')) return { label: 'Лекция', color: '#4085ff', icon: 'lecture' }
  if (k.startsWith('практ')) return { label: 'Практика', color: '#29bf6b', icon: 'practice' }
  if (k.startsWith('лаб')) return { label: 'Лабораторная', color: '#ff8c1a', icon: 'lab' }
  if (k.startsWith('семин')) return { label: 'Семинар', color: '#1ab8c7', icon: 'seminar' }
  if (k.includes('экзам')) return { label: 'Экзамен', color: '#f2404d', icon: 'exam' }
  if (k.includes('зач')) return { label: 'Зачёт', color: '#ed4d9e', icon: 'credit' }
  if (k.includes('консул')) return { label: 'Консультация', color: '#9e66f2', icon: 'consult' }
  return { label: kind || 'Занятие', color: '#8c94a6', icon: 'book' }
}

// ---------- адреса корпусов ----------

export const AddressFormat = {
  streets: {
    'НСД': 'наб. Северной Двины', 'ЛОМ': 'просп. Ломоносова', 'Л': 'просп. Ломоносова', 'СБ': 'ул. Смольный Буян',
    'УР': 'ул. Урицкого', 'УРИ': 'ул. Урицкого', 'СЕВ': 'ул. Северодвинская', 'ГАГ': 'ул. Гагарина', 'ТИМ': 'ул. Тимме'
  } as Record<string, string>,
  corpusAddresses: { '3': 'наб. Северной Двины, д. 17', '6': 'просп. Ломоносова, д. 4', '10': 'просп. Ломоносова, д. 2' } as Record<string, string>,

  isRemote(raw: string) {
    const l = (raw || '').toLowerCase().replace(/ /g, '')
    return ['д.о', 'в.з', 'дистанц', 'онлайн', 'online', 'эиос', 'вебинар'].some(w => l.includes(w))
  },

  parseCode(raw: string): { building: string; street: string; house: string; room: string } | null {
    const t = raw.trim().toUpperCase().replace(/A/g, 'А')
    const m = /^(?:([А-Я])\s*-\s*)?([А-ЯЁ]{1,5})\s*-?\s*(\d{1,3}[А-ЯЁ]?)(?:\s*[/\-]\s*([0-9А-ЯЁA-Z.\-]+))?$/.exec(t)
    if (!m) return null
    let city = m[1] || '', street = m[2] || ''
    const house = m[3] || '', room = m[4] || ''
    if (!city && street.length > 1 && street.startsWith('А')) {
      const rest = street.slice(1)
      if (rest === 'УК' || AddressFormat.streets[rest]) { city = 'А'; street = rest }
    }
    return { building: (city ? city + '-' : '') + street + house, street, house, room }
  },

  addressText(c: { street: string; house: string }) {
    if (c.street === 'УК') {
      const a = AddressFormat.corpusAddresses[c.house]
      return a ? `учебный корпус № ${c.house}, ${a}` : `учебный корпус № ${c.house}`
    }
    const s = AddressFormat.streets[c.street]
    return s ? `${s}, д. ${c.house}` : `корпус ${c.street}-${c.house}`
  },

  decode(room: string, address: string, buildings: Building[]): { room: string; address: string } {
    if (AddressFormat.isRemote(address)) return { room, address }
    const c = AddressFormat.parseCode(address)
    if (!c) return { room, address }
    const finalRoom = room || c.room
    const b = buildings.find(b => b.name.toUpperCase() === c.building || b.name.toUpperCase() === c.street + c.house)
    if (b) return { room: finalRoom, address: b.address }
    return { room: finalRoom, address: AddressFormat.addressText(c) }
  },

  full(raw: string) {
    const t = (raw || '').trim()
    if (!t) return ''
    if (AddressFormat.isRemote(t)) return 'Дистанционно / вне здания'
    const c = AddressFormat.parseCode(t)
    return c ? AddressFormat.addressText(c) : t
  }
}

// ---------- пары по дням ----------

export type Slot = {
  key: string
  subject: string
  kind: string
  weekday: number
  pair: number
  room: string
  building: string
  teacher: string
  start: number
  end: number
  address: string
  note: string
  remote: boolean
}

function makeSlot(l: Omit<Slot, 'key' | 'remote'>): Slot {
  return {
    ...l,
    key: `${Math.floor(l.start / 1000)}-${l.subject}-${l.room}`,
    remote: AddressFormat.isRemote(l.address) || AddressFormat.isRemote(l.room)
  }
}

export const slotPlace = (s: Slot) => [s.room ? `ауд. ${s.room}` : '', s.building].filter(Boolean).join(' · ')

// кеш: пересчитываем дни, только когда расписание изменилось
let cacheData: ScheduleData | null = null
let dayCache = new Map<number, Slot[]>()
let dayIndex: Map<number, RuzEvent[]> | null = null
let teachMemo = new Map<string, boolean>()
const cleanMemo = new Map<string, { subject: string; extra: string }>()

function syncCache(d: ScheduleData) {
  if (cacheData === d) return
  cacheData = d
  dayCache = new Map()
  dayIndex = null
  teachMemo = new Map()
}

export function cleanSubject(raw: string) {
  let c = cleanMemo.get(raw)
  if (!c) {
    c = EventText.cleanSubject(raw)
    if (cleanMemo.size > 3000) cleanMemo.clear()
    cleanMemo.set(raw, c)
  }
  return c
}

function eventsOn(d: ScheduleData, dayStart: number): RuzEvent[] {
  if (!dayIndex) {
    dayIndex = new Map()
    for (const e of d.ruzEvents) {
      const k = startOfDay(e.start)
      const list = dayIndex.get(k)
      if (list) list.push(e); else dayIndex.set(k, [e])
    }
  }
  return dayIndex.get(dayStart) || []
}

function teaches(d: ScheduleData, teacherLower: string, subject: string): boolean {
  const k = teacherLower + '|' + subject.toLowerCase()
  let v = teachMemo.get(k)
  if (v === undefined) {
    const subj = subject.toLowerCase()
    v = d.ruzEvents.some(e => cleanSubject(e.subject).subject.toLowerCase() === subj && e.teacher.toLowerCase().includes(teacherLower))
    teachMemo.set(k, v)
  }
  return v
}

/** Если в одно время по предмету несколько пар (подгруппы) — оставляем пару «моего» преподавателя */
function filterMySubgroup(list: Slot[], d: ScheduleData): Slot[] {
  const groups = new Map<string, Slot[]>()
  const order: string[] = []
  for (const s of list) {
    const k = `${Math.floor(s.start / 1000)}|${s.subject.toLowerCase()}`
    if (!groups.has(k)) { order.push(k); groups.set(k, []) }
    groups.get(k)!.push(s)
  }
  const out: Slot[] = []
  for (const k of order) {
    const g = groups.get(k)!
    const first = g[0]
    const pref = teacherPref(d, first.subject)?.toLowerCase()
    if (!pref) { out.push(...g); continue }
    const mine = g.filter(s => s.teacher.toLowerCase().includes(pref))
    if (g.length > 1) { out.push(...(mine.length ? mine : g)); continue }
    const isLecture = first.kind.toLowerCase().startsWith('лекц')
    const otherTeacher = !!first.teacher && !mine.length
    if (!isLecture && otherTeacher && teaches(d, pref, first.subject)) continue
    out.push(first)
  }
  return out
}

function computeSlots(day: number, d: ScheduleData): Slot[] {
  if (usesRuz(d)) {
    const evs = eventsOn(d, day)
      .map(raw => {
        const c = cleanSubject(raw.subject)
        if (!c.subject) return null
        return { ...raw, subject: c.subject, note: c.extra && !raw.note ? c.extra : raw.note }
      })
      .filter((e): e is RuzEvent => !!e)
      .sort((a, b) => a.start - b.start)
      .map(e => {
        const loc = AddressFormat.decode(e.room, e.address, d.buildings)
        let teacher = e.teacher
        if (!teacher) teacher = teacherPref(d, e.subject) || ''
        return makeSlot({
          subject: e.subject, kind: e.kind, weekday: weekday(e.start), pair: pairFor(e.start),
          room: loc.room, building: loc.address, teacher, start: e.start, end: e.end, address: loc.address, note: e.note
        })
      })
    return filterMySubgroup(evs, d)
  }
  const wd = weekday(day)
  if (wd > 6) return []
  const week = academicWeek(d.semesterStart, day) ?? 1
  return activeLessons(d, day)
    .filter(l => l.weekday === wd && (l.parity === 1 ? week % 2 === 1 : l.parity === 2 ? week % 2 === 0 : true))
    .map(l => {
      const iv = bellInterval(l.pair, day)
      if (!iv) return null
      const b = d.buildings.find(b => b.name === l.building)
      return makeSlot({
        subject: l.subject, kind: l.kind, weekday: l.weekday, pair: l.pair, room: l.room, building: l.building,
        teacher: l.teacher, start: iv[0], end: iv[1], address: b ? b.address : l.building, note: ''
      })
    })
    .filter((s): s is Slot => !!s)
    .sort((a, b) => a.start - b.start)
}

export function slotsOn(day: number, d: ScheduleData): Slot[] {
  syncCache(d)
  const k = startOfDay(day)
  let hit = dayCache.get(k)
  if (!hit) {
    hit = computeSlots(k, d)
    if (dayCache.size > 800) dayCache.clear()
    dayCache.set(k, hit)
  }
  return hit
}

export function slotsRange(from: number, days: number, d: ScheduleData): Slot[] {
  const out: Slot[] = []
  for (let i = 0; i < days; i++) out.push(...slotsOn(addDays(startOfDay(from), i), d))
  return out
}

export function nowAndNext(at: number, d: ScheduleData): { current: Slot | null; next: Slot | null } {
  let current: Slot | null = null, next: Slot | null = null
  for (let off = 0; off < 8; off++) {
    for (const s of slotsOn(addDays(startOfDay(at), off), d)) {
      if (s.start <= at && at < s.end) current = s
      else if (s.start > at && !next) next = s
    }
    if (next) break
  }
  return { current, next }
}

/** Все предметы расписания (для папок, БРС, ДЗ) */
export function subjects(d: ScheduleData): string[] {
  const set = new Map<string, string>()
  if (usesRuz(d)) {
    for (const e of d.ruzEvents) {
      const s = cleanSubject(e.subject).subject
      if (s && !set.has(s.toLowerCase())) set.set(s.toLowerCase(), s)
    }
  } else {
    for (const l of d.lessons) if (l.subject && !set.has(l.subject.toLowerCase())) set.set(l.subject.toLowerCase(), l.subject)
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'ru'))
}

/** Преподаватели предмета */
export function teachersOf(d: ScheduleData, subject: string): string[] {
  const s = subject.toLowerCase()
  const set = new Set<string>()
  if (usesRuz(d)) {
    for (const e of d.ruzEvents) if (cleanSubject(e.subject).subject.toLowerCase() === s && e.teacher) set.add(e.teacher)
  } else {
    for (const l of d.lessons) if (l.subject.toLowerCase() === s && l.teacher) set.add(l.teacher)
  }
  return [...set]
}

/** Есть ли пары в неделе этого дня */
export function hasEventsInWeek(d: ScheduleData, t: number) {
  const m = monday(t), e = m + 7 * DAY
  return d.ruzEvents.some(x => x.start >= m && x.start < e)
}

// ---------- журнал замен ----------

export type ScheduleChange = { id: string; date: number; text: string }

export function upcomingMap(d: ScheduleData, days = 14): Map<string, Slot> {
  const out = new Map<string, Slot>()
  const today = startOfDay(Date.now())
  for (let i = 0; i < days; i++) {
    for (const s of slotsOn(addDays(today, i), d)) {
      if (s.end > Date.now()) out.set(`${Math.floor(s.start / 1000)}|${s.subject.toLowerCase()}`, s)
    }
  }
  return out
}

export function diffChanges(before: Map<string, Slot>, after: Map<string, Slot>): ScheduleChange[] {
  const out: ScheduleChange[] = []
  for (const [k, s] of before) {
    if (!after.has(k)) out.push({ id: uid(), date: s.start, text: `Отменена: ${s.subject}, ${shortDayTime(s.start)}` })
  }
  for (const [k, s] of after) {
    const old = before.get(k)
    if (old) {
      if (old.room !== s.room || old.address !== s.address) {
        out.push({ id: uid(), date: s.start, text: `Новая аудитория: ${s.subject}, ${shortDayTime(s.start)}: ${old.room || '—'} → ${s.room || '—'}` })
      }
    } else {
      out.push({ id: uid(), date: s.start, text: `Добавлена: ${s.subject}, ${shortDayTime(s.start)}${s.room ? `, ауд. ${s.room}` : ''}` })
    }
  }
  return out.sort((a, b) => a.date - b.date)
}

/** Текст пары для «Поделиться» */
export function slotShareLine(s: Slot) {
  return `${hm(s.start)}–${hm(s.end)} ${s.subject} (${kindStyle(s.kind).label})${s.room ? `, ауд. ${s.room}` : ''}${s.teacher ? `, ${s.teacher}` : ''}`
}
