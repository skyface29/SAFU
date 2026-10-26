// Сборщик расписания РУЗ САФУ для arktika-app.ru/raspisanie/.
// Запускается по расписанию в GitHub Actions (.github/workflows/ruz.yml):
//   node ruz/collect.mjs --data ruz-data            — обойти РУЗ и обновить данные
//   node ruz/collect.mjs --data ruz-data --import f — влить готовую копию ({at, events:[{e,group}], groups})
// Пишет в папку данных (ветка ruz-data):
//   latest.json            — последнее известное расписание (если РУЗ лежит — остаётся прежним)
//   status.json            — жив ли РУЗ, когда проверяли
//   changes.json           — лента правок за 60 дней
//   snapshots/index.json   — список всех копий; snapshots/*.json.gz — сами копии (для «как было на…»)
//   web/                   — то, что реально грузит сайт (лёгкие файлы, см. buildWeb)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { RUZ, SCHOOLS, DAY, TZ, dayKey, parseTimetable, parseGroups, parseInstitutions } from './parse.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]), a), []));
const DIR = args.data || 'ruz-data';
const NOW = Date.now();
const P = f => path.join(DIR, f);
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(P(f), 'utf8')); } catch { return d; } };
const writeJSON = (f, o) => { fs.mkdirSync(path.dirname(P(f)), { recursive: true }); fs.writeFileSync(P(f), JSON.stringify(o)); };
const log = (...a) => console.log(...a);
const summary = [];

// ---------- сколько хранить ----------
// Каждая версия ~0,5 МБ, а у GitHub предел ~1 ГБ на репозиторий и 1 ГБ на сайт, поэтому:
//  • все версии за последние ALL_DAYS дней («как было утром / вчера / на прошлой неделе»)
//  • дальше — одна версия в день (последняя за день) до DAILY_DAYS дней
//  • ещё старше — удаляются. Само прошлое расписание при этом не теряется: оно лежит в текущей копии (latest.json)
//    за последние KEEP_LESSONS дней.
const ALL_DAYS = 10, DAILY_DAYS = 60, KEEP_LESSONS = 200;
function prune(idx) {
  const keep = new Set(), lastOfDay = new Map();
  for (const s of idx) {
    const age = NOW - s.at;
    if (age <= ALL_DAYS * DAY) keep.add(s.f);
    else if (age <= DAILY_DAYS * DAY) { const k = Math.floor((s.at + TZ) / DAY), o = lastOfDay.get(k); if (!o || s.at > o.at) lastOfDay.set(k, s); }
  }
  for (const s of lastOfDay.values()) keep.add(s.f);
  const out = idx.filter(s => keep.has(s.f));
  let files = []; try { files = fs.readdirSync(P('snapshots')); } catch {}
  for (const f of files) if (f.endsWith('.json.gz') && !keep.has(f)) fs.unlinkSync(P('snapshots/' + f));
  return out;
}

// ---------- компактный формат (общий с сайтом) ----------
// {v:2, at, base, S:[строки], G:[[номер, [школы], курс, название, id]],
//  L:[[старт(мин от base), длит, предмет, вид, препод, ауд, адрес, поток, подгруппа, ...индексы групп]]}
// v:1 (до 26.10) — без подгруппы, группы с 8-го места
const streamOf = n => { const m = /Поток\s*"([^"]*)"/.exec(n || ''); return m ? m[1] : ''; };
// подгруппа: РУЗ пишет её в примечании («Подгруппа 151318_2»), у физкультуры — в аудитории или адресе («подгр.1»)
const SUB_ROOM = /\s*(\d)\s*подгрупп[а-яё]*/i, SUB_ADDR = /\s*,?\s*подгр(?:уппа)?\.?\s*(\d+)\s*/i;
function subOf(e) {
  const m = /Подгруппа\s+(.+?)\s*(?:-->|$)/i.exec(String(e.note || ''));
  if (m) return m[1];
  const r = SUB_ROOM.exec(e.room || '') || SUB_ADDR.exec(e.room || '') || SUB_ADDR.exec(e.address || '');
  return r ? r[1] : (e.sub || '');
}
const dropSub = (s, re) => String(s || '').replace(re, ' ').replace(/\s*,\s*,/g, ',').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
const clean = s => String(s || '').replace(/\s*(-->|→)+\s*/g, ' ').trim().replace(/^,+|,+$/g, '').trim();
const lessonKey = l => [l.start, l.end, l.subject, l.kind, l.teacher, l.room, l.address, l.stream, l.sub].join('|');

