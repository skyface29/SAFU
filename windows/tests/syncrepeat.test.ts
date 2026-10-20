// Телефон заходит раз в 10 секунд: если он прислал то же самое и здесь ничего не меняли, интерфейс не сводит
// всё заново и ничего не пишет на диск, а телефон получает прежний ответ
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleSync, lastSync, LAST_KEY } from '../src/lib/sync'
import { homeworkStore } from '../src/lib/homework'
import { kv } from '../src/lib/kv'
import { safu } from '../src/lib/bridge'
import { skipRepeats } from '../electron/sync'
import { sameJson } from '../src/lib/syncmerge'

const A = 'AAAAAAAA-1111-4222-8333-444444444444'
const B = 'BBBBBBBB-1111-4222-8333-444444444444'
const hw = (id: string, o: Record<string, unknown> = {}): any => ({ id, subject: 'Матан', text: '№ 1', due: 1000, done: false, doneAt: null, steps: [], photos: [], ...o })

// сколько раз писали на диск и что приходило в интерфейс
let writes: string[] = []
const realSet = safu.kv.set
safu.kv.set = (k: string, v: unknown) => { writes.push(k); return realSet(k, v) }
let asked: any[] = []
const repeats = () => skipRepeats(async body => { asked.push(body); return handleSync(JSON.parse(JSON.stringify(body))) })

let clock = Date.now()
Date.now = () => clock

/** Как телефон пересобирает словари: те же данные, ключи в другом порядке */
const shuffled = (o: any): any => Array.isArray(o) ? o.map(shuffled)
  : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).reverse().map(([k, v]) => [k, shuffled(v)])) : o
const phoneSends = (data: any, device = 'iPhone Кирилла') => ({ device, data: shuffled(JSON.parse(JSON.stringify(data))) })

/** Первые заходы после связки: телефон присылает то, что получил, пока обе стороны не сойдутся */
async function settle(rep: ReturnType<typeof repeats>, data: any, own = (d: any) => d, device = 'iPhone Кирилла') {
  let r: any = { data }
  for (let i = 0; i < 6; i++) {
    clock += 10_000
    asked = []
    r = await rep.handle(phoneSends(own(r.data), device))
    if (asked.length === 1 && asked[0].same) return r
  }
  throw new Error('не сошлись за 6 заходов')
}

test('то же самое с телефона: без сведения заново, без данных в интерфейс и без записи на диск', async () => {
  homeworkStore.set([hw(A)])
  const rep = repeats()
  const first: any = await rep.handle({ device: 'iPhone Кирилла', data: { homework: { items: [hw(A, { done: true, doneAt: 5 })], m: {}, tomb: {} } } })
  assert.equal(first.seq, undefined, 'номер ответа телефону не уходит')
  assert.equal(first.data.homework.items[0].done, true)
  // телефон забрал общее и дальше присылает его же
  const second: any = await settle(rep, first.data)
  for (let i = 0; i < 5; i++) {
    clock += 10_000
    writes = []
    asked = []
    const again = await rep.handle(phoneSends(second.data))
    assert.deepEqual(again, second)
    assert.equal(asked.length, 1)
    assert.equal(asked[0].same, true)
    assert.equal(asked[0].data, undefined, 'данные телефона в интерфейс не пересылаются')
    assert.deepEqual(writes, [])
  }
  // «на связи» — свежее время, хотя на диск его не писали
  assert.equal(lastSync()?.at, clock)
  assert.ok(kv.get<any>(LAST_KEY, null).at < clock)
})

test('правка на компьютере — следующий заход сводит заново и отдаёт её', async () => {
  homeworkStore.set([hw(A)])
  const rep = repeats()
  const r2: any = await settle(rep, { homework: { items: [hw(A)], m: {}, tomb: {} } })
  clock += 10_000
  homeworkStore.set([hw(A, { text: 'дописал на компьютере' })])
  asked = []
  const r3: any = await rep.handle(phoneSends(r2.data))
  assert.deepEqual(asked.map(b => !!b.same), [true, false], 'сначала «то же?», потом полное сведение')
  assert.equal(r3.data.homework.items[0].text, 'дописал на компьютере')
  // и снова тишина, пока ничего не трогают
  const r4: any = await settle(rep, r3.data)
  assert.equal(r4.data.homework.items[0].text, 'дописал на компьютере')
})

