// Настройки и данные приложения (аналог UserDefaults/@AppStorage).
// Всё грузится один раз при старте, пишется на диск пачкой в главном процессе.
import { useSyncExternalStore, useCallback } from 'react'
import { safu } from './bridge'

/** 'student' → string, 10 → number: значения по умолчанию не сужают тип */
export type Widen<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T

let data: Record<string, unknown> = safu.kv.all() || {}
const listeners = new Map<string, Set<() => void>>()
const anyListeners = new Set<() => void>()

/** Равны ли значения. Один и тот же объект считаем изменённым: его могли поменять на месте */
function same(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Object.is(a, b)
  if (a === b) return false
  // быстрые отличия — без перевода обоих значений в текст (списки ДЗ и расписание бывают большими)
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && a.length !== (b as unknown[]).length) return false
  if (!Array.isArray(a) && Object.keys(a).length !== Object.keys(b).length) return false
  try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
}

function emit(key: string) {
  listeners.get(key)?.forEach(f => f())
  anyListeners.forEach(f => f())
}

export const kv = {
  get<T>(key: string, def: T): Widen<T> {
    const v = data[key]
    return (v === undefined ? def : v) as Widen<T>
  },
  has(key: string) { return data[key] !== undefined },
  set<T>(key: string, value: T) {
    // то же самое значение — не трогаем ни диск, ни подписчиков (почта, сайты и окно пишут одно и то же часто)
    const old = data[key]
    if ((value === undefined || value === null) ? old === undefined : same(old, value)) return
    if (value === undefined || value === null) delete data[key]
    else data[key] = value as unknown
    safu.kv.set(key, value as unknown)
    emit(key)
  },
  remove(key: string) { kv.set(key, undefined) },
  all() { return { ...data } },
  replaceAll(all: Record<string, unknown>) {
    data = { ...all }
    safu.kv.replace(data)
    for (const k of listeners.keys()) emit(k)
  },
  subscribe(key: string, f: () => void) {
    let s = listeners.get(key)
    if (!s) { s = new Set(); listeners.set(key, s) }
    s.add(f)
    return () => { s!.delete(f) }
  },
  subscribeAll(f: () => void) {
    anyListeners.add(f)
    return () => { anyListeners.delete(f) }
  }
}

/** Как @AppStorage: значение настройки + сеттер, компонент перерисуется при изменении */
export function usePref<T>(key: string, def: T): [Widen<T>, (v: Widen<T> | ((old: Widen<T>) => Widen<T>)) => void] {
  const value = useSyncExternalStore(
    useCallback(f => kv.subscribe(key, f), [key]),
    () => kv.get<T>(key, def)
  )
  const set = useCallback((v: Widen<T> | ((old: Widen<T>) => Widen<T>)) => {
    const next = typeof v === 'function' ? (v as (o: Widen<T>) => Widen<T>)(kv.get<T>(key, def)) : v
    kv.set(key, next)
  }, [key])
  return [value, set]
}

/** Маленькое хранилище-объект с подпиской (для списков: ДЗ, задачи, заметки...) */
export function createCollection<T>(key: string, def: T) {
  let cache: T = kv.get<T>(key, def) as T
  const subs = new Set<() => void>()
  kv.subscribe(key, () => { cache = kv.get<T>(key, def) as T; subs.forEach(f => f()) })
  return {
    get: () => cache,
    set(v: T | ((old: T) => T)) {
      const next = typeof v === 'function' ? (v as (o: T) => T)(cache) : v
      cache = next
      kv.set(key, next)
    },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
    use(): T {
      return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => cache)
    }
  }
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
