// Перенос с iPhone по QR — состояние живёт вне экрана: можно уйти в другой раздел, перенос продолжится
import { create } from 'zustand'
import { safu } from './bridge'
import { kv } from './kv'
import { parseBinaryPlist, type PlistValue } from './plist'
import { convertIOS } from './backup'
import { celebrations } from '../fx/Celebrations'
import { plural } from './date'

export type TransferPhase = 'idle' | 'starting' | 'waiting' | 'connected' | 'sending' | 'done' | 'error'

export type FlyingFile = { id: number; name: string; ext: string; size: number }

type State = {
  phase: TransferPhase
  url: string
  hosts: string[]
  pc: string
  device: string
  error: string
  /** Код устарел (15 минут без телефона) — показываем кнопку «Новый код» */
  expired: boolean
  done: number
  total: number
  files: number
  filesTotal: number
  name: string
  speed: number
  skipped: number
  withData: boolean
  dataApplied: boolean
  summary: { files: number; bytes: number; skipped: number; seconds: number } | null
  flying: FlyingFile[]
}

const initial: State = {
  phase: 'idle', url: '', hosts: [], pc: '', device: '', error: '', expired: false,
  done: 0, total: 0, files: 0, filesTotal: 0, name: '', speed: 0, skipped: 0,
  withData: false, dataApplied: false, summary: null, flying: []
}

export const useTransfer = create<State>(() => ({ ...initial }))
const set = (p: Partial<State>) => useTransfer.setState(p)

let unsub: (() => void) | null = null
let flyId = 0
let lastFly = 0

function addFlying(name: string, size: number) {
  // не больше пяти в полёте и не чаще восьми в секунду — сотни мелких файлов не превращаются в кашу
  const now = Date.now()
  if (now - lastFly < 120 || useTransfer.getState().flying.length >= 5) return
  lastFly = now
  const id = ++flyId
  const ext = (name.split('.').pop() || '').slice(0, 4).toUpperCase()
  set({ flying: [...useTransfer.getState().flying, { id, name, ext, size }] })
  setTimeout(() => set({ flying: useTransfer.getState().flying.filter(f => f.id !== id) }), 1300)
}

function applyData(b64: string) {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const domain = parseBinaryPlist(bytes) as Record<string, PlistValue>
    const converted = convertIOS(domain)
    kv.replaceAll({ ...kv.all(), ...converted, onboarded: true })
    set({ dataApplied: true })
  } catch (e) {
    set({ error: 'Файлы перенесены, но настройки с iPhone прочитать не получилось: ' + String((e as Error).message || e) })
  }
}

function onEvent(e: any) {
  switch (e?.type) {
    case 'connected':
      set({ phase: 'connected', device: e.device, expired: false })
      break
    case 'plan':
      set({ phase: 'sending', total: e.bytes, filesTotal: e.files, skipped: e.skipped, withData: e.data })
      break
    case 'progress':
      set({ phase: 'sending', done: e.done, total: e.total, files: e.files, filesTotal: e.filesTotal, name: e.name, speed: e.speed })
      break
    case 'file':
      addFlying(e.name, e.size)
      break
    case 'data':
      applyData(e.plist)
      break
    case 'done': {
      set({ phase: 'done', summary: { files: e.files, bytes: e.bytes, skipped: e.skipped, seconds: e.seconds }, files: e.files })
      const what = e.files ? `${e.files} ${plural(e.files, 'файл', 'файла', 'файлов')}` : 'Всё уже было на месте'
      celebrations.fire({ title: 'Перенесено! 🎉', subtitle: `${what}${e.data ? ' и все данные' : ''} — с iPhone на компьютер`, style: { kind: 'confetti' }, force: true })
      safu.app.flash()
      break
    }
    case 'closed':
      if (e.reason === 'idle' && useTransfer.getState().phase !== 'done') set({ phase: 'idle', expired: true })
      break
    case 'error':
      set({ phase: 'error', error: e.message })
      break
  }
}

export const transfer = {
  async start() {
    if (!unsub) unsub = safu.transfer.on(onEvent)
    set({ ...initial, phase: 'starting' })
    try {
      const info = await safu.transfer.start()
      if (!info) {
        set({ phase: 'error', error: 'Перенос работает в приложении для Windows' })
        return
      }
      set({ phase: 'waiting', url: info.url, hosts: info.hosts, pc: info.name })
    } catch (e) {
      set({ phase: 'error', error: 'Не получилось открыть приём: ' + String((e as Error).message || e) })
    }
  },
  stop() {
    safu.transfer.stop()
    const s = useTransfer.getState()
    // готовый итог не стираем — его ещё показывает экран
    if (s.phase !== 'done') set({ ...initial })
  },
  reset() {
    safu.transfer.stop()
    set({ ...initial })
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} МБ`
  return `${(n / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} ГБ`
}
