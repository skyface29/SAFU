// САФУ для Windows — главный процесс.
// Окно с материалом Mica, трей, мини-окно пары поверх всех окон (как Live Activity на iPhone),
// уведомления по расписанию, файлы предметов в «Документы\САФУ», сеть без CORS, пароли через DPAPI.

import {
  app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification, shell, dialog,
  safeStorage, net, protocol, session, screen, nativeTheme, clipboard, powerMonitor, globalShortcut
} from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { checkMail, type MailAccount } from './mail'
import * as zlib from 'node:zlib'
import { summarizeLecture } from './claude'

const isDev = !!process.env.VITE_DEV
const APP_ID = 'ru.student.safuhub'

app.setAppUserModelId(APP_ID)
app.setName('САФУ')
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

protocol.registerSchemesAsPrivileged([
  { scheme: 'safu-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
])

// ---------- пути ----------

const userDir = () => app.getPath('userData')
const storeFile = () => path.join(userDir(), 'store.json')
const secretsFile = () => path.join(userDir(), 'secrets.bin')
const notifFile = () => path.join(userDir(), 'scheduled.json')

function filesRoot(): string {
  const custom = kv['files.root']
  const root = typeof custom === 'string' && custom ? custom : path.join(app.getPath('documents'), 'САФУ')
  fs.mkdirSync(root, { recursive: true })
  return root
}

/** Путь внутри папки файлов. Выйти за её пределы нельзя */
function inRoot(rel: string): string {
  const root = filesRoot()
  const p = path.resolve(root, rel || '.')
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Путь вне папки САФУ')
  return p
}

// ---------- хранилище ключ-значение (как UserDefaults) ----------

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

function saveKVSoon() {
  if (kvTimer) clearTimeout(kvTimer)
  kvTimer = setTimeout(saveKVNow, 400)
}

function saveKVNow() {
  if (kvTimer) { clearTimeout(kvTimer); kvTimer = null }
  try {
    fs.mkdirSync(userDir(), { recursive: true })
    const tmp = storeFile() + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(kv))
    if (fs.existsSync(storeFile())) fs.copyFileSync(storeFile(), storeFile() + '.bak')
    fs.renameSync(tmp, storeFile())
  } catch (e) {
    console.error('store save failed', e)
  }
}

// ---------- секреты (пароли сайтов) — шифруются Windows DPAPI через safeStorage ----------

let secrets: Record<string, string> = {}

function loadSecrets() {
  try {
    const raw = fs.readFileSync(secretsFile())
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8')
    secrets = JSON.parse(text)
  } catch {
    secrets = {}
  }
}

function saveSecrets() {
  const text = JSON.stringify(secrets)
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8')
  fs.writeFileSync(secretsFile(), data)
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

function iconPath(): string {
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
    title: 'САФУ',
    icon: appIcon(),
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 40 },
    ...(process.platform === 'win32' && mica ? { backgroundMaterial: 'mica' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
      spellcheck: true
    }
  })
  if (kv['win.maximized']) win.maximize()
  win.loadURL(rendererURL())
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
  win.on('resize', remember)
  win.on('move', remember)

  win.on('close', e => {
    // закрытие окна — уходим в трей: напоминания о парах, замены и почта работают дальше
    if (!quitting && kv['app.tray'] !== false) {
      e.preventDefault()
      win?.hide()
      if (!kv['app.trayHintShown']) {
        kv['app.trayHintShown'] = true
        saveKVSoon()
        showNotification({ title: 'САФУ работает в трее', body: 'Напомню о парах, заменах и новых письмах. Открыть — значок у часов.' })
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
  widget.on('closed', () => { widget = null })
  kv['widget.open'] = true
  saveKVSoon()
}

// ---------- трей ----------

let trayState = { tooltip: 'САФУ', line: '' }

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: trayState.line || 'САФУ', enabled: false },
    { type: 'separator' },
    { label: 'Открыть САФУ', click: () => showMain() },
    { label: 'Расписание', click: () => showMain('schedule') },
    { label: 'Записать ДЗ', click: () => showMain('hw') },
    { label: 'Почта', click: () => showMain('site:mail') },
    { type: 'separator' },
    { label: widget ? 'Скрыть мини-окно пары' : 'Мини-окно пары поверх окон', click: () => { toggleWidget(); refreshTray() } },
    { label: 'Обновить расписание', click: () => win?.webContents.send('app:route', 'sync') },
    { type: 'separator' },
    {
      label: 'Запускать вместе с Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] })
    },
    { label: 'Выход', click: () => { quitting = true; app.quit() } }
  ])
}

