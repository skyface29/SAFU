// Связка с сайтом старост arktika-app.ru/otmetki/: те же группы, пары и отметки, что на сайте.
// Протокол и шифрование — один в один как в site/otmetki/index.html (HKDF + AES-GCM, ключ из кода группы).
// Код группы на сервер не уходит: сервер видит только номер группы (хеш из кода) и шифр.

export const API_BASES = [
  'https://functions.yandexcloud.net/d4e8m5ak49b1ggo0cbkh',   // функция Yandex (из России открывается везде)
  'https://otmetki-api.zarubin-kirillcka.workers.dev/'          // тот же сервер напрямую (Cloudflare)
]
export const SITE_URL = 'https://arktika-app.ru/otmetki/'
export const RUZ_URL = 'https://arktika-app.ru/raspisanie/data/web/'

/** p был, a нет, e уважительная, l опоздал, r перезачёт */
export type SiteMark = 'p' | 'a' | 'e' | 'l' | 'r'
export const SITE_MARKS: { id: SiteMark; sym: string; title: string; color: string }[] = [
  { id: 'p', sym: '+', title: 'Был', color: '#29bf6b' },
  { id: 'l', sym: 'О', title: 'Опоздал', color: '#5c85ff' },
  { id: 'e', sym: 'У', title: 'Уваж.', color: '#ff9e1a' },
  { id: 'a', sym: '−', title: 'Нет', color: '#f2474d' },
  { id: 'r', sym: 'П', title: 'Перезачёт', color: '#9b6bff' }
]
export type RosterItem = { id: string; n: string; t: string }
export type Meta = {
  v: number; name: string; ruz: { num: string; inst: number } | null; roster: RosterItem[]
  subs?: Record<string, string[]>; credits?: Record<string, string[]>; created?: number; updated?: number
}
export type SiteLesson = {
  d: string; t: string; e: string; subj: string; kind: string; teacher: string; sub: string; room?: string
  marks: Record<string, SiteMark>; by?: string; at?: number
}
export type Group = { code: string; gid: string; w: string; key: CryptoKey; meta: Meta }

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ID_ABC = 'abcdefghjklmnpqrstuvwxyz23456789'
const te = new TextEncoder(), td = new TextDecoder()
const subtle = () => globalThis.crypto.subtle

// ---------- шифрование ----------

function b32(bytes: Uint8Array, n: number) {
  let bits = 0, val = 0, out = ''
  for (let i = 0; i < bytes.length; i++) {
    val = ((val << 8) | bytes[i]) >>> 0; bits += 8
    while (bits >= 5) { out += ID_ABC[(val >>> (bits - 5)) & 31]; bits -= 5 }
    val &= (1 << bits) - 1
  }
  return out.slice(0, n)
}
function b64u(u: Uint8Array) {
  let s = ''
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64u(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const b = atob(s), u = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i)
  return u
}
async function hkdf(secret: string, info: string, len: number) {
  const k = await subtle().importKey('raw', te.encode(secret), 'HKDF', false, ['deriveBits'])
  const b = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('arktika-otmetki-v1'), info: te.encode(info) }, k, len * 8)
  return new Uint8Array(b)
}
const aesKey = (bytes: Uint8Array) => subtle().importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])

export function normCode(c: string) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I')
    .split('').filter(ch => CODE_ABC.includes(ch)).join('')
}
export const fmtCode = (c: string) => c.slice(0, 5) + '-' + c.slice(5, 10) + '-' + c.slice(10, 15)

export async function groupKeys(code: string) {
  code = normCode(code)
  const [g, w, k] = await Promise.all([hkdf(code, 'gid', 10), hkdf(code, 'write', 24), hkdf(code, 'key', 32)])
  return { code, gid: b32(g, 16), w: b64u(w), key: await aesKey(k) }
}
export async function studentKeys(gid: string, token: string) {
  const s = gid + ':' + token
  const [t, k] = await Promise.all([hkdf(s, 'tag', 10), hkdf(s, 'skey', 32)])
  return { tag: b32(t, 16), key: await aesKey(k) }
}
export async function enc(key: CryptoKey, obj: unknown) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)))
  const u = new Uint8Array(12 + ct.byteLength); u.set(iv); u.set(new Uint8Array(ct), 12)
  return b64u(u)
}
export async function dec<T = unknown>(key: CryptoKey, s: string): Promise<T> {
  const u = unb64u(s)
  const b = await subtle().decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12))
  return JSON.parse(td.decode(b))
}
export async function shortHash(s: string) {
  return b32(new Uint8Array(await subtle().digest('SHA-256', te.encode(s))), 8)
}
export async function lessonKey(date: string, l: { t: string; subj: string; kind: string; sub: string }) {
  return 'l/' + date + 'T' + l.t.replace(':', '') + '-' + await shortHash([l.subj, l.kind, l.sub].join('|'))
}

