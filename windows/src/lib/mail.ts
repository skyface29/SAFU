// Уведомления о новых письмах в почте САФУ (MailWatch.swift). Сама проверка — в главном процессе.
import { kv } from './kv'
import { safu } from './bridge'
import { creds } from './creds'
import { notify } from './notify'
import { advanceMail, type MailBoxState } from './mailstate'

export type MailReport = { ok: boolean; via?: 'ximss' | 'imap'; unseen?: number; total?: number; messages?: { uid: number; from: string; subject: string; seen: boolean }[]; validity?: number; maxUID?: number; error?: string; kind?: string }

let running = false

export const mailWatch = {
  enabled: () => kv.get('mail.notify', false),
  server: () => kv.get('mail.server', '') || 'edu.narfu.ru',
  port: () => kv.get('mail.port', 993) || 993,
  transport: () => kv.get<'auto' | 'ximss' | 'imap'>('mail.transport', 'auto'),

  async checkIfEnabled() {
    if (!mailWatch.enabled()) return
    try { await mailWatch.check(true) } catch { /* ошибка записана */ }
  },

  async check(doNotify = true): Promise<MailReport> {
    if (running) return { ok: false, error: 'Проверка уже идёт' }
    running = true
    try {
      await creds.load()
      const acc = creds.mailAccount()
      kv.set('mail.lastCheck', Date.now())
      if (!acc) {
        const r = { ok: false, error: 'Нет сохранённого пароля. Открой почту в приложении и войди — пароль сохранится.' }
        kv.set('mail.lastError', r.error)
        return r
      }
      const r: MailReport = await safu.mail.check({
        user: acc.user.trim(), pass: acc.pass, server: mailWatch.server(), port: mailWatch.port(),
        transport: mailWatch.transport(), preferImap: kv.get('mail.via', '') === 'imap'
      })
      if (!r.ok) { kv.set('mail.lastError', r.error || 'Почта недоступна'); return r }
      kv.set('mail.lastError', null)
      kv.set('mail.lastSuccess', Date.now())
      kv.set('mail.via', r.via)
      kv.set('mail.unseen', r.unseen ?? 0)
      // новые письма: номер больше последнего виденного (как advance() в iOS)
      const msgs = r.messages || []
      const vKey = `mail.uidValidity.${r.via}`
      const iKey = `mail.inited.${r.via}`
      const st: MailBoxState = { lastUID: kv.get('mail.lastUID', 0), validity: kv.get(vKey, 0), inited: kv.get(iKey, false) }
      const { fresh, next } = advanceMail(st, msgs, r.maxUID ?? 0, r.validity ?? 0)
      kv.set('mail.lastUID', next.lastUID)
      kv.set(vKey, next.validity)
      kv.set(iKey, true)
      kv.set('mail.recent', msgs.slice(0, 10))
      if (doNotify && fresh.length) {
        for (const m of fresh.slice(-3)) notify.show({ title: m.from || 'Почта САФУ', body: m.subject || '(без темы)', route: 'site:mail' })
        if (fresh.length > 3) notify.show({ title: 'Почта САФУ', body: `И ещё ${fresh.length - 3} новых писем`, route: 'site:mail' })
      }
      return r
    } finally {
      running = false
    }
  },

  sendTest() {
    notify.schedule('mail-test', [{ id: 'mail-test', at: Date.now() + 5000, title: 'Иванов И. И.', body: 'Так будет выглядеть уведомление о новом письме', route: 'site:mail' }])
  }
}
