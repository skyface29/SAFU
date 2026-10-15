// Пароли сайтов: хранятся зашифрованными (Windows DPAPI) в главном процессе
import { safu } from './bridge'
import { create } from 'zustand'

export type Credential = { host: string; user: string; pass: string; saved: number }

export const useCreds = create<{ list: Credential[] }>(() => ({ list: [] }))

const KEY = (host: string) => `cred:${host.toLowerCase()}`

export const creds = {
  async load() {
    const all = await safu.secret.all()
    const list = Object.entries(all).filter(([k]) => k.startsWith('cred:')).map(([, v]) => { try { return JSON.parse(v) as Credential } catch { return null } })
      .filter((c): c is Credential => !!c).sort((a, b) => a.host.localeCompare(b.host))
    useCreds.setState({ list })
    return list
  },
  get(host: string): Credential | null {
    const h = host.toLowerCase()
    const list = useCreds.getState().list
    return list.find(c => c.host === h) || list.find(c => h.endsWith('.' + c.host) || c.host.endsWith('.' + h)) || null
  },
  async set(c: Omit<Credential, 'saved'>) {
    const v: Credential = { ...c, host: c.host.toLowerCase(), saved: Date.now() }
    await safu.secret.set(KEY(v.host), JSON.stringify(v))
    await creds.load()
  },
  async remove(host: string) { await safu.secret.set(KEY(host), null); await creds.load() },
  async removeAll() { for (const c of useCreds.getState().list) await safu.secret.set(KEY(c.host), null); await creds.load() },
  /** Учётка для почты: сама почта, иначе вход на других сайтах САФУ (та же учётная запись) */
  mailAccount(): (Credential & { source: string }) | null {
    const usable = (c: Credential) => c.user.trim() && c.pass
    const m = creds.get('edu.narfu.ru')
    if (m && usable(m)) return { ...m, source: 'почты' }
    const rank = (h: string) => h.includes('sakai') ? 0 : h.startsWith('lk.') ? 1 : 2
    const others = useCreds.getState().list.filter(c => c.host.endsWith('narfu.ru') && usable(c)).sort((a, b) => rank(a.host) - rank(b.host))
    const c = others[0]
    if (!c) return null
    return { ...c, source: c.host.includes('sakai') ? 'Sakai' : c.host.startsWith('lk.') ? 'личного кабинета' : c.host }
  }
}