test('правка на телефоне — сводится как обычно', async () => {
  homeworkStore.set([hw(A)])
  const rep = repeats()
  const r2: any = await settle(rep, { homework: { items: [hw(A)], m: {}, tomb: {} } })
  clock += 10_000
  const edited = JSON.parse(JSON.stringify(r2.data))
  edited.homework.items[0].done = true
  edited.homework.m[A.toLowerCase()].done = clock
  asked = []
  const r3: any = await rep.handle(phoneSends(edited))
  assert.deepEqual(asked.map(b => !!b.same), [false])
  assert.equal(r3.data.homework.items[0].done, true)
  assert.equal(homeworkStore.get()[0].done, true)
})

test('раз в 10 минут сводится заново и без изменений; «последний раз» на диск — раз в 5 минут', async () => {
  homeworkStore.set([hw(A)])
  const rep = repeats()
  let r: any = await settle(rep, { homework: { items: [hw(A)], m: {}, tomb: {} } })
  let full = 0
  let saved = 0
  for (let i = 0; i < 6 * 15; i++) { // 15 минут по 10 секунд
    clock += 10_000
    asked = []
    writes = []
    r = await rep.handle(phoneSends(r.data))
    if (asked.some(b => !b.same)) full++
    if (writes.includes(LAST_KEY)) saved++
  }
  assert.equal(full, 1)
  assert.ok(saved >= 2 && saved <= 3, 'записей «последний раз»: ' + saved)
})

test('два телефона на одной связке: каждый получает прежний ответ, пока никто ничего не менял', async () => {
  homeworkStore.set([hw(A)])
  const rep = repeats()
  // у каждого свои фото, поэтому присылают разное
  const ownA = (d: any) => ({ ...d, homework: { ...d.homework, items: d.homework.items.map((x: any) => ({ ...x, photos: [] })) } })
  const ownB = (d: any) => ({ ...d, homework: { ...d.homework, items: d.homework.items.map((x: any) => ({ ...x, photos: ['свои.jpg'] })) } })
  let a: any = await settle(rep, { homework: { items: [hw(A)], m: {}, tomb: {} } }, ownA, 'iPhone')
  let b: any = await settle(rep, { homework: { items: [hw(A)], m: {}, tomb: {} } }, ownB, 'iPad')
  const phoneA = () => ownA(a.data)
  const phoneB = () => ownB(b.data)
  // после того как сошёлся второй, первый ещё раз сводит заново — и дальше оба получают прежние ответы
  a = await rep.handle(phoneSends(phoneA(), 'iPhone'))
  for (let i = 0; i < 3; i++) {
    clock += 5_000
    asked = []
    a = await rep.handle(phoneSends(phoneA(), 'iPhone'))
    b = await rep.handle(phoneSends(phoneB(), 'iPad'))
    assert.deepEqual(asked.map(x => !!x.same), [true, true])
  }
  // второй принёс новое ДЗ — первый получит его на следующем заходе
  clock += 5_000
  const withNew = phoneB()
  withNew.homework = { ...withNew.homework, items: [...withNew.homework.items, hw(B, { text: 'новое с планшета' })], m: { ...withNew.homework.m, [B.toLowerCase()]: { text: clock } } }
  b = await rep.handle(phoneSends(withNew, 'iPad'))
  asked = []
  a = await rep.handle(phoneSends(phoneA(), 'iPhone'))
  assert.deepEqual(asked.map(x => !!x.same), [true, false])
  assert.deepEqual(a.data.homework.items.map((x: any) => x.text), ['№ 1', 'новое с планшета'])
})

test('чужой или устаревший номер ответа — сводим заново', () => {
  homeworkStore.set([hw(A)])
  assert.deepEqual(handleSync({ device: 'iPhone', same: true, seq: 1 }), { stale: true })
  assert.deepEqual(handleSync({ device: 'iPhone', same: true }), { stale: true })
})

test('сравнение присланного: порядок ключей не важен, любое отличие — важно', () => {
  assert.ok(sameJson({ a: 1, b: [1, { c: 2, d: null }] }, { b: [1, { d: null, c: 2 }], a: 1 }))
  assert.ok(!sameJson({ a: 1 }, { a: 1, b: 2 }))
  assert.ok(!sameJson({ a: [1, 2] }, { a: [2, 1] }))
  assert.ok(!sameJson({ a: null }, { a: {} }))
  assert.ok(!sameJson({ a: [] }, { a: {} }))
  assert.ok(!sameJson({ a: '1' }, { a: 1 }))
})
