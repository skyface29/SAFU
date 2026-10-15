import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHTML, EventText, parseICS, parseGroups, extractGroupID, lecturerEvent, sameLecturer, icsLinks, sameGroup } from '../src/lib/ruz'
import { AddressFormat, mergeRuz, emptySchedule, slotsOn, pairFor, academicWeek, diffChanges, upcomingMap } from '../src/lib/schedule'
import { targets, guessKind, newHomework, resolve, chip } from '../src/lib/homework'
import { normalizeTimes, fromShareCode, shareCode, default150, commute } from '../src/lib/bus'
import { parseBinaryPlist } from '../src/lib/plist'
import { convertIOS } from '../src/lib/backup'
import { makeZip, crc32 } from '../src/lib/zip'

const PAGE = `<html><body><div class="list">
<div class="dayofweek">Понедельник, 05.10.2026</div>
<div class="timetable_sheet"><span class="num_para">1</span><span class="time_para">08:20–09:55</span>
<span class="kindOfWork">Лекции</span> <span class="discipline">Математический анализ ( Яковленкова А.О.)</span>
<span class="auditorium">ауд. 1405, А-НСД17</span></div>
<div class="timetable_sheet"><span class="num_para">2</span><span class="time_para">10:10–11:45</span>
<span>Лабораторные занятия Программирование Подгруппа 1 ( Попов С.В.)</span><span>ауд. 2210, А-НСД17/2210</span></div>
<div class="dayofweek">Вторник, 06.10.2026</div>
<div><span>3</span> <span>12:00–13:35</span> <span>Практические занятия История России Ссылка на курс https://sakai.narfu.ru ( Белова Т.М.)</span><span>ауд. 508, АУК-10</span></div>
</div><a href="?timetable&group=17890&date=12.10.2026">след</a><a href="/ical/17890.ics">iCal</a>
<a href="?timetable&lecturer=555">Яковленкова Анна Олеговна</a></body></html>`

test('разбор страницы РУЗ: даты, время по Москве, тип, преподаватель, аудитория', () => {
  const ev = parseHTML(PAGE)
  assert.equal(ev.length, 3)
  assert.equal(ev[0].subject, 'Математический анализ')
  assert.equal(ev[0].kind, 'Лекция')
  assert.equal(ev[0].teacher, 'Яковленкова А.О.')
  assert.equal(ev[0].room, '1405')
  assert.equal(ev[0].address, 'А-НСД17')
  assert.equal(new Date(ev[0].start).toISOString(), '2026-10-05T05:20:00.000Z')
  assert.equal(ev[1].kind, 'Лабораторная')
  assert.equal(ev[1].subject, 'Программирование')
  assert.match(ev[1].note, /Подгруппа/)
  assert.equal(ev[2].subject, 'История России')
  assert.equal(ev[2].kind, 'Практика')
  assert.match(ev[2].note, /Ссылка на курс/)
})

test('коды корпусов превращаются в адреса', () => {
  assert.equal(AddressFormat.decode('', 'А-НСД17/1405', []).address, 'наб. Северной Двины, д. 17')
  assert.equal(AddressFormat.decode('', 'А-НСД17/1405', []).room, '1405')
  assert.equal(AddressFormat.full('АУК-10'), 'учебный корпус № 10, просп. Ломоносова, д. 2')
  assert.equal(AddressFormat.isRemote('д.о.'), true)
  assert.equal(AddressFormat.decode('1', 'А-НСД17', [{ id: 'x', name: 'А-НСД17', address: 'Главный корпус' }]).address, 'Главный корпус')
})

test('разбор текста пары и чистка хвостов', () => {
  const p = EventText.parse('Семинар Философия ( Иванов И.И.) ауд. 12, ул. Урицкого')
  assert.deepEqual([p.kind, p.subject, p.teacher, p.room, p.address], ['Семинар', 'Философия', 'Иванов И.И.', '12', 'ул. Урицкого'])
  assert.equal(EventText.cleanSubject('Физика онлайн-курс на платформе').subject, 'Физика')
})

