import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHTML, parseGroups, lecturerEvent, parseInstitutions, groupNumbers } from '../server/ruz/parse'
import { mergeEvents } from '../server/ruz/client'
import { toSlots, targets, dueOptions, subjectsOf, recentSlot } from '../server/schedule'
import { matchSubject, splitQuick, firstWord } from '../server/bot/text'
import { checkInitData, signInitData } from '../server/auth'
import { clean, line } from '../shared/pretty'
import { parseDay, moscowDate, addDays, monday } from '../shared/dates'
import type { RuzEvent } from '../server/ruz/parse'

const PAGE = `<html><body><div class="list">
<div class="dayofweek">Понедельник, 05.10.2026</div>
<div class="timetable_sheet"><span class="num_para">1</span><span class="time_para">08:20–09:55</span>
<span class="kindOfWork">Лекции</span> <span class="discipline">Математический анализ ( Яковленкова А.О.)</span>
<span class="auditorium">ауд. 1405, А-НСД17</span></div>
<div class="timetable_sheet"><span class="num_para">2</span><span class="time_para">10:10–11:45</span>
<span>Лабораторные занятия Программирование Подгруппа 1 ( Попов С.В.)</span><span>ауд. 2210, А-НСД17/2210</span></div>
</div></body></html>`

test('разбор РУЗ — тот же, что в Арктике для Windows', () => {
  const ev = parseHTML(PAGE)
  assert.equal(ev.length, 2)
  assert.equal(ev[0].subject, 'Математический анализ')
  assert.equal(ev[0].kind, 'Лекция')
  assert.equal(new Date(ev[0].start).toISOString(), '2026-10-05T05:20:00.000Z')
  assert.equal(ev[1].kind, 'Лабораторная')
  const g = parseGroups('<h3>1 курс</h3><a href="?timetable&group=101">151621 Информатика</a>')
  assert.deepEqual(g.map(x => [x.id, x.number, x.course]), [['101', '151621', 1]])
  assert.deepEqual(parseInstitutions('<a href="?groups&institution=3">ВШИТАС</a><a href="?groups&institution=3">ещё</a>'), [{ id: 3, name: 'ВШИТАС' }])
  const e = lecturerEvent({ start: 0, end: 0, subject: 'Физика Поток "151612, 151613"', kind: 'Лекция', teacher: '', room: '', address: '', note: '' })
  assert.deepEqual(groupNumbers(e.teacher), ['151612', '151613'])
  assert.deepEqual(toSlots([e])[0].groups, ['151612', '151613'])
})

const ev = (day: number, h: number, m: number, subject: string, kind: string, room = '1405'): RuzEvent =>
  ({ start: moscowDate(2026, 10, day, h, m), end: moscowDate(2026, 10, day, h + 1, m + 35), subject, kind, teacher: 'Иванов И.И.', room, address: 'А-НСД17', note: '' })

// неделя 19–23 октября 2026: пн — лекция матана (и неделей раньше — значит, каждую неделю), ср — практика, пт — дистант
const WEEK = [
  ev(12, 8, 20, 'Математический анализ', 'Лекция'),
  ev(19, 8, 20, 'Математический анализ', 'Лекция'),
  ev(21, 10, 10, 'Математический анализ', 'Практика', '1220'),
  ev(23, 12, 0, 'Математический анализ', 'Практика', 'д.о.'),
  ev(20, 10, 10, 'Физика', 'Лекция')
]

test('сроки: к следующей паре, к практике, через одну, прогноз по прошлым неделям', () => {
  const slots = toSlots(WEEK)
  const after = moscowDate(2026, 10, 19, 9, 0)
  const now = after
  const t = targets(slots, 'математический анализ', after, null, 3, now)
  // дистант в пятницу пропущен, дальше — прогноз: следующий понедельник
  assert.equal(new Date(t[0].start).toISOString(), '2026-10-21T07:10:00.000Z')
  assert.equal(t[1].estimated, true)
  assert.equal(new Date(t[1].start).toISOString(), '2026-10-26T05:20:00.000Z')
  const opts = dueOptions(slots, 'Математический анализ', moscowDate(2026, 10, 19, 8, 20), 'Лекция', now)
  assert.equal(opts[0].id, 'next')
  assert.equal(opts[0].kind, 'Практика')
  assert.equal(opts[0].room, '1220')
  assert.ok(opts.some(o => o.id === 'tomorrow') && opts.some(o => o.id === 'week'))
  assert.equal(new Set(opts.map(o => o.due)).size, opts.length, 'одинаковые сроки не повторяются')
  // идёт пара по матану — предмет предлагается первым
  const during = moscowDate(2026, 10, 19, 9, 0)
  assert.equal(subjectsOf(slots, during)[0].subject, 'Математический анализ')
  assert.equal(recentSlot(slots, 'Математический анализ', during)?.kind, 'Лекция')
})

