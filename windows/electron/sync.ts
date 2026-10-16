// Синхронизация с iPhone по домашнему Wi‑Fi.
//
// Один раз связываем телефон QR-кодом: в нём адрес компьютера, номер связки и постоянный ключ.
// Дальше, пока Арктика здесь запущена (даже свёрнутой в трей), компьютер ждёт телефон на своём порту.
// Телефон сам заходит раз в несколько секунд, пока на нём открыто приложение, присылает свою версию
// ДЗ, задач и заметок и забирает общую. Всё зашифровано AES-256-GCM ключом из QR (как у переноса),
// к шифру привязан адрес запроса.
//
//   POST /v2/sync  {device, data:{homework, tasks, notes}}  → {data, pc, app, hosts, port}

import * as http from 'node:http'
import * as crypto from 'node:crypto'
import { seal, open, lanAddresses } from './transfer'

export type SyncPairing = { id: string; key: string; created: number }

export type SyncOptions = {
  name: string
  version: string
  /** Порт, на котором ждать телефон (связанный телефон его помнит). Занят — любой свободный */
  port: number
  pairing: () => SyncPairing | null
  /** Свести присланное с данными приложения и вернуть общее */
  handle: (body: any) => Promise<any>
  bind?: string
}

const BODY_LIMIT = 24 * 1024 * 1024
const ROUTE = '/v2/sync'

export function newPairing(): SyncPairing {
  return { id: crypto.randomBytes(9).toString('base64url'), key: crypto.randomBytes(32).toString('base64url'), created: Date.now() }
}

/** Ссылка для QR-кода связки */
export function syncLink(p: SyncPairing, hosts: string[], port: number, name: string): string {
  const q = new URLSearchParams({ v: '1', h: hosts.join(','), p: String(port), i: p.id, k: p.key, n: name.slice(0, 40) })
  return `arktika://sync?${q.toString()}`
}

export class SyncServer {
  private opts: SyncOptions
  private server: http.Server | null = null
  port = 0

  constructor(opts: SyncOptions) {
    this.opts = opts
  }

  get running() { return !!this.server }

  get hosts(): string[] {
    return this.opts.bind && this.opts.bind !== '0.0.0.0' ? [this.opts.bind] : lanAddresses()
  }

  start(): Promise<number> {
    const listen = (port: number) => new Promise<http.Server>((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        this.handle(req, res).catch(err => this.fail(res, 500, String((err as Error)?.message || err)))
      })
      srv.keepAliveTimeout = 10_000
      srv.requestTimeout = 30_000
      srv.once('error', reject)
      srv.listen(port, this.opts.bind ?? '0.0.0.0', () => resolve(srv))
    })
    return listen(this.opts.port)
      .catch(() => listen(0)) // порт занят другой программой — берём свободный (телефон узнает новый при следующей связке)
      .then(srv => {
        const a = srv.address()
        this.port = typeof a === 'object' && a ? a.port : 0
        this.server = srv
        return this.port
      })
  }

  stop() {
    const s = this.server
    this.server = null
    if (!s) return
    s.closeAllConnections?.()
    s.close()
  }

  private fail(res: http.ServerResponse, status: number, msg: string) {
    if (res.headersSent) { try { res.end() } catch { /* закрыт */ } return }
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(msg)
  }

  private readBody(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (Number(req.headers['content-length'] || 0) > BODY_LIMIT) { reject(new Error('too-big')); return }
      const parts: Buffer[] = []
      let n = 0
      req.on('data', (c: Buffer) => {
        n += c.length
        if (n > BODY_LIMIT) { reject(new Error('too-big')); req.destroy(); return }
        parts.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(parts)))
      req.on('error', reject)
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const method = req.method || 'GET'
    const route = (req.url || '/').split('?')[0]
    if (method !== 'POST' || route !== ROUTE) { this.fail(res, 404, 'unknown'); return }
    const p = this.opts.pairing()
    // телефон связан с другим кодом (связку обновили или отключили)
    if (!p || req.headers['x-arktika-pair'] !== p.id) { this.fail(res, 403, 'pair'); return }
    const key = Buffer.from(p.key, 'base64url')
    let body: Buffer
    try { body = await this.readBody(req) } catch { this.fail(res, 413, 'too big'); return }
    let plain: Buffer
    try { plain = open(key, body, `${method} ${ROUTE}`) } catch { this.fail(res, 400, 'bad seal'); return }
    const j = JSON.parse(plain.toString('utf8') || '{}')
    const result = await this.opts.handle(j)
    const answer = { ...result, pc: this.opts.name, app: this.opts.version, hosts: this.hosts, port: this.port }
    const sealed = seal(key, Buffer.from(JSON.stringify(answer), 'utf8'), `R ${method} ${ROUTE}`)
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': sealed.length })
    res.end(sealed)
  }
}
