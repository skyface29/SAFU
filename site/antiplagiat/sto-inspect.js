/* =====================================================================
   Айсберг — строгий инспектор СТО САФУ.
   Проверяет готовый .docx абзац за абзацем: вычисляет итоговые свойства (стиль → наследование →
   прямое форматирование), определяет роль абзаца и сверяет её с нормами профиля СТО (те же, по
   которым оформляет format.js). Нужен, чтобы оформление проверял не тот же код, что его делал.
   Работает в браузере, файл никуда не отправляется.
   ===================================================================== */
(function (global) {
'use strict';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const kids = (el, n) => el ? [...el.childNodes].filter(c => c.nodeType === 1 && c.namespaceURI === W && (!n || c.localName === n)) : [];
const kid = (el, n) => kids(el, n)[0] || null;
const at = (el, n) => el ? el.getAttributeNS(W, n) : null;
const on = el => !!el && !['0', 'false', 'off'].includes(at(el, 'val'));

const STRUCT = /^(лист для замечаний|реферат|аннотация|abstract|оглавление|содержание|нормативные ссылки|определения|обозначения и сокращения|определения, обозначения и сокращения|термины и определения|перечень сокращений( и обозначений)?|список сокращений|введение|заключение|выводы|список (использованных источников|использованной литературы|литературы|источников|использованных источников и литературы)|библиографический список|литература|приложения|информация об использовании технологий искусственного интеллекта( \(ии\))?)$/i;

/** Итоговые свойства абзаца и прогона по цепочке стилей. */
function styleTable(stylesXml) {
  const S = new Map(); let defP = null, defR = null, defPara = null;
  if (!stylesXml) return { S, defP, defR, defPara };
  const d = new DOMParser().parseFromString(stylesXml, 'application/xml');
  const dd = d.getElementsByTagNameNS(W, 'docDefaults')[0];
  if (dd) { defP = kid(kid(dd, 'pPrDefault'), 'pPr'); defR = kid(kid(dd, 'rPrDefault'), 'rPr'); }
  for (const st of d.getElementsByTagNameNS(W, 'style')) {
    const id = at(st, 'styleId');
    S.set(id, { id, type: at(st, 'type'), name: (at(kid(st, 'name'), 'val') || '').toLowerCase(), based: at(kid(st, 'basedOn'), 'val'), pPr: kid(st, 'pPr'), rPr: kid(st, 'rPr') });
    if (at(st, 'type') === 'paragraph' && ['1', 'true'].includes(at(st, 'default'))) defPara = id;
  }
  return { S, defP, defR, defPara };
}
function chain(T, id) { const out = []; for (let i = 0; id && i < 15 && T.S.has(id); i++) { out.push(T.S.get(id)); id = T.S.get(id).based; } return out; }
const first = (list, f) => { for (const x of list) { if (!x) continue; const v = f(x); if (v != null) return v; } return null; };

function paraProps(T, p) {
  const pPr = kid(p, 'pPr'), sid = at(kid(pPr, 'pStyle'), 'val') || T.defPara, sts = chain(T, sid);
  const pp = [pPr, ...sts.map(s => s.pPr), T.defP];
  const sp = first(pp, x => { const s = kid(x, 'spacing'); return s && at(s, 'line') != null ? s : null; });
  const before = first(pp, x => { const s = kid(x, 'spacing'); return s && at(s, 'before') != null ? +at(s, 'before') : null; }) || 0;
  const after = first(pp, x => { const s = kid(x, 'spacing'); return s && at(s, 'after') != null ? +at(s, 'after') : null; }) || 0;
  const ind = first(pp, x => { const i = kid(x, 'ind'); return i && (at(i, 'firstLine') != null || at(i, 'hanging') != null) ? i : null; });
  const left = first(pp, x => { const i = kid(x, 'ind'); const v = i && (at(i, 'left') ?? at(i, 'start')); return v != null ? +v : null; }) || 0;
  return {
    style: sts.map(s => s.name).join(' < '), styleId: sid,
    line: sp ? ((at(sp, 'lineRule') || 'auto') === 'auto' ? +at(sp, 'line') / 240 : 'exact') : 1,
    before, after, left,
    firstLine: ind ? (+at(ind, 'firstLine') || 0) - (+at(ind, 'hanging') || 0) : 0,
    jc: first(pp, x => at(kid(x, 'jc'), 'val')) || 'left',
    keepNext: on(first(pp, x => kid(x, 'keepNext'))),
    pageBreakBefore: on(first(pp, x => kid(x, 'pageBreakBefore'))),
    numbered: !!first(pp, x => kid(x, 'numPr')),
    sts, pPr
  };
}
function runProps(T, r, P, theme) {
  const rPr = kid(r, 'rPr'), rs = chain(T, at(kid(rPr, 'rStyle'), 'val'));
  const rr = [rPr, ...rs.map(s => s.rPr), ...P.sts.map(s => s.rPr), T.defR];
  let font = first(rr, x => { const f = kid(x, 'rFonts'); if (!f) return null; const th = at(f, 'asciiTheme') || at(f, 'hAnsiTheme');
    if (th) return theme[/major/i.test(th) ? 'major' : 'minor'] || null; return at(f, 'ascii') || at(f, 'hAnsi') || at(f, 'cs') || null; }) || theme.minor || 'Calibri';
  const sz = +(first(rr, x => at(kid(x, 'sz'), 'val')) || 20) / 2;
  const va = first(rr, x => at(kid(x, 'vertAlign'), 'val'));
  return { font, sz, bold: on(first(rr, x => kid(x, 'b'))), italic: on(first(rr, x => kid(x, 'i'))), sup: va === 'superscript' || va === 'subscript' };
}
function textOf(p) {
  let s = '';
  for (const e of p.getElementsByTagNameNS(W, '*')) {
    let own = true; for (let a = e.parentNode; a && a !== p; a = a.parentNode) if (a.localName === 'txbxContent' || a.localName === 'p') { own = false; break; }
    if (!own) continue;
    if (e.localName === 't') s += e.textContent; else if (e.localName === 'tab') s += '\t'; else if (e.localName === 'noBreakHyphen') s += '‑';
  }
  return s;
}
const ownRuns = p => [...p.getElementsByTagNameNS(W, 'r')].filter(r => { for (let a = r.parentNode; a; a = a.parentNode) { if (a === p) return true; if (a.localName === 'p' || a.localName === 'txbxContent') return false; } return false; });
const inside = (el, stop, names) => { for (let a = el.parentNode; a && a !== stop; a = a.parentNode) if (names.includes(a.localName)) return true; return false; };
const cm = tw => Math.round(tw / 566.929 * 100) / 100;
const mm = tw => Math.round(tw / 56.6929);

/** Строгая проверка. opts: { size: 14|12, binding: bool }. */
async function inspect(buf, opts) {
  opts = opts || {};
  const prof = global.Formatter.PROFILES.safu, size = opts.size || prof.size;
  const files = await global.Formatter.unzip(buf), dec = new TextDecoder();
  const get = n => { const e = files.find(x => x.name === n); return e ? dec.decode(e.data) : null; };
  const doc = new DOMParser().parseFromString(get('word/document.xml'), 'application/xml');
  const T = styleTable(get('word/styles.xml'));
  const theme = {}; const th = get('word/theme/theme1.xml');
  if (th) { const t = new DOMParser().parseFromString(th, 'application/xml');
    for (const [k, tag] of [['minor', 'minorFont'], ['major', 'majorFont']]) { const f = t.getElementsByTagNameNS('*', tag)[0], l = f && f.getElementsByTagNameNS('*', 'latin')[0]; if (l) theme[k] = l.getAttribute('typeface'); } }
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const issues = [], rules = new Set();
  let checked = 0, checks = 0;
  const bad = (rule, where, need, found, p) => issues.push({ rule, where, need, found, idx: p ? P.indexOf(p) : -1, gi: p ? ALL.indexOf(p) : -1, text: p ? textOf(p).replace(/\s+/g, ' ').trim().slice(0, 80) : '' });
  const ok = rule => { rules.add(rule); checks++; };

  /* 1. листы: формат, поля — у каждого раздела (альбомные листы с широкими таблицами — свои поля) */
  const sects = [...body.getElementsByTagNameNS(W, 'sectPr')];
  const wantL = opts.binding ? prof.bindingLeft : prof.margins.left;
  sects.forEach((s, i) => {
    const z = kid(s, 'pgSz'), m = kid(s, 'pgMar'); if (!z || !m) return;
    const land = at(z, 'orient') === 'landscape' || +at(z, 'w') > +at(z, 'h');
    const w = mm(+at(z, 'w')), h = mm(+at(z, 'h'));
    ok('Формат A4'); if (Math.abs(Math.min(w, h) - 210) > 2 || Math.abs(Math.max(w, h) - 297) > 2) bad('Формат A4', 'раздел ' + (i + 1), '210 × 297 мм', `${w} × ${h} мм`);
    if (land) return;
    const L = mm(+at(m, 'left')), R = mm(+at(m, 'right')), Tp = mm(+at(m, 'top')), B = mm(+at(m, 'bottom'));
    // п. 4.1.3: левое 25 (30 под переплёт), правое — не менее 10, верхнее 20, нижнее — не менее 20 мм
    ok('Поля'); if (L < 24 || L > 31 || R < 10 || Math.abs(Tp - 20) > 1 || B < 19)
      bad('Поля', 'раздел ' + (i + 1), 'левое 25 (30 под переплёт), правое не менее 10, верхнее 20, нижнее не менее 20 мм', `левое ${L}, правое ${R}, верхнее ${Tp}, нижнее ${B} мм`);
  });

  /* 2. абзацы основной части: от первого структурного заголовка (титульник не проверяем — у него своя форма) */
  const ALL = [...body.getElementsByTagNameNS(W, 'p')];   // все абзацы по порядку — для привязки к предпросмотру
  const P = ALL.filter(p => !inside(p, body, ['tbl', 'txbxContent']));
  const texts = P.map(p => textOf(p).replace(/ /g, ' ').trim());
  // титульный лист — первая страница, у него своя форма (приложение Б): начинаем после первого разрыва страницы,
  // если перед ним есть титульные строки; иначе — с первого структурного заголовка
  const brk = i => { const p = P[i], pr = kid(p, 'pPr'); return [...p.getElementsByTagNameNS(W, 'br')].some(b => at(b, 'type') === 'page') || on(kid(pr, 'pageBreakBefore')) || !!kid(pr, 'sectPr'); };
  const titleish = texts.slice(0, 40).some(t => /министерств|федеральн|университет|высшая школа|выполнил|руководитель|архангельск/i.test(t));
  let start = -1;
  if (titleish) for (let i = 0; i < Math.min(P.length, 80); i++) if (brk(i)) { start = on(kid(kid(P[i], 'pPr'), 'pageBreakBefore')) ? i : i + 1; break; }
  if (start < 0) start = texts.findIndex((t, i) => STRUCT.test(t.replace(/[.:\s]+$/, '')) || /^(глава\s+)?1\s+\S/i.test(t) && paraProps(T, P[i]).keepNext);
  if (start < 0) start = 0;
  // исходный файл: на титульнике проверяем только шрифт (у титульника своя форма — приложение Б)
  if (opts.all) for (let i = 0; i < start; i++) {
    const p = P[i], t = texts[i]; if (!t) continue;
    const pr = paraProps(T, p), runs = ownRuns(p).filter(r => r.getElementsByTagNameNS(W, 't').length); if (!runs.length) continue;
    const R = runs.map(r => runProps(T, r, pr, theme)); checked++; ok('Шрифт Times New Roman');
    if (R.some(x => !/times new roman|pt astra serif|tempora|courier|consolas|mono/i.test(x.font))) bad('Шрифт Times New Roman', '«' + (t.length > 60 ? t.slice(0, 57) + '…' : t) + '»', 'Times New Roman / PT Astra Serif / Tempora LGS', [...new Set(R.map(x => x.font))].join(', '), p);
  }
  let inBib = false, inApp = false, inToc = false;
  for (let i = start; i < P.length; i++) {
    const p = P[i], t = texts[i]; if (!t) continue;
    const pr = paraProps(T, p), low = t.toLowerCase().replace(/[.:\s]+$/, '');
    const isToc = /^toc|оглавление \d|содержание \d/i.test(pr.style) || /TOC/.test([...p.getElementsByTagNameNS(W, 'instrText')].map(x => x.textContent).join(''));
    if (isToc) { inToc = true; continue; }
    if (/\t\s*\d+\s*$/.test(textOf(p)) && t.length < 150) continue;   // строка оглавления «Название …… 12»
    const struct = STRUCT.test(low), app = /^приложение(\s+[а-яa-z0-9]{1,2}(?![а-яa-z0-9])|$)/i.test(low) && t.length < 120;
    if (struct || app) { inToc = false; inBib = /список|библиограф|^литература$/.test(low); inApp = app || inApp && !struct; }
    if (inToc || inApp && !app) continue;
    const runs = ownRuns(p).filter(r => r.getElementsByTagNameNS(W, 't').length);
    if (!runs.length) continue;
    const R = runs.map(r => runProps(T, r, pr, theme));
    const where = '«' + (t.length > 60 ? t.slice(0, 57) + '…' : t) + '»';
    checked++;
    /* шрифт везде, кроме формул и кода */
    const isCode = R.some(x => /courier|consolas|mono|lucida console/i.test(x.font));
    ok('Шрифт Times New Roman');   // п. 4.1.5: Times New Roman / PT Astra Serif / Tempora LGS
    if (!isCode && R.some(x => !/times new roman|pt astra serif|tempora/i.test(x.font))) bad('Шрифт Times New Roman', where, 'Times New Roman / PT Astra Serif / Tempora LGS', [...new Set(R.map(x => x.font))].join(', '), p);
    // заголовок: по номеру или по оформлению (держится со следующим, короткий, по центру или с интервалом после)
    const looksHead = pr.keepNext && t.length < 160 && !/[;:,]$/.test(t) && (pr.jc === 'center' || pr.after >= 200 || R.every(x => x.bold));
    const head = (struct || app || /^(\d+(\.\d+)*)\s+\S/.test(t) && pr.keepNext && t.length < 200 && !/[.;:,]$/.test(t) || looksHead) && !/^(рисунок|таблица)\s/i.test(t);
    const fig = /^рисунок\s+[\dА-ЯA-Z]+(\.\d+)*/i.test(t), tab = /^таблица\s+[\dА-ЯA-Z]+(\.\d+)*/i.test(t);
    const listItem = /^(–|-|•|\d+\)|[а-я]\))\s/.test(t) || pr.numbered;
    if (struct || app) {
      ok('Заголовок раздела: по центру'); if (pr.jc !== 'center') bad('Заголовок раздела: по центру', where, 'по центру', pr.jc, p);
      ok('Заголовок раздела: без точки'); if (/\.$/.test(t) && !/(?<![а-яёa-z0-9])[а-я]\.$/i.test(t)) bad('Заголовок раздела: без точки', where, 'без точки в конце', 'точка в конце', p);
      ok('Заголовок: кегль текста'); if (R.some(x => Math.abs(x.sz - size) > .25)) bad('Заголовок: кегль текста', where, size + ' пт', [...new Set(R.map(x => x.sz))].join(', ') + ' пт', p);
      ok('Заголовок: не отрывается от текста'); if (!pr.keepNext) bad('Заголовок: не отрывается от текста', where, 'вместе со следующим абзацем', 'может остаться внизу страницы один', p);
      continue;
    }
    if (head) {
      ok('Заголовок: без точки'); if (/\.$/.test(t)) bad('Заголовок: без точки', where, 'без точки в конце', 'точка в конце', p);
      ok('Заголовок: кегль текста'); if (R.some(x => Math.abs(x.sz - size) > .25)) bad('Заголовок: кегль текста', where, size + ' пт', [...new Set(R.map(x => x.sz))].join(', ') + ' пт', p);
      continue;
    }
    if (fig) {
      ok('Подпись рисунка: по центру'); if (pr.jc !== 'center') bad('Подпись рисунка: по центру', where, 'по центру', pr.jc, p);
      ok('Подпись рисунка: без точки'); if (/\.$/.test(t) && !/(?<![а-яёa-z0-9])(др|т\.\s?д|т\.\s?п|г|гг|в|вв)\.$/i.test(t)) bad('Подпись рисунка: без точки', where, 'без точки в конце', 'точка в конце', p);
      continue;
    }
    if (tab) {
      ok('Название таблицы: над таблицей'); const nx = p.nextSibling && p.nextElementSibling;
      if (nx && nx.localName !== 'tbl' && !/продолжение/i.test(t)) { let n = nx; while (n && n.localName === 'p' && !textOf(n).trim() && !n.getElementsByTagNameNS(W, 'drawing').length) n = n.nextElementSibling; if (n && n.localName !== 'tbl') bad('Название таблицы: над таблицей', where, 'сразу над таблицей', 'таблицы под названием нет', p); }
      ok('Название таблицы: не отрывается'); if (!pr.keepNext) bad('Название таблицы: не отрывается', where, 'вместе с таблицей', 'может остаться на другой странице', p);
      continue;
    }
    if (p.getElementsByTagNameNS(W, 'drawing').length || p.getElementsByTagNameNS(W, 'pict').length || p.getElementsByTagNameNS('*', 'oMath').length) continue;
    if (isCode || /листинг/i.test(t) && t.length < 120) continue;
    /* основной текст, списки, источники */
    const main = R.filter(x => !x.sup);
    ok('Кегль основного текста');
    if (main.some(x => Math.abs(x.sz - size) > .25)) bad('Кегль основного текста', where, size + ' пт', [...new Set(main.map(x => x.sz))].join(', ') + ' пт', p);
    ok('Межстрочный интервал 1,5');
    if (pr.line !== prof.line) bad('Межстрочный интервал 1,5', where, 'полуторный', typeof pr.line === 'number' ? String(pr.line).replace('.', ',') : 'точный', p);
    ok('Выравнивание по ширине');
    if (!['both', 'distribute'].includes(pr.jc) && t.length > 90) bad('Выравнивание по ширине', where, 'по ширине', pr.jc, p);
    if (!listItem && !inBib) {
      ok('Абзацный отступ 1,25 см');
      if (Math.abs(cm(pr.firstLine) + cm(pr.left) - prof.indent) > .06 && t.length > 40) bad('Абзацный отступ 1,25 см', where, '1,25 см', cm(pr.firstLine) + ' см', p);
    }
    ok('Без лишних интервалов между абзацами');
    if (pr.before > 0 || pr.after > 0) { const nx = p.nextElementSibling; if (!(nx && nx.localName === 'tbl') && !(p.previousElementSibling && p.previousElementSibling.localName === 'tbl')) bad('Без лишних интервалов между абзацами', where, '0 пт до и после', `${pr.before / 20} / ${pr.after / 20} пт`, p); }
    /* типографика */
    ok('Типографика: двойные пробелы'); if (/\S {2,}\S/.test(t.replace(/\t/g, ' '))) bad('Типографика: двойные пробелы', where, 'один пробел', 'два и больше подряд', p);
    ok('Типографика: кавычки «ёлочки»'); if (/"/.test(t) && !/https?:\/\//.test(t)) bad('Типографика: кавычки «ёлочки»', where, '«…»', '"…"', p);
    ok('Типографика: тире'); if (/[а-яё] - [а-яё]/i.test(t)) bad('Типографика: тире', where, '«–» с пробелами', 'дефис между словами', p);
  }

  /* 3. номера страниц */
  let pageNum = false;
  for (const f of files) if (/^word\/footer\d*\.xml$/.test(f.name) && /PAGE(?![A-Z])/.test(dec.decode(f.data))) pageNum = true;
  ok('Номера страниц'); if (!pageNum) bad('Номера страниц', 'колонтитулы', 'внизу по центру', 'нет');

  const byRule = {};
  for (const x of issues) (byRule[x.rule] = byRule[x.rule] || []).push(x);
  return { checked, checks, rules: [...rules], issues, byRule, ok: !issues.length };
}

global.StoInspect = { inspect };
})(typeof window !== 'undefined' ? window : globalThis);