test('свежее расписание заменяет будущее, прошлое остаётся', () => {
  const now = moscowDate(2026, 10, 21, 12, 0)
  const old = [ev(19, 8, 20, 'Матан', 'Лекция'), ev(22, 8, 20, 'Матан', 'Лекция')]
  const fresh = [ev(21, 8, 20, 'Матан', 'Лекция'), ev(23, 8, 20, 'Матан', 'Практика')]
  const merged = mergeEvents(old, fresh, now)
  assert.deepEqual(merged.map(e => new Date(e.start).getUTCDate()), [19, 21, 23])
})

test('предмет из того, как пишут в чатах', () => {
  const subjects = ['Математический анализ', 'Физическая культура', 'Иностранный язык', 'Физика', 'Программирование', 'История России']
  assert.equal(matchSubject('матан', subjects), 'Математический анализ')
  assert.equal(matchSubject('Мат. анализ', subjects), 'Математический анализ')
  assert.equal(matchSubject('физра', subjects), 'Физическая культура')
  assert.equal(matchSubject('англ', subjects), 'Иностранный язык')
  assert.equal(matchSubject('физика', subjects), 'Физика')
  assert.equal(matchSubject('физ', subjects), null, 'неоднозначно — переспросим')
  assert.equal(matchSubject('прога', subjects), 'Программирование')
  assert.equal(matchSubject('история', subjects), 'История России')
  assert.equal(matchSubject('прочитать', subjects), null)
  assert.deepEqual(splitQuick('Матан: № 5, 6 стр 45'), { subject: 'Матан', text: '№ 5, 6 стр 45' })
  assert.deepEqual(splitQuick('физика - упр 3'), { subject: 'физика', text: 'упр 3' })
  assert.equal(splitQuick('прочитать главу 3'), null)
  assert.deepEqual(firstWord('матан номер 5'), { subject: 'матан', text: 'номер 5' })
})

test('оформление ДЗ и даты по-русски', () => {
  assert.equal(clean('решить номер 5,6 стр 45 , упр 3-7'), 'Решить № 5, 6 стр. 45, упр. 3–7')
  assert.equal(line('1) прочитать § 5 2) упр. 3'), 'Прочитать § 5 · Упр. 3')
  const now = new Date(2026, 9, 20, 12).getTime() // вт 20 октября
  assert.equal(parseDay('25.10', now), new Date(2026, 9, 25).getTime())
  assert.equal(parseDay('25 октября', now), new Date(2026, 9, 25).getTime())
  assert.equal(parseDay('завтра', now), new Date(2026, 9, 21).getTime())
  assert.equal(parseDay('пт', now), new Date(2026, 9, 23).getTime())
  assert.equal(parseDay('10.01', new Date(2026, 11, 20).getTime()), new Date(2027, 0, 10).getTime())
  assert.equal(parseDay('31.02', now), null)
  assert.equal(monday(addDays(monday(now), 3)), monday(now))
})

test('подпись мини-приложения: верная проходит, подделка и старая — нет', () => {
  const token = '123:ABC'
  const now = Date.now()
  const fields = { auth_date: String(Math.floor(now / 1000)), query_id: 'q', user: JSON.stringify({ id: 42, first_name: 'Кирилл' }), start_param: 'hw7' }
  const ok = checkInitData(signInitData(fields, token), token, 3600, now)
  assert.equal(ok?.user.id, 42)
  assert.equal(ok?.startParam, 'hw7')
  assert.equal(checkInitData(signInitData(fields, token), 'другой:токен', 3600, now), null)
  const forged = signInitData(fields, token).replace('%22id%22%3A42', '%22id%22%3A43')
  assert.equal(checkInitData(forged, token, 3600, now), null)
  const old = signInitData({ ...fields, auth_date: String(Math.floor(now / 1000) - 7200) }, token)
  assert.equal(checkInitData(old, token, 3600, now), null)
})
