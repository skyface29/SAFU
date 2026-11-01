// Технический колледж филиала САФУ в Северодвинске (narfu.ru/sf/stc/forstud/).
//   • Расписание на семестр — PDF из Excel (A3): группы столбцами (предмет+преподаватель | аудитория), строки — дни × пары 1–7.
//     Ячейка, разделённая чертой пополам: верх — числитель (нечётная неделя), низ — знаменатель (чётная).
//     «1 ПГ» / «2 ПГ» — подгруппа. Перед первой парой: в понедельник «Разговоры о важном», во вторник классный час.
//   • Замены — PDF на каждый учебный день «ДД.ММ.ГГ-O.pdf»: Группа | № пары | Предмет | Преподаватель | Ауд.;
//     «нет» — пару сняли, «По расписанию» — предмет тот же, поменялись преподаватель или аудитория.
// Файлы кладёт загрузчик: <inbox>/sevtk/semester*.pdf и <inbox>/sevtk/zamena/ДД.ММ.ГГ-O.pdf.
import fs from 'node:fs';
import path from 'node:path';
import { at, DAY, TZ } from '../parse.mjs';
import { pdfItems, cellText, gridOf, inboxTimes } from './pdf.mjs';

const DAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
// Звонки (narfu.ru/sf/stc/forstud/call.php)
export const BELLS = [null, [9, 0, 10, 35], [10, 45, 12, 20], [13, 0, 14, 35], [14, 45, 16, 20], [16, 30, 18, 5], [18, 20, 19, 50], [20, 0, 21, 30]];
const PRE = [8, 30, 8, 55];   // «Разговоры о важном» / классный час перед первой парой
// Первый семестр 2026/27: неделя с 31.08.2026 — первая (числитель)
export const TERM = { from: Date.UTC(2026, 7, 31) - TZ, to: Date.UTC(2026, 11, 31) - TZ };
const TEACHER = /[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\.?\s?[А-ЯЁ]\.?(?![а-яё])/g;

const fixInitials = t => t.replace(/\s+([А-ЯЁ])\.?\s?([А-ЯЁ])\.?$/, ' $1.$2.');

/** Текст половины ячейки → пара без времени */
export function parseSevCell(subjText, roomText) {
  let t = subjText.replace(/\s+/g, ' ').trim();
  if (!t || /^[-–—/\s]*$/.test(t)) return null;
  let sub = '';
  const pg = [...t.matchAll(/(\d)\s*ПГ(?![А-Яа-яЁё])/g)];
  if (pg.length === 1) sub = pg[0][1];
  t = t.replace(/\s*(\d)\s*ПГ(?![А-Яа-яЁё])\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const teachers = [...t.matchAll(TEACHER)];
  const subject = (teachers.length ? t.slice(0, teachers[0].index) : t).replace(/[\s/]+$/, '').replace(/^"(.*)"$/, '$1').trim();
  const teacher = teachers.map(m => fixInitials(m[0].trim())).join(', ');
  let room = roomText.replace(/\s+/g, ' ').replace(/\s*\/\s*$/, '').replace(/^\/\s*/, '').trim();
  if (/^с\s*\/\s*з$/i.test(room)) room = 'Спортзал';
  if (!subject) return null;
  const kp = /\s+КПч?$/.exec(subject);
  return { subject: kp ? subject.slice(0, kp.index) : subject, kind: kp ? 'Курсовое проектирование' : 'Занятие', teacher, room, address: '', note: '', sub };
}

/** «Иностранный язык 1 ПГ Иванова Е.А./ Инженерная графика 2 ПГ Филимонова Е.А.» + «405/ 415» — две подгруппы в одной ячейке */
export function splitSlash(subj, room) {
  const rooms = room.split(/\s*\/\s*/).filter(Boolean);
  let parts = subj.split(/\s*\/\s*/).filter(Boolean);
  // без косой черты: «Иностранный язык 1 ПГ Иванова Е.А. Инженерная графика 2 ПГ Филимонова Е.А.» — режем после первого преподавателя
  if (parts.length === 1 && rooms.length === 2) {
    const ts = [...subj.matchAll(TEACHER)];
    if (ts.length === 2 && (subj.match(/\dПГ|\d\s+ПГ/g) || []).length === 2) { const cut = ts[0].index + ts[0][0].length; parts = [subj.slice(0, cut), subj.slice(cut)]; }
  }
  const withTeacher = parts.filter(p => (p.match(TEACHER) || []).length);
  if (parts.length > 1 && withTeacher.length === parts.length) {
    return parts.map((p, i) => parseSevCell(p, rooms[i] ?? rooms[0] ?? '')).filter(Boolean);
  }
  const l = parseSevCell(subj, room); return l ? [l] : [];
}

/** Семестровый PDF → [{ group, day: 0..5, pair: 0..7 (0 — до первой пары), parity: 0 — каждую неделю, 1 — числитель, 2 — знаменатель, lesson }] */
export async function parseSevSemester(file) {
  const pages = await pdfItems(file, { grid: true });
  const out = [];
  let carryDay = -1;
  for (const pg of pages) {
    // строки таблицы — по линиям, что идут почти через всю ширину; черта внутри ячейки (числитель/знаменатель) — короткая
    const cover = new Map();
    for (const l of pg.rules.h) { let k = Math.round(l.y); for (const y of cover.keys()) if (Math.abs(y - l.y) <= 2) { k = y; break; } cover.set(k, (cover.get(k) || 0) + (l.x1 - l.x0)); }
    const maxCover = Math.max(0, ...cover.values());
    const wide = [...cover].filter(([, c]) => c > 0.6 * maxCover).map(([y]) => y).sort((a, b) => b - a);
    const ys = []; for (const y of wide) if (!ys.length || ys.at(-1) - y > 3) ys.push(y);
    const { bands } = gridOf({ ...pg, rules: { h: ys.map(y => ({ y, x0: 0, x1: pg.w })), v: pg.rules.v } });
    // шапка с номерами групп
    const head = bands.find(b => b.cells.filter(c => /^\d{6}$/.test(cellText(c.items))).length >= 2);
    if (!head) continue;
    // столбцы групп: от вертикальной линии слева от номера до начала следующей группы (в шапке линии между группами иногда нет)
    const vxs = [...new Set(pg.rules.v.map(l => Math.round(l.x)))].sort((a, b) => a - b);
    const nums = head.cells.flatMap(c => c.items).filter(it => /^\d{6}$/.test(it.s.trim())).sort((a, b) => a.x - b.x);
    const groups = nums.map(it => ({ n: it.s.trim(), x0: vxs.filter(x => x <= it.x - 1).at(-1) ?? it.x - 20 }));
    groups.forEach((g, i) => { g.x1 = groups[i + 1]?.x0 ?? head.cells.find(c => c.items.some(it => it.s.trim() === g.n))?.x1 ?? g.x0 + 70; });
    for (const g of groups) g.split = vxs.filter(x => x > g.x0 + 10 && x < g.x1 - 4).at(-1) ?? g.x1;   // граница «предмет | аудитория»
    const inGroups = x => groups.some(g => x >= g.x0 - 1 && x <= g.x1 + 1);
    const dayLabels = pg.items.filter(it => !inGroups(it.x) && DAYS.includes(it.s.trim().toLowerCase())).map(it => ({ y: it.y, d: DAYS.indexOf(it.s.trim().toLowerCase()) }));
    const rows = [];
    for (const b of bands) {
      if (b === head) continue;
      const other = b.cells.filter(c => !inGroups((c.x0 + c.x1) / 2));
      const num = other.map(c => cellText(c.items).trim()).find(s => /^[1-7]$/.test(s));
      const texts = groups.map(g => pg.items.filter(it => it.x + 1 >= g.x0 && it.x + 1 <= g.x1 && it.y + 2 <= b.top && it.y + 2 >= b.bottom));
      const isPre = !num && texts.some(t => /разговоры о важном|классный час/i.test(cellText(t)));
      if (!num && !isPre) continue;
      rows.push({ b, pair: num ? +num : 0, texts });
    }
    // дни: новый день — когда номер пары не растёт; подпись дня — внутри блока по высоте
    let blocks = [], cur = null;
    for (const r of rows) { if (!cur || r.pair <= cur.at(-1).pair) { cur = [r]; blocks.push(cur); } else cur.push(r); }
    blocks.forEach((bl, i) => {
      const top = bl[0].b.top, bottom = bl.at(-1).b.bottom;
      const lab = dayLabels.find(l => l.y <= top + 2 && l.y >= bottom - 2);
      bl.day = lab ? lab.d : i === 0 && bl[0].pair > 1 && carryDay >= 0 ? carryDay : null;
    });
    for (let i = 0; i < blocks.length; i++) if (blocks[i].day == null) blocks[i].day = i > 0 && blocks[i - 1].day != null ? blocks[i - 1].day + 1 : null;
    for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].day == null && blocks[i + 1]?.day != null) blocks[i].day = blocks[i + 1].day - 1;
    if (blocks.length) carryDay = blocks.at(-1).day;
    for (const bl of blocks) {
      if (bl.day == null || bl.day < 0 || bl.day > 5) continue;
      for (const r of bl) groups.forEach((g, gi) => {
        // черта внутри ячейки группы → две половины
        const cut = pg.rules.h.find(l => l.y < r.b.top - 3 && l.y > r.b.bottom + 3 && l.x0 < g.split - 2 && l.x1 > g.x0 + 2);
        const halves = cut ? [[1, it => it.y + 2 > cut.y], [2, it => it.y + 2 <= cut.y]] : [[0, () => true]];
        for (const [parity, pick] of halves) {
          const items = r.texts[gi].filter(pick);
          const subj = cellText(items.filter(it => it.x + 1 < g.split)), room = cellText(items.filter(it => it.x + 1 >= g.split));
          for (const l of splitSlash(subj, room)) out.push({ group: g.n, day: bl.day, pair: r.pair, parity, lesson: l });
        }
      });
    }
  }
  return out;
}