test('iCal: даты в UTC и TZID, ссылки iCal', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261005T052000Z\r\nDTEND:20261005T065500Z\r\nSUMMARY:Лекции Физика\r\nLOCATION:ауд. 1201\\, А-НСД17\r\nDESCRIPTION:Смирнов П.П.\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Europe/Moscow:20261006T101000\r\nSUMMARY:Практика Химия\r\nEND:VEVENT\r\nEND:VCALENDAR'
  const ev = parseICS(ics)
  assert.equal(ev.length, 2)
  assert.equal(ev[0].room, '1201')
  assert.equal(ev[0].teacher, 'Смирнов П.П.')
  assert.equal(new Date(ev[1].start).toISOString(), '2026-10-06T07:10:00.000Z')
  assert.deepEqual(icsLinks(PAGE), ['https://ruz.narfu.ru/ical/17890.ics'])
  assert.equal(sameGroup([], ev), true)
})

test('список групп с курсами и поиск группы', () => {
  const html = '<h3>1 курс</h3><a href="?timetable&group=101">151621 Информатика и вычислительная техника</a><h3>2 курс</h3><a href="?timetable&group=202">151512 Программная инженерия</a>'
  const g = parseGroups(html)
  assert.deepEqual(g.map(x => [x.id, x.number, x.course]), [['101', '151621', 1], ['202', '151512', 2]])
  assert.equal(g[0].title, 'Информатика и вычислительная техника')
  assert.equal(extractGroupID(html, '151512'), '202')
})

test('страница преподавателя: вместо ФИО — группы', () => {
  const e = lecturerEvent({ start: 0, end: 0, subject: 'Физика Поток "151612, 151613"', kind: 'Лекция', teacher: '', room: '', address: '', note: '' })
  assert.equal(e.teacher, 'Группы 151612, 151613')
  assert.equal(e.subject, 'Физика')
  assert.equal(sameLecturer('Иванов И.И.', 'Иванов Иван Иванович'), true)
  assert.equal(sameLecturer('Иванов И.И.', 'Иванов П.И.'), false)
})

test('слияние РУЗ: прошлое не стирается, отменённое будущее исчезает, замены видны', () => {
  const day = 86400000
  const now = Date.now()
  const mk = (t: number, s: string, room = '1') => ({ start: t, end: t + 5700000, subject: s, kind: 'Лекция', teacher: '', room, address: '', note: '' })
  let d = { ...emptySchedule(), source: 1 }
  const past = mk(now - 10 * day, 'Старое')
  const fut1 = mk(now + 2 * day, 'Физика')
  const fut2 = mk(now + 2 * day + 7200000, 'Химия')
  d = mergeRuz(d, [past, fut1, fut2])
  const before = upcomingMap(d)
  d = mergeRuz(d, [mk(now + 2 * day, 'Физика', '2')])
  assert.ok(d.ruzEvents.some(e => e.subject === 'Старое'))
  assert.ok(!d.ruzEvents.some(e => e.subject === 'Химия'))
  const ch = diffChanges(before, upcomingMap(d))
  assert.ok(ch.some(c => c.text.startsWith('Отменена: Химия')))
  assert.ok(ch.some(c => c.text.startsWith('Новая аудитория: Физика')))
})

test('ручное расписание: чётность недель и звонки', () => {
  const d = { ...emptySchedule(), semesterStart: new Date(2026, 8, 1).getTime(), lessons: [
    { id: 'a', subject: 'Матан', kind: 'Лекция', weekday: 1, pair: 2, parity: 1, room: '1', building: '', teacher: '' }
  ] }
  const mon1 = new Date(2026, 7, 31).getTime()    // 1-я неделя (нечётная)
  const mon2 = new Date(2026, 8, 7).getTime()     // 2-я неделя
  assert.equal(academicWeek(d.semesterStart, mon1), 1)
  assert.equal(slotsOn(mon1, d).length, 1)
  assert.equal(slotsOn(mon2, d).length, 0)
  assert.equal(new Date(slotsOn(mon1, d)[0].start).getHours(), 10)
  assert.equal(pairFor(new Date(2026, 9, 5, 14, 30).getTime()), 4)
})

