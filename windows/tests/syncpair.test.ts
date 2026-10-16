// Связка с iPhone без QR-кода: телефон находит компьютер, оба считают один код, ключ приходит зашифрованным
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as crypto from 'node:crypto'
import { PairBroker, PAIR_AAD, pairKey, pairTag, sasCode, x25519, x25519Shared } from '../electron/syncpair'
import { SyncServer } from '../electron/sync'
import { open } from '../electron/transfer'

const grant = { id: 'pair-1', key: crypto.randomBytes(32).toString('base64url'), hosts: ['192.168.1.5'], port: 47823, name: 'PC' }

/** Телефон, как в PCSync.swift: свой ключ, проверка отпечатка, тот же код, расшифровка связки */
function phone() {
  const me = x25519()
  let commit = ''
  return {
    pub: me.pub.toString('base64'),
    setCommit(c: string) { commit = c },
    finish(pcPubB64: string) {
      const pcPub = Buffer.from(pcPubB64, 'base64')
      assert.equal(crypto.createHash('sha256').update(pcPub).digest('base64'), commit, 'отпечаток ключа компьютера')
      const shared = x25519Shared(me.privateKey, pcPub)
      return { key: pairKey(shared, me.pub, pcPub), code: sasCode(me.pub, pcPub) }
    }
  }
}

test('оба видят один код, после «Разрешить» телефон расшифровывает связку', async () => {
  let shown = ''
  const broker = new PairBroker({ ask: async (_d, code) => { shown = code; return true }, grant: async () => grant })
  const ph = phone()
  const st = broker.start('iPhone Кирилла')
  ph.setCommit(st.commit)
  const k = broker.key(st.sid, ph.pub)
  const mine = ph.finish(k.pub)
  const r = await broker.wait(st.sid, 1000)
  assert.equal(r.status, 'ok')
  assert.equal(shown, mine.code)
  assert.match(mine.code, /^\d{4}$/)
  const plain = JSON.parse(open(mine.key, Buffer.from(r.box!, 'base64'), PAIR_AAD).toString('utf8'))
  assert.deepEqual(plain, grant)
  // ключ отдаётся один раз
  await assert.rejects(broker.wait(st.sid, 10), /gone/)
})

test('«Отклонить» — телефон узнаёт, ключа нет', async () => {
  const broker = new PairBroker({ ask: async () => false, grant: async () => grant })
  const ph = phone()
  const st = broker.start('iPhone')
  ph.setCommit(st.commit)
  broker.key(st.sid, ph.pub)
  const r = await broker.wait(st.sid, 1000)
  assert.deepEqual(r, { status: 'denied' })
})

test('пока человек думает — «жди», второй запрос не открывает второе окно', async () => {
  let decide: (ok: boolean) => void = () => {}
  const broker = new PairBroker({ ask: () => new Promise(r => { decide = r }), grant: async () => grant })
  const ph = phone()
  const st = broker.start('iPhone')
  ph.setCommit(st.commit)
  broker.key(st.sid, ph.pub)
  assert.deepEqual(await broker.wait(st.sid, 20), { status: 'wait' })
  assert.throws(() => broker.start('чужой'), /busy/)
  const w = broker.wait(st.sid, 2000)
  decide(true)
  assert.equal((await w).status, 'ok')
})

test('неверный ключ телефона и чужой номер сессии отклоняются', () => {
  const broker = new PairBroker({ ask: async () => true, grant: async () => grant })
  const st = broker.start('iPhone')
  assert.throws(() => broker.key('nope', phone().pub), /gone/)
  assert.throws(() => broker.key(st.sid, Buffer.alloc(5).toString('base64')), /pub/)
})

test('устаревшая связка не принимается', () => {
  let now = 1_000_000
  const broker = new PairBroker({ ask: async () => true, grant: async () => grant }, () => now)
  const st = broker.start('iPhone')
  now += 10 * 60_000
  assert.throws(() => broker.key(st.sid, phone().pub), /gone/)
})

test('по сети: hello с отпечатком связки и связка через HTTP', async () => {
  let paired: { id: string; key: string; created: number } | null = null
  const broker = new PairBroker({
    ask: async () => true,
    grant: async () => { paired = { id: 'net-pair', key: crypto.randomBytes(32).toString('base64url'), created: Date.now() }; return { id: paired.id, key: paired.key } }
  })
  const srv = new SyncServer({ name: 'TEST-PC', version: '1', port: 0, pairing: () => paired, handle: async () => ({}), pair: broker, bind: '127.0.0.1' })
  const port = await srv.start()
  try {
    const base = `http://127.0.0.1:${port}`
    let hello = await (await fetch(`${base}/v2/hello`)).json()
    assert.deepEqual({ app: hello.app, pc: hello.pc, pair: hello.pair }, { app: 'arktika', pc: 'TEST-PC', pair: null })
    const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', body: JSON.stringify(body) })
    const ph = phone()
    const st = await (await post('/v2/pair/start', { device: 'iPhone' })).json()
    ph.setCommit(st.commit)
    const k = await (await post('/v2/pair/key', { sid: st.sid, pub: ph.pub })).json()
    assert.equal(k.code, undefined, 'код по сети не ходит')
    const mine = ph.finish(k.pub)
    const w = await (await post('/v2/pair/wait', { sid: st.sid })).json()
    assert.equal(w.status, 'ok')
    const plain = JSON.parse(open(mine.key, Buffer.from(w.box, 'base64'), PAIR_AAD).toString('utf8'))
    assert.equal(plain.id, 'net-pair')
    hello = await (await fetch(`${base}/v2/hello`)).json()
    assert.equal(hello.pair, pairTag('net-pair'))
    assert.equal((await post('/v2/pair/wait', { sid: st.sid })).status, 410)
  } finally {
    srv.stop()
  }
})
