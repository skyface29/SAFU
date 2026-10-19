// Арктика для Windows и Linux — главный процесс. Различия систем — в platform.ts.
// Окно с материалом Mica, трей, мини-окно пары поверх всех окон (как Live Activity на iPhone),
// уведомления по расписанию, файлы предметов в «Документах», сеть без CORS, пароли через DPAPI.

import {
  app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification, shell, dialog,
  net, protocol, session, screen, nativeTheme, clipboard, powerMonitor, globalShortcut, webContents
} from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { checkMail, type MailAccount } from './mail'
import * as zlib from 'node:zlib'
import { promisify } from 'node:util'
import { TransferServer } from './transfer'
import { SyncServer, newPairing, syncLink, type SyncPairing } from './sync'
import { PairBroker } from './syncpair'
import { firewallStatus, firewallFix } from './firewall'
import * as os from 'node:os'
import { isLinux, OS_NAME, earlySetup, vault, loginItem, integrateDesktop, trayImage, cachedThumb } from './platform'
import { LINUX_PORTS, freePort } from './linux'

// Конспекты через Claude — отдельным файлом (claude.js), который грузится только при первом конспекте:
// библиотека Claude — две трети главного процесса, и раньше она разбиралась при каждом запуске
type ClaudeModule = typeof import('./claude')
let claudeModule: ClaudeModule | null = null
const claude = (): ClaudeModule => (claudeModule ??= require(path.join(__dirname, 'claude.js')) as ClaudeModule)

const isDev = !!process.env.VITE_DEV
const inflateRaw = promisify(zlib.inflateRaw)
const APP_ID = 'ru.student.safuhub'

app.setAppUserModelId(APP_ID)
app.setName('Арктика')
earlySetup()
app.setPath('userData', path.join(app.getPath('appData'), 'САФУ'))

// ---------- один экземпляр и ссылки safu:// ----------

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('safu', process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('safu')
}

// ---------- видеокарта ----------
// Рисуем на видеокарте, даже если драйвер в «чёрном списке» Chromium: без этого на многих ноутбуках всё
// окно рисуется процессором — прокрутка и анимации идут рывками, как в 30 кадров (так было в 19.0).
// Если видеокарта при этом падает дважды за запуск, следующий запуск идёт в безопасном режиме (gpu.json).
// Кеш шейдеров снова хранится на диске: без него каждый запуск видеокарта собирала шейдеры заново, и первые
// секунды после открытия шли рывками. Сломанный кеш (с ним окно могло открываться чёрным) не копится:
// после падения видеокарты или неудачного запуска он удаляется до старта следующего запуска
const gpuFile = () => path.join(app.getPath('userData'), 'gpu.json')
type GpuState = { safe?: boolean; clearShaders?: boolean }
const gpuState: GpuState = (() => { try { return JSON.parse(fs.readFileSync(gpuFile(), 'utf8')) } catch { return {} } })()
function saveGpuState(patch: GpuState) {
  Object.assign(gpuState, patch)
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(gpuFile(), JSON.stringify(gpuState)) } catch { /* не страшно */ }
}
const SHADER_CACHES = ['GPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', path.join('Partitions', 'sites', 'GPUCache')]
if (gpuState.clearShaders) {
  for (const d of SHADER_CACHES) { try { fs.rmSync(path.join(app.getPath('userData'), d), { recursive: true, force: true }) } catch { /* занят — удалим в следующий раз */ } }
  saveGpuState({ clearShaders: false })
}
app.commandLine.appendSwitch('enable-gpu-rasterization')
if (!gpuState.safe) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-zero-copy')
}
let gpuCrashes = 0
app.on('child-process-gone', (_e, d) => {
  if (d.type !== 'GPU' || d.reason === 'clean-exit') return
  gpuCrashes += 1
  logError(`GPU process gone: ${d.reason} (${d.exitCode})`)
  saveGpuState(gpuCrashes >= 2 && !gpuState.safe ? { safe: true, clearShaders: true } : { clearShaders: true })
})

// ---------- журнал ошибок: чтобы по нему понять, почему окно не открылось ----------
function logError(text: string) {
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, 'errors.log')
    try { if (fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.old') } catch { /* файла ещё нет */ }
    fs.appendFileSync(f, `[${new Date().toISOString()}] ${text}\n`)
  } catch { /* не страшно */ }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'safu-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
])

// ---------- пути ----------

const userDir = () => app.getPath('userData')
const storeFile = () => path.join(userDir(), 'store.json')
const secretsFile = () => path.join(userDir(), 'secrets.bin')
const notifFile = () => path.join(userDir(), 'scheduled.json')

// Папка файлов вычисляется и создаётся один раз (и заново — только если её сменили в настройках):
// раньше это делалось на каждый файл списка — сотни обращений к диску на одну папку
let rootCache: { custom: string; root: string } | null = null
function filesRoot(): string {
  const custom = typeof kv['files.root'] === 'string' ? kv['files.root'] as string : ''
  if (rootCache && rootCache.custom === custom) return rootCache.root
  let root = custom
  if (!root) {
    // у тех, кто ставил приложение до переименования, файлы остаются в старой папке
    const old = path.join(app.getPath('documents'), 'САФУ')
    root = fs.existsSync(old) ? old : path.join(app.getPath('documents'), 'Арктика')
  }
  fs.mkdirSync(root, { recursive: true })
  rootCache = { custom, root }
  return root
}

/** Путь от корня файлов — с прямыми слешами, как его видит интерфейс */
const relOf = (root: string, full: string) => path.relative(root, full).split(path.sep).join('/')

/** Путь внутри папки файлов. Выйти за её пределы нельзя */
function inRoot(rel: string): string {
  const root = filesRoot()
  const p = path.resolve(root, rel || '.')
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Путь вне папки файлов')
  return p
}

// ---------- хранилище ключ-значение (как UserDefaults) ----------

/** Приём с iPhone по QR (пока открыт экран переноса) */
let transfer: TransferServer | null = null

// ---------- синхронизация с iPhone: пока приложение запущено, телефон заходит сам ----------

let syncServer: SyncServer | null = null
const syncWaiters = new Map<string, (r: { ok: boolean; result?: unknown; error?: string }) => void>()
const SYNC_PORT = 47823

function syncPairing(): SyncPairing | null {
  try { return secrets['sync.pair'] ? JSON.parse(secrets['sync.pair']) : null } catch { return null }
}

/** Свести данные просит интерфейс: там живут ДЗ, задачи и заметки */
function syncInRenderer(body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!win || win.isDestroyed()) { reject(new Error('Окно Арктики не открыто')); return }
    const rid = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const timer = setTimeout(() => { syncWaiters.delete(rid); reject(new Error('timeout')) }, 15_000)
    syncWaiters.set(rid, r => {
      clearTimeout(timer)
      if (r.ok) resolve(r.result)
      else reject(new Error(r.error || 'sync'))
    })
    win.webContents.send('sync:request', rid, body)
  })
}

/** Телефон просит связаться без QR-кода: показываем окно с кодом, человек сверяет и решает */
const pairAsks = new Map<string, (ok: boolean) => void>()
function askPair(device: string, code: string): Promise<boolean> {
  return new Promise(resolve => {
    if (!win || win.isDestroyed()) createWindow()
    if (!win) { resolve(false); return }
    const rid = Math.random().toString(36).slice(2)
    const timer = setTimeout(() => { pairAsks.delete(rid); win?.webContents.send('sync:askDone', rid); resolve(false) }, 100_000)
    pairAsks.set(rid, ok => { clearTimeout(timer); resolve(ok) })
    showMain()
    win.flashFrame(true)
    if (!win.isFocused()) showNotification({ title: `${device} хочет синхронизироваться`, body: `Сверь код ${code} с экраном телефона и нажми «Разрешить»` })
    const send = () => win?.webContents.send('sync:ask', rid, { device, code })
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => setTimeout(send, 600))
    else send()
  })
}

