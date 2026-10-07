// Домашка: ДЗ привязано к паре, на которой задали, а срок — к паре, к которой сдавать.
// Если РУЗ перенесёт или отменит пару, срок сам подстроится. Перенесено из Sources/Homework.swift.
import { kv, createCollection, uid } from './kv'
import { type ScheduleData, type Slot, slotsOn, usesRuz, kindStyle } from './schedule'
import { startOfDay, addDays, isToday, isTomorrow, isYesterday, hm, dayMon, WEEKDAYS_SHORT, daysBetween, DAY } from './date'
import { notify, type Note } from './notify'

export type HWKind = 'exercises' | 'reading' | 'notes' | 'lab' | 'prep' | 'project' | 'other'

export const HW_KINDS: { id: HWKind; title: string; color: string; emoji: string }[] = [
  { id: 'exercises', title: 'Задачи', color: '#4085ff', emoji: '🔢' },
  { id: 'reading', title: 'Прочитать', color: '#29b873', emoji: '📖' },
  { id: 'notes', title: 'Конспект', color: '#1ab3c7', emoji: '📝' },
  { id: 'lab', title: 'Лаба / отчёт', color: '#ff8c1a', emoji: '🧪' },
  { id: 'prep', title: 'Подготовиться', color: '#9e66f2', emoji: '🧠' },
  { id: 'project', title: 'Проект', color: '#ed4d9e', emoji: '📽️' },
  { id: 'other', title: 'Другое', color: '#8c94a6', emoji: '✏️' }
]
export const hwKind = (k: HWKind) => HW_KINDS.find(x => x.id === k) || HW_KINDS[6]

export function guessKind(text: string): HWKind | null {
  const t = text.toLowerCase()
  if (!t) return null
  const has = (w: string[]) => w.some(x => t.includes(x))
  if (has(['лаб', 'отчёт', 'отчет', 'протокол'])) return 'lab'
  if (has(['проект', 'презентац', 'курсов'])) return 'project'
  if (has(['контрольн', 'тест', 'опрос', 'коллоквиум', 'подготов', 'выучить', 'выучи', 'повтор', 'экзамен', 'зачёт', 'зачет'])) return 'prep'
  if (has(['конспект', 'реферат', 'эссе', 'доклад', 'сочинен', 'написать'])) return 'notes'
  if (has(['прочит', 'параграф', '§', 'глав', 'читать', 'статью'])) return 'reading'
  if (has(['№', 'номер', 'задач', 'упр', 'пример', 'стр.', 'решить', 'реши'])) return 'exercises'
  return null
}

export type HWStep = { id: string; text: string; done: boolean }
export type HWReminders = { evening: boolean; morning: boolean; hourBefore: boolean; custom: number | null }

export type Homework = {
  id: string
  subject: string
  text: string
  kind: HWKind
  givenAt: number
  givenKind: string
  fromPair: boolean
  due: number
  rule: 'pair' | 'date'
  anchor: number
  skip: number
  matchKind: string
  follow: boolean
  skipRemote: boolean
  dueKind: string
  dueRoom: string
  dueEstimated: boolean
  shiftNote: string
  steps: HWStep[]
  important: boolean
  note: string
  photos: string[]
  reminders: HWReminders
  done: boolean
  doneAt: number | null
  created: number
}

export const HWPrefs = {
  eveningHour: () => kv.get('hw.eveningHour', 20),
  eveningMinute: () => kv.get('hw.eveningMinute', 0),
  morningHour: () => kv.get('hw.morningHour', 7),
  morningMinute: () => kv.get('hw.morningMinute', 30),
  remindEvening: () => kv.get('hw.remind.evening', true),
  remindMorning: () => kv.get('hw.remind.morning', false),
  remindHour: () => kv.get('hw.remind.hour', true),
  defaultDue: () => kv.get('hw.defaultDue', 'next'),
  follow: () => kv.get('hw.follow', true),
  skipRemote: () => kv.get('hw.skipRemote', true),
  guessKind: () => kv.get('hw.guessKind', true),
  notifyShift: () => kv.get('hw.notifyShift', true),
  celebrate: () => kv.get('hw.celebrate', true),
  badge: () => kv.get('hw.badge', true),
  keepDoneDays: () => kv.get('hw.keepDone', 30),
  askAfter: () => kv.get('hw.ask', false),
  askDelay: () => kv.get('hw.ask.delay', 3),
  asks(kind: string) {
    const k = kind.toLowerCase()
    if (k.startsWith('лекц')) return kv.get('hw.ask.lecture', false)
    if (k.startsWith('практ')) return kv.get('hw.ask.practice', true)
    if (k.startsWith('лаб')) return kv.get('hw.ask.lab', true)
    if (k.startsWith('семин')) return kv.get('hw.ask.seminar', true)
    return false
  }
}

