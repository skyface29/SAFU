// Номера групп из списка РУЗа: группа с буквой или «-N» — отдельная группа (баг #19: 111512 и 111512У в одном расписании)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGroups, groupNumberOf } from '../parse.mjs';

const a = (id, n, t) => `<li><a href="?timetable&group=${id}" class="group">\n <span class="number">${n}</span>\n ${t} </a></li>`;

test('суффиксы номера группы', () => {
  const n = s => groupNumberOf(s)?.number;
  assert.equal(n('111512 Теплоэнергетика'), '111512');
  assert.equal(n('111512У Теплоэнергетика'), '111512У');
  assert.equal(n('143507С Спец. образование'), '143507С');
  assert.equal(n('143507C Спец.'), '143507С');            // латинская C → кириллица
  assert.equal(n('131600-2'), '131600-2');
  assert.equal(n('131600-2026 Что-то'), '131600');        // год, не подгруппа
  assert.equal(n('151621 ВШИТАС (Информационная безопасность)'), '151621');
  assert.equal(n('1.2.2 Аспиранты'), undefined);
  assert.equal(groupNumberOf('121314Д Строительство').d, true);
});

test('111512 и 111512У — две группы, «Д» — вариант', () => {
  const html = '<h3>1 курс</h3>' + [
    a(20287, '111512', 'Теплоэнергетика и теплотехника'), a(20288, '111512У', 'Теплоэнергетика и теплотехника'),
    a(21105, '131600', ''), a(21112, '131600-2', ''), a(1, '121314Д', 'Строительство'), a(2, '121314', 'Строительство'),
  ].join('');
  const g = Object.fromEntries(parseGroups(html).map(x => [x.id, x]));
  assert.equal(g[20287].number, '111512');
  assert.equal(g[20288].number, '111512У');
  assert.equal(g[20288].title, 'Теплоэнергетика и теплотехника');
  assert.equal(g[21112].number, '131600-2');
  assert.equal(g[1].number, '121314'); assert.equal(g[1].variant, 'Д'); assert.equal(g[1].title, 'Строительство');
  assert.equal(g[2].variant, '');
});