// ---------- сервер ----------

export class ApiError extends Error { constructor(msg: string, public status = 0, public offline = false) { super(msg) } }
let apiI = 0
export async function api<T = any>(op: string, params: Record<string, string> | null, body?: unknown): Promise<T> {
  const q = 'op=' + op + (params ? '&' + new URLSearchParams(params) : '')
  let last: ApiError | null = null
  for (let n = 0; n < API_BASES.length; n++) {
    const i = (apiI + n) % API_BASES.length, base = API_BASES[i]
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), body ? 15000 : 9000)
    try {
      const r = await fetch(base + (base.includes('?') ? '&' : '?') + q, body
        ? { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: ctl.signal }
        : { cache: 'no-store', signal: ctl.signal })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        last = new ApiError(j.error || 'ошибка ' + r.status, r.status)
        if (r.status >= 500) continue
        throw last
      }
      apiI = i
      return j
    } catch (e) {
      if (e instanceof ApiError && e.status && e.status < 500) throw e
      last = e instanceof ApiError ? e : new ApiError('Нет связи с сервером отметок', 0, true)
    } finally { clearTimeout(tm) }
  }
  throw last || new ApiError('Нет связи с сервером отметок', 0, true)
}

export async function openGroup(code: string): Promise<Group> {
  const k = await groupKeys(code)
  if (k.code.length !== 15) throw new ApiError('В коде группы 15 символов, сейчас ' + k.code.length)
  let r: { d: string }
  try { r = await api('get', { g: k.gid, k: 'meta' }) } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new ApiError('Группа с таким кодом не найдена. Проверь код у старосты', 404)
    throw e
  }
  const meta = await dec<Meta>(k.key, r.d)
  return { ...k, meta }
}

export async function loadMonth(G: Group, m: string): Promise<Record<string, SiteLesson>> {
  const r = await api<{ items: Record<string, string> }>('month', { g: G.gid, m })
  const out: Record<string, SiteLesson> = {}
  await Promise.all(Object.entries(r.items || {}).map(async ([k, v]) => {
    try { out[k] = await dec<SiteLesson>(G.key, JSON.parse(v).g) } catch { /* чужой или битый ключ — пропускаем */ }
  }))
  return out
}

/** Сохранить пару так же, как сайт: шифр для старост + часть каждого студента + подгруппа в meta. */
export async function saveLesson(G: Group, k: string, les: SiteLesson, who: string) {
  const L: SiteLesson = { ...les, by: who, at: Date.now() }
  delete (L as any)._k
  const all = await enc(G.key, L)
  const parts: Record<string, string> = {}
  await Promise.all(G.meta.roster.map(async s => {
    const m = L.marks[s.id]; if (!m) return
    const sk = await studentKeys(G.gid, s.t)
    parts[sk.tag] = await enc(sk.key, { d: L.d, t: L.t, subj: L.subj, kind: L.kind, m })
  }))
  const items: { k: string; d: string }[] = [{ k, d: JSON.stringify({ g: all, s: parts }) }]
  const was0 = (G.meta.subs || {})[L.sub] || []
  const ids = Object.keys(L.marks).filter(id => L.marks[id] !== 'r' || was0.includes(id)).sort()
  if (L.sub && ids.length && ids.length < G.meta.roster.length) {
    const was = was0.slice().sort()
    if (was.join() !== ids.join()) {
      G.meta.subs = { ...(G.meta.subs || {}), [L.sub]: ids }
      G.meta.updated = Date.now()
      items.push({ k: 'meta', d: await enc(G.key, G.meta) })
    }
  }
  await api('put', null, { g: G.gid, w: G.w, items })
  return L
}
export const deleteLesson = (G: Group, k: string) => api('del', null, { g: G.gid, w: G.w, k })

