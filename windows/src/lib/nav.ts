// Навигация по разделам приложения
import { create } from 'zustand'
import { kv } from './kv'

export type PageId =
  | 'home' | 'schedule' | 'homework' | 'tasks' | 'files' | 'subjects' | 'attendance' | 'developer' | 'profile'
  | 'grades' | 'session' | 'polls' | 'broadcast' | 'teachers' | 'rooms' | 'map' | 'boards' | 'wake' | 'lectures'
  | 'focus' | 'report' | 'matrix' | 'stats' | 'bus' | 'notes' | 'appearance' | 'passwords' | 'backup' | 'settings'
  | 'share' | 'tools' | 'game' | 'mailnotify' | 'celebrations' | 'hwsettings' | 'customize' | 'legal'

export const TAB_META: Record<string, { title: string }> = {
  home: { title: 'Главная' }, schedule: { title: 'Пары' }, homework: { title: 'ДЗ' }, tasks: { title: 'Задачи' },
  files: { title: 'Файлы' }, subjects: { title: 'Предметы' }, attendance: { title: 'Посещаемость' },
  developer: { title: 'Автор' }, profile: { title: 'Профиль' }
}

export const ALL_TABS = ['home', 'schedule', 'homework', 'tasks', 'files', 'subjects', 'attendance', 'developer', 'profile']
export const DEFAULT_TABS = 'home,schedule,homework,tasks,files,subjects,profile'

export function parseTabs(raw: string): string[] {
  const out: string[] = []
  for (const p of raw.split(',')) if (ALL_TABS.includes(p) && !out.includes(p)) out.push(p)
  if (!out.includes('profile')) out.push('profile')
  return out
}

type Nav = {
  page: PageId
  params: Record<string, any>
  history: { page: PageId; params: Record<string, any> }[]
  dir: 1 | -1
  go: (page: PageId, params?: Record<string, any>) => void
  back: () => void
}

export const useNav = create<Nav>((set, get) => ({
  page: kv.get<PageId>('memory.tabID', 'home') as PageId,
  params: {},
  history: [],
  dir: 1,
  go(page, params = {}) {
    const s = get()
    if (s.page === page && JSON.stringify(s.params) === JSON.stringify(params)) return
    kv.set('memory.tabID', page)
    set({ page, params, history: [...s.history.slice(-30), { page: s.page, params: s.params }], dir: 1 })
  },
  back() {
    const s = get()
    const prev = s.history[s.history.length - 1]
    if (!prev) return
    kv.set('memory.tabID', prev.page)
    set({ page: prev.page, params: prev.params, history: s.history.slice(0, -1), dir: -1 })
  }
}))

export const go = (page: PageId, params?: Record<string, any>) => useNav.getState().go(page, params)

/** Окна поверх (лист предмета, редактор ДЗ...) — открываются откуда угодно */
type Modals = {
  subject: string | null
  hwEdit: { id?: string; subject?: string; slotStart?: number } | null
  lesson: any | null
  palette: boolean
  set: (p: Partial<Omit<Modals, 'set'>>) => void
}
export const useModals = create<Modals>(set => ({ subject: null, hwEdit: null, lesson: null, palette: false, set: p => set(p) }))
export const openSubject = (s: string) => useModals.getState().set({ subject: s })
export const openHomeworkEditor = (p: Modals['hwEdit']) => useModals.getState().set({ hwEdit: p || {} })
