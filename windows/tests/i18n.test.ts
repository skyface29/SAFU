// Язык интерфейса: русский без изменений, английский из словаря, подстановки и склонения
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { L, Lang, plural, fill } from '../src/lib/i18n'
import table from '../src/lib/en.json'

test('русский: фразы и подстановки как в коде', () => {
  Lang.init('ru', ['en-US'])
  assert.equal(Lang.en, false)
  assert.equal(L('Главная'), 'Главная')
  const n = 3
  assert.equal(L`Сегодня ${n} пары`, 'Сегодня 3 пары')
  assert.equal(L('100%'), '100%')
  assert.equal(plural(5, 'день', 'дня', 'дней'), 'дней')
  assert.equal(plural(22, 'день', 'дня', 'дней'), 'дня')
})

test('английский: перевод, подстановки, нет перевода — остаётся как есть', () => {
  Lang.init('en', ['ru-RU'])
  assert.equal(Lang.en, true)
  assert.equal(L('Главная'), 'Home')
  const room = '1220'
  assert.equal(L`ауд. ${room}`, 'room 1220')
  assert.equal(L('Математический анализ (из РУЗ, нет в словаре)'), 'Математический анализ (из РУЗ, нет в словаре)')
  assert.equal(plural(1, 'day', 'days', 'days'), 'day')
  assert.equal(plural(2, 'day', 'days', 'days'), 'days')
})

test('язык по системе: русскоязычным — русский, остальным — английский', () => {
  Lang.init('system', ['ru-RU']); assert.equal(Lang.en, false)
  Lang.init('system', ['kk-KZ']); assert.equal(Lang.en, false)
  Lang.init('system', ['en-GB']); assert.equal(Lang.en, true)
  Lang.init('system', ['zh-CN']); assert.equal(Lang.en, true)
  Lang.init('system', []); assert.equal(Lang.en, false)
})

test('подстановки: по порядку, по номеру, знак процента', () => {
  assert.equal(fill('%@ of %@', ['1', '2']), '1 of 2')
  assert.equal(fill('%2$@ — %1$@', ['a', 'b']), 'b — a')
  assert.equal(fill('100%% done', []), '100% done')
})

test('словарь: в переводе столько же подстановок, сколько в оригинале', () => {
  for (const [ru, en] of Object.entries(table as Record<string, string>)) {
    const a = (ru.match(/%@/g) || []).length
    const b = (en.match(/%(?:\d+\$)?@/g) || []).length
    assert.equal(b, a, ru)
    assert.ok(en.trim().length > 0, ru)
  }
})
