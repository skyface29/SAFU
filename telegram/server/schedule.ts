// Пары группы и сроки ДЗ: «к следующей паре», «к следующей практике», «через одну».
// Та же логика, что в windows/src/lib/homework.ts: если пары ещё нет в РУЗ — считаем по ритму прошлых недель.
import type { RuzEvent } from './ruz/parse'
import { EventText, groupNumbers } from './ruz/parse'
import type { DueOption, Slot } from '../shared/types'
import { kindStyle, sameKind, isRemote, subjectKey, dueHint } from '../shared/pretty'

export { dueHint }
import { addDays, endOfDay, startOfDay, daysBetween, DAY } from '../shared/dates'

export function toSlots(events: RuzEvent[]): Slot[] {
  const out: Slot[] = []
  const seen = new Set<string>()
  for (const e of [...events].sort((a, b) => a.start - b.start)) {
    const c = EventText.cleanSubject(e.subject)
    if (!c.subject) continue
    const groups = /^Групп/.test(e.teacher) ? groupNumbers(e.teacher) : undefined
    const k = `${e.start}|${subjectKey(c.subject)}|${e.room}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({
      start: e.start, end: e.end, subject: c.subject, kind: e.kind, teacher: groups ? '' : e.teacher,
      room: e.room, address: e.address, note: e.note || c.extra, remote: isRemote(e.address) || isRemote(e.room),
      ...(groups ? { groups } : {})
    })
  }
  return out
}

export const slotsBetween = (slots: Slot[], from: number, to: number) => slots.filter(s => s.start >= from && s.start < to)

/** Предметы группы: сначала те, что сегодня (идущая и недавние пары — первыми), потом ближайшие */
export function subjectsOf(slots: Slot[], now = Date.now()): { subject: string; kind: string; recent: boolean }[] {
  const map = new Map<string, { subject: string; kind: string; score: number; recent: boolean }>()
  for (const s of slots) {
    const k = subjectKey(s.subject)
    // идёт сейчас или закончилась за последние 3 часа — самый вероятный предмет ДЗ
    const recent = s.start <= now && now - s.end < 3 * 3600_000
    const score = recent ? -1e15 + (now - s.start) : s.start >= now ? s.start - now : 1e14 + (now - s.start)
    const prev = map.get(k)
    if (!prev || score < prev.score) map.set(k, { subject: prev?.subject ?? s.subject, kind: s.kind, score, recent: recent || !!prev?.recent })
  }
  return [...map.values()].sort((a, b) => a.score - b.score).map(({ subject, kind, recent }) => ({ subject, kind, recent }))
}

/** Пара по предмету, которая идёт или недавно была — с неё «задали» */
export function recentSlot(slots: Slot[], subject: string, now = Date.now()): Slot | null {
  const k = subjectKey(subject)
  return slots.filter(s => subjectKey(s.subject) === k && s.start <= now && now - s.end < 3 * 3600_000).sort((a, b) => b.start - a.start)[0] ?? null
}

export type Target = { start: number; kind: string; room: string; estimated: boolean }

/** Ближайшие пары предмета после момента after (дистант пропускаем, если есть очные) */
export function targets(slots: Slot[], subject: string, after: number, kind: string | null, limit = 8, now = Date.now()): Target[] {
  const k = subjectKey(subject)
  if (!k || limit <= 0) return []
  const own = slots.filter(s => subjectKey(s.subject) === k && (!kind || sameKind(kind, s.kind)))
  const pick = (skipRemote: boolean) => {
    const out: Target[] = []
    for (const s of own) {
      if (s.start <= after || (skipRemote && s.remote)) continue
      if (out.length && out[out.length - 1].start === s.start) continue
      out.push({ start: s.start, kind: s.kind, room: s.remote ? 'дистант' : s.room, estimated: false })
      if (out.length >= limit) break
    }
    return out
  }
  let out = pick(true)
  if (!out.length) out = pick(false)
  if (out.length >= limit || !slots.length) return out
  const known = Math.max(...slots.map(s => s.end))
  const from = Math.max(after, known, now, out.length ? out[out.length - 1].start : -Infinity)
  for (const p of predict(own.filter(s => !s.remote), from, known)) {
    out.push(p)
    if (out.length >= limit) break
  }
  return out
}

/** Прогноз после конца известного расписания: повторяем недельный (или двухнедельный) ритм последних 4 недель */
function predict(own: Slot[], after: number, known: number): Target[] {
  const past = own.filter(s => s.start > startOfDay(known) - 28 * DAY && s.start <= known)
  if (!past.length) return []
  const groups = new Map<string, Slot[]>()
  for (const s of past) {
    const d = new Date(s.start)
    const key = `${d.getDay()}-${d.getHours()}-${d.getMinutes()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  const horizon = after + 70 * DAY
  const out: Target[] = []
  for (const list of groups.values()) {
    const sorted = list.sort((a, b) => a.start - b.start)
    const last = sorted[sorted.length - 1]
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].start, sorted[i].start))
    const period = (gaps.length ? Math.min(...gaps) : 14) <= 8 ? 7 : 14
    for (let n = 1; n < 30; n++) {
      const t = addDays(last.start, period * n)
      if (t > horizon) break
      if (t > after) out.push({ start: t, kind: last.kind, room: last.room, estimated: true })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

const pairOption = (id: string, label: string, t: Target, skip: number, matchKind: string): DueOption => ({
  id, label, hint: dueHint(t.start, t.kind, t.room, t.estimated), due: t.start, rule: 'pair', skip, matchKind,
  kind: t.kind, room: t.room, estimated: t.estimated
})

const dateOption = (id: string, label: string, due: number): DueOption => ({
  id, label, hint: dueHint(due), due, rule: 'date', skip: 0, matchKind: '', kind: '', room: '', estimated: false
})

const kindDative: Record<string, string> = { 'Практика': 'практике', 'Лабораторная': 'лабораторной', 'Семинар': 'семинару', 'Лекция': 'лекции' }

/** Варианты срока для предмета: к следующей паре, к следующей такой же паре, через одну, завтра, через неделю */
export function dueOptions(slots: Slot[], subject: string, anchor: number, givenKind = '', now = Date.now()): DueOption[] {
  const out: DueOption[] = []
  const any = targets(slots, subject, anchor, null, 2, now)
  if (any[0]) out.push(pairOption('next', 'К следующей паре', any[0], 0, ''))
  // к такой же паре, как та, на которой задали; если задали на лекции — к ближайшей практике/лабе
  const wanted = givenKind && !kindStyle(givenKind).label.startsWith('Лекц') ? [givenKind] : ['Практика', 'Лабораторная', 'Семинар']
  for (const k of wanted) {
    const t = targets(slots, subject, anchor, k, 1, now)[0]
    if (t && t.start !== any[0]?.start) {
      const label = kindStyle(k).label
      out.push(pairOption(`kind:${label}`, `К следующей ${kindDative[label] ?? label.toLowerCase()}`, t, 0, label))
      break
    }
  }
  if (any[1] && !out.some(o => o.due === any[1].start)) out.push(pairOption('skip1', 'Через одну пару', any[1], 1, ''))
  out.push(dateOption('tomorrow', 'Завтра', endOfDay(addDays(now, 1))))
  out.push(dateOption('week', 'Через неделю', endOfDay(addDays(now, 7))))
  return out
}

/** Срок «к паре» заново — после обновления расписания */
export function resolveDue(slots: Slot[], subject: string, anchor: number, matchKind: string, skip: number, now = Date.now()): Target | null {
  const list = targets(slots, subject, anchor, matchKind || null, skip + 1, now)
  return list.length > skip ? list[skip] : null
}
