// Различия Windows и Linux в одном месте: пароли, автозапуск, ярлык и ссылки safu://, значок в трее,
// миниатюры файлов. На Windows всё работает как раньше (DPAPI, реестр, миниатюры Проводника);
// на Linux — связка ключей или свой ключ, файлы .desktop, кеш миниатюр freedesktop.

import { app, safeStorage, nativeImage, type NativeImage } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import {
  DESKTOP_ID, WM_CLASS, desktopEntry, execOf, vaultKind, sealWithKey, openWithKey, MAGIC_KEYRING,
  secureBackend, backendLabel, drawBadgeDot
} from './linux'

export const isLinux = process.platform === 'linux'
export const OS_NAME = isLinux ? 'Linux' : 'Windows'

/** До готовности приложения: имя окна для панели задач (иначе док не узнаёт окно и показывает чужой значок) */
export function earlySetup() {
  if (!isLinux) return
  app.commandLine.appendSwitch('class', WM_CLASS)
  // если человек сам запустил с --ozone-platform-hint=auto под Wayland — рамки окна рисуем сами
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
}

// ---------- пароли ----------

const backend = () => { try { return safeStorage.getSelectedStorageBackend() } catch { return 'unknown' } }
const keyringReady = () => secureBackend(backend()) && safeStorage.isEncryptionAvailable()

let fileKey: Buffer | null = null
function ownKey(): Buffer {
  if (fileKey) return fileKey
  const f = path.join(app.getPath('userData'), 'secrets.key')
  try {
    const k = fs.readFileSync(f)
    if (k.length === 32) {
      // кто-то расширил права — возвращаем «только владелец»
      try { if ((fs.statSync(f).mode & 0o077) !== 0) fs.chmodSync(f, 0o600) } catch { /* не страшно */ }
      return (fileKey = k)
    }
  } catch { /* ключа ещё нет */ }
  const k = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, k, { mode: 0o600 })
  return (fileKey = k)
}

/**
 * Шифрование паролей. Windows — DPAPI, как и раньше (файл совместим со старыми версиями).
 * Linux — связка ключей, а без неё свой ключ в файле с правами 0600. Если пароли записаны связкой ключей,
 * а она сейчас недоступна (вход без неё, сломанный keyring), файл не трогаем: пароли живут в памяти до
 * закрытия, а при следующем запуске со связкой ключей всё на месте.
 */
export const vault = {
  locked: false,
  available(): boolean {
    if (!isLinux) return safeStorage.isEncryptionAvailable()
    return !vault.locked
  },
  encrypt(text: string): Buffer {
    if (!isLinux) return safeStorage.encryptString(text)
    if (keyringReady()) return Buffer.concat([MAGIC_KEYRING, safeStorage.encryptString(text)])
    return sealWithKey(ownKey(), text)
  },
  decrypt(buf: Buffer): string {
    if (!isLinux) return safeStorage.decryptString(buf)
    const kind = vaultKind(buf)
    if (kind === 'filekey') return openWithKey(ownKey(), buf)
    if (kind === 'keyring') {
      if (!keyringReady()) { vault.locked = true; throw new Error('keyring unavailable') }
      return safeStorage.decryptString(buf.subarray(MAGIC_KEYRING.length))
    }
    throw new Error('unknown format')
  },
  label(): string {
    if (!isLinux) return safeStorage.isEncryptionAvailable() ? 'Windows DPAPI' : ''
    if (vault.locked) return 'связка ключей недоступна — пароли сейчас только в памяти'
    return keyringReady() ? backendLabel(backend()) : backendLabel('basic_text')
  }
}

// ---------- автозапуск ----------

const autostartFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', `${DESKTOP_ID}.desktop`)

/** Чем запускать Арктику: файл AppImage (сам он распаковывается во временную папку) или установленная программа */
const launcher = () => {
  if (process.env.APPIMAGE) return process.env.APPIMAGE
  // пакет запускается скриптом arktika (он рядом с arktika-bin) — его и ставим в автозапуск
  const wrapper = process.execPath.replace(/-bin$/, '')
  return wrapper !== process.execPath && fs.existsSync(wrapper) ? wrapper : process.execPath
}

