// Синхронизация с iPhone: сведение по полям и сервер — телефон здесь изображает тест
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refresh, restamp, mergeColl, toWire, fixIds, isUUID, emptyState, fingerprint, canon, type CollState } from '../src/lib/syncmerge'
import { SyncServer, newPairing, syncLink } from '../electron/sync'
import { seal, open } from '../electron/transfer'

const ID = 'AAAAAAAA-1111-4222-8333-444444444444'
const hwItem = (o: Record<string, unknown> = {}) => ({ id: ID, subject: 'Матан', text: '№ 1', due: 1000, done: false, doneAt: null, steps: [], photos: ['a.jpg'], ...o })

/** Одна «сторона»: данные и отметки */
function side(items: any[], st: CollState = emptyState(), now = 1) {
  return { items, st: refresh('homework', items, st, now) }
}

test('первая встреча: «сделано» с телефона побеждает, срок и текст не теряются', () => {
  const pc = side([hwItem()])
  const phone = side([hwItem({ done: true, doneAt: 5000 })])
  const r = mergeColl('homework', pc, toWire(phone.items, phone.st))
  assert.equal(r.items.length, 1)
  assert.equal(r.items[0].done, true)
  assert.equal(r.items[0].doneAt, 5000)
  assert.equal(r.items[0].text, '№ 1')
})

test('по полям: «сделано» на одной стороне и новый срок на другой сохраняются оба', () => {
  // после первой синхронизации обе стороны одинаковы
  const base = [hwItem()]
  const stPC = restamp('homework', base, {}, {})
  const stPhone = restamp('homework', base, {}, {})
  // телефон: сделано в 100; компьютер: срок сдвинулся в 200
  const phone = { items: [hwItem({ done: true, doneAt: 90 })], st: refresh('homework', [hwItem({ done: true, doneAt: 90 })], stPhone, 100) }
  const pcItems = [hwItem({ due: 2000 })]
  const pc = { items: pcItems, st: refresh('homework', pcItems, stPC, 200) }
  const r = mergeColl('homework', pc, toWire(phone.items, phone.st))
  assert.equal(r.items[0].done, true)
  assert.equal(r.items[0].due, 2000)
})

test('одно и то же поле: побеждает поздняя правка', () => {
  const base = [hwItem()]
  const st = restamp('homework', base, {}, {})
  const a = [hwItem({ text: 'старое' })]
  const b = [hwItem({ text: 'новое' })]
  const pc = { items: a, st: refresh('homework', a, st, 100) }
  const phone = { items: b, st: refresh('homework', b, st, 300) }
  assert.equal(mergeColl('homework', pc, toWire(phone.items, phone.st)).items[0].text, 'новое')
  const pc2 = { items: a, st: refresh('homework', a, st, 500) }
  assert.equal(mergeColl('homework', pc2, toWire(phone.items, phone.st)).items[0].text, 'старое')
})

test('удаление: доходит до другой стороны, но правка после удаления возвращает запись', () => {
  const base = [hwItem()]
  const st = restamp('homework', base, {}, {})
  const phone = { items: [], st: refresh('homework', [], st, 100) }
  assert.equal(phone.st.tomb[ID.toLowerCase()], 100)
  const pc = { items: base, st: refresh('homework', base, st, 50) }
  assert.equal(mergeColl('homework', pc, toWire([], phone.st)).items.length, 0)
  // на компьютере поменяли после удаления на телефоне
  const edited = [hwItem({ text: 'дописал' })]
  const pc2 = { items: edited, st: refresh('homework', edited, st, 200) }
  const r = mergeColl('homework', pc2, toWire([], phone.st))
  assert.equal(r.items.length, 1)
  assert.equal(r.items[0].text, 'дописал')
})

test('новая запись с телефона приходит без чужих фото, свои фото не трогаются', () => {
  const NEW = 'BBBBBBBB-1111-4222-8333-444444444444'
  const pcItems = [hwItem({ photos: ['pc.jpg'] })]
  const pc = side(pcItems, emptyState(), 10)
  const phoneItems = [hwItem({ photos: ['phone.jpg'] }), hwItem({ id: NEW, text: 'новое', photos: ['x.jpg'] })]
  const phone = side(phoneItems, emptyState(), 10)
  const r = mergeColl('homework', pc, toWire(phone.items, phone.st))
  assert.equal(r.items.length, 2)
  assert.deepEqual(r.items[0].photos, ['pc.jpg'])
  assert.deepEqual(r.items[1].photos, [])
  assert.equal(r.m[ID.toLowerCase()].photos, undefined)
})

test('id сравниваются без учёта регистра; не-UUID исправляются', () => {
  const pc = side([hwItem({ id: ID.toLowerCase() })])
  const phone = side([hwItem({ id: ID })])
  assert.equal(mergeColl('homework', pc, toWire(phone.items, phone.st)).items.length, 1)
  let n = 0
  const fixed = fixIds([{ id: 'abc', steps: [{ id: 'x', text: '1' }] }], () => `00000000-0000-4000-8000-00000000000${n++}`)
  assert.ok(isUUID(fixed[0].id) && isUUID(fixed[0].steps[0].id))
  const same = [{ id: ID, steps: [] }]
  assert.equal(fixIds(same, () => ''), same)
})

test('отпечаток не зависит от порядка ключей', () => {
  assert.equal(fingerprint({ a: 1, b: [1, { c: 2, d: 3 }] }), fingerprint({ b: [1, { d: 3, c: 2 }], a: 1 }))
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }))
  assert.equal(canon({ a: undefined, b: 1 }), '{"b":1}')
})

test('сервер: свой ключ — сводит и отвечает; чужая связка и чужой ключ — нет', async () => {
  const pairing = newPairing()
  let got: any = null
  const srv = new SyncServer({
    name: 'ПК', version: '1', port: 0, bind: '127.0.0.1', pairing: () => pairing,
    handle: async body => { got = body; return { data: { homework: { items: [], m: {}, tomb: {} } } } }
  })
  const port = await srv.start()
  try {
    const link = new URL(syncLink(pairing, srv.hosts, port, 'ПК'))
    assert.equal(link.protocol, 'arktika:')
    assert.equal(link.searchParams.get('i'), pairing.id)
    const key = Buffer.from(link.searchParams.get('k') || '', 'base64url')
    const send = (pairId: string, k: Buffer) => fetch(`http://127.0.0.1:${port}/v2/sync`, {
      method: 'POST', headers: { 'x-arktika-pair': pairId },
      body: seal(k, Buffer.from(JSON.stringify({ device: 'iPhone', data: {} })), 'POST /v2/sync')
    })
    const ok = await send(pairing.id, key)
    assert.equal(ok.status, 200)
    const j = JSON.parse(open(key, Buffer.from(await ok.arrayBuffer()), 'R POST /v2/sync').toString())
    assert.equal(j.pc, 'ПК')
    assert.equal(j.port, port)
    assert.equal(got.device, 'iPhone')
    assert.equal((await send('other-pair', key)).status, 403)
    assert.equal((await send(pairing.id, Buffer.alloc(32, 7))).status, 400)
  } finally {
    srv.stop()
  }
})