function pack(groups, byGroup, meta) {
  const S = [], SI = new Map(), s = x => { x = clean(x); if (!SI.has(x)) { SI.set(x, S.length); S.push(x); } return SI.get(x); };
  const nums = [...new Set([...Object.keys(byGroup).filter(n => byGroup[n].length)])].sort();
  const G = nums.map(n => { const g = groups[n] || {}; return [n, g.insts || [], g.course || 0, g.title || '', g.id || '']; });
  const gi = new Map(nums.map((n, i) => [n, i]));
  const L = new Map();
  for (const n of nums) for (const l of byGroup[n]) {
    const k = lessonKey(l);
    if (!L.has(k)) L.set(k, { l, g: new Set() });
    L.get(k).g.add(gi.get(n));
  }
  // пары старше KEEP_LESSONS дней из текущей копии убираем (прошлые недели семестра при этом остаются)
  const rows = [...L.values()].filter(x => x.l.start > NOW - KEEP_LESSONS * DAY)
    .sort((a, b) => a.l.start - b.l.start || (a.l.subject < b.l.subject ? -1 : 1));
  const base = rows.length ? Math.floor(rows[0].l.start / 6e4) : Math.floor(NOW / 6e4);
  return {
    v: 2, ...meta, base, schools: SCHOOLS, S, G,
    L: rows.map(({ l, g }) => [Math.round(l.start / 6e4) - base, Math.round((l.end - l.start) / 6e4), s(l.subject), s(l.kind), s(l.teacher), s(l.room), s(l.address), s(l.stream), s(l.sub), ...[...g].sort((a, b) => a - b)]),
  };
}
function unpack(d) {
  const groups = {}, byGroup = {};
  if (!d || !d.L) return { groups, byGroup };
  d.G.forEach(([n, insts, course, title, id]) => { groups[n] = { number: n, insts, course, title, id }; byGroup[n] = []; });
  for (const r of d.L) {
    const start = (d.base + r[0]) * 6e4;
    const v2 = d.v >= 2;
    let l = { start, end: start + r[1] * 6e4, subject: d.S[r[2]], kind: d.S[r[3]], teacher: d.S[r[4]], room: d.S[r[5]], address: d.S[r[6]], stream: d.S[r[7]], sub: v2 ? d.S[r[8]] : '' };
    l = norm(l);   // старые строки (и группы, которые в этот раз не открылись): «подгр.1» из адреса → подгруппа
    for (const g of r.slice(v2 ? 9 : 8)) byGroup[d.G[g][0]].push(l);
  }
  return { groups, byGroup };
}
const norm = e => ({ start: e.start, end: e.end, subject: clean(e.subject), kind: clean(e.kind) || 'Занятие', teacher: clean(e.teacher),
  room: clean(dropSub(dropSub(e.room, SUB_ROOM), SUB_ADDR)), address: clean(dropSub(e.address, SUB_ADDR)),
  stream: clean(streamOf(e.note) || e.stream), sub: clean(subOf(e)) });
const dedupe = list => { const m = new Map(); for (const l of list) m.set(lessonKey(l), l); return [...m.values()].sort((a, b) => a.start - b.start); };

// ---------- сеть ----------
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (arktika-app.ru schedule mirror; +https://arktika-app.ru/raspisanie/)', 'Accept-Language': 'ru' }, signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      if (r.ok && t) return t;
      throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === tries - 1) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