export function newHomework(subject: string, text: string, due: number): Homework {
  const now = Date.now()
  return {
    id: uid(), subject, text, kind: 'exercises', givenAt: now, givenKind: '', fromPair: false, due, rule: 'date', anchor: now,
    skip: 0, matchKind: '', follow: true, skipRemote: true, dueKind: '', dueRoom: '', dueEstimated: false, shiftNote: '',
    steps: [], important: false, note: '', photos: [],
    reminders: { evening: HWPrefs.remindEvening(), morning: HWPrefs.remindMorning(), hourBefore: HWPrefs.remindHour(), custom: null },
    done: false, doneAt: null, created: now
  }
}

export const hwTitle = (h: Homework) => h.text.trim() || h.steps[0]?.text || 'Без описания'
export const key = (s: string) => s.toLowerCase().trim()
export const sameSubject = (a: string, b: string) => key(a) === key(b)
const sameKind = (a: string, b: string) => kindStyle(a).label === kindStyle(b).label

// ---------- пары для сроков ----------

export type HWTarget = { start: number; end: number; kind: string; room: string; estimated: boolean }

export function knownUntil(d: ScheduleData): number | null {
  if (!usesRuz(d) || !d.ruzEvents.length) return null
  return Math.max(...d.ruzEvents.map(e => e.end))
}

export function targets(subject: string, after: number, kind: string | null, d: ScheduleData, limit = 8, skipRemote = HWPrefs.skipRemote()): HWTarget[] {
  const subj = key(subject)
  if (!subj || limit <= 0) return []
  const kindFilter = kind || null
  const known = knownUntil(d)
  const today = startOfDay(Date.now())
  let day = startOfDay(after)
  let lastDay = addDays(Math.max(today, day), 60)
  if (known != null) lastDay = Math.min(lastDay, startOfDay(known))
  const out: HWTarget[] = []
  let guard = 0
  while (day <= lastDay && guard < 200) {
    for (const s of slotsOn(day, d)) {
      if (s.start <= after || key(s.subject) !== subj) continue
      if (skipRemote && s.remote) continue
      if (kindFilter && !sameKind(kindFilter, s.kind)) continue
      if (out.length && out[out.length - 1].start === s.start) continue
      out.push({ start: s.start, end: s.end, kind: s.kind, room: s.room, estimated: false })
      if (out.length >= limit) return out
    }
    day = addDays(day, 1)
    guard++
  }
  if (known == null) return out
  const from = Math.max(after, known, out.length ? out[out.length - 1].start : -Infinity)
  for (const p of predict(subj, kindFilter, from, d, known, skipRemote)) {
    out.push(p)
    if (out.length >= limit) break
  }
  return out
}

