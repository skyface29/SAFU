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
}

type State = {
  tabs: SiteTab[]
  active: string | null
  mode: 'closed' | 'open' | 'stack'
}

export const useSites = create<State>(() => ({ tabs: restoreSaved(), active: null, mode: 'closed' }))

// ---------- вкладки переживают перезапуск (как на iPhone) ----------

type Saved = { kind: SiteTab['kind']; title: string; url: string; icon: string; resourceId?: string; fileRel?: string; ext?: string }
const SAVED_KEY = 'sites.saved.v1'

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

export function openSite(r: Resource | { title: string; url: string; icon?: string }, opts: { fresh?: boolean } = {}) {
  const s = useSites.getState()
  const res = 'id' in r ? r as Resource : null
  const existing = s.tabs.find(t => (res && t.resourceId === res.id) || (!res && t.url === r.url))
  if (res) resources.markOpened(res)
  if (existing) { useSites.setState({ active: existing.id, mode: 'open' }); return existing.id }
  const url = res && !opts.fresh ? resources.lastURL(res) || res.url : r.url
  const tab: SiteTab = { id: uid(), kind: 'site', title: r.title, url, icon: (r as any).icon || 'globe', resourceId: res?.id, loading: true }
  useSites.setState({ tabs: [...s.tabs, tab].slice(-8), active: tab.id, mode: 'open' })
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
  if (existing) { useSites.setState({ active: existing.id, mode: 'open' }); return }
  const tab: SiteTab = { id: uid(), kind: 'file', title: name, url: '', icon: 'file', fileRel: rel, ext }
  useSites.setState({ tabs: [...s.tabs, tab].slice(-8), active: tab.id, mode: 'open' })
}

export const sites = {
  minimize() { useSites.setState({ mode: 'closed' }) },
  expand(id?: string) {
    const s = useSites.getState()
    const target = id || s.active || s.tabs[s.tabs.length - 1]?.id
    if (target) useSites.setState({ active: target, mode: 'open' })
  },
  stack() { if (useSites.getState().tabs.length) useSites.setState({ mode: 'stack' }) },
  close(id: string) {
    const s = useSites.getState()
    const tabs = s.tabs.filter(t => t.id !== id)
    const wasActive = s.active === id
    useSites.setState({
      tabs,
      active: wasActive ? null : s.active,
      mode: !tabs.length ? 'closed' : wasActive && s.mode === 'open' ? 'closed' : s.mode
    })
  },
  closeAll() { useSites.setState({ tabs: [], active: null, mode: 'closed' }) },
  update(id: string, patch: Partial<SiteTab>) {
    useSites.setState(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, ...patch } : t) }))
  }
}
