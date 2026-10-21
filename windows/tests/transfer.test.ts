// Перенос с iPhone по QR: телефон здесь изображает тест — тем же протоколом и тем же шифром
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { TransferServer, seal, open, mapRel, winName, type TransferEvent } from '../electron/transfer'
import { encodeQr } from '../src/lib/qr'

type Link = { base: string; session: string; key: Buffer }

function parse(url: string): Link {
  const u = new URL(url)
  const q = u.searchParams
  const host = (q.get('h') || '').split(',')[0]
  return { base: `http://${host}:${q.get('p')}`, session: q.get('s') || '', key: Buffer.from(q.get('k') || '', 'base64url') }
}

async function call(l: Link, method: string, pathQ: string, body: Buffer, opts: { key?: Buffer; session?: string } = {}) {
  const key = opts.key ?? l.key
  const res = await fetch(l.base + pathQ, {
    method,
    headers: { 'x-arktika-session': opts.session ?? l.session, 'content-type': 'application/octet-stream' },
    body: seal(key, body, `${method} ${pathQ}`)
  })
  const raw = Buffer.from(await res.arrayBuffer())
  let json: any = null
  if (res.headers.get('content-type') === 'application/octet-stream') {
    json = JSON.parse(open(key, raw, `R ${method} ${pathQ}`).toString('utf8'))
  }
  return { status: res.status, json }
}

const js = (o: unknown) => Buffer.from(JSON.stringify(o))

test('имена для Windows и раскладка фото доски', () => {
  assert.equal(winName('Матан: лекции?'), 'Матан_ лекции_')
  assert.equal(winName('CON'), '_CON')
  assert.equal(winName('файл. '), 'файл')
  assert.deepEqual(mapRel('Предметы/Физика/Доска 12.10 10-15-02.jpg'), ['Предметы', 'Физика', 'Доска', 'Доска 12.10 10-15-02.jpg'])
  assert.deepEqual(mapRel('Предметы/Физика/Конспект.pdf'), ['Предметы', 'Физика', 'Конспект.pdf'])
  assert.equal(mapRel('../../Windows/system.ini'), null)
  assert.equal(mapRel('Предметы/.скрытый'), null)
})

test('шифр: чужой ключ и подменённые данные не проходят', () => {
  const k = Buffer.alloc(32, 7)
  const s = seal(k, Buffer.from('привет'), 'POST /v1/hello')
  assert.equal(open(k, s, 'POST /v1/hello').toString(), 'привет')
  assert.throws(() => open(k, s, 'POST /v1/plan'))
  assert.throws(() => open(Buffer.alloc(32, 8), s, 'POST /v1/hello'))
  const bad = Buffer.from(s); bad[20] ^= 1
  assert.throws(() => open(k, bad, 'POST /v1/hello'))
})

test('QR со ссылкой переноса собирается', () => {
  const m = encodeQr('arktika://pc?v=1&h=192.168.1.34,10.0.0.5&p=51234&s=AbCdEfGhIjKlMnOp&k=' + 'A'.repeat(43) + '&n=DESKTOP')
  assert.ok(m.size >= 21 && m.size <= 73)
})