function refreshTray() {
  if (!tray) return
  tray.setToolTip(trayState.tooltip.slice(0, 120))
  tray.setContextMenu(buildTrayMenu())
}

function createTray() {
  const img = appIcon()
  tray = new Tray(img ? img.resize({ width: 16, height: 16 }) : nativeImage.createEmpty())
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

function saveScheduled() {
  try { fs.writeFileSync(notifFile(), JSON.stringify(scheduled)) } catch { /* ничего */ }
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

function listDir(rel: string): FileInfo[] {
  const dir = inRoot(rel)
  fs.mkdirSync(dir, { recursive: true })
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => !d.name.startsWith('.') && d.name !== 'desktop.ini' && d.name !== 'Thumbs.db')
    .map(d => {
      const full = path.join(dir, d.name)
      let st: fs.Stats | null = null
      try { st = fs.statSync(full) } catch { /* файл исчез */ }
      return {
        name: d.name,
        rel: path.relative(filesRoot(), full).split(path.sep).join('/'),
        dir: d.isDirectory(),
        size: st?.size ?? 0,
        mtime: st?.mtimeMs ?? 0,
        ext: d.isDirectory() ? '' : path.extname(d.name).slice(1).toLowerCase()
      }
    })
}

function walkFiles(rel: string, depth = 4): FileInfo[] {
  const out: FileInfo[] = []
  const step = (r: string, d: number) => {
    if (d < 0) return
    for (const f of listDir(r)) {
      if (f.dir) step(f.rel, d - 1)
      else out.push(f)
    }
  }
  step(rel, depth)
  return out
}

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

function copyInto(rel: string, sources: string[]): string[] {
  const dir = inRoot(rel)
  fs.mkdirSync(dir, { recursive: true })
  const out: string[] = []
  for (const src of sources) {
    try {
      const target = uniquePath(path.join(dir, path.basename(src)))
      const st = fs.statSync(src)
      if (st.isDirectory()) fs.cpSync(src, target, { recursive: true })
      else fs.copyFileSync(src, target)
      out.push(path.relative(filesRoot(), target).split(path.sep).join('/'))
    } catch (e) {
      console.error('copy failed', src, e)
    }
  }
  return out
}

// ---------- сайты в карточках (webview) ----------

const SITES_PARTITION = 'persist:sites'

function setupSiteSession() {
  const ses = session.fromPartition(SITES_PARTITION)
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media'].includes(permission))
  })
  // загрузки с сайтов (Sakai, почта) — в «Загрузки\САФУ» или в папку предмета, которую выбрали заранее
  ses.on('will-download', (_e, item) => {
    const targetRel = (kv['download.target'] as string) || ''
    let dir: string
    try {
      dir = targetRel ? inRoot(targetRel) : path.join(app.getPath('downloads'), 'САФУ')
    } catch {
      dir = path.join(app.getPath('downloads'), 'САФУ')
    }
    fs.mkdirSync(dir, { recursive: true })
    const file = uniquePath(path.join(dir, item.getFilename()))
    item.setSavePath(file)
    win?.webContents.send('download:progress', { name: item.getFilename(), state: 'started', path: file })
    item.on('updated', () => {
      const total = item.getTotalBytes()
      win?.webContents.send('download:progress', {
        name: item.getFilename(), state: 'progress', path: file,
        progress: total > 0 ? item.getReceivedBytes() / total : 0
      })
    })
    item.once('done', (_ev, state) => {
      win?.webContents.send('download:progress', { name: item.getFilename(), state, path: file })
      if (state === 'completed') {
        showNotification({ title: 'Файл скачан', body: path.basename(file), silent: true })
      }
    })
  })
}

