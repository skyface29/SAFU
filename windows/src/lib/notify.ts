// Уведомления Windows: сразу и по расписанию (таймеры живут в главном процессе, пока САФУ в трее)
import { safu } from './bridge'

export type Note = {
  id?: string
  title: string
  body?: string
  /** куда перейти по нажатию: 'schedule', 'hw:<id>', 'site:mail' … */
  route?: string
  at?: number
  silent?: boolean
  actions?: { id: string; text: string }[]
}

export const notify = {
  show(n: Note) { return safu.notify.show(n) },
  /** Заменить все запланированные уведомления с этим префиксом id на новый список */
  schedule(prefix: string, list: Note[]) {
    return safu.notify.schedule(prefix, list.map((n, i) => ({ ...n, id: n.id ?? `${prefix}${i}` })))
  },
  cancel(prefix: string) { return safu.notify.schedule(prefix, []) }
}
