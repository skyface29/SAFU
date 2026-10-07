// Сессия: экзамены из РУЗ + свои, билеты «знаю / повторить», результаты. Из Sources/Session.swift.
import { kv, createCollection, uid } from './kv'
import { type ScheduleData, slotsRange, kindStyle } from './schedule'
import { daysBetween, addDays, DAY } from './date'

export type SessionExam = { id: string; subject: string; kind: string; start: number; room: string; address: string; manual: boolean }
export type TicketSet = { total: number; states: Record<string, number> }
type Blob = { manual: SessionExam[]; tickets: Record<string, TicketSet>; results: Record<string, string> }

export const sessionStore = createCollection<Blob>('session.v1', { manual: [], tickets: {}, results: {} })

export const isConsult = (e: SessionExam) => e.kind.toLowerCase().includes('консульт')
export const daysLeft = (e: SessionExam) => daysBetween(Date.now(), e.start)
export const ticketSet = (subject: string): TicketSet => sessionStore.get().tickets[subject] || { total: 30, states: {} }
export const learned = (t: TicketSet) => Object.values(t.states).filter(v => v === 2).length
export const shaky = (t: TicketSet) => Object.values(t.states).filter(v => v === 1).length

export const session = {
  mode: () => kv.get('session.mode', 0),
  window: () => kv.get('session.window', 21),
  isExamKind(k: string) { const l = k.toLowerCase(); return l.includes('экзам') || l.includes('зач') || l.includes('консульт') || l.includes('курсов') },
  exams(d: ScheduleData, includePast = false): SessionExam[] {
    const from = addDays(Date.now(), includePast ? -30 : 0)
    let list: SessionExam[] = slotsRange(from, includePast ? 180 : 150, d).filter(s => session.isExamKind(s.kind)).map(s => ({
      id: `ruz-${Math.floor(s.start / 1000)}-${s.subject}`, subject: s.subject, kind: kindStyle(s.kind).label,
      start: s.start, room: s.room, address: s.address, manual: false
    }))
    list = list.concat(sessionStore.get().manual)
    if (!includePast) list = list.filter(e => e.start + 4 * 3600_000 > Date.now())
    return list.sort((a, b) => a.start - b.start)
  },
  isActive(d: ScheduleData) {
    const m = session.mode()
    if (m === 1) return true
    if (m === 2) return false
    const first = session.exams(d).find(e => !isConsult(e))
    return !!first && daysLeft(first) <= session.window()
  },
  addManual(e: Omit<SessionExam, 'id' | 'manual'>) { sessionStore.set(b => ({ ...b, manual: [...b.manual, { ...e, id: uid(), manual: true }] })) },
  removeManual(id: string) { sessionStore.set(b => ({ ...b, manual: b.manual.filter(e => e.id !== id) })) },
  cycle(n: number, subject: string) {
    sessionStore.set(b => {
      const t = { ...(b.tickets[subject] || { total: 30, states: {} }) }
      const states = { ...t.states }
      const v = ((states[n] || 0) + 1) % 3
      if (v === 0) delete states[n]; else states[n] = v
      return { ...b, tickets: { ...b.tickets, [subject]: { ...t, states } } }
    })
  },
  setTotal(subject: string, total: number) {
    sessionStore.set(b => ({ ...b, tickets: { ...b.tickets, [subject]: { ...(b.tickets[subject] || { states: {} }), total } as TicketSet } }))
  },
  setResult(id: string, r: string) { sessionStore.set(b => ({ ...b, results: { ...b.results, [id]: r } })) },
  DAY
}
