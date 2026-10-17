// Резервная копия: свой формат (.safu, JSON) и перенос с iPhone (.safubackup из iOS-версии)
import { kv } from './kv'
import { safu } from './bridge'
import { parseBinaryPlist, type PlistValue } from './plist'
import { confirmDialog, alertDialog, passwordDialog, toast } from '../ui/kit'
import { ymd } from './date'

const CACHE_NAMES = (all: Record<string, unknown>) => {
  const g = String(((all['schedule.v1'] as any)?.ruzGroupNumber) || '').replace(/[^\p{L}\p{N}]/gu, '')
  return g ? [`ruz-archive-${g}`] : []
}

// ---------- пароли в копии: только зашифрованными паролем копии ----------
// PBKDF2-SHA256 (600 000 итераций) → ключ AES-256-GCM. Открытым текстом пароли в файл копии не попадают.

type SealedSecrets = { v: 1; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; data: string }

const KDF_ITER = 600_000
const AAD = new TextEncoder().encode('arktika-backup-secrets-v1')

function toB64(u: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function backupKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function sealSecrets(secrets: Record<string, string>, password: string): Promise<SealedSecrets> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await backupKey(password, salt, KDF_ITER)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, new TextEncoder().encode(JSON.stringify(secrets))))
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: KDF_ITER, salt: toB64(salt), iv: toB64(iv), data: toB64(data) }
}

/** Неверный пароль или испорченный файл — исключение */
export async function openSecrets(s: SealedSecrets, password: string): Promise<Record<string, string>> {
  if (s?.v !== 1 || s.kdf !== 'PBKDF2-SHA256' || !(s.iter >= 100_000 && s.iter <= 10_000_000)) throw new Error('Неизвестный формат паролей в копии')
  const key = await backupKey(password, fromB64(s.salt), s.iter)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(s.iv), additionalData: AAD }, key, fromB64(s.data))
  const out = JSON.parse(new TextDecoder().decode(plain))
  if (!out || typeof out !== 'object' || Array.isArray(out)) throw new Error('Испорченные данные')
  return out as Record<string, string>
}

async function askNewBackupPassword(): Promise<string | null> {
  const p1 = await passwordDialog('Пароль для копии', 'Сохранённые пароли сайтов в копии зашифруются этим паролем (AES‑256). Без него их не восстановить, поэтому запомни или запиши его. Не короче 8 символов.')
  if (p1 == null) return null
  if (p1.length < 8) { await alertDialog('Слишком короткий пароль', 'Нужно хотя бы 8 символов. Копия не сохранена.'); return null }
  const p2 = await passwordDialog('Повтори пароль')
  if (p2 == null) return null
  if (p1 !== p2) { await alertDialog('Пароли не совпали', 'Копия не сохранена — попробуй ещё раз.'); return null }
  return p1
}

export async function makeBackup(includePasswords: boolean) {
  let secretsEnc: SealedSecrets | undefined
  if (includePasswords) {
    const pw = await askNewBackupPassword()
    if (!pw) return null
    secretsEnc = await sealSecrets(await safu.secret.all(), pw)
  }
  const all = kv.all()
  const caches: Record<string, unknown> = {}
  for (const n of CACHE_NAMES(all)) caches[n] = await safu.cache.get(n)
  const blob = {
    app: 'safu-windows', version: 2, created: Date.now(), kv: all, caches, secretsEnc
  }
  const p = await safu.dialog.save({ name: `Арктика копия ${ymd(Date.now())}.safu`, text: JSON.stringify(blob), filters: [{ name: 'Копия Арктики', extensions: ['safu'] }] })
  if (p) { kv.set('backup.last', Date.now()); toast('Копия сохранена') }
  return p
}

