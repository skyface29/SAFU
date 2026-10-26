// Разбор страниц ruz.narfu.ru — тот же алгоритм, что в приложении «Арктика» (App: tn / qc / nt.parse),
// чтобы сайт и приложение видели расписание одинаково.

export const RUZ = 'https://ruz.narfu.ru/';
export const SCHOOLS = [
  [3, 'ВШИТАС', 'Высшая школа информационных технологий и автоматизированных систем', 'ИТ, программирование, автоматизация, связь'],
  [15, 'ВИШ', 'Высшая инженерная школа', 'Строительство, транспорт, машиностроение'],
  [1, 'ВШЕНиТ', 'Высшая школа естественных наук и технологий', 'Биология, химия, география, экология'],
  [4, 'ВШСГНиМК', 'Высшая школа социально-гуманитарных наук и международной коммуникации', 'Филология, история, языки, журналистика'],
  [28, 'ВШЭУиП', 'Высшая школа экономики, управления и права', 'Экономика, менеджмент, юриспруденция'],
  [12, 'ВШЭНиГ', 'Высшая школа энергетики, нефти и газа', 'Энергетика, нефтегазовое дело'],
  [13, 'ВШППиФК', 'Высшая школа педагогики, психологии и физической культуры', 'Психология, педагогика, спорт'],
  [36, 'ВШРиМТ', 'Высшая школа рыболовства и морских технологий', 'Рыболовство, водные биоресурсы, морские технологии'],
  [26, 'Севмашвтуз', 'Институт судостроения и морской арктической техники (г. Северодвинск)', 'Судостроение, морская и арктическая техника'],
  [6, 'ГИ Северодвинск', 'Гуманитарный институт (г. Северодвинск)', 'Педагогика, филология, гуманитарные науки'],
  [23, 'ТК Северодвинск', 'Технический колледж (г. Северодвинск)', 'Среднее профессиональное образование'],
  [33, 'НПК', 'Управление подготовки и аттестации НПК', 'Аспирантура, подготовка кадров высшей квалификации'],
  [35, 'Наука, Северодвинск', 'Научный отдел филиала САФУ в г. Северодвинске', 'Аспирантура филиала'],
];

// Время в РУЗ — архангельское (UTC+3, без перехода)
export const TZ = 3 * 3600e3, DAY = 864e5;
export const at = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h, mi) - TZ;
export const dayKey = ms => Math.floor((ms + TZ) / DAY);

const Re = s => s.replace(/\s+/g, ' ').trim();
const ENT = { '&nbsp;': ' ', '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&laquo;': '«', '&raquo;': '»', '&ndash;': '–', '&mdash;': '—', '&apos;': "'" };
function Wt(s) {
  for (const [k, v] of Object.entries(ENT)) s = s.split(k).join(v);
  return s.replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(+n); } catch { return m; } });
}
const si = s => Re(Wt(s.replace(/<[^>]+>/g, ' ')));
function toText(h) {
  return Wt(h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|tr|h[1-6]|ul|table|section)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n');
}
function trimPairNo(s) {
  let t = s.trim();
  for (;;) {
    const m = /\s+[1-8]$/.exec(t); if (!m) break;
    const head = t.slice(0, m.index);
    if (head.endsWith('.') || head.endsWith(',') || head.toLowerCase().endsWith('корп')) break;
    t = head.trim();
  }
  return t;
}

const KINDS = ['Лабораторная работа', 'Лабораторные работы', 'Лабораторные занятия', 'Лабораторное занятие', 'Практическое занятие', 'Практические занятия', 'Дифференцированный зачет', 'Зачет с оценкой', 'Курсовое проектирование', 'Контрольная работа', 'Консультация', 'Экзамен', 'Семинар', 'Лекции', 'Лекция', 'Зачет', 'Зачёт'];
const MARKERS = ['ссылка на курс', 'курс лекций', 'http', 'подгруппа', 'поток ', 'онлайн-курс', 'ссылка', 'платформе sakai'];
const shortKind = k => { const l = k.toLowerCase(); return l.startsWith('лекц') ? 'Лекция' : l.startsWith('практ') ? 'Практика' : l.startsWith('лаб') ? 'Лабораторная' : k; };
function parseLocation(s) {
  const t = Re(s), i = t.indexOf('ауд.');
  if (i < 0) return { room: '', address: t };
  const r = t.slice(i + 4).trim(), c = r.indexOf(',');
  return c >= 0 ? { room: r.slice(0, c).trim(), address: r.slice(c + 1).trim() } : { room: r, address: '' };
}
function cleanSubject(s) {
  const t = Re(s), l = t.toLowerCase(); let n = -1;
  for (const m of MARKERS) { const i = l.indexOf(m); if (i >= 0 && (n < 0 || i < n)) n = i; }
  return n < 0 ? { subject: t, extra: '' } : { subject: t.slice(0, n).replace(/^[ ,;:\-–—]+|[ ,;:\-–—]+$/g, ''), extra: Re(t.slice(n)) };
}
function parseLesson(src) {
  const o = { kind: 'Занятие', subject: '', teacher: '', room: '', address: '', note: '' };
  let s = Re(src);
  for (const k of KINDS) if (s.toLowerCase().startsWith(k.toLowerCase())) { o.kind = shortKind(k); s = s.slice(k.length).trim(); break; }
  const a = s.indexOf('ауд.');
  if (a >= 0) { const l = parseLocation(s.slice(a)); o.room = l.room; o.address = l.address; s = s.slice(0, a).trim(); }
  const p = [...s.matchAll(/\(([^()]*)\)/g)].reverse().find(m => /[А-ЯЁ]\./.test(m[1]));
  if (p && p.index !== undefined) { o.teacher = Re(p[1]); o.subject = Re(s.slice(0, p.index)); o.note = Re(s.slice(p.index + p[0].length)); }
  else o.subject = s;
  const c = cleanSubject(o.subject); o.subject = c.subject;
  if (c.extra) o.note = Re(c.extra + ' ' + o.note);
  return o;
}