async function scan() {
  let insts = SCHOOLS.map(s => s[0]);
  try { const found = parseInstitutions(await get(RUZ)); if (found.length) insts = [...new Set([...insts, ...found])]; } catch (e) { log('главная РУЗ не открылась:', e.message); }
  const groups = {};
  let listsOk = 0;
  for (const inst of insts) {
    try {
      const list = parseGroups(await get(`${RUZ}?groups&institution=${inst}`));
      if (list.length) listsOk++;
      for (const g of list) {
        // один номер в РУЗе бывает у нескольких записей: очная и «Д» — разные группы, остальные дубли сливаем
        const key = g.variant ? `${g.number} ${g.variant}` : g.number;
        const old = groups[key];
        if (old) { if (!old.insts.includes(inst)) old.insts.push(inst); if (!old.ids.includes(g.id)) old.ids.push(g.id); if (!old.title && g.title) old.title = g.title; }
        else groups[key] = { number: key, ids: [g.id], title: g.title, course: g.course, insts: [inst] };
      }
    } catch (e) { log(`школа ${inst}: список групп не получен —`, e.message); }
  }
  const all = Object.values(groups);
  log(`школ со списком групп: ${listsOk}/${insts.length}, групп: ${all.length}`);
  let ok = 0, failed = 0, events = 0;
  const byGroup = {}, fetched = new Set();
  await pool(all, 3, async g => {   // 3 страницы одновременно — бережно к РУЗу
    try {
      const ev = [];
      for (const id of g.ids) ev.push(...parseTimetable(await get(`${RUZ}?timetable&group=${id}`, 2)).map(norm));
      if (g.ids.length > 1) {
        // одна и та же пара с разных записей РУЗ бывает с адресом и без — оставляем полную
        const best = new Map();
        for (const l of ev) {
          const k = [l.start, l.subject, l.kind, l.teacher, l.room, l.sub].join('|'), o = best.get(k);
          if (!o || (l.address || '').length > (o.address || '').length) best.set(k, l);
        }
        ev.length = 0; ev.push(...best.values());
      }
      g.ids.sort(); g.id = g.ids.join(',');
      byGroup[g.number] = dedupe(ev); fetched.add(g.number); ok++; events += ev.length;
    } catch { failed++; }
  });
  log(`страниц групп: ${ok} ок, ${failed} с ошибкой, пар: ${events}`);
  return { groups, byGroup, fetched, ok, failed, total: all.length, events };
}

// ---------- слияние: новое заменяет только те дни, что РУЗ сейчас показывает ----------
// cov — какие дни РУЗ уже показывал для группы. Правками считаем только изменения внутри старого окна:
// новая неделя, которую РУЗ только что открыл, — это не правка.
const wk = k => [k - ((k + 3) % 7), k + (6 - ((k + 3) % 7))];
function coverageOf(list) {
  const full = list.filter(l => l.teacher || l.room);   // пары из iCal без деталей окна не задают
  const src = full.length ? full : list;
  if (!src.length) return null;
  return [wk(dayKey(Math.min(...src.map(l => l.start))))[0], wk(dayKey(Math.max(...src.map(l => l.start))))[1]];
}
function merge(prev, fresh, prevCov, prevIds) {
  const out = {}, changedDays = {}, cov = { ...prevCov };
  const names = new Set([...Object.keys(prev), ...Object.keys(fresh.byGroup)]);
  for (const n of names) {
    const old = prev[n] || [];
    if (!fresh.fetched.has(n)) { out[n] = old; continue; }
    // набор записей РУЗ у группы поменялся (например, разделили очную и «Д») — это новая точка отсчёта, а не правки
    const rebase = (prevIds[n] !== undefined && fresh.groups[n] && fresh.groups[n].id && prevIds[n] !== fresh.groups[n].id) ||
      (!/ Д$/.test(n) && fresh.groups[n + ' Д'] && prevIds[n + ' Д'] === undefined);   // от группы только что отделили «Д»
    const nw = fresh.byGroup[n] || [];
    const today = dayKey(NOW);
    if (!nw.length) {
      // пустая страница: если раньше были будущие пары — не верим и оставляем как было
      out[n] = old;
      continue;
    }
    // РУЗ показывает недели целиком — окно от начала первой до конца последней недели
    const [wlo] = wk(dayKey(Math.min(...nw.map(l => l.start)))), [, whi] = wk(dayKey(Math.max(...nw.map(l => l.start))));
    const keep = old.filter(l => { const k = dayKey(l.start); return k < wlo || k > whi; });
    out[n] = dedupe([...keep, ...nw]);
    const oc = prevCov[n] || coverageOf(old);
    if (oc && !rebase) changedDays[n] = [Math.max(wlo, today, oc[0]), Math.min(whi, oc[1])];
    cov[n] = [wlo, Math.max(whi, oc ? oc[1] : whi)];
  }
  return { byGroup: out, window: changedDays, cov };
}