test('перенос: план, докачка после обрыва, пропуск уже перенесённого, данные', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arktika-'))
  const events: TransferEvent[] = []
  const srv = new TransferServer({ name: 'ТЕСТ-ПК', version: '18.2.0', root: () => root, emit: e => events.push(e), bind: '127.0.0.1' })
  const info = await srv.start()
  assert.ok(info.url.startsWith('arktika://pc?'))
  const l = parse(info.url)

  // без сессии и с чужим ключом — отказ
  assert.equal((await call(l, 'POST', '/v1/hello', js({ device: 'x' }), { session: 'nope' })).status, 403)
  assert.equal((await call(l, 'POST', '/v1/hello', js({ device: 'x' }), { key: Buffer.alloc(32, 1) })).status, 400)

  const hello = await call(l, 'POST', '/v1/hello', js({ device: 'iPhone Ивана', app: '18.2' }))
  assert.equal(hello.status, 200)
  assert.equal(hello.json.pc, 'ТЕСТ-ПК')
  assert.ok(events.some(e => e.type === 'connected' && e.device === 'iPhone Ивана'))

  const pdf = Buffer.alloc(3 * 1024 * 1024 + 123, 5)
  const photo = Buffer.from('jpeg-bytes')
  const same = Buffer.from('уже есть')
  const other = Buffer.from('новая версия с телефона')
  fs.mkdirSync(path.join(root, 'Предметы', 'Физика'), { recursive: true })
  fs.writeFileSync(path.join(root, 'Предметы', 'Физика', 'Старое.txt'), same)
  fs.writeFileSync(path.join(root, 'Предметы', 'Физика', 'Задачи.txt'), 'версия на компьютере')
  const t0 = Date.UTC(2026, 9, 12, 7, 15)
  const files = [
    { p: 'Предметы/Физика/Лекция 1.pdf', s: pdf.length, m: t0 },
    { p: 'Предметы/Физика/Доска 12.10 10-15-02.jpg', s: photo.length, m: t0 },
    { p: 'Предметы/Физика/Старое.txt', s: same.length, m: t0 },
    { p: 'Предметы/Физика/Задачи.txt', s: other.length, m: t0 },
    { p: '../../evil.txt', s: 3, m: t0 }
  ]
  let plan = await call(l, 'POST', '/v1/plan', js({ files, data: true }))
  assert.equal(plan.status, 200)
  const offs = new Map<number, number>(plan.json.files.map((f: any) => [f.i, f.o]))
  assert.equal(offs.get(2), -1, 'такой же файл не шлём')
  assert.equal(offs.has(4), false, 'путь наружу отброшен')
  assert.equal(offs.get(0), 0)

  // первый кусок PDF, потом «обрыв»
  const CH = 1024 * 1024
  let r = await call(l, 'PUT', '/v1/file?i=0&o=0', pdf.subarray(0, CH))
  assert.equal(r.json.o, CH)
  // кусок не с того места — сервер говорит, откуда продолжать
  r = await call(l, 'PUT', `/v1/file?i=0&o=${2 * CH}`, pdf.subarray(2 * CH, 3 * CH))
  assert.equal(r.status, 409)
  assert.equal(r.json.o, CH)

  // новый план после переподключения: докачка с 1 МБ
  plan = await call(l, 'POST', '/v1/plan', js({ files, data: true }))
  const again = new Map<number, number>(plan.json.files.map((f: any) => [f.i, f.o]))
  assert.equal(again.get(0), CH)
  for (let o = CH; o < pdf.length; o += CH) {
    r = await call(l, 'PUT', `/v1/file?i=0&o=${o}`, pdf.subarray(o, Math.min(o + CH, pdf.length)))
    assert.equal(r.status, 200)
  }
  await call(l, 'PUT', '/v1/file?i=1&o=0', photo)
  await call(l, 'PUT', '/v1/file?i=3&o=0', other)

  const plist = Buffer.from('bplist00-test')
  assert.equal((await call(l, 'POST', '/v1/data', plist)).json.ok, true)
  const done = await call(l, 'POST', '/v1/done', js({}))
  assert.equal(done.json.files, 3)

  assert.deepEqual(fs.readFileSync(path.join(root, 'Предметы', 'Физика', 'Лекция 1.pdf')), pdf)
  const board = path.join(root, 'Предметы', 'Физика', 'Доска', 'Доска 12.10 10-15-02.jpg')
  assert.deepEqual(fs.readFileSync(board), photo)
  assert.equal(Math.round(fs.statSync(board).mtimeMs / 1000), Math.round(t0 / 1000), 'дата съёмки сохранена')
  assert.equal(fs.readFileSync(path.join(root, 'Предметы', 'Физика', 'Задачи.txt'), 'utf8'), 'версия на компьютере', 'файл компьютера не перезаписан')
  assert.deepEqual(fs.readFileSync(path.join(root, 'Предметы', 'Физика', 'Задачи (iPhone).txt')), other)
  assert.equal(fs.existsSync(path.join(root, '..', 'evil.txt')), false)
  assert.equal(fs.readdirSync(path.join(root, 'Предметы', 'Физика')).some(n => n.endsWith('.arktika-part')), false)

  const dataEv = events.find(e => e.type === 'data') as any
  assert.equal(Buffer.from(dataEv.plist, 'base64').toString(), 'bplist00-test')
  const doneEv = events.find(e => e.type === 'done') as any
  assert.equal(doneEv.files, 3)
  assert.equal(doneEv.skipped, 1)
  assert.equal(doneEv.data, true)
  assert.ok(events.filter(e => e.type === 'file').length === 3)

  // второй перенос: всё уже есть — слать нечего
  const srv2 = new TransferServer({ name: 'ТЕСТ-ПК', version: '18.2.0', root: () => root, emit: () => {}, bind: '127.0.0.1' })
  const l2 = parse((await srv2.start()).url)
  await call(l2, 'POST', '/v1/hello', js({ device: 'iPhone' }))
  const p2 = await call(l2, 'POST', '/v1/plan', js({ files: files.slice(0, 4), data: false }))
  assert.ok(p2.json.files.every((f: any) => f.o === -1), 'повторный перенос — только новое')
  srv2.stop()
  srv.stop()
  fs.rmSync(root, { recursive: true, force: true })
})