/** Замены за день → [{ group, pair, sub, lesson|null (снято), keepSubject }] */
export async function parseSevZamena(file) {
  const pages = await pdfItems(file, { grid: true });
  const out = [];
  let group = '', pair = 0;
  for (const pg of pages) {
    const { bands } = gridOf(pg);
    for (const b of bands) {
      if (b.cells.length !== 5) continue;
      const [g, p, s, t, r] = b.cells.map(c => cellText(c.items).trim());
      if (/^группа$/i.test(g)) continue;
      if (/^\d{6}$/.test(g)) group = g;
      if (!group) continue;
      const pm = /^(\d)(?:\s*-\s*(\d))?$/.exec(p);
      if (pm) pair = pm[2] && +pm[2] === +pm[1] + 1 && +pm[1] % 2 === 1 ? +pm[2] / 2 : +pm[1];   // «1-2» — часы, это 1-я пара
      if (!pair) continue;
      // «1 ПГ – нет 2 ПГ – Иностранный язык» в одной ячейке: преподаватель и аудитория — только у той подгруппы, где пара есть
      const segs = s.split(/(?=\d\s*ПГ\s*[–—-])/).map(x => x.trim()).filter(Boolean);
      const ts = t.split(/(?<=[А-ЯЁ]{2})\s+(?=[А-ЯЁ])/).filter(Boolean), rs = r.split(/\s+/).filter(Boolean);
      let k = 0;
      for (const seg of segs) {
        const sm = /^(\d)\s*ПГ\s*[–—-]\s*(.*)$/.exec(seg);
        const sub = sm ? sm[1] : '', subj = (sm ? sm[2] : seg).trim();
        if (/^нет$/i.test(subj)) { out.push({ group, pair, sub, lesson: null }); continue; }
        const teacher = segs.length > 1 ? ts[k] || '' : t, room = segs.length > 1 ? rs[k] || '' : r; k++;
        out.push({ group, pair, sub, keepSubject: /^по расписанию$/i.test(subj), lesson: { subject: subj, kind: 'Занятие', teacher: fixInitials(teacher), room: /^с\s*\/\s*з$/i.test(room) ? 'Спортзал' : room, address: '', note: 'Замена', sub } });
      }
    }
  }
  return out;
}

