// БРС: баллы, прогноз оценки, сколько не хватает до зачёта / 4 / 5 / автомата. Ключ grades.v1 как в iOS.
import { createCollection, uid } from './kv'

export type GradeEntry = { id: string; title: string; points: number; outOf: number; date: number; source: string }
export type Control = 0 | 1 | 2   // зачёт, экзамен, дифзачёт
export const CONTROL_TITLES = ['Зачёт', 'Экзамен', 'Дифзачёт']
export type SubjectGrades = { id: string; subject: string; entries: GradeEntry[]; pass: number; good: number; excellent: number; auto: number; max: number; control: Control; result: string }

export const gradesStore = createCollection<SubjectGrades[]>('grades.v1', [])
export const newSubjectGrades = (subject: string): SubjectGrades => ({ id: uid(), subject, entries: [], pass: 61, good: 76, excellent: 91, auto: 85, max: 100, control: 1, result: '' })
export const newEntry = (title = 'Работа', points = 0): GradeEntry => ({ id: uid(), title, points, outOf: 0, date: Date.now(), source: '' })

const isTotal = (e: GradeEntry) => e.source === 'ЛК' && e.title === 'Итог'
export function total(g: SubjectGrades) {
  const t = g.entries.filter(isTotal).map(e => e.points)
  return t.length ? Math.max(...t) : g.entries.reduce((a, e) => a + (Number(e.points) || 0), 0)
}
export const ratio = (g: SubjectGrades) => g.max > 0 ? Math.min(1, total(g) / g.max) : 0
export const num = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(1)

export function forecast(g: SubjectGrades) {
  const t = total(g)
  if (g.control === 0) return t >= g.pass ? 'зачёт' : 'пока не зачёт'
  if (t >= g.excellent) return '5'
  if (t >= g.good) return '4'
  if (t >= g.pass) return '3'
  return '—'
}

export function statusColor(g: SubjectGrades) {
  const t = total(g)
  if (t >= g.auto || t >= g.excellent) return '#22c55e'
  if (t >= g.pass) return 'var(--brand)'
  if (ratio(g) >= 0.4) return '#f59e0b'
  return '#ef4444'
}

export function nextStep(g: SubjectGrades) {
  const t = total(g)
  if (g.result) return `Итог: ${g.result}`
  if (t >= g.max) return 'Максимум набран 🔥'
  if (g.control === 0) {
    if (t >= g.auto) return 'Автомат есть 🎉'
    if (t >= g.pass) return `Зачёт есть · до автомата ${num(g.auto - t)}`
    return `До зачёта ${num(g.pass - t)}`
  }
  if (t >= g.excellent) return 'Идёшь на «5» 🎉'
  if (t >= g.good) return `Сейчас «4» · до «5» ${num(g.excellent - t)}`
  if (t >= g.pass) return `Сейчас «3» · до «4» ${num(g.good - t)}`
  return `До «3» не хватает ${num(g.pass - t)}`
}

export const grades = {
  upsert(g: SubjectGrades) { gradesStore.set(l => { const i = l.findIndex(x => x.id === g.id); if (i >= 0) { const c = [...l]; c[i] = g; return c } return [...l, g] }) },
  remove(id: string) { gradesStore.set(l => l.filter(g => g.id !== id)) },
  addMany(subjects: string[]) { gradesStore.set(l => [...l, ...subjects.filter(s => !l.some(g => g.subject === s)).map(newSubjectGrades)]) },
  average() { const l = gradesStore.get().filter(g => g.entries.length); return l.length ? l.reduce((a, g) => a + total(g), 0) / l.length : 0 }
}
