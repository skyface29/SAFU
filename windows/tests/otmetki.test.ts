import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as O from '../src/lib/otmetki'
// @ts-ignore — серверная логика (CommonJS), та же, что работает в Cloudflare
import core from '../../otmetki-api/core.js'
// @ts-ignore
import memStore from '../../otmetki-api/store-mem.js'

// Шифрование сайта, взятое прямо из site/otmetki/index.html: приложение обязано совпадать с ним байт в байт.
function siteCrypto() {
  const html = readFileSync('../site/otmetki/index.html', 'utf8')
  const a = html.indexOf('var CODE_ABC='), b = html.indexOf('var M_TXT=')
  const c = html.indexOf('var te=new TextEncoder()'), d = html.indexOf('/* ================= сервер')
  assert.ok(a > 0 && b > a && c > 0 && d > c, 'не нашёл шифрование в странице сайта')
  const src = html.slice(a, b) + html.slice(c, d) + ';({groupKeys,studentKeys,enc,dec,shortHash,normCode})'
  return vm.runInNewContext(src, { crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob, Promise, String, JSON }) as any
}

const CODE = 'ABCDE-FGHJK-LMNPQ'

test('otmetki: ключи группы и студента совпадают с сайтом', async () => {
  const S = siteCrypto()
  const a = await O.groupKeys(CODE), b = await S.groupKeys(CODE)
  assert.equal(a.code, b.code); assert.equal(a.gid, b.gid); assert.equal(a.w, b.w)
  const sa = await O.studentKeys(a.gid, 'QWERTYUPASDFGHJ'), sb = await S.studentKeys(b.gid, 'QWERTYUPASDFGHJ')
  assert.equal(sa.tag, sb.tag)
  assert.equal(await O.shortHash('Физика|Лекция|'), await S.shortHash('Физика|Лекция|'))
  // шифр сайта читается приложением и наоборот
  assert.deepEqual(await O.dec(a.key, await S.enc(b.key, { x: 'привет' })), { x: 'привет' })
  assert.deepEqual(await S.dec(b.key, await O.enc(a.key, { y: [1, 2] })), { y: [1, 2] })
  assert.deepEqual(await O.dec(sa.key, await S.enc(sb.key, { m: 'r' })), { m: 'r' })
  assert.equal(O.normCode('abcde-fghjk-lmnp0 1'), S.normCode('abcde-fghjk-lmnp0 1'))
})

test('otmetki: группа сайта открывается, пара сохраняется, студент видит свою отметку', async () => {
  const S = siteCrypto(), store = memStore()
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = new URL(url)
    const r = await core.http({ httpMethod: init?.method || 'GET', queryStringParameters: Object.fromEntries(u.searchParams), body: init?.body || '', isBase64Encoded: false }, async () => store)
    return new Response(r.body, { status: r.statusCode })
  }) as any
  try {
    // группу создаёт сайт
    const k = await S.groupKeys(CODE)
    const roster = [{ id: 'aaaaaa', n: 'Иванов И.', t: 'QWERTYUPASDFGHJ' }, { id: 'bbbbbb', n: 'Петрова А.', t: 'ZXCVBNMLKJHGFDS' }]
    const meta = { v: 1, name: 'Тест', ruz: null, roster, credits: { aaaaaa: ['Физика'] }, created: 1 }
    await O.api('create', null, { g: k.gid, w: k.w })
    await O.api('put', null, { g: k.gid, w: k.w, items: [{ k: 'meta', d: await S.enc(k.key, meta) }] })

    await assert.rejects(O.openGroup('ABCDE-FGHJK-LMNPR'), /не найдена/)
    const G = await O.openGroup(CODE.toLowerCase())
    assert.equal(G.meta.name, 'Тест')

    const date = O.mskDate(Date.now())
    const les = O.applyCredits(G, O.newLesson(date, { t: '10:10', e: '11:45', subj: 'Физика', kind: 'Лекция', teacher: '', room: '', sub: '' }))
    assert.equal(les.marks.aaaaaa, 'r')
    les.marks.bbbbbb = 'l'
    const key = await O.lessonKey(date, les)
    assert.equal(key, 'l/' + date + 'T1010-' + await S.shortHash('Физика|Лекция|'))
    await O.saveLesson(G, key, les, 'Староста')

    // староста на сайте видит пару
    const month = await O.loadMonth(G, date.slice(0, 7))
    assert.equal(month[key].marks.bbbbbb, 'l')
    assert.equal(month[key].by, 'Староста')
    const items = await O.dayLessons(G, date, month)
    assert.equal(items.length, 1); assert.equal(items[0].saved?.subj, 'Физика')
    assert.deepEqual(O.countMarks(G, month[key].marks), { p: 0, a: 0, e: 0, l: 1, r: 1, n: 0 })

    // студент по своей ссылке видит только свою отметку
    const sk = await S.studentKeys(k.gid, 'ZXCVBNMLKJHGFDS')
    const r = await O.api('student', { g: k.gid, t: sk.tag, m: date.slice(0, 7) })
    const mine = await Promise.all(Object.values(r.items as Record<string, string>).map(x => S.dec(sk.key, x)))
    assert.deepEqual(mine.map((x: any) => x.m), ['l'])

    // неверный пропуск на запись не пускает
    await assert.rejects(O.api('put', null, { g: k.gid, w: 'x'.repeat(32), items: [{ k: 'meta', d: 'y'.repeat(30) }] }), /код группы не подходит/)
  } finally { globalThis.fetch = realFetch }
})