// ---------- правки ----------
const brief = l => ({ s: l.start, e: l.end, subj: l.subject, kind: l.kind, tch: l.teacher, room: l.room, addr: l.address, sub: l.sub || '' });
function diff(prev, next, window) {
  const items = [];
  for (const [n, [lo, hi]] of Object.entries(window)) {
    if (hi < lo) continue;
    const inWin = l => { const k = dayKey(l.start); return k >= lo && k <= hi; };
    const A = (prev[n] || []).filter(inWin), B = (next[n] || []).filter(inWin);
    const bk = new Set(B.map(lessonKey)), ak = new Set(A.map(lessonKey));
    let a = A.filter(l => !bk.has(lessonKey(l))), b = B.filter(l => !ak.has(lessonKey(l)));
    if (!a.length && !b.length) continue;
    const take = (pred, type) => {
      for (const x of [...a]) {
        const j = b.findIndex(y => pred(x, y));
        if (j >= 0) {
          const bx = brief(x), by = brief(b[j]);
          // отличие только в невидимом (поток, примечание) — не правка
          // правка — если поменялось то, что видно студенту: время, предмет, вид, преподаватель, аудитория, подгруппа
          // (текст адреса в РУЗе «плавает» и сам по себе правкой не считается)
          const vis = o => JSON.stringify([o.s, o.e, o.subj, o.kind, o.tch, o.room, o.sub]);
          if (vis(bx) !== vis(by)) items.push({ at: NOW, g: n, t: type, b: bx, a: by });
          b.splice(j, 1); a.splice(a.indexOf(x), 1);
        }
      }
    };
    take((x, y) => x.start === y.start && x.subject === y.subject, 'mod');              // та же пара: другая аудитория/преподаватель/вид
    take((x, y) => dayKey(x.start) === dayKey(y.start) && x.subject === y.subject && x.kind === y.kind, 'move'); // перенос в тот же день
    take((x, y) => x.start === y.start, 'swap');                                        // замена предмета
    for (const x of a) items.push({ at: NOW, g: n, t: 'del', b: brief(x) });
    for (const y of b) items.push({ at: NOW, g: n, t: 'add', a: brief(y) });
  }
  return items;
}

// ---------- лёгкие файлы для сайта ----------
// Чтобы укладываться в трафик GitHub Pages, сайт не тянет всё расписание сразу:
//   web/m.json              — крошечный «манифест»: статус РУЗа, время копии, имена файлов (меняется каждую проверку)
//   web/i.<хэш>.json        — списки школ, групп и преподавателей (для выбора и поиска)
//   web/s<школа>.<хэш>.json — расписание одной школы: 3 недели назад и всё вперёд + правки за 30 дней
// Хэш в имени = содержимое: пока расписание школы не менялось, имя то же и браузер берёт файл из своего кэша.
function buildWeb(d, st) {
  const dir = P('web'); fs.mkdirSync(dir, { recursive: true });
  const GO = d.v >= 2 ? 9 : 8, cut = Math.floor((NOW - 21 * DAY) / 6e4) - d.base;
  const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
  const changes = readJSON('changes.json', { items: [] }).items.filter(x => x.at > NOW - 30 * DAY);
  const keep = new Set(['m.json']), files = {};
  const put = (prefix, body) => { const f = `${prefix}.${hash(body)}.json`; keep.add(f); if (!fs.existsSync(path.join(dir, f))) fs.writeFileSync(path.join(dir, f), body); return f; };
  const insts = [...new Set(d.G.flatMap(g => g[1]))].sort((a, b) => a - b);
  let total = 0;
  for (const inst of insts) {
    const gsel = [], gmap = new Map();
    d.G.forEach((g, i) => { if (g[1].includes(inst)) { gmap.set(i, gsel.length); gsel.push(g.slice(0, 4)); } });
    const S = [], SI = new Map(), s = x => { x = x || ''; if (!SI.has(x)) { SI.set(x, S.length); S.push(x); } return SI.get(x); };
    const L = []; let base = null;
    for (const r of d.L) {
      if (r[0] < cut) continue;
      const gs = r.slice(GO).filter(x => gmap.has(x)).map(x => gmap.get(x)); if (!gs.length) continue;
      if (base === null) base = d.base + r[0];
      const f = r.slice(2, GO).map(k => s(d.S[k])); while (f.length < 7) f.push(s(''));
      L.push([d.base + r[0] - base, r[1], ...f, ...gs]);
    }
    const nums = new Set(gsel.map(g => g[0]));
    const body = JSON.stringify({ v: 2, at: d.at, base: base ?? d.base, S, G: gsel, L, C: changes.filter(x => nums.has(x.g)).slice(0, 2000) });
    files[inst] = put('s' + inst, body); total += zlib.gzipSync(body).length;
  }
  // преподаватели: в каких школах ведут и что (для поиска; само расписание — из файлов школ)
  const T = new Map();
  for (const r of d.L) {
    const names = (d.S[r[4]] || '').split(',').map(x => x.trim()).filter(x => x.length >= 3); if (!names.length) continue;
    const ins = new Set(r.slice(GO).flatMap(x => d.G[x][1]));
    for (const n of names) { if (!T.has(n)) T.set(n, { i: new Set(), s: new Set() }); const t = T.get(n); ins.forEach(x => t.i.add(x)); if (t.s.size < 4) t.s.add(d.S[r[2]]); }
  }
  // списки групп (нужны всем) и преподавателей (только тем, кто ищет преподавателя) — отдельными файлами
  const idx = JSON.stringify({ schools: SCHOOLS.filter(s => insts.includes(s[0])), G: d.G.map(g => g.slice(0, 4)) });
  const tch = JSON.stringify({ T: [...T.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([n, t]) => [n, [...t.i].sort((a, b) => a - b), [...t.s].join(', ')]) });
  const ifile = put('i', idx), tfile = put('t', tch);
  total += zlib.gzipSync(idx).length + zlib.gzipSync(tch).length;
  const snaps = readJSON('snapshots/index.json', []).length;
  fs.writeFileSync(path.join(dir, 'm.json'), JSON.stringify({ v: 3, at: d.at, checked: st.checkedAt, status: st, snaps, i: ifile, t: tfile, s: files }));
  for (const f of fs.readdirSync(dir)) if (!keep.has(f)) fs.unlinkSync(path.join(dir, f));
  return { files: insts.length, kb: Math.round(total / 1024), avg: Math.round(total / 1024 / (insts.length + 1)) };
}

