// ttt.narfu.ru — «Расписание СПО» (TANDEM, Laravel Livewire v2). Живые пары там сейчас есть только у колледжа ВШРиМТ (1946xx…).
// REST API нет: открываем страницу, берём livewire_token и wire:initial-data, затем зовём методы компонента main-grid:
// set(<группа>) — неделя с сегодняшним днём, addWeek — следующая. Пары лежат в serverMemo.data.events.
// Бережно к серверу: по одной группе за раз, 3 недели на группу.
import { at } from '../parse.mjs';

const BASE = 'https://ttt.narfu.ru';
const UA = 'Mozilla/5.0 (arktika-app.ru schedule mirror; +https://arktika-app.ru/raspisanie/)';
const WEEKS = 3;

const unescapeHtml = s => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function session() {
  const jar = new Map();
  const keep = r => { for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    async open() {
      const r = await fetch(BASE + '/', { headers: { 'User-Agent': UA, 'Accept-Language': 'ru' }, signal: AbortSignal.timeout(30000) });
      keep(r); const h = await r.text();
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const tok = /livewire_token\s*=\s*'([^']+)'/.exec(h)?.[1];
      const comps = [...h.matchAll(/wire:initial-data="([^"]+)"/g)].map(m => JSON.parse(unescapeHtml(m[1])));
      const comp = comps.find(c => c.fingerprint?.name === 'main-grid') || comps[0];
      if (!tok || !comp) throw new Error('на странице нет компонента расписания');
      return { tok, comp };
    },
    async call({ tok, comp }, method, params = []) {
      const body = JSON.stringify({ fingerprint: comp.fingerprint, serverMemo: comp.serverMemo, updates: [{ type: 'callMethod', payload: { id: Math.random().toString(36).slice(2, 7), method, params } }] });
      const r = await fetch(`${BASE}/livewire/message/${comp.fingerprint.name}`, {
        method: 'POST', body, signal: AbortSignal.timeout(60000),
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'X-Livewire': 'true', 'X-CSRF-TOKEN': tok, Accept: 'text/html, application/xhtml+xml', Cookie: cookie() },
      });
      keep(r);
      if (!r.ok) throw new Error(`${method}: HTTP ${r.status}`);
      const j = await r.json();
      for (const [k, v] of Object.entries(j.serverMemo || {})) { if (k === 'data') Object.assign(comp.serverMemo.data, v); else comp.serverMemo[k] = v; }
      return comp.serverMemo.data;
    },
  };
}

// события лежат группами («Доп_0» → […]) — собираем все объекты с датой и временем, где бы они ни были
function eventsOf(x, out = []) {
  if (!x || typeof x !== 'object') return out;
  if (typeof x.date === 'string' && typeof x.startTime === 'string') { out.push(x); return out; }
  for (const v of Array.isArray(x) ? x : Object.values(x)) eventsOf(v, out);
  return out;
}
const KIND = { 'лекции': 'Лекция', 'практические занятия': 'Практика', 'лабораторные занятия': 'Лабораторная', 'семинары': 'Семинар', 'экзамены (зачеты)': 'Экзамен', 'консультации': 'Консультация' };
// «414Б414Б» — аудитория в данных ttt продублирована
const room = s => { s = String(s || '').trim(); const h = s.length / 2; return s.length % 2 === 0 && s.slice(0, h) === s.slice(h) ? s.slice(0, h) : s; };
const initials = t => [t.last_name, [t.first_name, t.middle_name].filter(Boolean).map(x => x[0] + '.').join('')].filter(Boolean).join(' ');

export function lessonFromTtt(e) {
  const [d, m, y] = e.date.split('.').map(Number), [h1, m1] = e.startTime.split(':').map(Number), [h2, m2] = String(e.endTime || e.startTime).split(':').map(Number);
  const teachers = Object.values(e.teachers || {}).map(initials).filter(Boolean);
  const sub = /\((\d)\)\s*$/.exec(e.group || '')?.[1] || '';
  return {
    start: at(y, m, d, h1, m1), end: at(y, m, d, h2, m2), subject: String(e.discipline || '').trim(),
    kind: KIND[String(e.groupType || '').toLowerCase().trim()] || 'Занятие', teacher: teachers.join(', '),
    room: room(e.classroom), address: e.address && e.address !== 'Основной' ? e.address : '', note: [e.comment, e.urlOnline].filter(Boolean).join(' '), sub,
  };
}

/** Группы колледжа ВШРиМТ берём из списка РУЗа (там они есть, только пустые) */
export async function collectTtt({ ruzGroups = {}, log = () => {} } = {}) {
  const want = Object.values(ruzGroups).filter(g => g.insts.includes(1036)).map(g => g.number);
  const groups = {}, byGroup = {};
  let failed = 0;
  for (const n of want) {
    try {
      const s = session(), c = await s.open();
      const all = [];
      let d = await s.call(c, 'set', [n]);
      all.push(...eventsOf(d.events));
      for (let w = 1; w < WEEKS; w++) { d = await s.call(c, 'addWeek'); all.push(...eventsOf(d.events)); }
      byGroup[n] = all.filter(e => String(e.group || n).replace(/\(\d\)$/, '') === n).map(lessonFromTtt);
      groups[n] = { insts: [1036] };
    } catch (e) { failed++; if (failed <= 3) log(`ttt ${n}: ${e.message}`); }
  }
  return { groups, byGroup, note: `групп в списке ${want.length}${failed ? `, не открылись ${failed}` : ''}` };
}