/** Выбрать файл копии и восстановить. true — восстановлено (приложение перезапустится) */
export async function restoreBackupInteractive(): Promise<boolean> {
  let r: any
  try { r = await safu.backup.readIOS() } catch (e) { await alertDialog('Не получилось восстановить', String((e as Error).message || e)); return false }
  if (!r) return false
  try {
    if (r.kind === 'text') {
      const blob = JSON.parse(r.text)
      if (blob.app !== 'safu-windows' || !blob.kv) throw new Error('Это не резервная копия Арктики')
      if (!await confirmDialog('Восстановить копию?', `Все текущие данные заменятся данными из «${r.name}».`, 'Восстановить', true)) return false
      let secrets: Record<string, string> | null = null
      if (blob.secretsEnc) {
        while (!secrets) {
          const pw = await passwordDialog('Пароль копии', 'В копии есть сохранённые пароли сайтов. Введи пароль, которым она зашифрована. «Отмена» — восстановить всё остальное без паролей.')
          if (pw == null) break
          try { secrets = await openSecrets(blob.secretsEnc, pw) } catch { toast('Пароль не подходит', 'warn') }
        }
      } else if (blob.secrets && typeof blob.secrets === 'object') {
        secrets = blob.secrets // копия старой версии, где пароли лежали без шифрования
      }
      kv.replaceAll({ ...blob.kv, onboarded: true })
      for (const [n, v] of Object.entries(blob.caches || {})) await safu.cache.set(n, v)
      if (secrets) await safu.secret.replace(secrets)
    } else {
      if (!r.plist) throw new Error('Это не резервная копия Арктики')
      const domain = parseBinaryPlist(Uint8Array.from(atob(r.plist), c => c.charCodeAt(0))) as Record<string, PlistValue>
      const converted = convertIOS(domain)
      if (!await confirmDialog('Перенести данные с iPhone?', `Расписание, ДЗ, задачи, заметки, оценки и настройки из «${r.name}» заменят текущие. Файлов скопировано в папку файлов: ${r.files}.`, 'Перенести', true)) return false
      kv.replaceAll({ ...kv.all(), ...converted, onboarded: true })
    }
    setTimeout(() => safu.app.relaunch(), 600)
    return true
  } catch (e) {
    await alertDialog('Не получилось восстановить', String((e as Error).message || e))
    return false
  }
}

// ---------- перевод настроек iOS в формат Windows ----------

/** Swift JSONEncoder пишет даты числом секунд от 1 января 2001 */
const REF = 978307200
const DATE_KEYS = new Set(['start', 'end', 'semesterStart', 'lastSync', 'givenAt', 'due', 'anchor', 'doneAt', 'created', 'custom', 'date', 'time',
  'at', 'updated', 'fetchedAt', 'when', 'recorded', 'modified', 'deadline', 'remindAt', 'createdAt', 'updatedAt', 'takenAt', 'day', 'examDate'])

function fixDates(v: any, key = ''): any {
  if (Array.isArray(v)) return v.map(x => fixDates(x, key))
  if (v && typeof v === 'object') {
    const o: any = {}
    for (const [k, x] of Object.entries(v)) o[k] = fixDates(x, k)
    return o
  }
  if (typeof v === 'number' && DATE_KEYS.has(key) && Math.abs(v) < 5e9) return Math.round((v + REF) * 1000)
  return v
}

function toJS(v: PlistValue): any {
  if (v instanceof Date) return v.getTime()
  if (v instanceof Uint8Array) {
    const text = new TextDecoder().decode(v)
    try { return fixDates(JSON.parse(text)) } catch { return null }
  }
  if (Array.isArray(v)) return v.map(toJS)
  if (v && typeof v === 'object') { const o: any = {}; for (const [k, x] of Object.entries(v)) o[k] = toJS(x); return o }
  return v
}

export function convertIOS(domain: Record<string, PlistValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // разрешение на отправку в ИИ — у каждого устройства своё, с iPhone не переносим
  const skip = /^(Apple|NS|WebKit|com\.apple|PK|AK|INNext|widget\.|live\.|ai\.consent\.)/
  for (const [k, v] of Object.entries(domain)) {
    if (skip.test(k)) continue
    const j = toJS(v)
    if (j === null || j === undefined) continue
    out[k] = j
  }
  // числовые настройки iOS, которые на Windows — строки
  const card = ['glass', 'solid', 'tinted', 'neon', 'minimal', 'raised', 'clean', 'skeuo', '', 'rusty']
  if (typeof out.cardStyle === 'number') out.cardStyle = card[out.cardStyle as number] || 'glass'
  const scheme = ['system', 'light', 'dark']
  if (typeof out['ui.scheme'] === 'number') out['ui.scheme'] = scheme[out['ui.scheme'] as number] || 'system'
  if (typeof out['user.birthday'] === 'number' && (out['user.birthday'] as number) < 5e9) out['user.birthday'] = (out['user.birthday'] as number) * 1000
  delete out['memory.tabID']
  delete out['tabs.order']
  delete out['home.order']
  return out
}