// ---------- основное ----------
// Таймер GitHub часто пропускает запуски, поэтому workflow стучится чаще (раз в 10 минут),
// а сам обход РУЗа делаем не чаще, чем раз в --every минут (по умолчанию 25), если не --force
{
  const st = readJSON('status.json', {});
  // днём — не чаще раза в 25 минут, ночью (00–07 МСК, правок почти нет) — раз в ~2 часа
  const hour = new Date(NOW + TZ).getUTCHours();
  const every = +(args.every || (hour < 7 ? 110 : 25)) * 6e4;
  if (!args.force && !args.import && st.checkedAt && NOW - st.checkedAt < every) {
    log(`РУЗ проверяли ${Math.round((NOW - st.checkedAt) / 6e4)} мин назад — пропускаю`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'changed=false\ndata=false\n');
    process.exit(0);
  }
}
const PARSER = 2;   // поднять, когда меняется разбор страниц РУЗ (parse.mjs)
const prevData = readJSON('latest.json', null);
const prev = unpack(prevData);
const status = readJSON('status.json', { up: null });
let fresh, source;

if (args.import) {
  const src = JSON.parse(fs.readFileSync(args.import, 'utf8'));
  const byGroup = {}, fetched = new Set();
  for (const x of src.events) { (byGroup[x.group] ||= []).push(norm(x.e)); fetched.add(x.group); }
  for (const n in byGroup) byGroup[n] = dedupe(byGroup[n]);
  const groups = { ...prev.groups };
  for (const g of src.groups || []) groups[g.number] = { ...(groups[g.number] || {}), ...g, insts: [...new Set([...(groups[g.number]?.insts || []), ...(g.insts || [])])] };
  fresh = { groups, byGroup, fetched, ok: fetched.size, failed: 0, total: fetched.size, events: src.events.length };
  source = 'import';
  if (src.at) process.env.RUZ_AT = String(src.at);
} else {
  fresh = await scan();
  source = 'ruz';
}

