// Задачи, заметки, заметки и закрепы предметов. Ключи как в iOS-версии — копия переносится один в один.
import { kv, createCollection, uid } from './kv'
import { notify, type Note as Notice } from './notify'
import { addDays } from './date'

// ---------- задачи ----------

export type StudyTask = { id: string; title: string; subject: string; due: number; note: string; done: boolean; remind: boolean }
export const tasksStore = createCollection<StudyTask[]>('tasks.v1', [])

export const blankTask = (): StudyTask => {
  const d = new Date(addDays(Date.now(), 1)); d.setHours(23, 59, 0, 0)
  return { id: uid(), title: '', subject: '', due: d.getTime(), note: '', done: false, remind: true }
}

function taskReminders(t: StudyTask) {
  const prefix = `task-${t.id}-`
  if (t.done || !t.remind) { notify.cancel(prefix); return }
  const list: Notice[] = []
  const dayBefore = new Date(addDays(t.due, -1)); dayBefore.setHours(19, 0, 0, 0)
  list.push({ id: prefix + 'd', at: dayBefore.getTime(), title: 'Завтра дедлайн', body: `${t.subject ? t.subject + ': ' : ''}${t.title}`, route: 'tasks' })
  list.push({ id: prefix + 'h', at: t.due - 3 * 3600_000, title: 'Через 3 часа дедлайн', body: `${t.subject ? t.subject + ': ' : ''}${t.title}`, route: 'tasks' })
  notify.schedule(prefix, list.filter(n => (n.at ?? 0) > Date.now()))
}

export const tasks = {
  upsert(t: StudyTask) { tasksStore.set(l => { const i = l.findIndex(x => x.id === t.id); if (i >= 0) { const c = [...l]; c[i] = t; return c } return [...l, t] }); taskReminders(t) },
  toggle(id: string) { let r = false; tasksStore.set(l => l.map(t => t.id === id ? (r = !t.done, { ...t, done: r }) : t)); const t = tasksStore.get().find(x => x.id === id); if (t) taskReminders(t); return r },
  remove(id: string) { notify.cancel(`task-${id}-`); tasksStore.set(l => l.filter(t => t.id !== id)) },
  clearDone() { tasksStore.set(l => l.filter(t => !t.done)) }
}

// ---------- заметки ----------

export type NoteItem = { id: string; text: string; done: boolean }
export type Note = { id: string; title: string; text: string; items: NoteItem[]; subject: string; color: number; pinned: boolean; created: number; updated: number }
export const NOTE_COLORS = ['transparent', '#facc40', '#66c773', '#599ef9', '#ed6b8c', '#a673f2']
export const notesStore = createCollection<Note[]>('notes.v2', [])

export const noteTitle = (n: Note) => n.title.trim() || n.text.split('\n')[0]?.trim() || n.items[0]?.text || 'Без названия'
export const notePreview = (n: Note) => {
  const body = (n.title ? n.text : n.text.split('\n').slice(1).join(' ')).replace(/\n/g, ' ').trim()
  if (body) return body
  if (n.items.length) return `${n.items.filter(i => i.done).length} из ${n.items.length} готово`
  return ''
}
export const blankNote = (subject = ''): Note => ({ id: uid(), title: '', text: '', items: [], subject, color: 0, pinned: false, created: Date.now(), updated: Date.now() })

export const notes = {
  upsert(n: Note) {
    const empty = !n.title.trim() && !n.text.trim() && n.items.every(i => !i.text.trim())
    notesStore.set(l => {
      const rest = l.filter(x => x.id !== n.id)
      return empty ? rest : [{ ...n, updated: Date.now() }, ...rest]
    })
  },
  remove(id: string) { notesStore.set(l => l.filter(n => n.id !== id)) },
  togglePin(id: string) { notesStore.set(l => l.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n)) }
}

// ---------- предметы ----------

export const subjectNotes = {
  get: (s: string) => kv.get<Record<string, string>>('subject.notes', {})[s] || '',
  set: (s: string, text: string) => kv.set('subject.notes', { ...kv.get<Record<string, string>>('subject.notes', {}), [s]: text })
}

export type SubjectPin = { id: string; title: string; value: string; isFile: boolean }
export const pinsStore = createCollection<Record<string, SubjectPin[]>>('subject.pins.v1', {})
export const pins = {
  of: (s: string) => pinsStore.get()[s] || [],
  add(s: string, p: Omit<SubjectPin, 'id'>) { pinsStore.set(m => ({ ...m, [s]: [...(m[s] || []), { ...p, id: uid() }] })) },
  remove(s: string, id: string) { pinsStore.set(m => ({ ...m, [s]: (m[s] || []).filter(p => p.id !== id) })) }
}
