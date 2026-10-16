// Синхронизация ДЗ, задач и заметок между iPhone и компьютером — сведение двух версий.
//
// У каждой записи каждое поле помнит, когда его меняли на этом устройстве. При встрече двух версий
// по каждому полю побеждает то, что меняли позже. Поэтому, если на телефоне отметил ДЗ сделанным,
// а на компьютере в это время расписание сдвинуло его срок, сохранится и то и другое.
// Удалённая запись оставляет отметку «удалена тогда-то»: она побеждает, если запись после этого не меняли.
// Здесь только чистые функции — без хранилища, сети и окон (их проверяют тесты).

const DAY = 86_400_000

/** Отпечаток значения поля и когда поле меняли (мс) */
export type Stamp = [string, number]
export type CollState = {
  stamps: Record<string, Record<string, Stamp>>
  /** id → когда запись удалили */
  tomb: Record<string, number>
  /** Отметки уже ставились (первая синхронизация после связки идёт по подсказкам из самих данных) */
  init?: boolean
}
/** Как коллекция едет по сети: записи, «когда менялось» по полям и удалённые */
export type Wire = { items: any[]; m: Record<string, Record<string, number>>; tomb: Record<string, number> }

export const emptyState = (): CollState => ({ stamps: {}, tomb: {} })
export const emptyWire = (): Wire => ({ items: [], m: {}, tomb: {} })

/** Поля, которые не синхронизируются: фото ДЗ лежат файлами на своём устройстве */
export const LOCAL_ONLY: Record<string, string[]> = { homework: ['photos'] }

export const idOf = (x: any) => String(x?.id ?? '').toLowerCase()

/** JSON с ключами по алфавиту — одинаковые значения дают одинаковую строку */
export function canon(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'
  const o = v as Record<string, unknown>
  return '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'
}