const pairBroker = new PairBroker({
  ask: askPair,
  grant: async () => {
    // уже связан другой телефон — отдаём ту же связку: оба будут синхронизироваться
    let p = syncPairing()
    if (!p) {
      p = newPairing()
      secrets['sync.pair'] = JSON.stringify(p)
      saveSecrets()
    }
    const s = await ensureSync()
    win?.webContents.send('sync:changed')
    return { id: p.id, key: p.key, hosts: s?.hosts ?? [], port: s?.port ?? SYNC_PORT, name: os.hostname() }
  }
})

/** Файлы связанного телефона (файлы предметов, фото доски, записи лекций, фото к ДЗ): приходят сами после
 *  синхронизации, по ключу связки. Приёмник тот же, что у переноса по QR, только постоянный */
let pairedFiles: { id: string; t: TransferServer } | null = null
const fileBatch: { n: number; names: string[]; timer: ReturnType<typeof setTimeout> | null } = { n: 0, names: [], timer: null }
function pairedFilesHandler(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
  const p = syncPairing()!
  if (!pairedFiles || pairedFiles.id !== p.id) {
    pairedFiles = {
      id: p.id,
      t: new TransferServer({
        name: os.hostname(),
        version: app.getVersion(),
        root: filesRoot,
        key: Buffer.from(p.key, 'base64url'),
        session: p.id,
        persistent: true,
        emit: ev => {
          if (ev.type !== 'file') return
          win?.webContents.send('sync:file', { rel: ev.rel, name: ev.name, size: ev.size })
          // одно уведомление на пачку: «С iPhone пришло 5 файлов»
          fileBatch.n++
          if (fileBatch.names.length < 3) fileBatch.names.push(ev.name)
          if (fileBatch.timer) clearTimeout(fileBatch.timer)
          fileBatch.timer = setTimeout(() => {
            const n = fileBatch.n
            if (n && (!win || !win.isFocused())) {
              const word = n % 10 === 1 && n % 100 !== 11 ? 'файл' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'файла' : 'файлов'
              showNotification({ title: `С iPhone: ${n} ${word}`, body: fileBatch.names.join(', ') + (n > fileBatch.names.length ? '…' : ''), route: 'files' })
            }
            fileBatch.n = 0; fileBatch.names = []; fileBatch.timer = null
          }, 4000)
        }
      })
    }
  }
  return pairedFiles.t.serve(req, res)
}

/** Кто и когда искал компьютер в сети — подсказка на экране синхронизации («телефон видит компьютер») */
const syncSeen: { at: number; from: string } = { at: 0, from: '' }

/** Сервер работает всё время, пока запущено приложение: телефон найдёт компьютер и без QR-кода */
let syncStarting: Promise<SyncServer | null> | null = null
async function ensureSync(): Promise<SyncServer | null> {
  if (syncServer?.running) return syncServer
  if (syncStarting) return syncStarting
  syncStarting = (async () => {
    const s = new SyncServer({
      name: os.hostname(),
      version: app.getVersion(),
      port: Number(kv['sync.port']) || SYNC_PORT,
      pairing: syncPairing,
      handle: syncInRenderer,
      pair: pairBroker,
      files: pairedFilesHandler,
      onHello: from => { syncSeen.at = Date.now(); syncSeen.from = from }
    })
    const port = await s.start()
    syncServer = s
    if (kv['sync.port'] !== port) { kv['sync.port'] = port; saveKVSoon() }
    return s
  })().finally(() => { syncStarting = null })
  return syncStarting
}

async function currentSyncLink(): Promise<{ url: string; hosts: string[]; port: number } | null> {
  const p = syncPairing()
  const s = await ensureSync()
  if (!p || !s) return null
  return { url: syncLink(p, s.hosts, s.port, os.hostname()), hosts: s.hosts, port: s.port }
}

let kv: Record<string, unknown> = {}
let kvTimer: NodeJS.Timeout | null = null

function loadKV() {
  try {
    kv = JSON.parse(fs.readFileSync(storeFile(), 'utf8'))
  } catch {
    // повреждённый файл — пробуем запасную копию
    try { kv = JSON.parse(fs.readFileSync(storeFile() + '.bak', 'utf8')) } catch { kv = {} }
  }
}

// Хранилище пишется на диск не на каждое изменение, а пачкой через 1,5 с после последнего — и в фоне:
// раньше каждая запись (почта раз в минуту, переход по странице сайта, перетаскивание окна) останавливала
// главный процесс, а с ним и сайты, и перетаскивание окна
let kvWriting = false
let kvDirty = false
let kvBackedUp = false
/** Записали синхронно (выход, замена данных) — фоновая запись, что ещё в пути, не должна её перетереть */
let kvSyncGen = 0

function saveKVSoon() {
  kvDirty = true
  if (kvTimer) clearTimeout(kvTimer)
  kvTimer = setTimeout(() => { kvTimer = null; void saveKVAsync() }, 1500)
}

/** Запасная копия — один раз за запуск, а не при каждой записи */
function backupOnce() {
  if (kvBackedUp) return
  kvBackedUp = true
  try { if (fs.existsSync(storeFile())) fs.copyFileSync(storeFile(), storeFile() + '.bak') } catch { /* не страшно */ }
}

async function saveKVAsync() {
  if (kvWriting) { kvDirty = true; return }
  kvWriting = true
  kvDirty = false
  const gen = kvSyncGen
  try {
    await fs.promises.mkdir(userDir(), { recursive: true })
    backupOnce()
    const tmp = storeFile() + '.tmp'
    await fs.promises.writeFile(tmp, JSON.stringify(kv))
    if (gen === kvSyncGen) await fs.promises.rename(tmp, storeFile())
  } catch (e) {
    console.error('store save failed', e)
  } finally {
    kvWriting = false
    if (kvDirty) saveKVSoon()
  }
}

/** Сразу и синхронно — при выходе и при полной замене данных */
function saveKVNow() {
  if (kvTimer) { clearTimeout(kvTimer); kvTimer = null }
  kvDirty = false
  kvSyncGen++
  try {
    fs.mkdirSync(userDir(), { recursive: true })
    backupOnce()
    const tmp = storeFile() + '.now.tmp'
    fs.writeFileSync(tmp, JSON.stringify(kv))
    fs.renameSync(tmp, storeFile())
  } catch (e) {
    console.error('store save failed', e)
  }
}

// ---------- секреты (пароли сайтов) — шифруются: Windows DPAPI, на Linux связка ключей или свой ключ (platform.ts) ----------

// Открытым текстом секреты на диск не пишутся никогда: если шифрование недоступно,
// они живут только в памяти до закрытия приложения.

let secrets: Record<string, string> = {}

function loadSecrets() {
  let raw: Buffer
  try { raw = fs.readFileSync(secretsFile()) } catch { secrets = {}; return }
  if (vault.available()) {
    try { secrets = JSON.parse(vault.decrypt(raw)); return } catch { /* не зашифрован — возможно, файл старой версии */ }
  }
  const canEncrypt = vault.available()
  // старые версии без шифрования могли записать открытый JSON — читаем и сразу перешифровываем
  try {
    const legacy = JSON.parse(raw.toString('utf8'))
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
      secrets = legacy
      if (canEncrypt) saveSecrets()
      return
    }
  } catch { /* не JSON — зашифрован, а расшифровать сейчас нечем */ }
  secrets = {}
}

// Секреты пишутся так же, как хранилище: пачкой и в фоне. Раньше каждая запись (а вход на сайтах меняет
// cookie постоянно — запоминаем их раз в 5 секунд) останавливала главный процесс вместе с сайтами
let secretsTimer: NodeJS.Timeout | null = null
let secretsWriting = false
let secretsDirty = false
let secretsSyncGen = 0

function saveSecrets() {
  secretsDirty = true
  if (secretsTimer) clearTimeout(secretsTimer)
  secretsTimer = setTimeout(() => { secretsTimer = null; void saveSecretsAsync() }, 300)
}