test('ДЗ: срок к следующей паре и прогноз после конца расписания', () => {
  const day = 86400000
  const base = new Date(); base.setHours(10, 10, 0, 0)
  const mk = (t: number) => ({ start: t, end: t + 5700000, subject: 'Физика', kind: 'Практика', teacher: '', room: '5', address: '', note: '' })
  const d = { ...emptySchedule(), source: 1, ruzEvents: [mk(base.getTime() + day), mk(base.getTime() + 8 * day)] }
  const t = targets('Физика', Date.now(), null, d, 3)
  assert.equal(t[0].start, base.getTime() + day)
  assert.equal(t[0].estimated, false)
  assert.equal(t[2].estimated, true)
  const h = { ...newHomework('Физика', 'x', 0), rule: 'pair' as const, anchor: Date.now(), skip: 1 }
  assert.equal(resolve(h, d)!.start, base.getTime() + 8 * day)
  assert.equal(guessKind('Отчёт по лабе'), 'lab')
  assert.equal(guessKind('прочитать параграф 3'), 'reading')
  assert.equal(chip(Date.now() - 2 * day), 'просрочено 2 дн')
})

test('автобусы: разбор времени, коды обмена, правило 150', () => {
  assert.equal(normalizeTimes('7.40, 6:20; 8:15 6:20'), '06:20 07:40 08:15')
  const r = fromShareCode('лови ' + shareCode(default150) + ' 🙂')!
  assert.equal(r.number, '150')
  assert.notEqual(r.id, default150.id)
  const first = new Date(2026, 9, 5, 8, 20).getTime()
  assert.equal(new Date(commute.latestDeparture(first, default150)).getHours(), 7)
})

test('копия с iPhone: binary plist и даты Swift', () => {
  // bplist: { "user.first": "Кирилл", "schedule.v1": <JSON с датой от 2001 года> }
  const json = new TextEncoder().encode(JSON.stringify({ semesterStart: 810000000, source: 1, ruzEvents: [{ start: 812000000, end: 812005700, subject: 'X' }] }))
  const objs: Uint8Array[] = []
  const enc = (s: string) => { const b = [0x60 | s.length]; for (const ch of s) { const c = ch.charCodeAt(0); b.push(c >> 8, c & 255) } return Uint8Array.from(b) }
  const ascii = (s: string) => Uint8Array.from([0x50 | s.length, ...[...s].map(c => c.charCodeAt(0))])
  objs.push(Uint8Array.from([0xd2, 1, 2, 3, 4]))
  objs.push(ascii('user.first'))
  objs.push(ascii('schedule.v1'))
  objs.push(enc('Кирилл'))
  objs.push(Uint8Array.from([0x4f, 0x10, json.length, ...json]))
  const head = new TextEncoder().encode('bplist00')
  const offsets: number[] = []
  let pos = head.length
  for (const o of objs) { offsets.push(pos); pos += o.length }
  const table = Uint8Array.from(offsets.flatMap(o => [o >> 8, o & 255]))
  const trailer = new Uint8Array(32); const dv = new DataView(trailer.buffer)
  dv.setUint8(6, 2); dv.setUint8(7, 1); dv.setBigUint64(8, BigInt(objs.length)); dv.setBigUint64(16, 0n); dv.setBigUint64(24, BigInt(pos))
  const all = new Uint8Array(pos + table.length + 32)
  all.set(head, 0); let p = head.length; for (const o of objs) { all.set(o, p); p += o.length }
  all.set(table, pos); all.set(trailer, pos + table.length)
  const dom = parseBinaryPlist(all) as any
  assert.equal(dom['user.first'], 'Кирилл')
  const conv = convertIOS(dom) as any
  assert.equal(conv['schedule.v1'].semesterStart, (810000000 + 978307200) * 1000)
  assert.equal(conv['schedule.v1'].ruzEvents[0].start, (812000000 + 978307200) * 1000)
})

test('zip для .docx: правильный CRC и сигнатуры', () => {
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686)
  const z = makeZip([['a.txt', 'hi']])
  assert.equal(z[0], 0x50); assert.equal(z[1], 0x4b)
})
