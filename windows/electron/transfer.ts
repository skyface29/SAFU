// Перенос с iPhone по QR-коду.
//
// Компьютер показывает QR, телефон сканирует его — и сам присылает файлы и данные по Wi‑Fi, напрямую,
// без интернета, облаков и кабеля. В QR — адрес компьютера в домашней сети и одноразовый ключ.
// Всё, что идёт по сети, зашифровано AES-256-GCM этим ключом: ключ знает только тот, кто видит экран,
// поэтому подсмотреть или подменить файлы в общей сети (общежитие, кафе) нельзя.
//
// Протокол (все тела зашифрованы; к шифру привязаны метод и адрес запроса — кусок одного файла
// не подставить в другой):
//   POST /v1/hello  {device, app}              → {pc, app}
//   POST /v1/plan   {files:[{p,s,m}], data}     → {files:[{i,o}]}   o = -1: уже есть, иначе с какого байта слать
//   PUT  /v1/file?i=&o=  кусок файла            → {o}               сколько байт уже принято
//   POST /v1/data   настройки (binary plist)    → {ok}
//   POST /v1/done   {}                          → {ok, files, bytes}
// Обрыв связи не страшен: телефон заново присылает план, и докачка идёт с того же места.

import * as http from 'node:http'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

export type TransferEvent =
  | { type: 'connected'; device: string }
  | { type: 'plan'; files: number; bytes: number; skipped: number; data: boolean }
  | { type: 'progress'; done: number; total: number; files: number; filesTotal: number; name: string; speed: number }
  | { type: 'file'; name: string; rel: string; size: number }
  | { type: 'data'; plist: string }
  | { type: 'done'; files: number; bytes: number; skipped: number; data: boolean; seconds: number }
  | { type: 'error'; message: string }
  | { type: 'closed'; reason: 'idle' | 'stopped' | 'done' }

export type TransferInfo = { url: string; hosts: string[]; port: number; name: string }

export type TransferOptions = {
  /** Имя компьютера, как его увидит телефон */
  name: string
  version: string
  /** Папка с файлами предметов (вызывается каждый раз — её можно сменить в настройках) */
  root: () => string
  emit: (e: TransferEvent) => void
  /** Сколько ждать телефона, мс */
  idleMs?: number
  /** Порт: 0 — любой свободный (в тестах — тоже 0) */
  port?: number
  /** Слушать только этот адрес (в тестах — 127.0.0.1) */
  bind?: string
  /** Постоянный канал связанного телефона (синхронизация): свой ключ и номер, без простоя и без закрытия после «done».
   *  Такой приёмник не слушает порт сам — запросы ему передаёт сервер синхронизации (serve) */
  key?: Buffer
  session?: string
  persistent?: boolean
}

type Entry = {
  id: number
  rel: string
  name: string
  size: number
  mtime: number
  dest: string
  tmp: string
  received: number
  done: boolean
  /** Такой файл уже был на компьютере — не пересылали */
  skipped: boolean
}

const MB = 1024 * 1024
const CHUNK_LIMIT = 9 * MB
const BODY_LIMIT = 64 * MB
const PART = '.arktika-part'

/** Адреса компьютера в локальных сетях: сначала домашние Wi‑Fi (192.168…), потом остальные */
export function lanAddresses(): string[] {
  const out: { ip: string; rank: number }[] = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    // виртуальные сети (WSL, Hyper-V, VirtualBox, VMware, Docker) — в конец: телефон туда не достучится
    const virtual = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|vbox|loopback|bluetooth|tailscale|zerotier|vpn/i.test(name)
    for (const a of list || []) {
      if (a.internal || a.family !== 'IPv4') continue
      const ip = a.address
      if (ip.startsWith('169.254.')) continue // нет сети: адрес «сам себе»
      let rank = ip.startsWith('192.168.137.') ? 2 // мобильный хот-спот Windows
        : ip.startsWith('192.168.') ? 0
        : ip.startsWith('10.') ? 1
        : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 1 // в том числе «Режим модема» iPhone (172.20.10.x)
        : 4
      if (virtual) rank += 10
      out.push({ ip, rank })
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map(a => a.ip).slice(0, 5)
}

// ---------- шифрование ----------

export function seal(key: Buffer, plain: Buffer, aad: string): Buffer {
  const nonce = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, nonce)
  c.setAAD(Buffer.from(aad, 'utf8'))
  const body = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([nonce, body, c.getAuthTag()])
}

