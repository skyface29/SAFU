// Связка с iPhone без QR-кода. Телефон сам находит компьютер в сети, оба показывают один и тот же
// четырёхзначный код, человек сверяет его и нажимает «Разрешить» здесь.
//
// У каждой стороны свой одноразовый ключ X25519. Общий секрет → HKDF → ключ AES-256-GCM, и им компьютер
// шифрует постоянный ключ синхронизации. Свой открытый ключ компьютер отдаёт только после ключа телефона,
// а до этого присылает его отпечаток (commit). Поэтому подменить ключи посредине сети незаметно можно,
// только угадав код: шанс один из 10 000, и то лишь если человек нажмёт «Разрешить».
//
//   POST /v2/pair/start {device}    → {sid, commit}
//   POST /v2/pair/key   {sid, pub}  → {pub}                 (теперь обе стороны показывают код)
//   POST /v2/pair/wait  {sid}       → {status: wait | ok | denied, box?}

import * as crypto from 'node:crypto'
import { seal } from './transfer'

const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex')
/** Сколько живёт незавершённая связка */
export const PAIR_TTL = 3 * 60_000
export const PAIR_AAD = 'arktika pair'

/** Код для сверки глазами: одинаковый на обеих сторонах, только если ключи никто не подменил */
export function sasCode(phonePub: Buffer, pcPub: Buffer): string {
  const h = crypto.createHash('sha256').update('arktika-sas|').update(phonePub).update(pcPub).digest()
  return String(h.readUInt32BE(0) % 10000).padStart(4, '0')
}

export function pairKey(shared: Buffer, phonePub: Buffer, pcPub: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.from('arktika-pair-v1'), Buffer.concat([phonePub, pcPub]), 32))
}

export function x25519(): { privateKey: crypto.KeyObject; pub: Buffer } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519')
  return { privateKey, pub: Buffer.from(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)) }
}

export function x25519Shared(privateKey: crypto.KeyObject, peerRaw: Buffer): Buffer {
  const publicKey = crypto.createPublicKey({ key: Buffer.concat([SPKI_X25519, peerRaw]), format: 'der', type: 'spki' })
  return crypto.diffieHellman({ privateKey, publicKey })
}

/** Короткий отпечаток номера связки: по нему телефон узнаёт «свой» компьютер в сети */
export function pairTag(id: string): string {
  return crypto.createHash('sha256').update(id).digest('hex').slice(0, 12)
}

export type PairHooks = {
  /** Спросить человека: связать этот телефон? (код он сверяет с экраном телефона) */
  ask: (device: string, code: string) => Promise<boolean>
  /** Что отдать телефону после «Разрешить»: номер связки, ключ, адреса */
  grant: () => Promise<Record<string, unknown>>
}

type Session = {
  sid: string
  device: string
  privateKey: crypto.KeyObject
  pub: Buffer
  created: number
  status: 'start' | 'wait' | 'ok' | 'denied'
  box?: Buffer
  listeners: Set<() => void>
}

export class PairError extends Error {
  constructor(readonly status: number, msg: string) { super(msg) }
}

export class PairBroker {
  private s: Session | null = null

  constructor(private hooks: PairHooks, private now: () => number = Date.now) {}

  private live(sid: unknown): Session {
    const s = this.s
    if (!s || typeof sid !== 'string' || s.sid !== sid || this.now() - s.created > PAIR_TTL) throw new PairError(410, 'gone')
    return s
  }

  start(device: unknown): { sid: string; commit: string } {
    // на компьютере уже ждёт ответа другой запрос — не засыпаем человека окнами
    const cur = this.s
    if (cur && cur.status === 'wait' && this.now() - cur.created < PAIR_TTL) throw new PairError(409, 'busy')
    const { privateKey, pub } = x25519()
    const name = (typeof device === 'string' ? device : '').trim().slice(0, 60) || 'iPhone'
    this.s = { sid: crypto.randomBytes(12).toString('base64url'), device: name, privateKey, pub, created: this.now(), status: 'start', listeners: new Set() }
    return { sid: this.s.sid, commit: crypto.createHash('sha256').update(pub).digest('base64') }
  }

  key(sid: unknown, phonePubB64: unknown): { pub: string; code: string } {
    const s = this.live(sid)
    if (s.status !== 'start') throw new PairError(409, 'state')
    const phonePub = Buffer.from(typeof phonePubB64 === 'string' ? phonePubB64 : '', 'base64')
    if (phonePub.length !== 32) throw new PairError(400, 'pub')
    let shared: Buffer
    try { shared = x25519Shared(s.privateKey, phonePub) } catch { throw new PairError(400, 'pub') }
    const key = pairKey(shared, phonePub, s.pub)
    const code = sasCode(phonePub, s.pub)
    s.status = 'wait'
    const settle = (st: 'ok' | 'denied', box?: Buffer) => {
      if (this.s !== s) return
      s.status = st
      s.box = box
      s.listeners.forEach(f => f())
      s.listeners.clear()
    }
    this.hooks.ask(s.device, code)
      .then(async ok => {
        if (!ok) { settle('denied'); return }
        const grant = await this.hooks.grant()
        settle('ok', seal(key, Buffer.from(JSON.stringify(grant), 'utf8'), PAIR_AAD))
      })
      .catch(() => settle('denied'))
    return { pub: s.pub.toString('base64'), code }
  }

  /** Ждём решения человека не дольше ms; телефон спрашивает снова, пока не решится */
  async wait(sid: unknown, ms = 25_000): Promise<{ status: 'wait' | 'ok' | 'denied'; box?: string }> {
    const s = this.live(sid)
    if (s.status === 'start') throw new PairError(409, 'state')
    if (s.status === 'wait') {
      await new Promise<void>(resolve => {
        const t = setTimeout(() => { s.listeners.delete(done); resolve() }, ms)
        const done = () => { clearTimeout(t); resolve() }
        s.listeners.add(done)
      })
    }
    if (s.status === 'ok' && s.box) {
      const box = s.box.toString('base64')
      if (this.s === s) this.s = null // ключ отдан один раз
      return { status: 'ok', box }
    }
    if (s.status === 'denied') {
      if (this.s === s) this.s = null
      return { status: 'denied' }
    }
    return { status: 'wait' }
  }
}
