// Синхронизация с iPhone по домашнему Wi‑Fi: ДЗ, задачи и заметки — одинаковые на телефоне и компьютере.
// Телефон сам заходит на компьютер (пока Арктика здесь запущена, даже свёрнутой в трей), присылает свою
// версию и забирает общую. Сведение по полям — в syncmerge.ts.
import { kv, uid } from './kv'
import { safu } from './bridge'
import { homeworkStore, rearmHomework } from './homework'
import { tasksStore, notesStore, rearmTask } from './study'
import { notify } from './notify'
import { refresh, restamp, mergeColl, fixIds, canon, emptyState, emptyWire, idOf, type CollState, type Wire } from './syncmerge'

const STATE_KEY = 'sync.state.v1'
export const LAST_KEY = 'sync.last'

export type SyncLast = { at: number; device: string; changed: number }

const COLLS = {
  homework: homeworkStore,
  tasks: tasksStore,
  notes: notesStore
} as const
type Coll = keyof typeof COLLS

/** Поля, без которых записи с iPhone здесь неудобны */
function normalize(coll: Coll, items: any[]): any[] {
  if (coll === 'homework') {
    return items.map(h => ({
      ...h,
      doneAt: h.doneAt ?? null,
      steps: Array.isArray(h.steps) ? h.steps : [],
      photos: Array.isArray(h.photos) ? h.photos : [],
      reminders: { evening: true, morning: false, hourBefore: true, ...(h.reminders || {}), custom: h.reminders?.custom ?? null }
    }))
  }
  if (coll === 'notes') return items.map(n => ({ ...n, items: Array.isArray(n.items) ? n.items : [] }))
  return items
}

/** Напоминания для того, что поменялось или пропало */
function rearm(coll: Coll, before: any[], after: any[]) {
  const was = new Map(before.map(x => [idOf(x), canon(x)]))
  const now = new Set(after.map(idOf))
  for (const x of after) {
    if (was.get(idOf(x)) === canon(x)) continue
    if (coll === 'homework') rearmHomework(x)
    if (coll === 'tasks') rearmTask(x)
  }
  for (const x of before) {
    if (now.has(idOf(x))) continue
    if (coll === 'homework') notify.cancel(`hw-${x.id}-`)
    if (coll === 'tasks') notify.cancel(`task-${x.id}-`)
  }
}

/** Телефон прислал свою версию — сводим и отдаём общую. Вызывается главным процессом */
export function handleSync(body: { device?: string; data?: Partial<Record<Coll, Wire>> }): { data: Record<Coll, Wire> } {
  const now = Date.now()
  const state = kv.get<Record<string, CollState>>(STATE_KEY, {}) as Record<string, CollState>
  const nextState: Record<string, CollState> = {}
  const out = {} as Record<Coll, Wire>
  let changed = 0
  for (const coll of Object.keys(COLLS) as Coll[]) {
    const store = COLLS[coll] as { get: () => any[]; set: (v: any[]) => void }
    const before = store.get()
    const items = fixIds(before, uid)
    const st = refresh(coll, items, state[coll] || emptyState(), now)
    const merged = mergeColl(coll, { items, st }, body.data?.[coll] || emptyWire())
    const list = normalize(coll, merged.items)
    if (canon(list) !== canon(before)) {
      store.set(list)
      rearm(coll, before, list)
      changed += Math.abs(list.length - before.length) || 1
    }
    nextState[coll] = restamp(coll, list, merged.m, merged.tomb)
    out[coll] = { items: list, m: merged.m, tomb: merged.tomb }
  }
  kv.set(STATE_KEY, nextState)
  kv.set(LAST_KEY, { at: now, device: String(body.device || 'iPhone').slice(0, 60), changed } satisfies SyncLast)
  return { data: out }
}

/** Компьютер отвечает телефону, пока приложение запущено */
export function serveSync() {
  return safu.sync.serve(body => handleSync(body))
}

export const sync = {
  /** Новая связка: старый телефон перестаёт синхронизироваться, ссылку для QR — в ответе */
  async pair(): Promise<string | null> {
    const r = await safu.sync.pair()
    kv.set(STATE_KEY, {})
    kv.remove(LAST_KEY)
    return r?.url ?? null
  },
  /** Ссылка для QR уже связанного телефона (показать код ещё раз) */
  async link(): Promise<string | null> {
    const r = await safu.sync.link()
    return r?.url ?? null
  },
  async unpair() {
    await safu.sync.unpair()
    kv.set(STATE_KEY, {})
    kv.remove(LAST_KEY)
  }
}