export function open(key: Buffer, sealed: Buffer, aad: string): Buffer {
  if (sealed.length < 28) throw new Error('short')
  const nonce = sealed.subarray(0, 12)
  const tag = sealed.subarray(sealed.length - 16)
  const d = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  d.setAAD(Buffer.from(aad, 'utf8'))
  d.setAuthTag(tag)
  return Buffer.concat([d.update(sealed.subarray(12, sealed.length - 16)), d.final()])
}

// ---------- куда класть файлы ----------

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Имя файла или папки, допустимое в Windows */
export function winName(s: string): string {
  let n = s.replace(/[<>:"\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim()
  if (!n) n = '_'
  if (RESERVED.test(n)) n = '_' + n
  if (n.length > 120) {
    const ext = path.extname(n).slice(0, 12)
    n = n.slice(0, 120 - ext.length) + ext
  }
  return n
}

/**
 * Путь файла из «Файлов» iPhone → путь в папке компьютера (части пути через «/»).
 * Фото доски на iPhone лежат прямо в папке предмета («Доска 12.10 10-15-02.jpg»),
 * а на компьютере — в подпапке «Доска»: там их показывает раздел «Фото доски»
 */
export function mapRel(rel: string): string[] | null {
  const parts = rel.split('/').filter(p => p.length > 0)
  if (!parts.length) return null
  if (parts.some(p => p === '.' || p === '..' || p.startsWith('.'))) return null
  const clean = parts.map(winName)
  if (clean[0] === 'Предметы' && clean.length === 3 && /^Доска .+\.(jpe?g|png|heic)$/i.test(clean[2])) {
    clean.splice(2, 0, 'Доска')
  }
  return clean
}

function withSuffix(p: string, suffix: string) {
  const ext = path.extname(p)
  return p.slice(0, p.length - ext.length) + suffix + ext
}

function fileSize(p: string): number {
  try {
    const st = fs.statSync(p)
    return st.isFile() ? st.size : -1
  } catch {
    return -1
  }
}

// ---------- сервер ----------

export class TransferServer {
  private opts: TransferOptions
  private key: Buffer = crypto.randomBytes(32)
  private session: string = crypto.randomBytes(12).toString('base64url')
  private server: http.Server | null = null
  private entries = new Map<number, Entry>()
  private device = ''
  private wantsData = false
  private gotData = false
  private totalBytes = 0
  private doneBytes = 0
  private skipped = 0
  private startedAt = 0
  private lastProgress = 0
  private speedFrom = { t: 0, bytes: 0 }
  private speed = 0
  private idle: ReturnType<typeof setTimeout> | null = null
  private finished = false

  constructor(opts: TransferOptions) {
    this.opts = opts
    if (opts.key) this.key = opts.key
    if (opts.session) this.session = opts.session
  }

  /** Обработать запрос, пришедший на чужой сервер (канал связанного телефона) */
  serve(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    return this.handle(req, res).catch(err => this.fail(res, 500, String((err as Error)?.message || err)))
  }

  /** Запустить приём. Возвращает ссылку для QR */
  start(): Promise<TransferInfo> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        this.handle(req, res).catch(err => {
          this.fail(res, 500, String((err as Error)?.message || err))
        })
      })
      srv.keepAliveTimeout = 30_000
      srv.requestTimeout = 120_000
      srv.on('error', reject)
      srv.listen(this.opts.port ?? 0, this.opts.bind ?? '0.0.0.0', () => {
        const addr = srv.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        this.server = srv
        this.touch()
        const hosts = this.opts.bind && this.opts.bind !== '0.0.0.0' ? [this.opts.bind] : lanAddresses()
        const q = new URLSearchParams({
          v: '1',
          h: hosts.join(','),
          p: String(port),
          s: this.session,
          k: this.key.toString('base64url'),
          n: this.opts.name.slice(0, 40)
        })
        resolve({ url: `arktika://pc?${q.toString()}`, hosts, port, name: this.opts.name })
      })
    })
  }

  stop(reason: 'idle' | 'stopped' | 'done' = 'stopped') {
    if (this.idle) clearTimeout(this.idle)
    this.idle = null
    if (!this.server) return
    const s = this.server
    this.server = null
    s.closeAllConnections?.()
    s.close()
    this.opts.emit({ type: 'closed', reason })
  }

  get running() { return !!this.server }

  private touch() {
    if (this.opts.persistent) return
    if (this.idle) clearTimeout(this.idle)
    this.idle = setTimeout(() => this.stop('idle'), this.opts.idleMs ?? 15 * 60_000)
  }

  private fail(res: http.ServerResponse, status: number, msg: string) {
    if (res.headersSent) { try { res.end() } catch { /* уже закрыт */ } return }
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(msg)
  }

  private reply(res: http.ServerResponse, method: string, url: string, obj: unknown, status = 200) {
    const body = seal(this.key, Buffer.from(JSON.stringify(obj), 'utf8'), `R ${method} ${url}`)
    res.writeHead(status, { 'content-type': 'application/octet-stream', 'content-length': body.length })
    res.end(body)
  }

  private readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length'] || 0)
      if (declared > limit) { reject(new Error('too-big')); return }
      const parts: Buffer[] = []
      let n = 0
      req.on('data', (c: Buffer) => {
        n += c.length
        if (n > limit) { reject(new Error('too-big')); req.destroy(); return }
        parts.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(parts)))
      req.on('error', reject)
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const method = req.method || 'GET'
    const url = req.url || '/'
    const route = url.split('?')[0]
    if (req.headers['x-arktika-session'] !== this.session) {
      this.fail(res, 403, 'session')
      return
    }
    this.touch()
    let body: Buffer
    try {
      body = await this.readBody(req, route === '/v1/file' ? CHUNK_LIMIT : BODY_LIMIT)
    } catch {
      this.fail(res, 413, 'too big')
      return
    }
    let plain: Buffer
    try {
      plain = open(this.key, body, `${method} ${url}`)
    } catch {
      // не тот ключ или подменённые данные
      this.fail(res, 400, 'bad seal')
      return
    }

    if (method === 'POST' && route === '/v1/hello') {
      const j = JSON.parse(plain.toString('utf8') || '{}')
      const device = String(j.device || 'iPhone').slice(0, 60)
      if (device !== this.device) {
        this.device = device
        this.opts.emit({ type: 'connected', device })
      }
      this.reply(res, method, url, { pc: this.opts.name, app: this.opts.version })
      return
    }

    if (method === 'POST' && route === '/v1/plan') {
      const j = JSON.parse(plain.toString('utf8') || '{}')
      const files = Array.isArray(j.files) ? j.files : []
      this.wantsData = !!j.data
      // постоянный канал: каждый план — новый перенос
      if (this.opts.persistent) { this.finished = false; this.startedAt = 0; this.gotData = false }
      this.plan(files)
      const answer = [...this.entries.values()].map(e => ({ i: e.id, o: e.done ? -1 : e.received }))
      if (!this.startedAt) this.startedAt = Date.now()
      this.opts.emit({
        type: 'plan',
        files: [...this.entries.values()].filter(e => !e.done).length,
        bytes: this.totalBytes,
        skipped: this.skipped,
        data: this.wantsData
      })
      this.reply(res, method, url, { files: answer })
      return
    }

    if (method === 'PUT' && route === '/v1/file') {
      const q = new URLSearchParams(url.split('?')[1] || '')
      const e = this.entries.get(Number(q.get('i')))
      const off = Number(q.get('o'))
      if (!e) { this.fail(res, 404, 'no file'); return }
      if (e.done) { this.reply(res, method, url, { o: e.size }); return }
      if (off !== e.received) {
        // кусок пришёл не по порядку (например, после обрыва) — скажем, откуда продолжать
        this.reply(res, method, url, { o: e.received }, 409)
        return
      }
      if (e.received + plain.length > e.size) { this.fail(res, 400, 'overflow'); return }
      await fs.promises.mkdir(path.dirname(e.tmp), { recursive: true })
      await fs.promises.appendFile(e.tmp, plain)
      e.received += plain.length
      this.doneBytes += plain.length
      if (e.received === e.size) await this.finish(e)
      this.progress(e.name)
      this.reply(res, method, url, { o: e.received })
      return
    }

    if (method === 'POST' && route === '/v1/data') {
      this.gotData = true
      this.opts.emit({ type: 'data', plist: plain.toString('base64') })
      this.reply(res, method, url, { ok: true })
      return
    }

    if (method === 'POST' && route === '/v1/done') {
      const list = [...this.entries.values()]
      const files = list.filter(e => e.done).length - this.skipped
      const bytes = list.filter(e => e.done).reduce((a, e) => a + e.size, 0)
      this.reply(res, method, url, { ok: true, files, bytes })
      if (!this.finished) {
        this.finished = true
        this.opts.emit({
          type: 'done', files, bytes, skipped: this.skipped, data: this.gotData,
          seconds: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0
        })
        if (!this.opts.persistent) setTimeout(() => this.stop('done'), 1500)
      }
      return
    }

    this.fail(res, 404, 'unknown')
  }

  /** Что из присланного списка уже есть на компьютере, а что и с какого места докачивать */
  private plan(files: any[]) {
    const root = path.resolve(this.opts.root())
    const before = this.entries
    this.entries = new Map()
    this.totalBytes = 0
    this.doneBytes = 0
    this.skipped = 0
    files.slice(0, 50_000).forEach((f, id) => {
      const rel = String(f?.p || '')
      const size = Math.max(0, Math.floor(Number(f?.s) || 0))
      const mtime = Number(f?.m) || Date.now()
      const parts = mapRel(rel)
      if (!parts) return
      let dest = path.join(root, ...parts)
      if (!path.resolve(dest).startsWith(root + path.sep)) return
      const old = [...before.values()].find(e => e.rel === rel && e.size === size)
      const entry: Entry = { id, rel, name: parts[parts.length - 1], size, mtime, dest, tmp: '', received: 0, done: false, skipped: false }
      if (old?.done) {
        entry.dest = old.dest
        entry.done = true
        entry.skipped = old.skipped
      } else {
        const have = fileSize(dest)
        if (have === size) {
          entry.done = true
          entry.skipped = true
        } else if (have >= 0) {
          // на компьютере уже лежит другой файл с таким именем — его не трогаем, кладём рядом
          const alt = withSuffix(dest, ' (iPhone)')
          if (fileSize(alt) === size) {
            entry.done = true
            entry.dest = alt
            entry.skipped = true
          } else {
            dest = alt
            entry.dest = alt
          }
        }
      }
      if (!entry.done) {
        entry.tmp = entry.dest + PART
        const part = fileSize(entry.tmp)
        if (part > 0 && part <= size) entry.received = part
        else if (part >= 0) { try { fs.unlinkSync(entry.tmp) } catch { /* занят */ } }
        this.totalBytes += size
        this.doneBytes += entry.received
        if (size === 0) {
          try {
            fs.mkdirSync(path.dirname(entry.dest), { recursive: true })
            fs.writeFileSync(entry.dest, Buffer.alloc(0))
            entry.done = true
          } catch { /* пропустим */ }
        } else if (entry.received === size) {
          // файл дошёл целиком, но в прошлый раз не успел встать на место — ставим сейчас
          try {
            fs.rmSync(entry.dest, { force: true })
            fs.renameSync(entry.tmp, entry.dest)
            const t = new Date(mtime)
            fs.utimesSync(entry.dest, t, t)
            entry.done = true
          } catch { /* пришлют заново */ }
        }
      }
      this.entries.set(id, entry)
    })
    this.skipped = [...this.entries.values()].filter(e => e.skipped).length
  }

  private async finish(e: Entry) {
    await fs.promises.rm(e.dest, { force: true })
    await fs.promises.rename(e.tmp, e.dest)
    // дата файла — как на iPhone: фото доски раскладываются по дням съёмки
    const t = new Date(e.mtime)
    await fs.promises.utimes(e.dest, t, t).catch(() => undefined)
    e.done = true
    this.opts.emit({ type: 'file', name: e.name, rel: path.relative(this.opts.root(), e.dest).split(path.sep).join('/'), size: e.size })
  }

  private progress(name: string) {
    const now = Date.now()
    if (!this.speedFrom.t) this.speedFrom = { t: now, bytes: this.doneBytes }
    if (now - this.speedFrom.t > 1000) {
      const inst = ((this.doneBytes - this.speedFrom.bytes) * 1000) / (now - this.speedFrom.t)
      this.speed = this.speed ? this.speed * 0.6 + inst * 0.4 : inst
      this.speedFrom = { t: now, bytes: this.doneBytes }
    }
    if (now - this.lastProgress < 80 && this.doneBytes < this.totalBytes) return
    this.lastProgress = now
    const list = [...this.entries.values()]
    this.opts.emit({
      type: 'progress',
      done: this.doneBytes,
      total: this.totalBytes,
      files: list.filter(e => e.done).length - this.skipped,
      filesTotal: list.length - this.skipped,
      name,
      speed: Math.round(this.speed)
    })
  }
}