// РУЗ жив? Сравниваем с прошлым разом, чтобы пустой или обрезанный ответ не затёр расписание
const prevOk = status.groupsOk || 0;
const prevFuture = Object.values(prev.byGroup).reduce((s, l) => s + l.filter(x => dayKey(x.start) >= dayKey(NOW)).length, 0);
const freshFuture = Object.values(fresh.byGroup).reduce((s, l) => s + l.filter(x => dayKey(x.start) >= dayKey(NOW)).length, 0);
const up = source === 'import' || (fresh.ok > 0 && fresh.ok >= prevOk * 0.6 && fresh.events > 0 && (prevFuture === 0 || freshFuture >= prevFuture * 0.4));
const reason = up ? '' : fresh.ok === 0 ? 'РУЗ не отвечает' : 'РУЗ отдаёт неполные данные';
log(`РУЗ ${up ? 'работает' : '— ' + reason}: групп ок ${fresh.ok} (было ${prevOk}), будущих пар ${freshFuture} (было ${prevFuture})`);

const newStatus = {
  up, reason, checkedAt: NOW,
  lastOkAt: up ? NOW : status.lastOkAt || null,
  downSince: up ? null : status.downSince || NOW,
  groupsOk: up ? fresh.ok : prevOk, groupsTotal: fresh.total || status.groupsTotal || 0,
};

let dataChanged = false;
if (up) {
  const prevIds = Object.fromEntries(Object.values(prev.groups).map(g => [g.number, g.id || '']));
  const m = merge(prev.byGroup, fresh, (prevData && prevData.cov) || {}, prevIds);
  const groups = { ...prev.groups, ...fresh.groups };
  // при смене формата (v1 → v2: появились подгруппы) сравнивать не с чем — это новая точка отсчёта
  // и при смене разборщика (PARSER) тоже: иначе его же исправления выглядели бы как правки в РУЗе
  const items = prevData && prevData.v >= 2 && prevData.parser === PARSER ? diff(prev.byGroup, m.byGroup, m.window) : [];
  const atTime = +process.env.RUZ_AT || NOW;
  const next = pack(groups, m.byGroup, { at: atTime, checked: NOW });
  next.cov = m.cov; next.parser = PARSER;
  const sig = o => crypto.createHash('sha1').update(JSON.stringify([o.S, o.G, o.L, o.base])).digest('hex');
  const prevSig = prevData ? sig(prevData) : '';
  if (sig(next) !== prevSig) {
    dataChanged = true;
    next.sig = sig(next);
    writeJSON('latest.json', next);
    const d = new Date(atTime + TZ), pad = x => String(x).padStart(2, '0');
    const name = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.json.gz`;
    fs.mkdirSync(P('snapshots'), { recursive: true });
    fs.writeFileSync(P('snapshots/' + name), zlib.gzipSync(JSON.stringify(next), { level: 9 }));
    const idx = readJSON('snapshots/index.json', []);
    idx.push({ f: name, at: atTime, n: next.L.length, g: next.G.length, c: items.length });
    const kept = prune(idx);
    writeJSON('snapshots/index.json', kept);
    if (kept.length < idx.length) summary.push(`Архив: удалено старых версий ${idx.length - kept.length}, осталось ${kept.length}`);
    const ch = readJSON('changes.json', { items: [] });
    const keep = ch.items.filter(x => x.at > NOW - 60 * DAY);
    writeJSON('changes.json', { items: [...items, ...keep].slice(0, 20000) });
    summary.push(`Новая копия ${name}: ${next.L.length} пар, ${next.G.length} групп, правок: ${items.length}`);
    const byG = {}; for (const x of items) byG[x.g] = (byG[x.g] || 0) + 1;
    if (items.length) summary.push('Правки по группам: ' + Object.entries(byG).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([g, c]) => `${g}×${c}`).join(', '));
  } else summary.push('Расписание не изменилось');
}

// status.json коммитим, когда что-то поменялось или раз в 3 часа — чтобы «проверено» на сайте не протухало
// status.json пишем каждый раз: сайт показывает, когда РУЗ проверяли в последний раз
// (коммиты «только проверка» workflow склеивает в один, история не засоряется)
writeJSON('status.json', newStatus);
{
  const d = readJSON('latest.json', null);
  if (d) { const w = buildWeb(d, newStatus); summary.push(`Сайт: ${w.files} файлов школ, ${w.kb} КБ (gzip) на всё; на одну школу в среднем ${w.avg} КБ`); }
}
summary.push(`РУЗ: ${up ? 'работает' : reason}; групп ${fresh.ok}/${fresh.total}`);
const out = process.env.GITHUB_OUTPUT;
if (out) fs.appendFileSync(out, `changed=true\ndata=${dataChanged}\n`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.map(s => '- ' + s).join('\n') + '\n');
log(summary.join('\n'));