async function saveSecretsAsync() {
  if (secretsWriting) { secretsDirty = true; return }
  secretsDirty = false
  if (!vault.available()) return
  secretsWriting = true
  const gen = secretsSyncGen
  try {
    const data = vault.encrypt(JSON.stringify(secrets))
    const tmp = secretsFile() + '.tmp'
    await fs.promises.writeFile(tmp, data)
    if (gen === secretsSyncGen) await fs.promises.rename(tmp, secretsFile())
  } catch (e) {
    logError('secrets save: ' + String(e))
  } finally {
    secretsWriting = false
    if (secretsDirty) saveSecrets()
  }
}

/** Сразу и синхронно — перед выходом, перезапуском и при полной замене */
function saveSecretsNow() {
  if (secretsTimer) { clearTimeout(secretsTimer); secretsTimer = null }
  if (!secretsDirty && !secretsWriting) return
  secretsDirty = false
  secretsSyncGen++
  if (!vault.available()) return
  try {
    const tmp = secretsFile() + '.now.tmp'
    fs.writeFileSync(tmp, vault.encrypt(JSON.stringify(secrets)))
    fs.renameSync(tmp, secretsFile())
  } catch (e) {
    logError('secrets save: ' + String(e))
  }
}

/** Всё, что ещё не дописано на диск, — перед app.exit (перезапуск): он не вызывает before-quit */
function flushAll() {
  saveKVNow()
  saveSecretsNow()
  saveScheduledNow()
}

// ---------- окна ----------

let win: BrowserWindow | null = null
let widget: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let pendingRoute: string | null = null

function rendererURL(hash = ''): string {
  if (isDev) return `http://localhost:5173/${hash ? '#' + hash : ''}`
  return pathToFileURL(path.join(__dirname, '../dist/index.html')).toString() + (hash ? '#' + hash : '')
}

let iconPathCache = ''
function iconPath(): string {
  return iconPathCache ||= findIcon()
}
function findIcon(): string {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(__dirname, '../dist/icon.png')
  ]
  return candidates.find(p => fs.existsSync(p)) || candidates[0]
}

function appIcon() {
  const img = nativeImage.createFromPath(iconPath())
  return img.isEmpty() ? undefined : img
}

function createWindow() {
  const bounds = (kv['win.bounds'] as Electron.Rectangle | undefined) || { width: 1280, height: 820 }
  const mica = kv['ui.mica'] === true
  win = new BrowserWindow({
    ...bounds,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: 'Арктика',
    icon: appIcon(),
    // непрозрачный фон: пока интерфейс грузится (или если он не загрузился) — тёмное окно, а не «дыра»
    backgroundColor: mica ? '#00000000' : (darkUI() ? '#0a0d14' : '#eef2f8'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 40 },
    ...(process.platform === 'win32' && mica ? { backgroundMaterial: 'mica' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      // в трее окно не рисует кадры впустую; таймеры почты и РУЗ всё равно срабатывают
      backgroundThrottling: true,
      spellcheck: true
    }
  })
  if (kv['win.maximized']) win.maximize()
  win.loadURL(rendererURL())
  armWatchdog()
  // интерфейс упал — перезагружаем сами; не помогает — экран восстановления вместо чёрного окна
  win.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return
    logError(`renderer gone: ${d.reason} (${d.exitCode})`)
    recoverOrReload(`Окно приложения упало (${d.reason})`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, _url, isMain) => {
    if (!isMain || code === -3) return
    logError(`did-fail-load ${code} ${desc}`)
    recoverOrReload(`Не загрузился интерфейс: ${desc}`)
  })
  win.webContents.on('unresponsive', () => logError('renderer unresponsive'))
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('safu-recover://')) return
    e.preventDefault()
    void runRecovery(url.slice('safu-recover://'.length).replace(/\/+$/, ''))
  })
  win.once('ready-to-show', () => {
    const hidden = process.argv.includes('--hidden')
    if (!hidden) win?.show()
  })

  const remember = () => {
    if (!win || win.isMinimized()) return
    kv['win.maximized'] = win.isMaximized()
    if (!win.isMaximized()) kv['win.bounds'] = win.getBounds()
    saveKVSoon()
  }
  // место окна — когда его отпустили, а не на каждом пикселе перетаскивания
  win.on('resized', remember)
  win.on('moved', remember)
  win.on('maximize', remember)
  win.on('unmaximize', remember)

  win.on('close', e => {
    // закрытие окна — уходим в трей: напоминания о парах, замены и почта работают дальше
    if (!quitting && kv['app.tray'] !== false) {
      e.preventDefault()
      win?.hide()
      if (!kv['app.trayHintShown']) {
        kv['app.trayHintShown'] = true
        saveKVSoon()
        showNotification({ title: 'Арктика работает в трее', body: isLinux
          ? 'Напомню о парах, заменах и новых письмах. Открыть — значок в трее или снова запусти Арктику из меню.'
          : 'Напомню о парах, заменах и новых письмах. Открыть — значок у часов.' })
      }
    }
  })
  win.on('focus', () => win?.webContents.send('app:focus', true))
  win.on('blur', () => win?.webContents.send('app:focus', false))
  win.on('show', () => win?.webContents.send('app:visible', true))
  win.on('hide', () => win?.webContents.send('app:visible', false))

  // ссылки из приложения (не из webview) открываются во внешнем браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('did-attach-webview', (_e, wc) => setupSiteContents(wc))
  win.webContents.on('did-finish-load', () => {
    if (pendingRoute) { win?.webContents.send('app:route', pendingRoute); pendingRoute = null }
  })
}

// ---------- окно не загрузилось: сами перезагружаем, потом — экран восстановления ----------

let rendererReady = false
let recoverTries = 0
let watchdog: NodeJS.Timeout | null = null

function darkUI() {
  const s = kv['ui.scheme']
  return s === 'light' ? false : s === 'system' ? nativeTheme.shouldUseDarkColors : true
}

function armWatchdog() {
  rendererReady = false
  if (watchdog) clearTimeout(watchdog)
  watchdog = setTimeout(() => {
    if (rendererReady || !win || win.isDestroyed()) return
    logError('renderer did not report ready in 20s')
    saveGpuState({ clearShaders: true })
    recoverOrReload('Интерфейс не загрузился за 20 секунд')
  }, 20_000)
}

function recoverOrReload(reason: string) {
  if (!win || win.isDestroyed()) return
  if (recoverTries < 1) {
    recoverTries += 1
    win.webContents.session.clearCache().catch(() => null).finally(() => {
      if (!win || win.isDestroyed()) return
      win.loadURL(rendererURL())
      armWatchdog()
    })
    return
  }
  showRecovery(reason)
}

function showRecovery(reason: string) {
  if (!win || win.isDestroyed()) return
  if (watchdog) { clearTimeout(watchdog); watchdog = null }
  const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!))
  const btn = (a: string, t: string, primary = false) =>
    `<a href="safu-recover://${a}" style="display:block;margin:8px 0;padding:12px 16px;border-radius:12px;text-decoration:none;font-weight:600;color:#fff;background:${primary ? 'linear-gradient(135deg,#2973fa,#22d3ee)' : 'rgba(255,255,255,.08)'}">${t}</a>`
  const html = `<!doctype html><meta charset="utf-8"><title>Арктика</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0a0d14;color:#e8ecf4;font-family:'Segoe UI',sans-serif">
<div style="max-width:440px;padding:28px">
<div style="font-size:44px">❄️</div>
<h2 style="margin:8px 0">Арктика не открылась</h2>
<p style="opacity:.7;line-height:1.5">${esc(reason)}. Данные (расписание, ДЗ, заметки, пароли) целы — попробуй по порядку:</p>
${btn('reload', 'Попробовать ещё раз', true)}
${btn('reset', 'Сбросить открытые сайты и кеш — и открыть')}
${btn('safe-gpu', 'Перезапустить без ускорения видеокартой')}
${btn('logs', 'Открыть папку с журналом ошибок')}
</div></body>`
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  if (!win.isVisible() && !process.argv.includes('--hidden')) win.show()
}

