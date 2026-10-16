// Оформление ДЗ, записанного как попало (как на iPhone)
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocks, clean, line, parts, shareText } from '../src/lib/hwpretty'
import { newHomework } from '../src/lib/homework'

const bl = (s: string) => blocks(s).map(b => [b.marker, b.text])

test('номера, страницы, упражнения и диапазоны', () => {
  assert.equal(clean('решить номер 5,6 стр 45  , упр 3-7'), 'Решить № 5, 6 стр. 45, упр. 3–7')
  assert.equal(clean('параграф 5 и §7'), '§ 5 и § 7')
  assert.equal(clean('страница 12, упражнение 4'), 'Стр. 12, упр. 4')
  assert.equal(clean('сп 5'), 'Сп 5') // «п» внутри слова — не сокращение
  assert.equal(clean('число 1,5 оставить'), 'Число 1,5 оставить')
})

test('ссылки не портятся', () => {
  assert.equal(clean('см www.sakai.narfu.ru/x?a=1,2;b'), 'См www.sakai.narfu.ru/x?a=1,2;b')
  assert.equal(clean('https://e.lanbook.com/book/1 - читать'), 'https://e.lanbook.com/book/1 - читать')
})

test('нумерованный список одной строкой', () => {
  assert.deepEqual(bl('1) прочитать параграф 5 2)ответить на вопросы стр 40 3) упр 12'),
    [['1.', 'Прочитать § 5'], ['2.', 'Ответить на вопросы стр. 40'], ['3.', 'Упр. 12']])
  assert.deepEqual(bl('текст. 2) не список'), [['', 'Текст. 2) не список']])
})

test('строки — пункты, заголовок с двоеточием — абзац', () => {
  assert.deepEqual(bl('подготовиться к кр:\nпроизводные\nинтегралы'),
    [['', 'Подготовиться к кр:'], ['•', 'Производные'], ['•', 'Интегралы']])
  assert.deepEqual(bl('№5.3 , №5.4 ; повторить п 2.1'), [['•', '№ 5.3, № 5.4'], ['•', 'Повторить п. 2.1']])
  assert.deepEqual(bl('1. задача 1-5\n2. лаба 3\n- принести тетрадь'), [['1.', 'Задача 1–5'], ['2.', 'Лаба 3'], ['•', 'Принести тетрадь']])
  assert.equal(line('1) а 2) б'), 'А · Б')
})

test('выделение номеров и текст для чата', () => {
  assert.deepEqual(parts('Решить № 5, 6 стр. 45').filter(p => p.ref).map(p => p.text), ['№ 5, 6', 'стр. 45'])
  const h = newHomework('Матан', 'решить номер 5,6', new Date(2026, 9, 17, 10, 10).getTime())
  h.steps = [{ id: '1', text: 'проверить ответы', done: true }]
  const t = shareText(h)
  assert.match(t, /^📚 Матан\nРешить № 5, 6\n✅ Проверить ответы\n📅 Сдать: сб 17 октября, 10:10$/)
})