const weekNo = t => Math.floor((t - TERM.from) / (7 * DAY)) + 1;
const timeOf = (y, m, d, pair) => { const b = pair ? BELLS[pair] : PRE; return [at(y, m, d, b[0], b[1]), at(y, m, d, b[2], b[3])]; };

/** Семестр + замены → пары по датам от from до конца семестра */
export function expandSev(semester, zamenas, from) {
  const byGroup = {};
  const start = Math.max(TERM.from, Math.floor((from + TZ) / DAY) * DAY - TZ);
  for (let t = start; t <= TERM.to; t += DAY) {
    const d = new Date(t + TZ), wd = (d.getUTCDay() + 6) % 7;
    if (wd > 5) continue;
    const odd = weekNo(t) % 2 === 1, Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1, D = d.getUTCDate();
    const key = `${String(D).padStart(2, '0')}.${String(M).padStart(2, '0')}.${String(Y % 100).padStart(2, '0')}`;
    const zam = zamenas[key] || [];
    const day = semester.filter(x => x.day === wd && (x.parity === 0 || (x.parity === 1) === odd));
    const groups = new Set([...day.map(x => x.group), ...zam.map(z => z.group)]);
    for (const g of groups) {
      let list = day.filter(x => x.group === g).map(x => ({ pair: x.pair, ...x.lesson }));
      for (const z of zam.filter(z => z.group === g)) {
        const hit = l => l.pair === z.pair && (!z.sub || !l.sub || l.sub === z.sub);
        const old = list.filter(hit);
        list = list.filter(l => !hit(l));
        if (z.lesson) list.push({ pair: z.pair, ...z.lesson, subject: z.keepSubject ? (old[0]?.subject || 'По расписанию') : z.lesson.subject, kind: old[0]?.kind || 'Занятие' });
      }
      for (const l of list) { const [s, e] = timeOf(Y, M, D, l.pair); const { pair, ...rest } = l; (byGroup[g] ||= []).push({ start: s, end: e, ...rest }); }
    }
  }
  return byGroup;
}