/** Прогноз пар после конца известного расписания: повторяем недельный (или двухнедельный) ритм */
function predict(subject: string, kind: string | null, after: number, d: ScheduleData, known: number, skipRemote: boolean): HWTarget[] {
  const knownDay = startOfDay(known)
  const past: Slot[] = []
  for (let back = 0; back < 28; back++) {
    for (const s of slotsOn(addDays(knownDay, -back), d)) {
      if (key(s.subject) === subject && (!kind || sameKind(kind, s.kind)) && !(skipRemote && s.remote)) past.push(s)
    }
  }
  if (!past.length) return []
  const groups = new Map<string, Slot[]>()
  for (const s of past) {
    const dt = new Date(s.start)
    const k = `${dt.getDay()}-${dt.getHours()}-${dt.getMinutes()}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(s)
  }
  const horizon = after + 70 * DAY
  const out: HWTarget[] = []
  for (const list of groups.values()) {
    const sorted = list.sort((a, b) => a.start - b.start)
    const last = sorted[sorted.length - 1]
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].start, sorted[i].start))
    const period = (gaps.length ? Math.min(...gaps) : 14) <= 8 ? 7 : 14
    const duration = last.end - last.start
    for (let k = 1; k < 30; k++) {
      const t = addDays(last.start, period * k)
      if (t > horizon) break
      if (t > after) out.push({ start: t, end: t + duration, kind: last.kind, room: last.room, estimated: true })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

export function resolve(h: Homework, d: ScheduleData): HWTarget | null {
  if (h.rule !== 'pair') return null
  const list = targets(h.subject, h.anchor, h.matchKind || null, d, h.skip + 1, h.skipRemote)
  return list.length > h.skip ? list[h.skip] : null
}

/** Пара, с которой логичнее всего записывать ДЗ прямо сейчас: идёт или закончилась недавно */
export function suggestedSlot(d: ScheduleData, now = Date.now()): Slot | null {
  const today = slotsOn(now, d)
  const cur = today.find(s => s.start <= now && s.end > now)
  if (cur) return cur
  const recent = today.filter(s => s.end <= now && now - s.end < 3 * 3600_000)
  return recent.sort((a, b) => b.end - a.end)[0] || null
}

export function findSlot(subject: string, start: number, d: ScheduleData): Slot | null {
  return slotsOn(start, d).find(s => Math.abs(s.start - start) < 90_000 && key(s.subject) === key(subject)) || null
}

// ---------- подписи ----------

export const isEndOfDay = (t: number) => { const d = new Date(t); return d.getHours() === 23 && d.getMinutes() === 59 }

export function dayTime(t: number): string {
  const time = isEndOfDay(t) ? 'до конца дня' : hm(t)
  if (isToday(t)) return `сегодня, ${time}`
  if (isTomorrow(t)) return `завтра, ${time}`
  if (isYesterday(t)) return `вчера, ${time}`
  const sameYear = new Date(t).getFullYear() === new Date().getFullYear()
  return `${WEEKDAYS_SHORT[new Date(t).getDay()]} ${dayMon(t)}${sameYear ? '' : ' ' + new Date(t).getFullYear()}, ${time}`
}

export function chip(t: number, done = false): string {
  const now = Date.now()
  if (!done && t < now) {
    const days = daysBetween(t, now)
    return days <= 0 ? 'просрочено' : `просрочено ${days} дн`
  }
  const mins = Math.floor((t - now) / 60_000)
  if (mins < 60 && mins >= 0) return `через ${Math.max(mins, 1)} мин`
  if (isToday(t)) return isEndOfDay(t) ? 'сегодня' : `сегодня ${hm(t)}`
  if (isTomorrow(t)) return isEndOfDay(t) ? 'завтра' : `завтра ${hm(t)}`
  const days = daysBetween(now, t)
  if (days < 7) { const wd = WEEKDAYS_SHORT[new Date(t).getDay()]; return isEndOfDay(t) ? wd : `${wd}, ${hm(t)}` }
  return dayMon(t)
}

export function urgency(t: number, done = false): string {
  if (done) return 'var(--text3)'
  const left = t - Date.now()
  if (left < 0) return '#ef4444'
  if (left < DAY) return '#f59e0b'
  if (left < 3 * DAY) return 'var(--brand)'
  return 'var(--text2)'
}

// ---------- хранилище ----------

export const homeworkStore = createCollection<Homework[]>('homework.v1', [])

export const hw = {
  all: () => homeworkStore.get(),
  active: () => homeworkStore.get().filter(h => !h.done).sort((a, b) => a.due - b.due),
  finished: () => homeworkStore.get().filter(h => h.done).sort((a, b) => (b.doneAt ?? b.due) - (a.doneAt ?? a.due)),
  item: (id: string) => homeworkStore.get().find(h => h.id === id),
  badgeCount: () => { const lim = Date.now() + DAY; return hw.active().filter(h => h.due < lim).length },
  openItems: (subject: string) => hw.active().filter(h => sameSubject(h.subject, subject)),
  dueAt: (s: Slot) => homeworkStore.get().filter(h => sameSubject(h.subject, s.subject) && Math.abs(h.due - s.start) < 90_000).sort((a, b) => Number(a.done) - Number(b.done)),
  givenAt: (s: Slot) => homeworkStore.get().filter(h => h.fromPair && sameSubject(h.subject, s.subject) && Math.abs(h.givenAt - s.start) < 90_000),
  weekStats() {
    const from = Date.now() - 7 * DAY, to = Date.now() + 7 * DAY
    const w = homeworkStore.get().filter(h => (h.due >= from && h.due <= to) || (h.doneAt ?? 0) >= from)
    return { done: w.filter(h => h.done).length, total: w.length }
  },

  upsert(h: Homework) {
    const n = { ...h, text: h.text.trim() }
    homeworkStore.set(list => {
      const i = list.findIndex(x => x.id === n.id)
      if (i >= 0) { const c = [...list]; c[i] = n; return c }
      return [...list, n]
    })
    scheduleReminders(n)
  },

  toggle(id: string): boolean {
    let nowDone = false
    homeworkStore.set(list => list.map(h => {
      if (h.id !== id) return h
      nowDone = !h.done
      return { ...h, done: nowDone, doneAt: nowDone ? Date.now() : null, steps: nowDone ? h.steps.map(s => ({ ...s, done: true })) : h.steps }
    }))
    const h = hw.item(id)
    if (h) scheduleReminders(h)
    return nowDone
  },

  toggleStep(id: string, stepId: string): boolean {
    let completed = false
    homeworkStore.set(list => list.map(h => {
      if (h.id !== id) return h
      const steps = h.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s)
      if (!h.done && steps.every(s => s.done)) { completed = true; return { ...h, steps, done: true, doneAt: Date.now() } }
      return { ...h, steps }
    }))
    if (completed) { const h = hw.item(id); if (h) scheduleReminders(h) }
    return completed
  },

  remove(id: string) {
    notify.cancel(`hw-${id}-`)
    homeworkStore.set(list => list.filter(h => h.id !== id))
  },

  clearFinished() { homeworkStore.set(list => list.filter(h => !h.done)) },

  postpone(id: string, d: ScheduleData) {
    const h = hw.item(id)
    if (!h) return
    const n = { ...h }
    if (n.rule === 'pair') {
      n.skip += 1
      const t = resolve(n, d)
      if (t) { n.due = t.start; n.dueKind = t.kind; n.dueRoom = t.room; n.dueEstimated = t.estimated }
      else { n.skip -= 1; n.rule = 'date'; n.due = h.due + 7 * DAY }
    } else {
      n.due = h.due + DAY
    }
    n.shiftNote = ''
    hw.upsert(n)
  },

  duplicate(id: string) {
    const h = hw.item(id)
    if (!h) return
    hw.upsert({ ...h, id: uid(), done: false, doneAt: null, created: Date.now(), photos: [], steps: h.steps.map(s => ({ id: uid(), text: s.text, done: false })) })
  },

  dismissShift(id: string) { homeworkStore.set(list => list.map(h => h.id === id ? { ...h, shiftNote: '' } : h)) },

  markDone(id: string) { const h = hw.item(id); if (h && !h.done) hw.toggle(id) },

  /** Расписание обновилось: сроки «к паре» переезжают вслед за парами */
  reconcile(d: ScheduleData) {
    if (usesRuz(d) ? !d.ruzEvents.length : !d.lessons.length) return
    const now = Date.now()
    const touched: Homework[] = []
    const list = homeworkStore.get().map(h => {
      if (h.done || h.rule !== 'pair' || !h.follow) return h
      const t = resolve(h, d)
      if (!t) return h
      const n = { ...h }
      let changed = false
      if (Math.abs(t.start - h.due) > 60_000) {
        if (h.due < now && t.start < now) return h
        if (!h.dueEstimated && h.due > now) {
          n.shiftNote = `Пару перенесли: было ${dayTime(h.due)}`
          if (HWPrefs.notifyShift()) notify.show({ title: 'Срок ДЗ сдвинулся', body: `${h.subject}: пару перенесли, теперь сдавать ${dayTime(t.start)}`, route: `hw:${h.id}` })
        }
        n.due = t.start
        changed = true
      }
      if (n.dueKind !== t.kind || n.dueRoom !== t.room || n.dueEstimated !== t.estimated) {
        n.dueKind = t.kind; n.dueRoom = t.room; n.dueEstimated = t.estimated; changed = true
      }
      if (changed) touched.push(n)
      return changed ? n : h
    })
    if (!touched.length) return
    homeworkStore.set(list)
    touched.forEach(scheduleReminders)
  },

  cleanupFinished() {
    const days = HWPrefs.keepDoneDays()
    if (days <= 0) return
    const limit = Date.now() - days * DAY
    homeworkStore.set(list => list.filter(h => !(h.done && (h.doneAt ?? h.due) < limit)))
  },

  rescheduleAll() { homeworkStore.get().forEach(scheduleReminders) }
}

// ---------- напоминания ----------

function scheduleReminders(h: Homework) {
  const prefix = `hw-${h.id}-`
  if (h.done) { notify.cancel(prefix); return }
  const plan: Note[] = []
  const prev = new Date(addDays(h.due, -1))
  if (h.reminders.evening) {
    prev.setHours(HWPrefs.eveningHour(), HWPrefs.eveningMinute(), 0, 0)
    plan.push({ id: prefix + 'e', at: prev.getTime(), title: 'Завтра сдавать ДЗ' })
  }
  if (h.reminders.morning) {
    const m = new Date(h.due); m.setHours(HWPrefs.morningHour(), HWPrefs.morningMinute(), 0, 0)
    if (m.getTime() < h.due) plan.push({ id: prefix + 'm', at: m.getTime(), title: 'Сегодня сдавать ДЗ' })
  }
  if (h.reminders.hourBefore && !isEndOfDay(h.due)) plan.push({ id: prefix + 'h', at: h.due - 3600_000, title: 'Через час сдавать ДЗ' })
  if (h.reminders.custom) plan.push({ id: prefix + 'c', at: h.reminders.custom, title: 'Напоминание о ДЗ' })
  let body = h.subject ? `${h.subject}: ${hwTitle(h)}` : hwTitle(h)
  if (h.steps.length) body += ` (${h.steps.filter(s => s.done).length}/${h.steps.length})`
  notify.schedule(prefix, plan.filter(p => (p.at ?? 0) > Date.now()).map(p => ({
    ...p, body, route: `hw:${h.id}`, actions: [{ id: `hwdone:${h.id}`, text: 'Сделано' }]
  })))
}

/** «Что задали?» — уведомление после пары, чтобы не забыть записать */
export function scheduleAsk(d: ScheduleData) {
  if (!HWPrefs.askAfter()) { notify.cancel('hw-ask-'); return }
  const delay = HWPrefs.askDelay() * 60_000
  const list: Note[] = []
  for (let i = 0; i < 4; i++) {
    for (const s of slotsOn(addDays(Date.now(), i), d)) {
      if (s.end <= Date.now() || !HWPrefs.asks(s.kind)) continue
      list.push({
        id: `hw-ask-${Math.floor(s.start / 1000)}`, at: s.end + delay,
        title: `Что задали по «${s.subject}»?`, body: 'Нажми, чтобы записать ДЗ. Срок поставлю к следующей паре.',
        route: `hwnew:${s.start}:${s.subject}`
      })
    }
  }
  notify.schedule('hw-ask-', list.slice(0, 20))
}

/** Срок по умолчанию для нового ДЗ с пары */
export function defaultDueFor(subject: string, slot: Slot | null, d: ScheduleData): { rule: 'pair' | 'date'; due: number; skip: number; matchKind: string; target: HWTarget | null } {
  const mode = HWPrefs.defaultDue()
  const anchor = slot?.start ?? Date.now()
  if (mode === 'tomorrow' || mode === 'week' || !subject) {
    const t = new Date(addDays(Date.now(), mode === 'week' ? 7 : 1)); t.setHours(23, 59, 0, 0)
    return { rule: 'date', due: t.getTime(), skip: 0, matchKind: '', target: null }
  }
  const matchKind = mode === 'nextSame' && slot ? slot.kind : ''
  const skip = mode === 'skip1' ? 1 : 0
  const list = targets(subject, anchor, matchKind || null, d, skip + 1)
  const target = list[skip] || null
  if (target) return { rule: 'pair', due: target.start, skip, matchKind, target }
  const t = new Date(addDays(Date.now(), 7)); t.setHours(23, 59, 0, 0)
  return { rule: 'date', due: t.getTime(), skip: 0, matchKind: '', target: null }
}
