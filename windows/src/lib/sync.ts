// Синхронизация с iPhone по домашнему Wi‑Fi: ДЗ, задачи и заметки — одинаковые на телефоне и компьютере.
// Телефон сам заходит на компьютер (пока Арктика здесь запущена, даже свёрнутой в трей), присылает свою
// версию и забирает общую. Сведение по полям — в syncmerge.ts.
import { useSyncExternalStore } from 'react'
import { kv, uid } from './kv'
import { safu } from './bridge'
import { homeworkStore, rearmHomework } from './homework'
import { tasksStore, notesStore, rearmTask } from './study'
import { notify } from './notify'
import { refresh, restamp, mergeColl, fixIds, canon, sameJson, emptyState, emptyWire, idOf, type CollState, type Wire } from './syncmerge'

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

/**
 * Телефон заходит раз в 10 секунд и почти всегда присылает то же, что в прошлый раз. Тогда главный процесс
 * не пересылает сюда его данные, а спрашивает: «то же, что в ответе seq, — здесь с тех пор что-нибудь меняли?»
 * Не меняли — ответ прежний, сводить заново не нужно (раньше каждые 10 секунд всё сводилось заново:
 * отпечатки всех полей всех записей — десятки миллисекунд в интерфейсе)
 */
// номера ответов не повторяются и после перезапуска окна
let seq = Date.now()
/** Ответы с этого номера ещё верны: после них здесь ничего не менялось (ни правками, ни сведением) */
let clean = Infinity
let dirty = true
let fullAt = 0
for (const c of Object.values(COLLS)) c.subscribe(() => { dirty = true })
kv.subscribe(STATE_KEY, () => { dirty = true })
/** Раз в 10 минут сводим заново и без изменений: старые отметки об удалении так дочищаются */
const FULL_EVERY = 10 * 60_000

export type SyncBody = { device?: string; data?: Partial<Record<Coll, Wire>>; same?: boolean; seq?: number }
export type SyncReply = { data: Record<Coll, Wire>; seq: number } | { same: true } | { stale: true }

/** Телефон прислал свою версию — сводим и отдаём общую. Вызывается главным процессом */
export function handleSync(body: SyncBody): SyncReply {
  const now = Date.now()
  const device = String(body.device || 'iPhone').slice(0, 60)
  if (body.same) {
    const n = Number(body.seq)
    if (dirty || !(n >= clean && n <= seq) || now - fullAt > FULL_EVERY) return { stale: true }
    seen({ at: now, device, changed: 0 })
    return { same: true }
  }
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
    if (!sameJson(list, before)) {
      store.set(list)
      rearm(coll, before, list)
      changed += Math.abs(list.length - before.length) || 1
    }
    nextState[coll] = restamp(coll, list, merged.m, merged.tomb)
    out[coll] = { items: list, m: merged.m, tomb: merged.tomb }
  }
  kv.set(STATE_KEY, nextState)
  seen({ at: now, device, changed })
  // с прошлых ответов что-то поменялось (правкой или этим сведением) — они больше не годятся
  if (dirty) clean = seq + 1
  dirty = false
  fullAt = now
  return { data: out, seq: ++seq }
}

/**
 * «Последний раз на связи». Телефон заходит раз в 10 секунд — время держим в памяти, а на диск пишем, только
 * когда что-то поменялось, сменился телефон или раз в 5 минут (раньше файл данных переписывался каждые 10 секунд)
 */
let live: SyncLast | null = null
const liveSubs = new Set<() => void>()
function seen(l: SyncLast) {
  const saved = kv.get<SyncLast | null>(LAST_KEY, null)
  const shown = live ?? saved
  live = l
  if (l.changed || !saved || saved.device !== l.device || l.at - saved.at > 5 * 60_000) kv.set(LAST_KEY, l)
  // надписи «на связи» перерисовываем, только если телефон вернулся после перерыва; иначе их обновит свой таймер
  else if (!shown || shown.device !== l.device || l.at - shown.at > 20_000) liveSubs.forEach(f => f())
}
function forget() {
  live = null
  kv.remove(LAST_KEY)
  liveSubs.forEach(f => f())
}

/** Когда телефон последний раз был на связи (свежее, чем записано на диске) */
export function lastSync(): SyncLast | null {
  const saved = kv.get<SyncLast | null>(LAST_KEY, null)
  return live && (!saved || live.at >= saved.at) ? live : saved
}
const watchLast = (f: () => void) => {
  liveSubs.add(f)
  const off = kv.subscribe(LAST_KEY, f)
  return () => { liveSubs.delete(f); off() }
}
export const useSyncLast = () => useSyncExternalStore(watchLast, lastSync)

/** Фото к ДЗ с iPhone приходят файлами «ДЗ с iPhone/<номер ДЗ>/<имя>» — прикрепляем их к тому же ДЗ здесь */
export const HW_PHOTO_DIR = 'ДЗ с iPhone'
export function attachHomeworkPhoto(rel: string): boolean {
  const m = new RegExp(`^${HW_PHOTO_DIR}/([0-9a-f-]{36})/[^/]+$`, 'i').exec(rel)
  if (!m) return false
  const id = m[1].toLowerCase()
  const list = homeworkStore.get()
  const i = list.findIndex(h => String(h.id).toLowerCase() === id)
  if (i < 0 || list[i].photos?.includes(rel)) return false
  const next = list.slice()
  next[i] = { ...list[i], photos: [...(list[i].photos || []), rel] }
  homeworkStore.set(next)
  return true
}

/** Компьютер отвечает телефону, пока приложение запущено; файлы с телефона приходят сами */
export function serveSync() {
  const a = safu.sync.serve(body => handleSync(body))
  const b = safu.sync.onFile(f => { attachHomeworkPhoto(f.rel) })
  return () => { a(); b() }
}

export const sync = {
  /** Новая связка: старый телефон перестаёт синхронизироваться, ссылку для QR — в ответе */
  async pair(): Promise<string | null> {
    const r = await safu.sync.pair()
    kv.set(STATE_KEY, {})
    forget()
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
    forget()
  }
}
