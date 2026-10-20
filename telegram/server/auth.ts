// Вход в мини-приложение: Telegram подписывает initData токеном бота — проверяем подпись,
// пароли и отдельные аккаунты не нужны. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { TgUser } from './homework'

export type InitData = { user: TgUser; startParam: string; authDate: number }

export function checkInitData(raw: string, botToken: string, maxAge = 24 * 3600, now = Date.now()): InitData | null {
  if (!raw || !botToken) return null
  const params = new URLSearchParams(raw)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(check).digest()
  const given = Buffer.from(hash, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  const authDate = Number(params.get('auth_date'))
  if (!authDate || now / 1000 - authDate > maxAge) return null
  let user: TgUser
  try { user = JSON.parse(params.get('user') ?? '') } catch { return null }
  if (!user?.id) return null
  return { user, startParam: params.get('start_param') ?? '', authDate }
}

/** Подписать initData — для тестов и демо-режима */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields)
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
  return params.toString()
}