async function runRecovery(action: string) {
  logError(`recovery: ${action}`)
  if (action === 'safe-gpu') { saveGpuState({ safe: true, clearShaders: true }); quitting = true; flushAll(); app.relaunch(); app.exit(0); return }
  if (action === 'logs') { void shell.openPath(path.join(app.getPath('userData'), 'logs')); return }
  if (action === 'reset') {
    delete kv['sites.saved.v1']
    saveKVNow()
    saveGpuState({ clearShaders: true })
    await win?.webContents.session.clearCache().catch(() => null)
    await session.fromPartition(SITES_PARTITION).clearCache().catch(() => null)
  }
  recoverTries = 0
  if (!win || win.isDestroyed()) return
  win.loadURL(rendererURL())
  armWatchdog()
}

function showMain(route?: string) {
  if (!win) createWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (route) {
    if (win.webContents.isLoading()) pendingRoute = route
    else win.webContents.send('app:route', route)
  }
}

/** Мини-окно текущей пары: маленькое, поверх всех окон, можно таскать */
function toggleWidget(force?: boolean) {
  const want = force ?? !widget
  if (!want) {
    widget?.close()
    widget = null
    kv['widget.open'] = false
    saveKVSoon()
    return
  }
  if (widget) { widget.show(); return }
  const area = screen.getPrimaryDisplay().workArea
  const saved = kv['widget.pos'] as { x: number; y: number } | undefined
  const w = 360, h = 132
  widget = new BrowserWindow({
    width: w,
    height: h,
    x: saved?.x ?? area.x + area.width - w - 18,
    y: saved?.y ?? area.y + area.height - h - 18,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  widget.setAlwaysOnTop(true, 'floating')
  widget.loadURL(rendererURL('widget'))
  widget.once('ready-to-show', () => widget?.showInactive())
  widget.on('moved', () => {
    if (!widget) return
    const b = widget.getBounds()
    kv['widget.pos'] = { x: b.x, y: b.y }
    saveKVSoon()
  })
  widget.on('closed', () => { widget = null; refreshTray() })
  kv['widget.open'] = true
  saveKVSoon()
}

// ---------- трей ----------

let trayState = { tooltip: 'Арктика', line: '' }

// Автозапуск читается из реестра Windows — один раз, дальше помним сами
let autostartCache: boolean | null = null
const autostartOn = () => (autostartCache ??= loginItem.get())
function setAutostart(on: boolean) {
  loginItem.set(on)
  autostartCache = on
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: trayState.line || 'Арктика', enabled: false },
    { type: 'separator' },
    { label: 'Открыть Арктику', click: () => showMain() },
    { label: 'Расписание', click: () => showMain('schedule') },
    { label: 'Записать ДЗ', click: () => showMain('hw') },
    { label: 'Почта', click: () => showMain('site:mail') },
    { type: 'separator' },
    { label: widget ? 'Скрыть мини-окно пары' : 'Мини-окно пары поверх окон', click: () => { toggleWidget(); refreshTray() } },
    { label: 'Обновить расписание', click: () => win?.webContents.send('app:route', 'sync') },
    { type: 'separator' },
    {
      label: `Запускать вместе с ${OS_NAME}`,
      type: 'checkbox',
      checked: autostartOn(),
      click: item => { setAutostart(item.checked); refreshTray() }
    },
    { label: 'Выход', click: () => { quitting = true; app.quit() } }
  ])
}

// Интерфейс присылает строку для трея раз в 20 секунд. Меню собирается заново, только когда в нём что-то
// поменялось (пара сменилась, открыли мини-окно), — раньше оно пересобиралось и читало реестр каждый раз
let trayTip = ''
let trayMenuKey = ''
function refreshTray() {
  if (!tray) return
  const tip = trayState.tooltip.slice(0, 120)
  if (tip !== trayTip) { trayTip = tip; tray.setToolTip(tip) }
  const key = `${trayState.line}|${!!widget}|${autostartOn()}`
  if (key === trayMenuKey) return
  trayMenuKey = key
  tray.setContextMenu(buildTrayMenu())
}

function createTray() {
  const img = appIcon()
  tray = new Tray(trayImage(img))
  tray.on('click', () => showMain())
  refreshTray()
}

// ---------- уведомления (сразу и по расписанию) ----------

type Note = { id?: string; title: string; body?: string; route?: string; at?: number; silent?: boolean; actions?: { id: string; text: string }[] }
let scheduled: Note[] = []
const timers = new Map<string, NodeJS.Timeout>()

function showNotification(n: Note) {
  if (!Notification.isSupported()) return
  const note = new Notification({
    title: n.title,
    body: n.body || '',
    silent: !!n.silent,
    icon: iconPath(),
    actions: (n.actions || []).map(a => ({ type: 'button' as const, text: a.text })),
    toastXml: undefined
  })
  note.on('click', () => showMain(n.route))
  note.on('action', (_e, index) => {
    const a = n.actions?.[index]
    if (a) win?.webContents.send('app:route', a.id)
  })
  note.show()
}

function loadScheduled() {
  try { scheduled = JSON.parse(fs.readFileSync(notifFile(), 'utf8')) } catch { scheduled = [] }
}

// список напоминаний пишется в фоне и не чаще раза в секунду
let schedSaveTimer: NodeJS.Timeout | null = null
function saveScheduled() {
  if (schedSaveTimer) clearTimeout(schedSaveTimer)
  schedSaveTimer = setTimeout(() => {
    schedSaveTimer = null
    fs.promises.writeFile(notifFile(), JSON.stringify(scheduled)).catch(() => { /* ничего */ })
  }, 1000)
}

function saveScheduledNow() {
  if (schedSaveTimer) { clearTimeout(schedSaveTimer); schedSaveTimer = null }
  try { fs.writeFileSync(notifFile(), JSON.stringify(scheduled)) } catch { /* ничего */ }
}

// несколько списков подряд (пары, ДЗ, вопросы «что задали?») — один пересчёт таймеров
let armTimer: NodeJS.Timeout | null = null
function armSoon() {
  if (armTimer) clearTimeout(armTimer)
  armTimer = setTimeout(() => { armTimer = null; armAll() }, 150)
}

function armAll() {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  const now = Date.now()
  // пропущенные недавно (компьютер спал) — показываем, если опоздали не больше чем на 10 минут
  scheduled = scheduled.filter(n => (n.at ?? 0) > now - 10 * 60_000)
  for (const n of scheduled) {
    const id = n.id || Math.random().toString(36)
    const delay = Math.max(0, (n.at ?? now) - now)
    // setTimeout не любит задержки больше ~24 дней — такие поставим при следующем пересчёте
    if (delay > 2_000_000_000) continue
    timers.set(id, setTimeout(() => {
      timers.delete(id)
      scheduled = scheduled.filter(x => x.id !== id)
      saveScheduled()
      showNotification(n)
    }, delay))
  }
  saveScheduled()
}

// ---------- сеть: запросы к сайтам университета без ограничений браузера ----------

type FetchReq = { url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number; partition?: string }

async function doFetch(r: FetchReq) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), r.timeout ?? 25_000)
  try {
    const ses = r.partition ? session.fromPartition(r.partition) : session.defaultSession
    const res = await ses.fetch(r.url, {
      method: r.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        ...(r.headers || {})
      },
      body: r.body,
      signal: ctrl.signal,
      redirect: 'follow'
    })
    const buf = Buffer.from(await res.arrayBuffer())
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    } catch {
      text = new TextDecoder('windows-1251').decode(buf)
    }
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => { headers[k] = v })
    return { ok: res.ok, status: res.status, text, url: res.url, headers }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? 'Превышено время ожидания' : (e as Error).message
    return { ok: false, status: 0, text: '', url: r.url, headers: {}, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

// ---------- файлы предметов ----------

type FileInfo = { name: string; rel: string; dir: boolean; size: number; mtime: number; ext: string }

// Вся работа с файлами — в фоне (fs.promises): пока главный процесс ждёт диск, окно перетаскивается,
// а сайты отвечают. Раньше большая папка или поиск по файлам подвешивали всё приложение
async function listDir(rel: string, create = true): Promise<FileInfo[]> {
  const root = filesRoot()
  const dir = inRoot(rel)
  if (create) await fs.promises.mkdir(dir, { recursive: true })
  let entries: fs.Dirent[]
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return [] }
  const visible = entries.filter(d => !d.name.startsWith('.') && d.name !== 'desktop.ini' && d.name !== 'Thumbs.db')
  return Promise.all(visible.map(async d => {
    const full = path.join(dir, d.name)
    const st = await fs.promises.stat(full).catch(() => null)
    return {
      name: d.name,
      rel: relOf(root, full),
      dir: d.isDirectory(),
      size: st?.size ?? 0,
      mtime: st?.mtimeMs ?? 0,
      ext: d.isDirectory() ? '' : path.extname(d.name).slice(1).toLowerCase()
    }
  }))
}

