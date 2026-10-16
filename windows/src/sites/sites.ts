// Открытые сайты и файлы-карточки: развёрнут один, остальные свёрнуты в плашку и стопку
import { create } from 'zustand'
import { uid, kv } from '../lib/kv'
import { type Resource, resources, resourcesStore } from '../lib/resources'

export type SiteTab = {
  id: string
  kind: 'site' | 'file'
  title: string
  url: string
  icon: string
  resourceId?: string
  fileRel?: string
  ext?: string
  snapshot?: string
  loading?: boolean
  pageTitle?: string
  currentURL?: string
  canBack?: boolean
  canForward?: boolean
  /** Вкладка вернулась после перезапуска: страница загрузится, только когда её развернут */
  dormant?: boolean
  /** Закрывается: карточка уезжает, а страница выгрузится, когда анимация закончится */
  closing?: boolean
}

type State = {
  tabs: SiteTab[]
  active: string | null
  mode: 'closed' | 'open' | 'stack'
}

// ---------- вкладки переживают перезапуск (как на iPhone) ----------
// Ключ объявлен до хранилища: хранилище создаётся сразу при загрузке и читает его
// (когда ключ стоял ниже, приложение падало при запуске — оставался пустой фон)

type Saved = { kind: SiteTab['kind']; title: string; url: string; icon: string; resourceId?: string; fileRel?: string; ext?: string }
const SAVED_KEY = 'sites.saved.v1'

export const useSites = create<State>(() => ({ tabs: restoreSaved(), active: null, mode: 'closed' }))

/** При запуске — свёрнутыми в плашку, как их оставили (если с тех пор прошло меньше недели) */
function restoreSaved(): SiteTab[] {
  const s = kv.get<{ at: number; tabs: Saved[] } | null>(SAVED_KEY, null)
  if (!s || !Array.isArray(s.tabs) || Date.now() - s.at > 7 * 24 * 3600_000) return []
  return s.tabs.slice(-8).map(t => ({ ...t, id: uid(), dormant: true }))
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaved = ''
useSites.subscribe(st => {
  if (saveTimer) clearTimeout(saveTimer)
  // не на каждый кадр загрузки страницы: раз в секунду после последнего изменения
  saveTimer = setTimeout(() => {
    const tabs: Saved[] = st.tabs.map(t => ({ kind: t.kind, title: t.title, url: t.currentURL || t.url, icon: t.icon, resourceId: t.resourceId, fileRel: t.fileRel, ext: t.ext }))
    const json = JSON.stringify(tabs)
    if (json === lastSaved) return
    lastSaved = json
    kv.set(SAVED_KEY, tabs.length ? { at: Date.now(), tabs } : null)
  }, 1000)
})

// ---------- откуда карточка выросла (и куда вернётся при закрытии) ----------
// Запоминаем, на что нажали перед открытием: плитку, кнопку, плашку свёрнутых. Карточка вырастает из
// этого места, а при закрытии садится обратно, если оно ещё на экране

let lastPress: { el: WeakRef<Element>; at: number } | null = null
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pointerdown', e => {
    const t = e.target as Element | null
    // своя метка (плашка, карточка стопки) важнее кнопки внутри неё
    const el = t?.closest?.('[data-site-origin]') || t?.closest?.('.card, .chip, .btn, button, .side-item, .row, [role="button"]')
    lastPress = el ? { el: new WeakRef(el), at: performance.now() } : null
  }, true)
}
const origins = new Map<string, WeakRef<Element>>()
const lastExpandFrom = new Map<string, WeakRef<Element> | undefined>()

function takeOrigin(id: string) {
  const p = lastPress
  lastPress = null
  if (!p || performance.now() - p.at > 800) return
  const el = p.el.deref()
  if (el && el.isConnected) origins.set(id, new WeakRef(el))
}

export type OriginRect = { x: number; y: number; w: number; h: number; radius: number }

/** Где сейчас плитка, из которой открыли вкладку; null — её нет на экране (перешли на другую страницу) */
export function originRect(id: string): OriginRect | null {
  const el = origins.get(id)?.deref()
  if (!el || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8 || r.width > window.innerWidth * 0.7 || r.bottom < 0 || r.top > window.innerHeight) return null
  if (getComputedStyle(el).visibility === 'hidden') return null
  return { x: r.left, y: r.top, w: r.width, h: r.height, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14 }
}

export function forgetOrigin(id: string) { origins.delete(id) }