/** Перезачёт: студенты, которым предмет перезачли, на новой паре сразу «r» (кроме чужой подгруппы). */
export function applyCredits(G: Group, les: SiteLesson) {
  const subs = (G.meta.subs || {})[les.sub] || null
  for (const s of G.meta.roster) {
    const c = (G.meta.credits || {})[s.id]
    if (c && c.includes(les.subj) && (!subs || subs.includes(s.id)) && !les.marks[s.id]) les.marks[s.id] = 'r'
  }
  return les
}

export function countMarks(G: Group, marks: Record<string, SiteMark>) {
  const c = { p: 0, a: 0, e: 0, l: 0, r: 0, n: 0 }
  for (const s of G.meta.roster) { const m = marks[s.id]; if (m) c[m]++; else c.n++ }
  return c
}

// ---------- расписание из зеркала РУЗ (то же, что берёт сайт: от него зависит ключ пары) ----------

const MSK = 3 * 3600e3
export const mskDate = (ts: number) => new Date(ts + MSK).toISOString().slice(0, 10)
export const mskTime = (ts: number) => new Date(ts + MSK).toISOString().slice(11, 16)
type School = { base: number; S: string[]; G: [string | number, ...unknown[]][]; L: number[][] }
const ruzCache = new Map<string, Promise<any>>()
function getJSON(u: string) {
  let p = ruzCache.get(u)
  if (!p) {
    p = fetch(u).then(r => { if (!r.ok) throw new Error('ruz ' + r.status); return r.json() })
    p.catch(() => ruzCache.delete(u))
    ruzCache.set(u, p)
  }
  return p
}
export function resetRuzCache() { ruzCache.clear() }

export type PlanLesson = { t: string; e: string; subj: string; kind: string; teacher: string; room: string; sub: string }
export async function ruzLessons(ruz: Meta['ruz'], date: string): Promise<PlanLesson[]> {
  if (!ruz) return []
  try {
    const m = await getJSON(RUZ_URL + 'm.json')
    const d: School = await getJSON(RUZ_URL + m.s[ruz.inst])
    const gi = d.G.findIndex(g => String(g[0]) === String(ruz.num))
    if (gi < 0) return []
    const out: PlanLesson[] = [], seen = new Set<string>()
    for (const r of d.L) {
      if (!r.slice(9).includes(gi)) continue
      const st = (d.base + r[0]) * 6e4
      if (mskDate(st) !== date) continue
      const l = { t: mskTime(st), e: mskTime(st + r[1] * 6e4), subj: d.S[r[2]] || '', kind: d.S[r[3]] || '', teacher: d.S[r[4]] || '', room: d.S[r[5]] || '', sub: d.S[r[8]] || '' }
      const k = l.t + '|' + l.subj + '|' + l.kind + '|' + l.sub
      if (seen.has(k)) continue
      seen.add(k); out.push(l)
    }
    return out.sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : 0)
  } catch { return [] }
}

export type DayItem = { k: string; plan: PlanLesson | null; saved: SiteLesson | null; d: string }
/** Пары дня: по расписанию + уже отмеченные на сайте (в том числе добавленные вручную). */
export async function dayLessons(G: Group, date: string, month: Record<string, SiteLesson>): Promise<DayItem[]> {
  const plan = await ruzLessons(G.meta.ruz, date)
  const items: DayItem[] = [], keys = new Set<string>()
  for (const l of plan) {
    const k = await lessonKey(date, l)
    if (keys.has(k)) continue
    keys.add(k); items.push({ k, plan: l, saved: month[k] || null, d: date })
  }
  for (const [k, s] of Object.entries(month)) if (s.d === date && !keys.has(k)) items.push({ k, plan: null, saved: s, d: date })
  return items.sort((a, b) => {
    const x = (a.saved || a.plan)!.t, y = (b.saved || b.plan)!.t
    return x < y ? -1 : x > y ? 1 : 0
  })
}
export function newLesson(date: string, l: PlanLesson): SiteLesson {
  return { d: date, t: l.t, e: l.e || '', subj: l.subj, kind: l.kind || '', teacher: l.teacher || '', sub: l.sub || '', marks: {} }
}
export function subName(x: string) {
  x = String(x || '').replace(/^\d{6}\s*[_\-–.,]*\s*/, '').trim()
  return x ? (/^\d+$/.test(x) ? 'подгруппа ' + x : x) : ''
}
