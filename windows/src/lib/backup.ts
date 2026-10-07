// Резервная копия: свой формат (.safu, JSON) и перенос с iPhone (.safubackup из iOS-версии)
import { kv } from './kv'
import { safu } from './bridge'
import { parseBinaryPlist, type PlistValue } from './plist'
import { confirmDialog, alertDialog, toast } from '../ui/kit'
import { ymd } from './date'

const CACHE_NAMES = (all: Record<string, unknown>) => {
  const g = String(((all['schedule.v1'] as any)?.ruzGroupNumber) || '').replace(/[^\p{L}\p{N}]/gu, '')
  return g ? [`ruz-archive-${g}`] : []
}

export async function makeBackup(includePasswords: boolean) {
  const all = kv.all()
  const caches: Record<string, unknown> = {}
  for (const n of CACHE_NAMES(all)) caches[n] = await safu.cache.get(n)
  const blob = {
    app: 'safu-windows', version: 1, created: Date.now(), kv: all, caches,
    secrets: includePasswords ? await safu.secret.all() : undefined
  }
  const p = await safu.dialog.save({ name: `САФУ копия ${ymd(Date.now())}.safu`, text: JSON.stringify(blob), filters: [{ name: 'Копия САФУ', extensions: ['safu'] }] })
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
      if (blob.app !== 'safu-windows' || !blob.kv) throw new Error('Это не резервная копия САФУ')
      if (!await confirmDialog('Восстановить копию?', `Все текущие данные заменятся данными из «${r.name}».`, 'Восстановить', true)) return false
      kv.replaceAll({ ...blob.kv, onboarded: true })
      for (const [n, v] of Object.entries(blob.caches || {})) await safu.cache.set(n, v)
      if (blob.secrets) await safu.secret.replace(blob.secrets)
    } else {
      if (!r.plist) throw new Error('Это не резервная копия САФУ')
      const domain = parseBinaryPlist(Uint8Array.from(atob(r.plist), c => c.charCodeAt(0))) as Record<string, PlistValue>
      const converted = convertIOS(domain)
      if (!await confirmDialog('Перенести данные с iPhone?', `Расписание, ДЗ, задачи, заметки, оценки и настройки из «${r.name}» заменят текущие. Файлов скопировано в папку САФУ: ${r.files}.`, 'Перенести', true)) return false
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
  const skip = /^(Apple|NS|WebKit|com\.apple|PK|AK|INNext|widget\.|live\.)/
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
