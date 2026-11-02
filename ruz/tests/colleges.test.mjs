// Разбор расписаний колледжей на настоящих файлах (скачаны с narfu.ru 01.11.2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLtkPdf, parseCell, niceSubject, courseOf } from '../colleges/ltk.mjs';
import { parseSevSemester, parseSevZamena, expandSev, parseSevCell } from '../colleges/sevtk.mjs';
import { lessonFromTtt } from '../colleges/ttt.mjs';
import { isSpoGroup } from '../parse.mjs';

const F = n => new URL('./fixtures/' + n, import.meta.url).pathname;
const msk = t => new Date(t + 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

test('ТК Петра I: недельный PDF — все группы, время, преподаватели, аудитории', async () => {
  const r = await parseLtkPdf(F('ltk-02.11.pdf'));
  assert.ok(Object.keys(r).length >= 50);
  const g = r['184615'].sort((a, b) => a.start - b.start);
  assert.equal(g.length, 16);
  assert.deepEqual([msk(g[0].start), msk(g[0].end), g[0].subject, g[0].teacher, g[0].room], ['2026-11-02 08:30', '2026-11-02 10:10', 'Русский язык', 'Круглякова В.Е.', '1402']);
  const foreign = g.find(l => l.subject === 'Иностранный язык');
  assert.equal(foreign.teacher, 'Елсакова Н.Н., Власова С.В.');
  assert.equal(foreign.room, '1405,1201');
  // 04.11 — праздник, пар нет
  assert.ok(!g.some(l => msk(l.start).startsWith('2026-11-04')));
  // строка таблицы, разорванная страницей, склеена
  assert.ok(r['184418'].some(l => l.subject === 'МДК.04.01 Внедрение и поддержка компьютерных систем' && l.teacher === 'Кобенко А.В.'));
  // объединённые группы «184418,184424»
  assert.equal(r['184418'].length, r['184424'].length);
});

test('ТК Петра I: ячейка и предмет', () => {
  assert.equal(niceSubject('ИСТОРИЯ РОССИИ'), 'История России');
  assert.equal(niceSubject('МДК.01.01 ДОРОЖНО-СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ'), 'МДК.01.01 Дорожно-строительные материалы');
  assert.equal(parseCell('-------'), null);
  assert.deepEqual(parseCell('ФИЗИЧЕСКАЯ КУЛЬТУРА Прозорова Н.А. ауд.С зал'), { subject: 'Физическая культура', kind: 'Занятие', teacher: 'Прозорова Н.А.', room: 'Спортзал', address: '', note: '' });
  assert.equal(parseCell('ЭКЗАМЕН МДК.01.01 ЭКОНОМИКА Иванова И.И. ауд.1201').kind, 'Экзамен');
  assert.equal(courseOf('184615', Date.UTC(2026, 10, 1)), 1);
  assert.equal(courseOf('184315', Date.UTC(2026, 10, 1)), 4);
});

test('ТК Северодвинска: семестр — дни, пары, числитель/знаменатель, подгруппы', async () => {
  const s = await parseSevSemester(F('sevtk-semester.pdf'));
  assert.equal(new Set(s.map(x => x.group)).size, 32);
  const g = s.filter(x => x.group === '524502');
  const mon1 = g.filter(x => x.day === 0 && x.pair === 1);
  assert.deepEqual(mon1.map(x => [x.parity, x.lesson.subject, x.lesson.sub]), [[1, 'Осн. Электроники и электротехники', '2'], [2, 'Инж.графика', '2']]);
  const tue3 = g.filter(x => x.day === 1 && x.pair === 3).map(x => [x.lesson.subject, x.lesson.teacher, x.lesson.room, x.lesson.sub]);
  assert.deepEqual(tue3, [['Иностранный язык', 'Иванова Е.А.', '405', '1'], ['Инженерная графика', 'Филимонова Е.А.', '415', '2']]);
  assert.ok(s.some(x => x.group === '524601' && x.day === 0 && x.pair === 0 && x.lesson.subject === 'Разговоры о важном'));
  assert.ok(g.some(x => x.day === 4));   // пятница — со второй страницы
  assert.equal(parseSevCell('Проект.зданий и сооруж. КПч Чавлытко А.Е.', '406').kind, 'Курсовое проектирование');
});

test('ТК Северодвинска: замены — «1-2» это первая пара, «нет» снимает пару подгруппы', async () => {
  const z = await parseSevZamena(F('sevtk-31.10.26-O.pdf'));
  assert.deepEqual(z.filter(x => x.group === '524505').map(x => [x.pair, x.sub, x.lesson && x.lesson.subject]), [[1, '1', null], [1, '2', 'Иностранный язык'], [2, '1', 'Иностранный язык'], [2, '2', null]]);
  const s = await parseSevSemester(F('sevtk-semester.pdf'));
  const days = expandSev(s, { '31.10.26': z }, Date.UTC(2026, 9, 26));
  const sat = days['524505'].filter(l => msk(l.start).startsWith('2026-10-31'));
  assert.deepEqual(sat.map(l => [msk(l.start).slice(11), l.sub, l.note]), [['09:00', '2', 'Замена'], ['10:45', '1', 'Замена']]);
});

test('ttt.narfu.ru: событие → пара', () => {
  const l = lessonFromTtt({ date: '02.11.2026', startTime: '10:45', endTime: '12:20', discipline: 'Иностранный язык', groupType: 'Практические занятия', address: 'Основной', classroom: '414Б414Б', teachers: { a: { last_name: 'Настеко', first_name: 'Анастасия', middle_name: 'Анатольевна' } }, group: '194602' });
  assert.deepEqual([msk(l.start), msk(l.end), l.kind, l.teacher, l.room, l.address], ['2026-11-02 10:45', '2026-11-02 12:20', 'Практика', 'Настеко А.А.', '414Б', '']);
  assert.ok(isSpoGroup('194602') && isSpoGroup('524601') && !isSpoGroup('151621'));
});