/** Все файлы в папке (до 4 уровней вложенности и не больше 20 000 — поиску этого хватает) */
async function walkFiles(rel: string, depth = 4, limit = 20_000): Promise<FileInfo[]> {
  const out: FileInfo[] = []
  const step = async (r: string, d: number, create: boolean) => {
    if (d < 0 || out.length >= limit) return
    for (const f of await listDir(r, create)) {
      if (out.length >= limit) return
      if (f.dir) await step(f.rel, d - 1, false)
      else out.push(f)
    }
  }
  await step(rel, depth, true)
  return out
}

const exists = (p: string) => fs.promises.access(p).then(() => true, () => false)

function uniquePath(target: string): string {
  if (!fs.existsSync(target)) return target
  const ext = path.extname(target)
  const base = target.slice(0, target.length - ext.length)
  for (let i = 2; i < 999; i++) {
    const p = `${base} (${i})${ext}`
    if (!fs.existsSync(p)) return p
  }
  return `${base}-${Date.now()}${ext}`
}

async function copyInto(rel: string, sources: string[]): Promise<string[]> {
  const root = filesRoot()
  const dir = inRoot(rel)
  await fs.promises.mkdir(dir, { recursive: true })
  const out: string[] = []
  for (const src of sources) {
    try {
      const target = uniquePath(path.join(dir, path.basename(src)))
      const st = await fs.promises.stat(src)
      if (st.isDirectory()) await fs.promises.cp(src, target, { recursive: true })
      else await fs.promises.copyFile(src, target)
      out.push(relOf(root, target))
    } catch (e) {
      console.error('copy failed', src, e)
    }
  }
  return out
}

// Миниатюры файлов: Windows строит их сама, а мы запоминаем готовые — при возврате в папку они не
// строятся и не кодируются заново. Ключ — путь, размер и время изменения: поменялся файл — новая миниатюра
const thumbCache = new Map<string, string | null>()
async function fileThumb(rel: string, size: number): Promise<string | null> {
  const p = inRoot(rel)
  const st = await fs.promises.stat(p).catch(() => null)
  if (!st || st.isDirectory()) return null
  const key = `${p}|${size}|${st.size}|${st.mtimeMs}`
  const hit = thumbCache.get(key)
  if (hit !== undefined) {
    thumbCache.delete(key)
    thumbCache.set(key, hit)
    return hit
  }
  let url: string | null = null
  try {
    if (isLinux) url = await cachedThumb(p, size) // Linux: готовые миниатюры файлового менеджера, остальное строит окно
    else {
      const img = await nativeImage.createThumbnailFromPath(p, { width: size, height: size })
      url = img.isEmpty() ? null : img.toDataURL()
    }
  } catch { /* у файла нет миниатюры */ }
  thumbCache.set(key, url)
  if (thumbCache.size > 400) thumbCache.delete(thumbCache.keys().next().value!)
  return url
}

// ---------- сайты в карточках (webview) ----------

const SITES_PARTITION = 'persist:sites'

// Вход на сайтах вуза держится в «сессионных» cookie — без срока, их стирает каждый выход из
// приложения, и войти приходилось заново. Как на iPhone: сохраняем их зашифрованными (DPAPI)
// и возвращаем при запуске; старше двух недель — не возвращаем
const SESSION_COOKIES = 'sites.sessionCookies'

async function saveSiteSessionCookies() {
  try {
    const ses = session.fromPartition(SITES_PARTITION)
    const list = (await ses.cookies.get({})).filter(c => c.session && c.domain && c.name)
    const out = list.slice(0, 400).map(c => ({
      url: `${c.secure ? 'https' : 'http'}://${String(c.domain).replace(/^\./, '')}${c.path || '/'}`,
      name: c.name, value: c.value, domain: c.hostOnly ? undefined : c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite
    }))
    const text = JSON.stringify({ at: Date.now(), list: out })
    if (secrets[SESSION_COOKIES] === text) return
    secrets[SESSION_COOKIES] = text
    saveSecrets()
  } catch (e) {
    logError('session cookies: ' + String(e))
  }
}

async function restoreSiteSessionCookies() {
  try {
    const raw = secrets[SESSION_COOKIES]
    if (!raw) return
    const j = JSON.parse(raw) as { at: number; list: Electron.CookiesSetDetails[] }
    if (!j?.list || Date.now() - j.at > 14 * 86_400_000) return
    const ses = session.fromPartition(SITES_PARTITION)
    await Promise.all(j.list.map(c => ses.cookies.set(c).catch(() => undefined)))
  } catch { /* испорченная запись — войдут заново */ }
}

function setupSiteSession() {
  const ses = session.fromPartition(SITES_PARTITION)
  void restoreSiteSessionCookies()
  // вошли или вышли — запоминаем (не чаще раза в 5 секунд)
  let cookieTimer: ReturnType<typeof setTimeout> | null = null
  ses.cookies.on('changed', (_e, c) => {
    if (!c.session || cookieTimer) return
    cookieTimer = setTimeout(() => { cookieTimer = null; void saveSiteSessionCookies() }, 5000)
  })
  // сайты видят обычный Chrome: со словом «Electron» в адресе браузера некоторые страницы входа не пускают
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|safu-desktop|Arktika|arktika)\/\S+/g, ''))
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media'].includes(permission))
  })
  // загрузки с сайтов (Sakai, почта) — в «Файлы» приложения: в папку предмета, которую выбрали заранее,
  // в папку курса Sakai, который сейчас открыт (подсказывает интерфейс), иначе в «Загрузки»
  ses.on('will-download', (_e, item, wc) => {
    const chosen = (kv['download.target'] as string) || ''
    const hint = wc ? downloadHints.get(wc.id) || '' : ''
    let dir: string
    try { dir = inRoot(chosen || hint || 'Загрузки') } catch { dir = inRoot('Загрузки') }
    fs.mkdirSync(dir, { recursive: true })
    const name = item.getFilename() || 'Файл'
    const file = uniquePath(path.join(dir, name.replace(/[\\/:*?"<>|]/g, '_')))
    item.setSavePath(file)
    const rel = path.relative(filesRoot(), file).split(path.sep).join('/')
    const folder = path.basename(dir)
    const send = (o: Record<string, unknown>) => win?.webContents.send('download:progress', { name: path.basename(file), path: file, rel, folder, ...o })
    send({ state: 'started' })
    item.on('updated', () => {
      const total = item.getTotalBytes()
      send({ state: 'progress', progress: total > 0 ? item.getReceivedBytes() / total : 0 })
    })
    item.once('done', (_ev, state) => {
      send({ state })
      if (state === 'completed' && !win?.isFocused()) {
        showNotification({ title: `Сохранено в «${folder}»`, body: path.basename(file), silent: true })
      }
    })
  })
}

/** Куда класть скачанное с конкретной страницы: интерфейс узнаёт открытый курс Sakai и присылает папку предмета */
const downloadHints = new Map<number, string>()

function setupSiteContents(wc: Electron.WebContents) {
  const wcId = wc.id
  wc.once('destroyed', () => downloadHints.delete(wcId))
  // ссылки «в новом окне» открываем в той же карточке — так работают Sakai и почта
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) win?.webContents.send('site:newWindow', { id: wc.id, url })
    return { action: 'deny' }
  })
  wc.on('context-menu', (_e, p) => {
    const items: Electron.MenuItemConstructorOptions[] = []
    if (p.linkURL) {
      if (/^https?:/i.test(p.linkURL)) items.push({ label: 'Скачать в Файлы', click: () => wc.downloadURL(p.linkURL) })
      items.push({ label: 'Открыть ссылку в браузере', click: () => shell.openExternal(p.linkURL) })
      items.push({ label: 'Копировать ссылку', click: () => clipboard.writeText(p.linkURL) })
      items.push({ type: 'separator' })
    }
    if (p.selectionText) items.push({ label: 'Копировать', role: 'copy' })
    if (p.isEditable) {
      items.push({ label: 'Вырезать', role: 'cut' }, { label: 'Вставить', role: 'paste' }, { label: 'Выделить всё', role: 'selectAll' })
    }
    if (p.mediaType === 'image' && p.srcURL) {
      items.push({ label: 'Сохранить картинку', click: () => wc.downloadURL(p.srcURL) })
    }
    if ((p.mediaType === 'video' || p.mediaType === 'audio') && /^https?:/i.test(p.srcURL)) {
      items.push({ label: p.mediaType === 'video' ? 'Сохранить видео' : 'Сохранить запись', click: () => wc.downloadURL(p.srcURL) })
    }
    items.push({ type: 'separator' })
    items.push({ label: 'Назад', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() })
    items.push({ label: 'Обновить', click: () => wc.reload() })
    items.push({ label: 'Открыть в браузере', click: () => shell.openExternal(wc.getURL()) })
    Menu.buildFromTemplate(items).popup()
  })
}

