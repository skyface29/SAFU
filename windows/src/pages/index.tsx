// Все страницы приложения. Сразу загружается только «Главная»: остальные — отдельными кусками, когда их
// открывают (и заранее, в свободное время после запуска, — чтобы переход был мгновенным). Раньше все ~40 страниц
// разбирались до первого кадра, и запуск ждал их всех
import React from 'react'
import type { PageId } from '../lib/nav'
import Home from './Home'
// экран синхронизации нужен сразу (окно «iPhone хочет связаться» живёт в App), поэтому он в общем куске
import SyncPage from './Sync'

type Loader = () => Promise<any>
const loaders: Loader[] = []

/** Страница из отдельного куска: pick — какая из выгруженных в нём (в одном файле их бывает несколько) */
function page<M>(load: () => Promise<M>, pick: (m: M) => React.ComponentType<any>): React.ComponentType<any> {
  loaders.push(load)
  return React.lazy(() => load().then(m => ({ default: pick(m) })))
}

const profile = () => import('./Profile')
const group = () => import('./tools/Group')
const study = () => import('./tools/Study')
const places = () => import('./tools/Places')
const productivity = () => import('./tools/Productivity')
const misc = () => import('./tools/Misc')
const homework = () => import('./Homework')

export const PAGES: Partial<Record<PageId, React.ComponentType<any>>> = {
  home: Home,
  schedule: page(() => import('./Schedule'), m => m.default),
  homework: page(homework, m => m.default),
  hwsettings: page(homework, m => m.HomeworkSettings),
  tasks: page(() => import('./Tasks'), m => m.default),
  files: page(() => import('./Files'), m => m.default),
  subjects: page(() => import('./Subjects'), m => m.default),
  notes: page(() => import('./Notes'), m => m.default),
  profile: page(profile, m => m.default),
  appearance: page(profile, m => m.Appearance),
  customize: page(profile, m => m.Customize),
  settings: page(profile, m => m.AppSettings),
  passwords: page(profile, m => m.Passwords),
  mailnotify: page(profile, m => m.MailNotify),
  backup: page(profile, m => m.Backup),
  developer: page(profile, m => m.Developer),
  legal: page(profile, m => m.Legal),
  attendance: page(group, m => m.Attendance),
  broadcast: page(group, m => m.Broadcast),
  polls: page(group, m => m.Polls),
  grades: page(study, m => m.Grades),
  session: page(study, m => m.Session),
  teachers: page(places, m => m.Teachers),
  rooms: page(places, m => m.FreeRooms),
  map: page(places, m => m.CampusMap),
  focus: page(productivity, m => m.Focus),
  report: page(productivity, m => m.Report),
  matrix: page(productivity, m => m.Matrix),
  stats: page(productivity, m => m.Stats),
  lectures: page(() => import('./tools/Lectures'), m => m.Lectures),
  bus: page(misc, m => m.BusPage),
  wake: page(misc, m => m.Wake),
  share: page(misc, m => m.ShareImage),
  boards: page(misc, m => m.Boards),
  celebrations: page(misc, m => m.CelebrationSettings),
  game: page(misc, m => m.Game),
  tools: page(misc, m => m.ToolsPage),
  transfer: page(() => import('./Transfer'), m => m.default),
  sync: SyncPage
}

/** Подгрузить все страницы заранее — по одной, в свободное время, чтобы не мешать интерфейсу */
export function preloadPages(extra: Loader[] = []) {
  const queue = [...new Set([...extra, ...loaders])]
  const idle = (f: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 50))
  const next = () => {
    const load = queue.shift()
    if (!load) return
    load().catch(() => undefined).finally(() => idle(next))
  }
  idle(next)
}