// Страница группы → пары
export function parseTimetable(html) {
  let h = html;
  const s = /понедельник|вторник|среда|четверг|пятница|суббота/i.exec(html);
  if (s) h = html.slice(Math.max(0, s.index - 1500));
  const t = toText(h), out = [];
  const days = [...t.matchAll(/(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье),?\s*(\d{2})\.(\d{2})\.(\d{4})/gi)];
  days.forEach((d, di) => {
    const a = d.index + d[0].length, b = di + 1 < days.length ? days[di + 1].index : t.length;
    if (b <= a) return;
    const chunk = t.slice(a, b), dd = +d[2] || 1, mm = +d[3] || 1, yy = +d[4] || 2026;
    // Пары делим по времени «ЧЧ:ММ–ЧЧ:ММ». Номер пары перед временем бывает не всегда, поэтому на него не опираемся:
    // иначе следующая пара без номера прилипала к адресу предыдущей, а цифра из адреса («корп. 1») съедалась как номер.
    // Номер следующей пары, если он есть, остаётся в конце текста и срезается trimPairNo.
    const pairs = [...chunk.matchAll(/(?:^|\s)()(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})(?=\s|$)/g)];
    pairs.forEach((p, pi) => {
      const x = p.index + p[0].length, y = pi + 1 < pairs.length ? pairs[pi + 1].index : chunk.length;
      if (y <= x) return;
      const body = trimPairNo(Re(chunk.slice(x, y).replace(/\n/g, ' ')));
      if (body.length <= 2) return;
      const l = parseLesson(body);
      out.push({ start: at(yy, mm, dd, +p[2] || 8, +p[3] || 0), end: at(yy, mm, dd, +p[4] || 9, +p[5] || 35), ...l });
    });
  });
  return out;
}

// Страница школы → группы
export function parseGroups(html) {
  const courses = [];
  for (const re of [/(\d)\s*курс/gi, /course[_-]?(\d)/gi])
    for (const m of html.matchAll(re)) { const c = +m[1]; if (c >= 1 && c <= 6) courses.push({ pos: m.index, course: c }); }
  courses.sort((a, b) => a.pos - b.pos);
  const links = [...html.matchAll(/group=(\d+)/g)], seen = new Set(), out = [];
  links.forEach((m, i) => {
    const id = m[1]; if (seen.has(id)) return;
    const a = m.index + m[0].length, b = i + 1 < links.length ? links[i + 1].index : Math.min(html.length, a + 600);
    if (b <= a) return;
    let u = html.slice(a, a + Math.min(b - a, 600));
    const gt = u.indexOf('>'); if (gt >= 0) u = u.slice(gt + 1);
    const end = u.toLowerCase().indexOf('</a>'); if (end >= 0) u = u.slice(0, end);
    const txt = Wt(si(u)).replace(/\s+/g, ' ').trim();
    const num = /\b(\d{6})\b/.exec(txt) || /\b(\d{4,7})\b/.exec(txt); if (!num) return;
    let title = txt.replace(num[1], '').replace(/^[\s\-–—,.:()]+|[\s\-–—,.:()]+$/g, '');
    if ((title.match(/\(/g) || []).length > (title.match(/\)/g) || []).length) title += ')';
    // «Д …» в начале названия — отдельная группа с тем же номером (у РУЗа это другая запись)
    let variant = '';
    const dm = /^[Дд]\s+(?=\S)/.exec(title);
    if (dm) { variant = 'Д'; title = title.slice(dm[0].length); }
    const course = [...courses].reverse().find(c => c.pos < m.index)?.course ?? 0;
    seen.add(id); out.push({ id, number: num[1], title, course, variant });
  });
  return out;
}

export const parseInstitutions = html => [...new Set([...html.matchAll(/institution=(\d+)/g)].map(m => +m[1]))];
