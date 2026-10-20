// Ненастоящий Telegram: все вызовы API записываются, а не уходят в сеть. Для демо-режима и тестов.
import type { Api, RawApi } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'

export type Call = { method: string; payload: Record<string, any> }

export const FAKE_BOT: UserFromGetMe = {
  id: 7000000001, is_bot: true, first_name: 'Арктика · ДЗ', username: 'arktika_dz_bot',
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false
} as UserFromGetMe

export function fakeTelegram(api: Api<RawApi>, log = false) {
  const calls: Call[] = []
  let messageId = 100
  api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, any> })
    if (log && /^send|^edit/.test(method)) console.log(`[telegram] ${method} → ${(payload as any).chat_id}: ${String((payload as any).text ?? (payload as any).caption ?? '').slice(0, 120).replace(/\n/g, ' ⏎ ')}`)
    const p = payload as Record<string, any>
    const chat = { id: p.chat_id, type: Number(p.chat_id) > 0 ? 'private' : 'supergroup' }
    let result: unknown = true
    if (method === 'getMe') result = FAKE_BOT
    else if (method.startsWith('send')) {
      result = { message_id: ++messageId, date: Math.floor(Date.now() / 1000), chat, text: p.text,
        photo: method === 'sendPhoto' ? [{ file_id: `photo-${messageId}`, file_unique_id: `u${messageId}`, width: 1280, height: 960 }] : undefined }
      if (method === 'sendMediaGroup') result = [result]
    } else if (method === 'getChatMember') result = { status: 'administrator', user: { id: p.user_id } }
    else if (method === 'getFile') result = { file_id: p.file_id, file_unique_id: 'u', file_path: 'photos/demo.jpg' }
    return { ok: true, result } as any
  })
  return calls
}