/** Короткий отпечаток (cyrb53) */
export function fingerprint(v: unknown): string {
  const s = canon(v)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Когда менялось поле, которое видим впервые при первой синхронизации: берём из самих данных */
export function hint(coll: string, item: any, field: string): number {
  if (coll === 'homework' && (field === 'done' || field === 'doneAt' || field === 'steps')) return Number(item?.doneAt) || 0
  if (coll === 'notes') return Number(item?.updated) || 0
  return 0
}

const synced = (coll: string, f: string) => f !== 'id' && !(LOCAL_ONLY[coll] || []).includes(f)

/** Отметить свои изменения с прошлого раза: поле поменялось — «сейчас», запись пропала — удалена сейчас */
export function refresh(coll: string, items: any[], st: CollState, now: number): CollState {
  const first = !st.init
  const stamps: CollState['stamps'] = {}
  const tomb = { ...st.tomb }
  for (const it of items) {
    const id = idOf(it)
    if (!id) continue
    const old = st.stamps[id]
    const s: Record<string, Stamp> = {}
    for (const f of Object.keys(it)) {
      if (!synced(coll, f)) continue
      const h = fingerprint(it[f])
      const prev = old?.[f]
      if (prev) s[f] = prev[0] === h ? prev : [h, now]
      // новое поле у старой записи (обновление приложения) — не правка; новая запись — правка сейчас
      else s[f] = [h, first ? hint(coll, it, f) : old ? 0 : now]
    }
    stamps[id] = s
    delete tomb[id]
  }
  for (const id of Object.keys(st.stamps)) if (!stamps[id]) tomb[id] = now
  for (const [id, t] of Object.entries(tomb)) if (now - t > 120 * DAY) delete tomb[id]
  return { stamps, tomb, init: true }
}

/** Отметки для того, что получилось после сведения: отпечатки — свои, «когда менялось» — общее */
export function restamp(coll: string, items: any[], m: Wire['m'], tomb: Wire['tomb']): CollState {
  const stamps: CollState['stamps'] = {}
  for (const it of items) {
    const id = idOf(it)
    if (!id) continue
    const s: Record<string, Stamp> = {}
    for (const f of Object.keys(it)) if (synced(coll, f)) s[f] = [fingerprint(it[f]), m[id]?.[f] ?? 0]
    stamps[id] = s
  }
  return { stamps, tomb: { ...tomb }, init: true }
}

/** Отметки этого устройства — в виде для сети */
export function toWire(items: any[], st: CollState): Wire {
  const m: Wire['m'] = {}
  for (const [id, s] of Object.entries(st.stamps)) {
    m[id] = {}
    for (const [f, [, t]] of Object.entries(s)) m[id][f] = t
  }
  return { items, m, tomb: { ...st.tomb } }
}

const maxOf = (r: Record<string, number> | undefined) => Math.max(0, ...Object.values(r || {}))

/** Пустое значение поля, которое у пришедшей записи не переносится (фото — чужие файлы) */
const blank = (v: unknown) => (Array.isArray(v) ? [] : typeof v === 'string' ? '' : null)

/**
 * Свести свою коллекцию (local, отметки уже обновлены refresh) с пришедшей (remote).
 * Порядок — свой, новые записи с той стороны — в конце
 */
export function mergeColl(coll: string, local: { items: any[]; st: CollState }, remote: Wire): Wire {
  const L = new Map(local.items.map(x => [idOf(x), x] as const))
  const R = new Map((remote.items || []).map(x => [idOf(x), x] as const))
  const lm = (id: string): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const [f, [, t]] of Object.entries(local.st.stamps[id] || {})) out[f] = t
    return out
  }
  const rTomb = remote.tomb || {}
  const lTomb = local.st.tomb || {}
  const tomb: Record<string, number> = { ...lTomb }
  for (const [id, t] of Object.entries(rTomb)) tomb[id] = Math.max(tomb[id] ?? 0, t)

  const items: any[] = []
  const m: Wire['m'] = {}
  const order = [...L.keys(), ...[...R.keys()].filter(id => !L.has(id))]
  for (const id of order) {
    if (!id) continue
    const l = L.get(id)
    const r = R.get(id)
    const lt = lm(id)
    const rt = remote.m?.[id] || {}
    if (l && !r) {
      // там удалили — и здесь после этого не трогали
      if (rTomb[id] !== undefined && rTomb[id] >= maxOf(lt)) continue
      items.push(l)
      m[id] = lt
      delete tomb[id]
    } else if (r && !l) {
      if (lTomb[id] !== undefined && lTomb[id] >= maxOf(rt)) continue
      const it = { ...r }
      for (const f of LOCAL_ONLY[coll] || []) if (f in it) it[f] = blank(it[f])
      items.push(it)
      m[id] = { ...rt }
      delete tomb[id]
    } else if (l && r) {
      const it: any = { ...l }
      const mm: Record<string, number> = {}
      for (const f of new Set([...Object.keys(l), ...Object.keys(r)])) {
        if (!synced(coll, f)) continue
        const a = lt[f] ?? 0
        const b = rt[f] ?? 0
        let useRemote = b > a
        if (a === b) {
          // ничья (первая встреча): «сделано» важнее «не сделано», недостающее поле берём оттуда
          if (f === 'done') useRemote = !!r.done && !l.done
          else if (f === 'doneAt') useRemote = r.doneAt != null && l.doneAt == null
          else useRemote = !(f in l)
        }
        if (useRemote && f in r) it[f] = r[f]
        mm[f] = Math.max(a, b)
      }
      items.push(it)
      m[id] = mm
      delete tomb[id]
    }
  }
  return { items, m, tomb }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUUID = (s: unknown) => typeof s === 'string' && UUID.test(s)

/**
 * iPhone понимает только настоящие UUID — у записей и у подпунктов ДЗ и заметок.
 * Возвращает те же записи (или исправленные копии, если что-то поменялось)
 */
export function fixIds(items: any[], newId: () => string): any[] {
  let changed = false
  const out = items.map(it => {
    let x = it
    if (!isUUID(x?.id)) { x = { ...x, id: newId() }; changed = true }
    for (const k of ['steps', 'items']) {
      const list = x?.[k]
      if (Array.isArray(list) && list.some((s: any) => !isUUID(s?.id))) {
        x = { ...x, [k]: list.map((s: any) => (isUUID(s?.id) ? s : { ...s, id: newId() })) }
        changed = true
      }
    }
    return x
  })
  return changed ? out : items
}
