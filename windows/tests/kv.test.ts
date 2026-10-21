import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kv } from '../src/lib/kv'

test('kv: значение чужого типа — значение по умолчанию, а не падение интерфейса', () => {
  kv.replaceAll({ 'user.last': {}, 'user.role': 'x', list: { a: 1 }, obj: [1], flag: 'да', gone: null, name: 'Иванов', hw: [{ id: 1 }], prefs: { a: 1 } })
  assert.equal(kv.get('user.last', ''), '')
  assert.equal(kv.get('user.role', 0), 0)
  assert.deepEqual(kv.get('list', [] as number[]), [])
  assert.deepEqual(kv.get('obj', {}), {})
  assert.equal(kv.get('flag', false), false)
  assert.equal(kv.get('gone', 'нет'), 'нет')
  // подходящие значения — как были
  assert.equal(kv.get('name', ''), 'Иванов')
  assert.deepEqual(kv.get('hw', [] as unknown[]), [{ id: 1 }])
  assert.deepEqual(kv.get('prefs', {}), { a: 1 })
  // без значения по умолчанию проверять не с чем — отдаём как есть
  assert.deepEqual(kv.get<unknown>('obj', null), [1])
  kv.replaceAll({})
})