export async function collectSevTk({ inbox, now = Date.now() } = {}) {
  const dir = inbox && path.join(inbox, 'sevtk');
  if (!dir || !fs.existsSync(dir)) return { groups: {}, byGroup: {}, note: 'папки с PDF нет' };
  const when = inboxTimes(inbox);
  const sem = fs.readdirSync(dir).filter(f => /^semester.*\.pdf$/i.test(f)).sort((a, b) => when('sevtk/' + b) - when('sevtk/' + a)).map(f => path.join(dir, f))[0];
  if (!sem) return { groups: {}, byGroup: {}, note: 'нет семестрового PDF' };
  const semester = await parseSevSemester(sem);
  const zdir = path.join(dir, 'zamena'), zamenas = {};
  if (fs.existsSync(zdir)) for (const f of fs.readdirSync(zdir)) {
    const m = /^(\d{2}\.\d{2}\.\d{2})-O\.pdf$/i.exec(f); if (!m) continue;
    try { zamenas[m[1]] = await parseSevZamena(path.join(zdir, f)); } catch { /* битый файл — без замен этого дня */ }
  }
  const byGroup = expandSev(semester, zamenas, now - 14 * DAY);
  const groups = Object.fromEntries([...new Set(semester.map(x => x.group))].map(g => [g, { insts: [23] }]));
  return { groups, byGroup, note: `уроков в сетке ${semester.length}, дней с заменами ${Object.keys(zamenas).length}` };
}