// ---------- IPC ----------

function registerIPC() {
  ipcMain.on('kv:all', e => { e.returnValue = kv })
  ipcMain.on('kv:set', (_e, key: string, value: unknown) => {
    if (value === undefined || value === null) delete kv[key]
    else kv[key] = value
    saveKVSoon()
  })
  ipcMain.on('kv:replace', (_e, all: Record<string, unknown>) => {
    kv = all || {}
    saveKVNow()
  })

  ipcMain.handle('secret:get', (_e, key: string) => secrets[key] ?? null)
  ipcMain.handle('secret:all', () => ({ ...secrets }))
  ipcMain.handle('secret:set', (_e, key: string, value: string | null) => {
    if (value == null) delete secrets[key]
    else secrets[key] = value
    saveSecrets()
    return true
  })
  ipcMain.handle('secret:replace', (_e, all: Record<string, string>) => {
    secrets = all || {}
    saveSecrets()
    saveSecretsNow()
    return true
  })

  ipcMain.handle('net:fetch', (_e, r: FetchReq) => doFetch(r))

  // большие кеши (архив пар, расписание всей школы) — отдельными файлами, не в общем хранилище
  let cacheDirReady = false
  const cacheFile = (name: string) => {
    const dir = path.join(userDir(), 'cache')
    if (!cacheDirReady) { fs.mkdirSync(dir, { recursive: true }); cacheDirReady = true }
    return path.join(dir, name.replace(/[^\w.-]/g, '_') + '.json')
  }
  // в фоне: архив пар и расписание всей школы бывают по несколько мегабайт. Здесь кеш — просто текст:
  // разбирает и собирает JSON интерфейс, а не главный процесс (иначе он стоял бы, пока разбирает мегабайты)
  ipcMain.handle('cache:get', async (_e, name: string) => {
    try { return await fs.promises.readFile(cacheFile(name), 'utf8') } catch { return null }
  })
  ipcMain.handle('cache:set', async (_e, name: string, text: string | null) => {
    const f = cacheFile(name)
    if (text == null) { try { await fs.promises.unlink(f) } catch { /* нет файла */ } return true }
    const tmp = f + '.' + Math.random().toString(36).slice(2) + '.tmp'
    await fs.promises.writeFile(tmp, typeof text === 'string' ? text : JSON.stringify(text))
    await fs.promises.rename(tmp, f)
    return true
  })

  ipcMain.handle('notify:show', (_e, n: Note) => { showNotification(n); return true })
  ipcMain.handle('notify:schedule', (_e, prefix: string, list: Note[]) => {
    // заменить все запланированные с таким началом id на новый список
    scheduled = scheduled.filter(n => !(n.id || '').startsWith(prefix)).concat(list.filter(n => (n.at ?? 0) > Date.now()))
    armSoon()
    return scheduled.filter(n => (n.id || '').startsWith(prefix)).length
  })
  ipcMain.handle('notify:list', () => scheduled)

  ipcMain.handle('fs:root', () => filesRoot())
  ipcMain.handle('fs:list', (_e, rel: string) => listDir(rel))
  ipcMain.handle('fs:walk', (_e, rel: string) => walkFiles(rel))
  ipcMain.handle('fs:mkdir', async (_e, rel: string) => { await fs.promises.mkdir(inRoot(rel), { recursive: true }); return true })
  // папки предметов: создаём только те, которых ещё нет на этом запуске (список приходит после каждой синхронизации)
  const madeDirs = new Set<string>()
  ipcMain.handle('fs:ensureDirs', async (_e, rels: string[]) => {
    await Promise.all(rels.map(async r => {
      try {
        const p = inRoot(r)
        if (madeDirs.has(p)) return
        await fs.promises.mkdir(p, { recursive: true })
        madeDirs.add(p)
      } catch { /* имя с запрещёнными символами */ }
    }))
    return true
  })
  ipcMain.handle('fs:import', async (_e, rel: string, folders = false) => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Добавить файлы',
      properties: folders ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']
    })
    if (r.canceled) return []
    return copyInto(rel, r.filePaths)
  })
  ipcMain.handle('fs:importPaths', (_e, rel: string, paths: string[]) => copyInto(rel, paths))
  ipcMain.handle('fs:open', async (_e, rel: string) => (await shell.openPath(inRoot(rel))) || true)
  ipcMain.handle('fs:openPath', async (_e, abs: string) => (await shell.openPath(abs)) || true)
  ipcMain.handle('fs:reveal', (_e, rel: string) => { shell.showItemInFolder(inRoot(rel)); return true })
  ipcMain.handle('fs:revealPath', (_e, abs: string) => { shell.showItemInFolder(abs); return true })
  ipcMain.handle('fs:openRoot', async (_e, rel = '') => { await shell.openPath(inRoot(rel)); return true })
  ipcMain.handle('fs:trash', async (_e, rel: string) => { await shell.trashItem(inRoot(rel)); return true })
  ipcMain.handle('fs:rename', async (_e, rel: string, name: string) => {
    const from = inRoot(rel)
    const safe = name.replace(/[\\/:*?"<>|]/g, '_').trim()
    if (!safe) throw new Error('Пустое имя')
    const to = uniquePath(path.join(path.dirname(from), safe))
    await fs.promises.rename(from, to)
    return relOf(filesRoot(), to)
  })
  ipcMain.handle('fs:move', async (_e, rel: string, toDirRel: string) => {
    const from = inRoot(rel)
    const dir = inRoot(toDirRel)
    await fs.promises.mkdir(dir, { recursive: true })
    const to = uniquePath(path.join(dir, path.basename(from)))
    await fs.promises.rename(from, to)
    return relOf(filesRoot(), to)
  })
  ipcMain.handle('fs:readText', (_e, rel: string) => fs.promises.readFile(inRoot(rel), 'utf8'))
  ipcMain.handle('fs:writeText', async (_e, rel: string, text: string) => {
    const p = inRoot(rel)
    await fs.promises.mkdir(path.dirname(p), { recursive: true })
    await fs.promises.writeFile(p, text, 'utf8')
    return true
  })
  ipcMain.handle('fs:writeBase64', async (_e, rel: string, b64: string) => {
    const p = inRoot(rel)
    await fs.promises.mkdir(path.dirname(p), { recursive: true })
    await fs.promises.writeFile(p, Buffer.from(b64, 'base64'))
    return true
  })
  ipcMain.handle('fs:readBase64', async (_e, rel: string) => (await fs.promises.readFile(inRoot(rel))).toString('base64'))
  ipcMain.handle('fs:exists', async (_e, rel: string) => { try { return await exists(inRoot(rel)) } catch { return false } })
  ipcMain.handle('fs:thumb', (_e, rel: string, size = 256) => fileThumb(rel, size).catch(() => null))
  ipcMain.handle('fs:chooseRoot', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Папка для файлов Арктики', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    kv['files.root'] = r.filePaths[0]
    saveKVNow()
    return r.filePaths[0]
  })
  ipcMain.handle('fs:dragOut', (e, rel: string) => {
    try {
      e.sender.startDrag({ file: inRoot(rel), icon: appIcon()?.resize({ width: 32, height: 32 }) || nativeImage.createEmpty() })
    } catch { /* ничего */ }
    return true
  })

  ipcMain.handle('dialog:save', async (_e, opts: { name: string; text?: string; base64?: string; filters?: Electron.FileFilter[] }) => {
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(app.getPath('documents'), opts.name),
      filters: opts.filters
    })
    if (r.canceled || !r.filePath) return null
    if (opts.base64 != null) await fs.promises.writeFile(r.filePath, Buffer.from(opts.base64, 'base64'))
    else await fs.promises.writeFile(r.filePath, opts.text ?? '', 'utf8')
    return r.filePath
  })
  ipcMain.handle('dialog:open', async (_e, opts: { filters?: Electron.FileFilter[]; base64?: boolean }) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: opts.filters })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    return { path: p, name: path.basename(p), data: opts.base64 ? (await fs.promises.readFile(p)).toString('base64') : await fs.promises.readFile(p, 'utf8') }
  })

  ipcMain.handle('shell:open', (_e, url: string) => { if (/^(https?|mailto|tel|yandexmaps):/i.test(url)) shell.openExternal(url); return true })
  ipcMain.handle('clipboard:write', (_e, text: string) => { clipboard.writeText(text); return true })
  ipcMain.handle('clipboard:read', () => clipboard.readText())

  /** Какая видеокарта работает (коды производителя и модели): интерфейс помнит её имя и пробует WebGL заново, только если карту сменили */
  let gpuDeviceId = ''
  const gpuDevice = async () => gpuDeviceId || (gpuDeviceId = await Promise.race([
    app.getGPUInfo('basic').then((i: any) => {
      const all: any[] = i?.gpuDevice || []
      const list = all.some(d => d.active) ? all.filter(d => d.active) : all
      return list.map(d => `${d.vendorId}:${d.deviceId}`).join(',')
    }),
    new Promise<string>(r => setTimeout(() => r(''), 800))
  ]).catch(() => ''))
  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    userData: userDir(),
    autostart: autostartOn(),
    encryption: vault.available(),
    encryptionLabel: vault.label(),
    dark: nativeTheme.shouldUseDarkColors,
    // как сейчас рисуется окно: enabled — видеокартой, остальное — процессором (будет рывками)
    gpu: { safe: !!gpuState.safe, compositing: String((app.getGPUFeatureStatus() as any).gpu_compositing || ''), raster: String((app.getGPUFeatureStatus() as any).rasterization || ''), device: await gpuDevice() }
  }))
  ipcMain.handle('app:gpuSafe', (_e, safe: boolean) => { saveGpuState({ safe }); return safe })
  ipcMain.handle('app:autostart', (_e, on: boolean) => { setAutostart(on); refreshTray(); return on })
  ipcMain.handle('app:quit', () => { quitting = true; app.quit() })
  ipcMain.handle('app:relaunch', () => { quitting = true; flushAll(); app.relaunch(); app.exit(0) })
  ipcMain.handle('app:show', (_e, route?: string) => { showMain(route); return true })
  ipcMain.handle('app:badge', (_e, count: number) => {
    // число на значке в панели задач (как бейдж непрочитанных на iPhone)
    if (!win) return
    if (process.platform === 'win32') {
      if (count > 0) {
        const label = count > 99 ? '99+' : String(count)
        win.setOverlayIcon(badgeImage(label), `${label} новых`)
      } else {
        win.setOverlayIcon(null, '')
      }
    } else {
      app.setBadgeCount(count)
      // Linux: док показывает число не везде, поэтому ещё и точка на значке в трее
      if (tray && isLinux) tray.setImage(trayImage(appIcon(), count > 0))
    }
  })
  ipcMain.handle('app:titlebar', (_e, opts: { color: string; symbol: string }) => {
    try { win?.setTitleBarOverlay({ color: opts.color, symbolColor: opts.symbol, height: 40 }) } catch { /* не Windows */ }
  })
  ipcMain.handle('app:mica', (_e, on: boolean) => {
    kv['ui.mica'] = on
    saveKVSoon()
    try { win?.setBackgroundMaterial(on ? 'mica' : 'none') } catch { /* Windows 10 */ }
  })
  ipcMain.handle('app:flash', () => { win?.flashFrame(true) })
  // интерфейс собрался — сторож больше не нужен
  ipcMain.on('app:ready', () => {
    rendererReady = true; recoverTries = 0; if (watchdog) { clearTimeout(watchdog); watchdog = null }
    // проверка собранного пакета в CI: окно открылось и интерфейс собрался — выходим с кодом 0
    if (process.env.ARKTIKA_SMOKE) { console.log('ARKTIKA_SMOKE_OK'); quitting = true; setTimeout(() => app.exit(0), 300) }
  })
  ipcMain.on('app:log', (_e, text: string) => logError(`renderer: ${String(text).slice(0, 2000)}`))
  ipcMain.handle('app:recover', (_e, action: string) => runRecovery(action))

  ipcMain.handle('tray:update', (_e, s: { tooltip: string; line: string }) => {
    trayState = s
    refreshTray()
  })
  ipcMain.handle('widget:toggle', (_e, on?: boolean) => { toggleWidget(on); refreshTray(); return !!widget })
  ipcMain.handle('widget:state', () => !!widget)
  ipcMain.on('widget:push', (_e, payload: unknown) => widget?.webContents.send('widget:data', payload))
  ipcMain.on('widget:ready', () => win?.webContents.send('widget:wants'))
  ipcMain.on('widget:open', (_e, route?: string) => showMain(route))
  ipcMain.on('widget:resize', (_e, h: number) => {
    if (!widget) return
    const b = widget.getBounds()
    widget.setBounds({ ...b, height: Math.max(60, Math.min(400, Math.round(h))) })
  })

  // резервная копия с iPhone (.safubackup — zip): настройки отдаём интерфейсу, файлы кладём в папку файлов
  ipcMain.handle('backup:readIOS', async (_e, given?: string) => {
    let file = given
    if (!file) {
      const r = await dialog.showOpenDialog(win!, { title: 'Резервная копия Арктики', properties: ['openFile'], filters: [{ name: 'Копия Арктики', extensions: ['safubackup', 'safu', 'zip', 'json'] }] })
      if (r.canceled || !r.filePaths[0]) return null
      file = r.filePaths[0]
    }
    const buf = await fs.promises.readFile(file)
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) return { kind: 'text', name: path.basename(file), text: buf.toString('utf8') }
    let eocd = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    if (eocd < 0) throw new Error('Повреждённый архив')
    let count = buf.readUInt16LE(eocd + 10)
    let cd = buf.readUInt32LE(eocd + 16)
    let plist: string | null = null
    let files = 0
    const root = filesRoot()
    for (let n = 0; n < count; n++) {
      if (buf.readUInt32LE(cd) !== 0x02014b50) break
      const method = buf.readUInt16LE(cd + 10)
      const csize = buf.readUInt32LE(cd + 20)
      const nameLen = buf.readUInt16LE(cd + 28), extraLen = buf.readUInt16LE(cd + 30), commentLen = buf.readUInt16LE(cd + 32)
      const local = buf.readUInt32LE(cd + 42)
      const name = buf.toString('utf8', cd + 46, cd + 46 + nameLen)
      cd += 46 + nameLen + extraLen + commentLen
      const lNameLen = buf.readUInt16LE(local + 26), lExtra = buf.readUInt16LE(local + 28)
      const start = local + 30 + lNameLen + lExtra
      const raw = buf.subarray(start, start + csize)
      const isFile = name.startsWith('files/') && !name.includes('..') && !name.endsWith('/')
      if (name !== 'data.plist' && !isFile) continue
      const dest = isFile ? path.join(root, ...name.slice(6).split('/')) : ''
      // распаковка — в фоне, и только того, чего ещё нет
      if (isFile && await exists(dest)) continue
      const data = method === 8 ? await inflateRaw(raw) : raw
      if (name === 'data.plist') plist = Buffer.from(data).toString('base64')
      else {
        await fs.promises.mkdir(path.dirname(dest), { recursive: true })
        await fs.promises.writeFile(dest, data)
        files++
      }
    }
    return { kind: 'ios', name: path.basename(file), plist, files }
  })

  // перенос с iPhone по QR: свой маленький сервер в домашней сети — только пока открыт экран с кодом
  ipcMain.handle('transfer:start', async () => {
    transfer?.stop()
    const t = new TransferServer({
      // Linux: порт из диапазона, который открывает «Разрешить синхронизацию» в брандмауэре
      ...(isLinux ? { port: await freePort(LINUX_PORTS.transferFrom, LINUX_PORTS.to) } : {}),
      name: os.hostname(),
      version: app.getVersion(),
      root: filesRoot,
      emit: ev => {
        // телефон подключился — окно на передний план, даже если свернули
        if (ev.type === 'connected') { showMain(); win?.flashFrame(true) }
        win?.webContents.send('transfer:event', ev)
      }
    })
    transfer = t
    try {
      return await t.start()
    } catch (e) {
      if (transfer === t) transfer = null
      throw e
    }
  })
  ipcMain.handle('transfer:stop', () => { transfer?.stop(); transfer = null; return true })

  // синхронизация с iPhone: новая связка (старый код перестаёт работать), показать код ещё раз, отвязать
  ipcMain.handle('sync:pair', async () => {
    secrets['sync.pair'] = JSON.stringify(newPairing())
    saveSecrets()
    return currentSyncLink()
  })
  ipcMain.handle('sync:link', () => currentSyncLink())
  ipcMain.handle('sync:unpair', () => {
    delete secrets['sync.pair']
    saveSecrets()
    return true
  })
  ipcMain.on('sync:askReply', (_e, rid: string, ok: boolean) => {
    pairAsks.get(rid)?.(!!ok)
    pairAsks.delete(rid)
  })
  // брандмауэр: проверить (без прав администратора) и разрешить (одно окно UAC)
  ipcMain.handle('sync:firewall', () => firewallStatus(process.execPath))
  ipcMain.handle('sync:firewallFix', () => firewallFix(process.execPath))
  // для экрана синхронизации: адреса компьютера, порт и когда телефон последний раз его искал
  ipcMain.handle('sync:stats', async () => {
    const s = await ensureSync().catch(() => null)
    return { hosts: s?.hosts ?? [], port: s?.port ?? 0, seenAt: syncSeen.at, seenFrom: syncSeen.from, name: os.hostname() }
  })
  ipcMain.on('sync:reply', (_e, rid: string, r: { ok: boolean; result?: unknown; error?: string }) => {
    syncWaiters.get(rid)?.(r)
    syncWaiters.delete(rid)
  })

  ipcMain.handle('ai:summarize', async (_e, r: { subject: string; minutes: number; style: string; transcript: string }) => {
    const apiKey = secrets['claude.key']
    if (!apiKey) return { ok: false, error: 'Добавь ключ Claude API в настройках лекций' }
    return claude().summarizeLecture({ ...r, apiKey })
  })

  ipcMain.handle('mail:check', (_e, acc: MailAccount) => checkMail(acc))

  ipcMain.handle('sites:clear', async () => {
    await session.fromPartition(SITES_PARTITION).clearStorageData()
    // и сохранённый вход тоже — иначе он вернётся при следующем запуске
    delete secrets[SESSION_COOKIES]
    saveSecrets()
    return true
  })
  ipcMain.on('sites:downloadHint', (_e, id: number, rel: string | null) => {
    if (typeof id !== 'number') return
    if (typeof rel === 'string' && rel) downloadHints.set(id, rel)
    else downloadHints.delete(id)
  })
  ipcMain.handle('sites:preload', () => pathToFileURL(path.join(__dirname, 'site-preload.js')).toString())
  // снимок открытого сайта для анимации сворачивания и стопки. Снимаем здесь, а не в окне: webview.capturePage()
  // в окне роняло его целиком (V8 «Empty MaybeLocal» в песочнице) — приложение «вылетало и запускалось заново».
  // Заодно уменьшение и JPEG больше не занимают интерфейс
  ipcMain.handle('sites:capture', async (e, id: number, width: number) => {
    const wc = typeof id === 'number' ? webContents.fromId(id) : undefined
    // только страницы из этого же окна
    if (!wc || wc.isDestroyed() || wc.hostWebContents !== e.sender) return null
    try {
      let img = await wc.capturePage()
      if (img.isEmpty()) return null
      if (width > 0 && img.getSize().width > width * 1.2) img = img.resize({ width: Math.round(width), quality: 'good' })
      return { jpeg: img.toJPEG(84), thumb: 'data:image/jpeg;base64,' + img.resize({ width: Math.min(800, img.getSize().width), quality: 'good' }).toJPEG(82).toString('base64') }
    } catch {
      return null
    }
  })
}

