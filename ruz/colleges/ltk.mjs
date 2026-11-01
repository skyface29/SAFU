// Технологический колледж Императора Петра I (бывший ЛТК, narfu.ru/ltk/obrazovatelnaya/raspisanie/).
// Каждую неделю (в пятницу-субботу) выкладывают PDF из Word на все очные группы:
//   «РАСПИСАНИЕ ГРУППЫ 184615 неделя с 02.11.2026 по 08.11.2026», таблица: строки — пары (номер, «08:30-», «10:10»),
//   столбцы — Понедельник…Суббота, ячейка «ПРЕДМЕТ Фамилия И.О. [Фамилия И.О.] ауд.1402[,1201]», пусто — «-------».
// Таблица группы может начаться на одной странице и закончиться на следующей, но строка (пара) не рвётся.
// Файлы кладёт загрузчик в <inbox>/ltk/*.pdf (narfu.ru с серверов GitHub не открывается).
import fs from 'node:fs';
import path from 'node:path';
import { at } from '../parse.mjs';
import { pdfItems, lines, cellText, gridOf, inboxTimes } from './pdf.mjs';

const DAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const HEAD = /РАСПИСАНИЕ\s*ГРУПП[ЫА]?\s*([\d,\s]+?)\s*неделя\s*с\s*(\d{2})\.(\d{2})\.(\d{4})/i;
const TIME = /^(\d{1,2}):(\d{2})\s*-?$/;
const TEACHER = /[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./g;
const KEEP_UPPER = /^(МДК|ПМ|ОП|ОГСЭ|ЕН|ОУД|УП|ПП|СГ|ОДБ|ОДП|БЖД|ЭВМ|ПК|ПО|IT|ИТ|ТРНС|ЛЗУ|1С|РФ|СССР)\b/;
const PROPER = new Map(Object.entries({ 'россии': 'России', 'российской': 'Российской', 'федерации': 'Федерации', 'архангельской': 'Архангельской' }));

/** «ИСТОРИЯ РОССИИ» → «История России»; «МДК.01.01 ДОРОЖНО-СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ» → «МДК.01.01 Дорожно-строительные материалы» */
export function niceSubject(s) {
  const words = s.split(/\s+/).filter(Boolean);
  let first = true;
  return words.map(w => {
    if (/\d/.test(w) || KEEP_UPPER.test(w)) return w;
    const low = w.toLowerCase();
    if (PROPER.has(low)) { first = false; return PROPER.get(low); }
    if (first) { first = false; return low[0].toUpperCase() + low.slice(1); }
    return low;
  }).join(' ');
}

/** Ячейка → пара: предмет до первого «Фамилия И.О.», дальше преподаватели, «ауд.» — аудитории */
export function parseCell(text) {
  let t = text.replace(/\s+/g, ' ').trim();
  if (!t || /^-+$/.test(t)) return null;
  let room = '';
  const ai = t.search(/ауд\.?/i);
  if (ai >= 0) { room = t.slice(ai).replace(/^ауд\.?\s*/i, '').trim(); t = t.slice(0, ai).trim(); }
  if (/^\/?ДО$/i.test(room)) room = 'Дистанционно';
  else if (/^С\s*\/?\s*з(ал)?$/i.test(room)) room = 'Спортзал';
  const teachers = [...t.matchAll(TEACHER)];
  const subjectRaw = teachers.length ? t.slice(0, teachers[0].index).trim() : t;
  const teacher = teachers.map(m => m[0].replace(/\s+/g, ' ').replace(/\.\s/g, '.')).join(', ');
  let kind = 'Занятие', subject = subjectRaw;
  const ex = /^(ЭКЗАМЕН|ЗАЧЕТ|ЗАЧЁТ|КОНСУЛЬТАЦИЯ|ДИФФЕРЕНЦИРОВАННЫЙ ЗАЧЕТ)\s+/i.exec(subject);
  if (ex) { kind = /экзамен/i.test(ex[1]) ? 'Экзамен' : /консульт/i.test(ex[1]) ? 'Консультация' : 'Зачёт'; subject = subject.slice(ex[0].length).replace(/^ПО\s+/i, ''); }
  if (!subject) return null;
  return { subject: niceSubject(subject), kind, teacher, room, address: '', note: '' };
}

/** Весь PDF → { группа: [пары] }. Раскладка по линиям таблицы: строка — между горизонтальными линиями,
 *  ячейка — между вертикальными. Строку без номера пары вверху страницы (хвост строки, разорванной страницей)
 *  приклеиваем к последней строке прошлой страницы. */
export async function parseLtkPdf(file) {
  const pages = await pdfItems(file, { grid: true });
  const tables = [];
  let cur = null, lastRow = null;
  for (const pg of pages) {
    const { bands, free } = gridOf(pg);
    // заголовки «РАСПИСАНИЕ ГРУППЫ …» стоят над таблицей, вне линий
    const heads = lines(free).map(l => ({ y: l.y, m: HEAD.exec(l.text) })).filter(x => x.m);
    const events = [...heads.map(x => ({ y: x.y, head: x.m })), ...bands.map(b => ({ y: b.top, band: b }))].sort((p, q) => q.y - p.y);
    let firstBand = true;
    for (const e of events) {
      if (e.head) {
        const m = e.head;
        cur = { groups: m[1].split(/[,\s]+/).filter(x => /^\d{4,7}$/.test(x)), monday: [+m[4], +m[3], +m[2]], days: null, rows: [] };
        tables.push(cur); lastRow = null; firstBand = false;
        continue;
      }
      if (!cur) continue;
      const b = e.band, texts = b.cells.map(c => pagesText(c.items));
      if (/^пара/i.test(texts[0] || '') && texts.some(t => /понедельник/i.test(t))) {
        // шапка: какой ячейке какой день (по центру ячейки)
        cur.days = b.cells.map((c, i) => DAYS.findIndex(d => texts[i].toLowerCase().includes(d)));
        cur.dayX = b.cells.map(c => (c.x0 + c.x1) / 2);
        firstBand = false;
        continue;
      }
      if (!cur.days) continue;
      const n = /^([1-8])$/.exec((texts[0] || '').trim());
      const times = [...(texts[1] || '').matchAll(/(\d{1,2}):(\d{2})/g)].map(m => [+m[1], +m[2]]);
      if (!n && firstBand && lastRow) {
        // хвост прошлой строки
        b.cells.forEach((c, i) => { if (i < 2 || !texts[i]) return; for (const d of [].concat(dayOfCell(cur, c))) if (d >= 0) lastRow.cells[d] = ((lastRow.cells[d] || '') + ' ' + texts[i]).trim(); });
        if (times.length && lastRow.times.length < 2) lastRow.times.push(...times);
        firstBand = false;
        continue;
      }
      firstBand = false;
      if (!n) continue;
      const row = { n: +n[1], times, cells: {} };
      b.cells.forEach((c, i) => { if (i < 2) return; for (const d of [].concat(dayOfCell(cur, c))) if (d >= 0) row.cells[d] = texts[i]; });
      cur.rows.push(row); lastRow = row;
    }
  }
  const out = {};
  for (const t of tables) {
    const [yy, mm, dd] = t.monday;
    for (const r of t.rows) {
      if (r.times.length < 2) continue;
      for (const [d, text] of Object.entries(r.cells)) {
        const l = parseCell(text); if (!l) continue;
        const day = new Date(Date.UTC(yy, mm - 1, dd + +d));
        const Y = day.getUTCFullYear(), M = day.getUTCMonth() + 1, D = day.getUTCDate();
        const lesson = { start: at(Y, M, D, r.times[0][0], r.times[0][1]), end: at(Y, M, D, r.times[1][0], r.times[1][1]), ...l };
        for (const g of t.groups) (out[g] ||= []).push(lesson);
      }
    }
  }
  return out;
}
// ячейка → день недели по шапке таблицы: тот день, чей центр внутри ячейки (объединённая ячейка — несколько дней)
function dayOfCell(t, c) {
  const ds = t.dayX.map((x, i) => (x >= c.x0 - 1 && x <= c.x1 + 1 ? t.days[i] : -1)).filter(d => d >= 0);
  return ds.length === 1 ? ds[0] : ds.length ? ds : -1;
}
const pagesText = items => cellText(items);

/** <inbox>/ltk/*.pdf → пары всех групп; файлы старше 120 дней не разбираем */
export async function collectLtk({ inbox, now = Date.now() } = {}) {
  const dir = inbox && path.join(inbox, 'ltk');
  if (!dir || !fs.existsSync(dir)) return { groups: {}, byGroup: {}, note: 'папки с PDF нет' };
  const when = inboxTimes(inbox);
  const files = fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f) && now - when('ltk/' + f) < 120 * 864e5).map(f => path.join(dir, f));
  const byGroup = {}, groups = {};
  for (const f of files) {
    const r = await parseLtkPdf(f);
    for (const [g, l] of Object.entries(r)) { (byGroup[g] ||= []).push(...l); groups[g] = { insts: [1001], course: courseOf(g, now) }; }
  }
  return { groups, byGroup, note: `файлов ${files.length}` };
}

// 184615: четвёртая цифра — год набора (6 → 2026), курс = учебный год − набор + 1
export function courseOf(n, now = Date.now()) {
  const d = /^\d{3}(\d)/.exec(n); if (!d) return 0;
  const t = new Date(now), y = t.getUTCFullYear() - (t.getUTCMonth() < 8 ? 1 : 0);
  const c = (y % 10) - +d[1] + 1;
  return c >= 1 && c <= 5 ? c : c + 10 >= 1 && c + 10 <= 5 ? c + 10 : 0;
}