export const loginItem = {
  get(): boolean {
    if (!isLinux) return app.getLoginItemSettings().openAtLogin
    try { return !/^\s*Hidden\s*=\s*true/mi.test(fs.readFileSync(autostartFile(), 'utf8')) } catch { return false }
  },
  set(on: boolean) {
    if (!isLinux) { app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] }); return }
    const f = autostartFile()
    if (!on) { fs.promises.rm(f, { force: true }).catch(() => null); return }
    fs.mkdirSync(path.dirname(f), { recursive: true })
    // запуск из исходников (npm start): electron + папка приложения
    const args = process.defaultApp && process.argv[1] ? [path.resolve(process.argv[1])] : []
    fs.writeFileSync(f, desktopEntry({ exec: launcher(), args, icon: DESKTOP_ID, autostart: true }))
  }
}

// ---------- ярлык в меню приложений и ссылки safu:// ----------

const dataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')

function run(cmd: string, args: string[], timeout = 10_000): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout }, (err, stdout) => {
      const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : 127) : 0
      resolve({ code, out: String(stdout || '').trim() })
    })
  })
}

/**
 * Для AppImage: ярлык «Арктика» в меню приложений, значок и ссылки safu:// (из QR-кода, из уведомлений).
 * Пакеты .deb и .rpm ставят ярлык сами. Если файл AppImage переложили в другую папку — ярлык обновится
 * при следующем запуске; автозапуск тоже.
 */
export async function integrateDesktop(icon: string) {
  if (!isLinux || !process.env.APPIMAGE) return
  const exe = process.env.APPIMAGE
  const apps = path.join(dataHome(), 'applications')
  const file = path.join(apps, `${DESKTOP_ID}.desktop`)
  const current = await fs.promises.readFile(file, 'utf8').catch(() => '')
  if (current && !/X-Arktika-AppImage=true/.test(current)) return // ярлык поставил пакет или сам человек
  try {
    const iconDir = path.join(dataHome(), 'icons', 'hicolor', '512x512', 'apps')
    const iconFile = path.join(iconDir, `${DESKTOP_ID}.png`)
    if (!fs.existsSync(iconFile)) {
      const img = nativeImage.createFromPath(icon)
      if (!img.isEmpty()) {
        await fs.promises.mkdir(iconDir, { recursive: true })
        await fs.promises.writeFile(iconFile, img.resize({ width: 512, height: 512, quality: 'best' }).toPNG())
      }
    }
    if (execOf(current) === exe) return
    await fs.promises.mkdir(apps, { recursive: true })
    await fs.promises.writeFile(file, desktopEntry({ exec: exe, icon: DESKTOP_ID }) + 'X-Arktika-AppImage=true\n')
    await run('update-desktop-database', [apps])
    await run('xdg-mime', ['default', `${DESKTOP_ID}.desktop`, 'x-scheme-handler/safu'])
    // автозапуск указывал на старое место AppImage — переписываем
    if (loginItem.get()) loginItem.set(true)
  } catch { /* без ярлыка приложение всё равно работает */ }
}

// ---------- трей ----------

/** Значок для трея: на Linux панели крупнее (22–32 px), а AppIndicator масштабирует сам */
export function trayImage(img: NativeImage | undefined, dot = false): NativeImage {
  if (!img) return nativeImage.createEmpty()
  const size = isLinux ? 32 : 16
  const small = img.resize({ width: size, height: size, quality: 'best' })
  if (!dot) return small
  const bmp = drawBadgeDot(small.toBitmap(), size, size)
  return nativeImage.createFromBitmap(bmp, { width: size, height: size })
}

// ---------- миниатюры файлов на Linux: готовые из кеша freedesktop (их строят Nautilus, Dolphin, Thunar) ----------

export async function cachedThumb(file: string, size: number): Promise<string | null> {
  if (!isLinux) return null
  const st = await fs.promises.stat(file).catch(() => null)
  if (!st) return null
  const md5 = crypto.createHash('md5').update(pathToFileURL(file).toString()).digest('hex')
  const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
  const dirs = size > 128 ? ['large', 'x-large', 'normal'] : ['normal', 'large']
  for (const d of dirs) {
    const t = path.join(cache, 'thumbnails', d, md5 + '.png')
    const ts = await fs.promises.stat(t).catch(() => null)
    // миниатюра старше файла — файл поменялся, она уже не та
    if (!ts || ts.mtimeMs + 1000 < st.mtimeMs) continue
    const buf = await fs.promises.readFile(t).catch(() => null)
    if (buf) return 'data:image/png;base64,' + buf.toString('base64')
  }
  return null
}
