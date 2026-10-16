// Синхронизация с iPhone по домашнему Wi‑Fi.
//
// Один раз связываем телефон: он сам находит компьютер в сети (GET /v2/hello), оба показывают код,
// человек нажимает «Разрешить» (syncpair.ts), — или по старинке QR-кодом. В связке — номер, постоянный
// ключ и адреса компьютера. Пока Арктика здесь запущена (даже свёрнутой в трей), компьютер ждёт телефон
// на своём порту; сменился адрес в сети — телефон найдёт компьютер заново по отпечатку связки.
// Телефон сам заходит раз в несколько секунд, пока на нём открыто приложение, присылает свою версию
// ДЗ, задач и заметок и забирает общую. Всё зашифровано AES-256-GCM ключом из QR (как у переноса),
// к шифру привязан адрес запроса.
//
//   GET  /v2/hello                                         → {app, v, pc, pair}  (pair — отпечаток связки)
//   POST /v2/sync  {device, data:{homework, tasks, notes}}  → {data, pc, app, hosts, port}

import * as http from 'node:http'
import * as crypto from 'node:crypto'
import { seal, open, lanAddresses } from './transfer'
import { PairBroker, PairError, pairTag } from './syncpair'

export type SyncPairing = { id: string; key: string; created: number }

export type SyncOptions = {
  name: string
  version: string
  /** Порт, на котором ждать телефон (связанный телефон его помнит). Занят — соседние, потом любой свободный */
  port: number
  pairing: () => SyncPairing | null
  /** Свести присланное с данными приложения и вернуть общее */
  handle: (body: any) => Promise<any>
  /** Связка без QR-кода */
  pair?: PairBroker
  /** Файлы с телефона по ключу связки (протокол переноса /v1/*) */
  files?: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
  /** Кто-то спросил «кто тут?» — для подсказки на экране синхронизации */
  onHello?: (from: string) => void
  bind?: string
}

/** Порты, которые телефон проверяет при поиске компьютера (и которые открываем в брандмауэре) */
export const SYNC_PORTS = [47823, 47824, 47825, 47826, 47827, 47828, 47829, 47830]

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
      srv.requestTimeout = 120_000 // куски файлов по 4 МБ
      srv.once('error', reject)
      srv.listen(port, this.opts.bind ?? '0.0.0.0', () => resolve(srv))
    })
    // порт занят другой программой — соседние из известных телефону, в крайнем случае любой свободный
    const order = [...new Set([this.opts.port, ...SYNC_PORTS])]
    const attempt = (i: number): Promise<http.Server> =>
      i < order.length ? listen(order[i]).catch(() => attempt(i + 1)) : listen(0)
    return attempt(0)
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

  private readBody(req: http.IncomingMessage, limit = BODY_LIMIT): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (Number(req.headers['content-length'] || 0) > limit) { reject(new Error('too-big')); return }
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

  private json(res: http.ServerResponse, status: number, body: unknown) {
    const data = Buffer.from(JSON.stringify(body), 'utf8')
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, 'cache-control': 'no-store' })
    res.end(data)
  }

  /** Связка без QR-кода: небольшие открытые JSON-запросы, секрет внутри шифруется ключом X25519 */
  private async handlePair(step: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const broker = this.opts.pair
    if (!broker) { this.fail(res, 404, 'unknown'); return }
    let j: any
    try { j = JSON.parse((await this.readBody(req, 4096)).toString('utf8') || '{}') } catch { this.fail(res, 400, 'json'); return }
    try {
      if (step === 'start') this.json(res, 200, broker.start(j.device))
      else if (step === 'key') this.json(res, 200, { pub: broker.key(j.sid, j.pub).pub })
      else if (step === 'wait') this.json(res, 200, await broker.wait(j.sid))
      else this.fail(res, 404, 'unknown')
    } catch (e) {
      if (e instanceof PairError) this.json(res, e.status, { error: e.message })
      else throw e
    }
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const method = req.method || 'GET'
    const route = (req.url || '/').split('?')[0]
    // «Кто тут?» — телефон ищет компьютер в сети. Имя и отпечаток связки, без данных и ключей
    if (method === 'GET' && route === '/v2/hello') {
      this.opts.onHello?.(String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''))
      const p = this.opts.pairing()
      this.json(res, 200, { app: 'arktika', v: 2, pc: this.opts.name, pair: p ? pairTag(p.id) : null, port: this.port })
      return
    }
    if (method === 'POST' && route.startsWith('/v2/pair/')) { await this.handlePair(route.slice(9), req, res); return }
    // файлы связанного телефона: тот же протокол, что у переноса по QR, ключ — ключ связки
    if (route.startsWith('/v1/')) {
      const p = this.opts.pairing()
      if (!this.opts.files || !p || req.headers['x-arktika-session'] !== p.id) { this.fail(res, 403, 'pair'); return }
      await this.opts.files(req, res)
      return
    }
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
