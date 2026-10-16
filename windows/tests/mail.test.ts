// Какие письма считаются новыми (уведомления о почте)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceMail, type MailBoxState } from '../src/lib/mailstate'

const m = (uid: number, seen = false) => ({ uid, seen })
const start: MailBoxState = { lastUID: 0, validity: 0, inited: false }

test('первая проверка — только запоминаем, без уведомлений о старых письмах', () => {
  const r = advanceMail(start, [m(10), m(9, true)], 10, 7)
  assert.deepEqual(r.fresh, [])
  assert.deepEqual(r.next, { lastUID: 10, validity: 7, inited: true })
})

test('новое письмо — уведомление', () => {
  const st = { lastUID: 10, validity: 7, inited: true }
  const r = advanceMail(st, [m(12), m(11, true), m(10)], 12, 7)
  assert.deepEqual(r.fresh.map(x => x.uid), [12])
  assert.equal(r.next.lastUID, 12)
})

test('IMAP: всё прочитано, а потом пришло письмо — уведомление не теряется', () => {
  // раньше: непрочитанных нет → номер сбрасывался в 0 → следующее письмо считалось «первой проверкой»
  let st = { lastUID: 10, validity: 7, inited: true }
  st = advanceMail(st, [], 10, 7).next
  assert.equal(st.lastUID, 10)
  const r = advanceMail(st, [m(11)], 11, 7)
  assert.deepEqual(r.fresh.map(x => x.uid), [11])
})

test('пустой ящик не сбрасывает счёт', () => {
  let st = { lastUID: 50, validity: 0, inited: true }
  st = advanceMail(st, [], 0, 0).next
  assert.equal(st.lastUID, 50)
  assert.deepEqual(advanceMail(st, [m(51)], 51, 0).fresh.map(x => x.uid), [51])
})

test('ящик пересоздан (сменился UIDVALIDITY) — заново запоминаем, без потока уведомлений', () => {
  const st = { lastUID: 500, validity: 7, inited: true }
  const r = advanceMail(st, [m(3), m(2)], 3, 8)
  assert.deepEqual(r.fresh, [])
  assert.equal(r.next.lastUID, 3)
})

test('не больше 5 уведомлений за раз, самые свежие', () => {
  const st = { lastUID: 1, validity: 0, inited: true }
  const msgs = [2, 3, 4, 5, 6, 7, 8].map(u => m(u))
  assert.deepEqual(advanceMail(st, msgs, 8, 0).fresh.map(x => x.uid), [4, 5, 6, 7, 8])
})
