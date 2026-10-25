// Расписание ребятам: день и неделя карточкой и текстом
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySchedule } from '../src/lib/schedule'
import { shareDays, shareTitle, shareSummary, shareScheduleText, shortTeacher, windowText, roomText, rangeText, shareFileName } from '../src/lib/scheduleShare'

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m, d, h, min).getTime()
const ev = (start: number, subject: string, o: Partial<{ kind: string; room: string; teacher: string; address: string; note: string }> = {}) =>
  ({ start, end: start + 95 * 60_000, subject, kind: 'Лекция', teacher: '', room: '', address: '', note: '', ...o })

// неделя 26 – 31 октября 2026: пары во вторник и в четверг, суббота пустая
const data = {
  ...emptySchedule(), source: 1, ruzGroupNumber: '151621',
  ruzEvents: [
    ev(at(2026, 9, 27, 8, 20), 'Математический анализ', { room: '1405', teacher: 'Яковленкова Анна Олеговна', address: 'А-НСД17' }),
    ev(at(2026, 9, 27, 10, 10), 'Программирование', { kind: 'Лабораторная', room: '2210', teacher: 'Попов С.В.' }),
    ev(at(2026, 9, 27, 10, 10), 'Программирование', { kind: 'Лабораторная', room: '2212', teacher: 'Петров А.А.' }),
    ev(at(2026, 9, 27, 16, 15), 'История России', { kind: 'Практика', address: 'Дистанционно' }),
    ev(at(2026, 9, 29, 12, 0), 'Физика', { kind: 'Практика', room: '508' })
  ]
}

test('неделя: пн–пт, пустая суббота не показывается, подгруппы — одной строкой', () => {
  const days = shareDays({ kind: 'week', date: at(2026, 9, 29, 12, 0) }, data)
  assert.equal(days.length, 5)
  assert.equal(new Date(days[0].date).getDate(), 26)
  assert.equal(days[1].rows.length, 3)
  assert.deepEqual(days[1].rows[1].rooms, ['2210', '2212'])
  assert.equal(roomText(days[1].rows[1]), 'ауд. 2210, 2212')
  assert.equal(roomText(days[1].rows[2]), 'дистант')
  assert.equal(roomText({ ...days[1].rows[0], rooms: ['спортзал'] }), 'спортзал')
  assert.equal(shareTitle({ kind: 'week', date: days[0].date }, days), '26 – 30 октября')
  assert.equal(shareSummary({ kind: 'week', date: days[0].date }, days), '4 пары · 2 учебных дня')
})

test('день: заголовок, итог, окна между парами', () => {
  const span = { kind: 'day' as const, date: at(2026, 9, 27, 0, 0) }
  const days = shareDays(span, data)
  assert.equal(shareTitle(span, days), 'Вторник, 27 октября')
  assert.equal(shareSummary(span, days), '3 пары · 8:20 – 17:50')
  const [a, b, c] = days[0].rows
  assert.equal(windowText(a, b), null)               // 15 минут перемены
  assert.equal(windowText(b, c), 'Окно 4 ч 30 мин')
})

test('текстом: группа, по порядку, сокращённые преподаватели', () => {
  const t = shareScheduleText({ kind: 'day', date: at(2026, 9, 27, 0, 0) }, data, '151621')
  const lines = t.split('\n')
  assert.equal(lines[0], '📅 Вторник, 27 октября · 151621')
  assert.match(lines[1], /^1\. 8:20–9:55 Математический анализ \(лекция\) — ауд\. 1405, наб\. Северной Двины, д\. 17 \(главный корпус\), Яковленкова А\. О\.$/)
  assert.match(lines[2], /ауд\. 2210, 2212.*Попов С\.В\., Петров А\.А\./)
  const empty = shareScheduleText({ kind: 'day', date: at(2026, 9, 28, 0, 0) }, data)
  assert.equal(empty, '📅 Среда, 28 октября\nПар нет 🎉')
  const week = shareScheduleText({ kind: 'week', date: at(2026, 9, 28, 0, 0) }, data, '151621')
  assert.ok(week.startsWith('📅 Пары на неделю: 26 – 30 октября · 151621'))
  assert.ok(week.includes('▫️ Понедельник, 26 октября\nпар нет'))
})

test('мелочи: имена, диапазоны, имя файла', () => {
  assert.equal(shortTeacher('Иванов Иван Иванович'), 'Иванов И. И.')
  assert.equal(shortTeacher('Иванов И.И.'), 'Иванов И.И.')
  assert.equal(rangeText(at(2026, 9, 26, 0, 0), at(2026, 10, 1, 0, 0)), '26 октября – 1 ноября')
  assert.equal(shareFileName({ kind: 'day', date: at(2026, 9, 27, 0, 0) }, data), 'Пары 27 октября.png')
})
