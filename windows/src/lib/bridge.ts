// Доступ к возможностям Windows из интерфейса. В обычном браузере (для разработки и тестов)
// подставляется заглушка на localStorage — приложение открывается и там.
import type { SafuAPI } from '../../electron/preload'

declare global {
  interface Window { safu?: SafuAPI }
}

function browserFallback(): SafuAPI {
  const LS = 'safu.kv'
  const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} } }
  const secrets: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem('safu.secrets') || '{}') } catch { return {} } })()
  const noop = async () => null as any
  const api: any = {
    kv: {
      all: () => read(),
      set: (k: string, v: unknown) => { const all = read(); if (v == null) delete all[k]; else all[k] = v; localStorage.setItem(LS, JSON.stringify(all)) },
      replace: (all: any) => localStorage.setItem(LS, JSON.stringify(all))
    },
    secret: {
      get: async (k: string) => secrets[k] ?? null,
      all: async () => ({ ...secrets }),
      set: async (k: string, v: string | null) => { if (v == null) delete secrets[k]; else secrets[k] = v; localStorage.setItem('safu.secrets', JSON.stringify(secrets)); return true },
      replace: async (a: any) => { Object.keys(secrets).forEach(k => delete secrets[k]); Object.assign(secrets, a); return true }
    },
    cache: {
      get: async (n: string) => { try { return JSON.parse(localStorage.getItem('safu.cache.' + n) || 'null') } catch { return null } },
      set: async (n: string, v: unknown) => { try { if (v == null) localStorage.removeItem('safu.cache.' + n); else localStorage.setItem('safu.cache.' + n, JSON.stringify(v)) } catch { /* переполнено */ } return true }
    },
    net: {
      fetch: async (r: any) => {
        try {
          const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body })
          return { ok: res.ok, status: res.status, text: await res.text(), url: res.url, headers: {} }
        } catch (e) {
          return { ok: false, status: 0, text: '', url: r.url, headers: {}, error: String(e) }
        }
      }
    },
    notify: {
      show: async (n: any) => { console.info('[notify]', n.title, n.body); return true },
      schedule: async (_p: string, l: any[]) => l.length,
      list: async () => []
    },
    fs: new Proxy({}, { get: (_t, p) => p === 'list' || p === 'walk' ? async () => [] : p === 'root' ? async () => 'C:\\Users\\student\\Documents\\САФУ' : p === 'pathFor' ? () => '' : noop }),
    dialog: { save: noop, open: noop },
    shell: { open: async (u: string) => { window.open(u, '_blank'); return true } },
    clipboard: { write: async (t: string) => { await navigator.clipboard?.writeText(t).catch(() => null); return true }, read: async () => '' },
    app: {
      info: async () => ({ version: '17.0.0', platform: 'browser', electron: '-', chrome: '-', userData: '', autostart: false, encryption: false, dark: true }),
      autostart: noop, quit: noop, relaunch: async () => location.reload(), show: noop, badge: noop, titlebar: noop, mica: noop, flash: noop,
      on: () => () => {}
    },
    tray: { update: noop },
    widget: { toggle: async () => false, state: async () => false, push: () => {}, ready: () => {}, open: () => {}, resize: () => {} },
    backup: { readIOS: noop },
    ai: { summarize: async () => ({ ok: false, error: 'Конспекты ИИ работают в приложении для Windows' }) },
    mail: { check: async () => ({ ok: false, error: 'Почта проверяется только в приложении для Windows' }) },
    sites: { clear: noop, preload: async () => '' }
  }
  return api as SafuAPI
}

const w: any = typeof window !== 'undefined' ? window : {}
export const safu: SafuAPI = w.safu ?? browserFallback()
export const isDesktop = !!w.safu
export const isWidget = typeof location !== 'undefined' && location.hash === '#widget'

export type FileInfo = { name: string; rel: string; dir: boolean; size: number; mtime: number; ext: string }
export type FetchResult = { ok: boolean; status: number; text: string; url: string; headers: Record<string, string>; error?: string }

/** URL для показа локального файла предмета (картинки, PDF) */
export const fileURL = (rel: string) => 'safu-file://root/' + rel.split('/').map(encodeURIComponent).join('/')