/** Красный кружок с числом для значка в панели задач */
function badgeImage(text: string) {
  const size = 32
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="16" cy="16" r="15" fill="#ef4444"/>
    <text x="16" y="21.5" font-family="Segoe UI, Arial" font-size="${text.length > 2 ? 12 : 16}" font-weight="700" fill="#fff" text-anchor="middle">${text}</text>
  </svg>`
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))
}

// ---------- запуск ----------

function handleDeepLink(argv: string[]) {
  const link = argv.find(a => a.startsWith('safu:'))
  if (link) {
    const target = link.replace(/^safu:\/*/, '').replace(/\/$/, '')
    showMain(target || 'home')
  } else {
    showMain()
  }
}

app.on('second-instance', (_e, argv) => handleDeepLink(argv))
app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink([url]) })

app.whenReady().then(() => {
  loadKV()
  loadSecrets()
  loadScheduled()

  // файлы предметов показываются в приложении через safu-file://
  protocol.handle('safu-file', req => {
    try {
      const u = new URL(req.url)
      const rel = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
      const host = decodeURIComponent(u.host)
      const p = inRoot(host === 'root' ? rel : path.posix.join(host, rel))
      return net.fetch(pathToFileURL(p).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })

  registerIPC()
  setupSiteSession()
  createWindow()
  createTray()
  void integrateDesktop(iconPath())
  armAll()
  ensureSync().catch(e => console.error('sync server', e))
  if (kv['widget.open']) setTimeout(() => toggleWidget(true), 1500)

  // глобальная горячая клавиша: Ctrl+Alt+S — показать Арктику откуда угодно
  try { globalShortcut.register('CommandOrControl+Alt+S', () => (win?.isVisible() && win.isFocused() ? win.hide() : showMain())) } catch { /* занята */ }

  // компьютер проснулся — пересчитать напоминания и обновить расписание
  powerMonitor.on('resume', () => {
    armAll()
    win?.webContents.send('app:route', 'sync')
  })
  powerMonitor.on('lock-screen', () => win?.webContents.send('app:locked'))

  const link = process.argv.find(a => a.startsWith('safu:'))
  if (link) handleDeepLink([link])
})

let cookiesSaved = false
app.on('before-quit', e => {
  // перед выходом — сохранить вход на сайтах (это асинхронно: выходим чуть позже, не дольше секунды)
  if (!cookiesSaved) {
    cookiesSaved = true
    e.preventDefault()
    quitting = true
    Promise.race([saveSiteSessionCookies(), new Promise(r => setTimeout(r, 1000))]).finally(() => app.quit())
    return
  }
  quitting = true
  transfer?.stop()
  syncServer?.stop()
  flushAll()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (quitting || kv['app.tray'] === false)) app.quit()
})