export function openSite(r: Resource | { title: string; url: string; icon?: string }, opts: { fresh?: boolean } = {}) {
  const s = useSites.getState()
  const res = 'id' in r ? r as Resource : null
  const existing = s.tabs.find(t => (res && t.resourceId === res.id) || (!res && t.url === r.url))
  if (res) resources.markOpened(res)
  if (existing) { takeOrigin(existing.id); useSites.setState({ active: existing.id, mode: 'open' }); return existing.id }
  const url = res && !opts.fresh ? resources.lastURL(res) || res.url : r.url
  const tab: SiteTab = { id: uid(), kind: 'site', title: r.title, url, icon: (r as any).icon || 'globe', resourceId: res?.id, loading: true }
  takeOrigin(tab.id)
  useSites.setState({ tabs: trimmed([...s.tabs, tab], tab.id), active: tab.id, mode: 'open' })
  return tab.id
}

export function openURL(url: string, title?: string) {
  let t = title
  if (!t) { try { t = new URL(url).host.replace(/^www\./, '') } catch { t = url } }
  return openSite({ title: t, url, icon: 'globe' })
}

/** Открыть сайт по части адреса: 'mail' → почта, 'sakai' → Sakai */
export function openSiteByKey(k: string) {
  const map: Record<string, string> = { mail: 'edu.narfu', sakai: 'sakai', ruz: 'ruz.narfu', office: 'office.edu', lk: 'lk.narfu' }
  const part = map[k] || k
  const r = resourcesStore.get().find(x => x.url.includes(part))
  if (r) openSite(r)
}

export function openFileCard(rel: string, name: string, ext: string) {
  const s = useSites.getState()
  const existing = s.tabs.find(t => t.fileRel === rel)
  if (existing) { takeOrigin(existing.id); useSites.setState({ active: existing.id, mode: 'open' }); return }
  const tab: SiteTab = { id: uid(), kind: 'file', title: name, url: '', icon: 'file', fileRel: rel, ext }
  takeOrigin(tab.id)
  useSites.setState({ tabs: trimmed([...s.tabs, tab], tab.id), active: tab.id, mode: 'open' })
}

/** Сайтов держим не больше 4 (каждый — отдельный процесс на 150–400 МБ), всего вкладок — 8: самые давние закрываются */
const SITE_LIMIT = 4
const TOTAL_LIMIT = 8
function trimmed(list: SiteTab[], keep: string): SiteTab[] {
  let out = list
  while (out.filter(t => t.kind === 'site').length > SITE_LIMIT) {
    const old = out.find(t => t.kind === 'site' && t.id !== keep)
    if (!old) break
    out = out.filter(t => t.id !== old.id)
  }
  while (out.length > TOTAL_LIMIT) {
    const old = out.find(t => t.id !== keep)
    if (!old) break
    out = out.filter(t => t.id !== old.id)
  }
  return out
}

export const sites = {
  minimize() { useSites.setState({ mode: 'closed' }) },
  expand(id?: string) {
    const s = useSites.getState()
    const target = id || s.active || s.tabs[s.tabs.length - 1]?.id
    if (!target) return
    // развернули из плашки или стопки — вырастает оттуда (а закроется туда, откуда открывали вначале)
    const keep = origins.get(target)
    takeOrigin(target)
    const fresh = origins.get(target)
    if (keep && fresh !== keep) { lastExpandFrom.set(target, fresh); origins.set(target, keep) }
    useSites.setState({ active: target, mode: 'open' })
  },
  stack() { if (useSites.getState().tabs.length) useSites.setState({ mode: 'stack' }) },
  /** Откуда вырос этот разворот (плашка, стопка) — только для анимации появления */
  expandedFrom(id: string): OriginRect | null {
    const ref = lastExpandFrom.get(id)
    lastExpandFrom.delete(id)
    const el = ref?.deref()
    if (!el || !el.isConnected) return null
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) return null
    return { x: r.left, y: r.top, w: r.width, h: r.height, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14 }
  },
  close(id: string) {
    const s = useSites.getState()
    const wasOpen = s.active === id && s.mode === 'open'
    const drop = () => {
      const st = useSites.getState()
      const tabs = st.tabs.filter(t => t.id !== id)
      useSites.setState({
        tabs,
        active: st.active === id ? null : st.active,
        mode: !tabs.length ? 'closed' : st.mode
      })
    }
    if (!wasOpen) { drop(); return }
    // развёрнутая: сначала карточка плавно уезжает (страница в ней уже спрятана),
    // и только потом страница выгружается — выгрузка больше не попадает на анимацию
    useSites.setState({ tabs: s.tabs.map(t => t.id === id ? { ...t, closing: true } : t), mode: 'closed' })
    setTimeout(() => { drop(); origins.delete(id) }, 520)
  },
  closeAll() { useSites.setState({ tabs: [], active: null, mode: 'closed' }) },
  update(id: string, patch: Partial<SiteTab>) {
    useSites.setState(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, ...patch } : t) }))
  }
}