function setupSiteContents(wc: Electron.WebContents) {
  // ссылки «в новом окне» открываем в той же карточке — так работают Sakai и почта
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) win?.webContents.send('site:newWindow', { id: wc.id, url })
    return { action: 'deny' }
  })
  wc.on('context-menu', (_e, p) => {
    const items: Electron.MenuItemConstructorOptions[] = []
    if (p.linkURL) {
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
    return true
  })

  ipcMain.handle('net:fetch', (_e, r: FetchReq) => doFetch(r))

  // большие кеши (архив пар, расписание всей школы) — отдельными файлами, не в общем хранилище
  const cacheFile = (name: string) => {
    const dir = path.join(userDir(), 'cache')
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, name.replace(/[^\w.-]/g, '_') + '.json')
  }
  ipcMain.handle('cache:get', (_e, name: string) => {
    try { return JSON.parse(fs.readFileSync(cacheFile(name), 'utf8')) } catch { return null }
  })
  ipcMain.handle('cache:set', (_e, name: string, value: unknown) => {
    const f = cacheFile(name)
    if (value == null) { try { fs.unlinkSync(f) } catch { /* нет файла */ } return true }
    fs.writeFileSync(f + '.tmp', JSON.stringify(value))
    fs.renameSync(f + '.tmp', f)
    return true
  })

  ipcMain.handle('notify:show', (_e, n: Note) => { showNotification(n); return true })
  ipcMain.handle('notify:schedule', (_e, prefix: string, list: Note[]) => {
    // заменить все запланированные с таким началом id на новый список
    scheduled = scheduled.filter(n => !(n.id || '').startsWith(prefix)).concat(list.filter(n => (n.at ?? 0) > Date.now()))
    armAll()
    return scheduled.filter(n => (n.id || '').startsWith(prefix)).length
  })
  ipcMain.handle('notify:list', () => scheduled)

  ipcMain.handle('fs:root', () => filesRoot())
  ipcMain.handle('fs:list', (_e, rel: string) => listDir(rel))
  ipcMain.handle('fs:walk', (_e, rel: string) => walkFiles(rel))
  ipcMain.handle('fs:mkdir', (_e, rel: string) => { fs.mkdirSync(inRoot(rel), { recursive: true }); return true })
  ipcMain.handle('fs:ensureDirs', (_e, rels: string[]) => {
    for (const r of rels) { try { fs.mkdirSync(inRoot(r), { recursive: true }) } catch { /* имя с запрещёнными символами */ } }
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
  ipcMain.handle('fs:rename', (_e, rel: string, name: string) => {
    const from = inRoot(rel)
    const safe = name.replace(/[\\/:*?"<>|]/g, '_').trim()
    if (!safe) throw new Error('Пустое имя')
    const to = uniquePath(path.join(path.dirname(from), safe))
    fs.renameSync(from, to)
    return path.relative(filesRoot(), to).split(path.sep).join('/')
  })
  ipcMain.handle('fs:move', (_e, rel: string, toDirRel: string) => {
    const from = inRoot(rel)
    const dir = inRoot(toDirRel)
    fs.mkdirSync(dir, { recursive: true })
    const to = uniquePath(path.join(dir, path.basename(from)))
    fs.renameSync(from, to)
    return path.relative(filesRoot(), to).split(path.sep).join('/')
  })
  ipcMain.handle('fs:readText', (_e, rel: string) => fs.readFileSync(inRoot(rel), 'utf8'))
  ipcMain.handle('fs:writeText', (_e, rel: string, text: string) => {
    const p = inRoot(rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, text, 'utf8')
    return true
  })
  ipcMain.handle('fs:writeBase64', (_e, rel: string, b64: string) => {
    const p = inRoot(rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, Buffer.from(b64, 'base64'))
    return true
  })
  ipcMain.handle('fs:readBase64', (_e, rel: string) => fs.readFileSync(inRoot(rel)).toString('base64'))
  ipcMain.handle('fs:exists', (_e, rel: string) => { try { return fs.existsSync(inRoot(rel)) } catch { return false } })
  ipcMain.handle('fs:thumb', async (_e, rel: string, size = 256) => {
    try {
      const img = await nativeImage.createThumbnailFromPath(inRoot(rel), { width: size, height: size })
      return img.isEmpty() ? null : img.toDataURL()
    } catch {
      return null
    }
  })
  ipcMain.handle('fs:chooseRoot', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Папка для файлов САФУ', properties: ['openDirectory', 'createDirectory'] })
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
    if (opts.base64 != null) fs.writeFileSync(r.filePath, Buffer.from(opts.base64, 'base64'))
    else fs.writeFileSync(r.filePath, opts.text ?? '', 'utf8')
    return r.filePath
  })
  ipcMain.handle('dialog:open', async (_e, opts: { filters?: Electron.FileFilter[]; base64?: boolean }) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: opts.filters })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    return { path: p, name: path.basename(p), data: opts.base64 ? fs.readFileSync(p).toString('base64') : fs.readFileSync(p, 'utf8') }
  })

  ipcMain.handle('shell:open', (_e, url: string) => { if (/^(https?|mailto|tel|yandexmaps):/i.test(url)) shell.openExternal(url); return true })
  ipcMain.handle('clipboard:write', (_e, text: string) => { clipboard.writeText(text); return true })
  ipcMain.handle('clipboard:read', () => clipboard.readText())

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    userData: userDir(),
    autostart: app.getLoginItemSettings().openAtLogin,
    encryption: safeStorage.isEncryptionAvailable(),
    dark: nativeTheme.shouldUseDarkColors
  }))
  ipcMain.handle('app:autostart', (_e, on: boolean) => { app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] }); return on })
  ipcMain.handle('app:quit', () => { quitting = true; app.quit() })
  ipcMain.handle('app:relaunch', () => { quitting = true; app.relaunch(); app.exit(0) })
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

  // резервная копия с iPhone (.safubackup — zip): настройки отдаём интерфейсу, файлы кладём в папку САФУ
  ipcMain.handle('backup:readIOS', async (_e, given?: string) => {
    let file = given
    if (!file) {
      const r = await dialog.showOpenDialog(win!, { title: 'Резервная копия САФУ', properties: ['openFile'], filters: [{ name: 'Копия САФУ', extensions: ['safubackup', 'safu', 'zip', 'json'] }] })
      if (r.canceled || !r.filePaths[0]) return null
      file = r.filePaths[0]
    }
    const buf = fs.readFileSync(file)
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
      const data = method === 8 ? zlib.inflateRawSync(raw) : raw
      if (name === 'data.plist') plist = Buffer.from(data).toString('base64')
      else if (name.startsWith('files/') && !name.includes('..') && !name.endsWith('/')) {
        const dest = path.join(root, ...name.slice(6).split('/'))
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        if (!fs.existsSync(dest)) { fs.writeFileSync(dest, data); files++ }
      }
    }
    return { kind: 'ios', name: path.basename(file), plist, files }
  })

  ipcMain.handle('ai:summarize', async (_e, r: { subject: string; minutes: number; style: string; transcript: string }) => {
    const apiKey = secrets['claude.key']
    if (!apiKey) return { ok: false, error: 'Добавь ключ Claude API в настройках лекций' }
    return summarizeLecture({ ...r, apiKey })
  })

  ipcMain.handle('mail:check', (_e, acc: MailAccount) => checkMail(acc))

  ipcMain.handle('sites:clear', async () => {
    await session.fromPartition(SITES_PARTITION).clearStorageData()
    return true
  })
  ipcMain.handle('sites:preload', () => pathToFileURL(path.join(__dirname, 'site-preload.js')).toString())
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
  armAll()
  if (kv['widget.open']) setTimeout(() => toggleWidget(true), 1500)

  // глобальная горячая клавиша: Ctrl+Alt+S — показать САФУ откуда угодно
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

app.on('before-quit', () => {
  quitting = true
  saveKVNow()
  saveScheduled()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (quitting || kv['app.tray'] === false)) app.quit()
})
