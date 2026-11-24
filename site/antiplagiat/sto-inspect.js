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
const mono = f => /courier|consolas|mono|lucida console|jetbrains/i.test(f || '');

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


/* Пункт СТО и подсказка для каждого правила — «умная» проверка с пояснениями. */
const RULE_META = {
  'Формат A4': ['4.1.2', 'Лист A4: 210 × 297 мм (книжная) или 297 × 210 (альбомная).'],
  'Поля': ['4.1.3', 'Левое 25 мм (30 под переплёт), правое не менее 10, верхнее 20, нижнее не менее 20 мм.'],
  'Шрифт Times New Roman': ['4.1.5', 'Times New Roman (или PT Astra Serif / Tempora LGS); листинги — моноширинный.'],
  'Кегль основного текста': ['4.1.5', 'Единый кегль основного текста: 12–14 пт.'],
  'Межстрочный интервал 1,5': ['4.1.5', 'Полуторный интервал во всём тексте.'],
  'Выравнивание по ширине': ['4.1.5', 'Основной текст — по ширине.'],
  'Абзацный отступ 1,25 см': ['4.1.5', 'Красная строка 1,25 см; интервалы до и после абзаца — 0 пт.'],
  'Без лишних интервалов между абзацами': ['4.1.5', 'Не добавляйте пустые строки: интервал между абзацами 0 пт.'],
  'Список источников: абзацный отступ 1,25 см': ['4.13.3', 'Записи списка — с абзацного отступа 1,25 см.'],
  'Номера страниц': ['4.3', 'Номер страницы — внизу по центру, без точки.'],
  'Номер страницы: кегль 12–14': ['4.3.3', 'Кегль номера страницы — 12–14 пт.'],
  'Заголовок раздела: по центру': ['4.2.1', 'Структурные элементы (Введение, Заключение, Список источников) — по центру.'],
  'Заголовок раздела: без точки': ['4.2.1', 'В конце заголовка точка не ставится.'],
  'Заголовок раздела: полужирный': ['4.2.1', 'Заголовок структурного элемента — полужирный.'],
  'Заголовок раздела: без отступа': ['4.2.1', 'Заголовок структурного элемента — без абзацного отступа.'],
  'Заголовок раздела: интервал 12 пт после': ['4.2.1', 'После заголовка — интервал 12 пт.'],
  'Заголовок: кегль текста': ['4.1.5', 'Кегль заголовка — как у основного текста.'],
  'Заголовок: не отрывается от текста': ['4.2.7', 'Включите «не отрывать от следующего».'],
  'Заголовок: без точки': ['4.2.5', 'В конце заголовка точка не ставится.'],
  'Заголовок: полужирный': ['4.2.5', 'Заголовок раздела и подраздела — полужирный.'],
  'Заголовок: по левому краю': ['4.2.5', 'Заголовки разделов — по левому краю.'],
  'Заголовок: абзацный отступ 1,25 см': ['4.2.5', 'Заголовок — с абзацным отступом 1,25 см.'],
  'Заголовок: интервал 12 пт после': ['4.2.7', 'После заголовка — интервал 12 пт.'],
  'Подзаголовок: интервал 12 пт до': ['4.2.7', 'Перед подзаголовком — интервал 12 пт.'],
  'Подпись рисунка: по центру': ['4.5.6', 'Подпись — под рисунком, по центру, без отступа.'],
  'Подпись рисунка: без точки': ['4.5.7', 'В конце подписи рисунка точка не ставится.'],
  'Подпись рисунка: кегль меньше основного': ['4.5.7', 'Кегль подписи — на 1–2 пт меньше основного.'],
  'Подпись рисунка: без отступа': ['4.5.7', 'Подпись — без абзацного отступа.'],
  'Название таблицы: над таблицей': ['4.9.4', 'Название таблицы — над таблицей.'],
  'Название таблицы: не отрывается': ['4.9.6', 'Включите «не отрывать от следующего».'],
  'Таблица: по центру': ['4.9.10', 'Таблица — по центру страницы, без абзацного отступа.'],
  'Текст таблицы: одинарный интервал': ['4.9.7', 'В таблице — одинарный интервал.'],
  'Текст таблицы: кегль на 1–2 пт меньше': ['4.9.7', 'Кегль в таблице — на 1–2 пт меньше, но не менее 10 пт.'],
  'Текст таблицы: без абзацного отступа': ['4.9.7', 'В таблице — без абзацного отступа.'],
  'Типографика: двойные пробелы': ['4.1.13', 'Уберите двойные пробелы.'],
  'Типографика: кавычки «ёлочки»': ['4.1.12', 'Используйте кавычки «ёлочки».'],
  'Типографика: тире': ['4.1.10', 'Тире «–» — с пробелами.'],
  'Типографика: без пробела после скобки': ['4.1.13', 'Уберите пробел после «(» и ««».'],
  'Типографика: без пробела перед знаком': ['4.1.13', 'Уберите пробел перед «.,;:!?».'],
  'Листинг: кегль 10–11': ['6.1.1', 'Листинг — моноширинный, 10–11 пт.'],
  'Листинг: одинарный интервал': ['6.1.1', 'В листинге — одинарный интервал.'],
  'Листинг: по левому краю': ['6.1.1', 'Листинг — по левому краю.'],
  'Единицы: пробел между числом и единицей': ['4.7', 'Между числом и единицей — неразрывный пробел: «5 кг».'],
  'Сокращения: «и т. д.»': ['4.11.2', 'Пишется «и т. д.» (с пробелами).'],
  'Сокращения: «и т. п.»': ['4.11.2', 'Пишется «и т. п.» (с пробелами).'],
  'Сокращения: недопустимые сокращения': ['4.11.3', 'Запрещены: т. н., вм., т. о., напр., т. ч., п. ч.'],
  'Формула: номер в круглых скобках': ['4.6.1.6', 'Номер формулы — у правого поля в скобках: (1).'],
  'Ссылка на рисунок в тексте': ['4.14.10', 'На каждый рисунок нужна ссылка в тексте: «в соответствии с рисунком 1».'],
  'Ссылка на таблицу в тексте': ['4.14.10', 'На каждую таблицу нужна ссылка в тексте: «в таблице 1».'],
  'Сноска: кегль на 1–2 пт меньше': ['4.10', 'Текст сноски — на 1–2 пт меньше основного (10–12 пт).'],
  'Приложение: допустимое обозначение': ['4.16.4', 'Буквы приложений: кроме Е, З, Й, О, Ч, Ь, Ы, Ъ.'],
};

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
  const issues = [], warnings = [], rules = new Set();
  let checked = 0, checks = 0;
  const bad = (rule, where, need, found, p) => { const m = RULE_META[rule] || []; issues.push({ rule, where, need, found, clause: m[0] || '', hint: m[1] || '', idx: p ? P.indexOf(p) : -1, gi: p ? ALL.indexOf(p) : -1, text: p ? textOf(p).replace(/\s+/g, ' ').trim().slice(0, 80) : '' }); };
  const ok = rule => { rules.add(rule); checks++; };
  const warn = (rule, where, need, found) => { const m = RULE_META[rule] || []; warnings.push({ rule, where, need, found, clause: m[0] || '', hint: m[1] || '', severity: 'warn' }); };

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
      /* п. 4.2.1: полужирный, без абзацного отступа, интервал после 12 пт */
      ok('Заголовок раздела: полужирный'); if (!R.every(x => x.bold)) bad('Заголовок раздела: полужирный', where, 'полужирный', 'обычное начертание', p);
      ok('Заголовок раздела: без отступа'); if (Math.abs(cm(pr.firstLine + pr.left)) > .06) bad('Заголовок раздела: без отступа', where, 'без абзацного отступа', cm(pr.firstLine) + ' см', p);
      ok('Заголовок раздела: интервал 12 пт после'); if (Math.abs(pr.after - 240) > 20) bad('Заголовок раздела: интервал 12 пт после', where, '12 пт', (pr.after / 20) + ' пт', p);
      if (app) { ok('Приложение: с новой страницы'); if (!pr.pageBreakBefore && !(i > 0 && brk(i - 1))) bad('Приложение: с новой страницы', where, 'с новой страницы', 'не с новой страницы', p);
        const am = t.match(/^приложение\s+([А-ЯA-Z])/i); if (am && /[ЕЗЙОЧЬЫЪ]/.test(am[1].toUpperCase())) warn('Приложение: допустимое обозначение', where, 'кроме Е, З, Й, О, Ч, Ь, Ы, Ъ', 'буква ' + am[1]); }
      continue;
    }
    if (head) {
      ok('Заголовок: без точки'); if (/\.$/.test(t)) bad('Заголовок: без точки', where, 'без точки в конце', 'точка в конце', p);
      ok('Заголовок: кегль текста'); if (R.some(x => Math.abs(x.sz - size) > .25)) bad('Заголовок: кегль текста', where, size + ' пт', [...new Set(R.map(x => x.sz))].join(', ') + ' пт', p);
      /* п. 4.2.5, 4.2.7: полужирный, по левому краю, с абзацным отступом, интервал после 12 пт */
      ok('Заголовок: полужирный'); if (!R.every(x => x.bold)) bad('Заголовок: полужирный', where, 'полужирный', 'обычное начертание', p);
      ok('Заголовок: по левому краю'); if (!['left', 'start', 'both'].includes(pr.jc)) bad('Заголовок: по левому краю', where, 'по левому краю', pr.jc, p);
      ok('Заголовок: абзацный отступ 1,25 см'); if (Math.abs(cm(pr.firstLine + pr.left) - prof.indent) > .06) bad('Заголовок: абзацный отступ 1,25 см', where, '1,25 см', cm(pr.firstLine) + ' см', p);
      ok('Заголовок: интервал 12 пт после'); if (Math.abs(pr.after - 240) > 20) bad('Заголовок: интервал 12 пт после', where, '12 пт', (pr.after / 20) + ' пт', p);
      if (/^\d+\.\d+/.test(t)) { ok('Подзаголовок: интервал 12 пт до'); if (Math.abs(pr.before - 240) > 20) bad('Подзаголовок: интервал 12 пт до', where, '12 пт', (pr.before / 20) + ' пт', p); }
      continue;
    }
    if (fig) {
      ok('Подпись рисунка: по центру'); if (pr.jc !== 'center') bad('Подпись рисунка: по центру', where, 'по центру', pr.jc, p);
      ok('Подпись рисунка: без точки'); if (/\.$/.test(t) && !/(?<![а-яёa-z0-9])(др|т\.\s?д|т\.\s?п|г|гг|в|вв)\.$/i.test(t)) bad('Подпись рисунка: без точки', where, 'без точки в конце', 'точка в конце', p);
      /* п. 4.5.7: кегль на 1–2 пт меньше основного, без абзацного отступа */
      ok('Подпись рисунка: кегль меньше основного'); if (R.some(x => x.sz > size - .5 || x.sz < 10)) bad('Подпись рисунка: кегль меньше основного', where, 'на 1–2 пт меньше (' + (size - 2) + '–' + (size - 1) + ' пт)', [...new Set(R.map(x => x.sz))].join(', ') + ' пт', p);
      ok('Подпись рисунка: без отступа'); if (Math.abs(cm(pr.firstLine + pr.left)) > .06) bad('Подпись рисунка: без отступа', where, 'без абзацного отступа', cm(pr.firstLine) + ' см', p);
      continue;
    }
    if (tab) {
      ok('Название таблицы: над таблицей'); const nx = p.nextSibling && p.nextElementSibling;
      if (nx && nx.localName !== 'tbl' && !/продолжение/i.test(t)) { let n = nx; while (n && n.localName === 'p' && !textOf(n).trim() && !n.getElementsByTagNameNS(W, 'drawing').length) n = n.nextElementSibling; if (n && n.localName !== 'tbl') bad('Название таблицы: над таблицей', where, 'сразу над таблицей', 'таблицы под названием нет', p); }
      ok('Название таблицы: не отрывается'); if (!pr.keepNext) bad('Название таблицы: не отрывается', where, 'вместе с таблицей', 'может остаться на другой странице', p);
      continue;
    }
    if (p.getElementsByTagNameNS(W, 'drawing').length || p.getElementsByTagNameNS(W, 'pict').length || p.getElementsByTagNameNS('*', 'oMath').length) continue;
    if (isCode) {
      if (R.every(x => mono(x.font))) {
        /* п. 6.1.1: моноширинный, 10–11 пт, одинарный интервал, по левому краю */
        ok('Листинг: кегль 10–11'); if (R.some(x => x.sz < 9.5 || x.sz > 11.5)) bad('Листинг: кегль 10–11', where, '10–11 пт', [...new Set(R.map(x => x.sz))].join(', ') + ' пт', p);
        ok('Листинг: одинарный интервал'); if (pr.line !== 1) bad('Листинг: одинарный интервал', where, 'одинарный', typeof pr.line === 'number' ? String(pr.line).replace('.', ',') : 'точный', p);
        ok('Листинг: по левому краю'); if (!['left', 'start', 'both'].includes(pr.jc)) bad('Листинг: по левому краю', where, 'по левому краю', pr.jc, p);
      }
      continue;
    }
    if (/листинг/i.test(t) && t.length < 120) continue;
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
    if (inBib) {
      ok('Список источников: абзацный отступ 1,25 см');
      if (Math.abs(cm(pr.firstLine) + cm(pr.left) - prof.indent) > .06 && t.length > 20) bad('Список источников: абзацный отступ 1,25 см', where, '1,25 см', cm(pr.firstLine) + ' см', p);
    }
    ok('Без лишних интервалов между абзацами');
    if (pr.before > 0 || pr.after > 0) { const nx = p.nextElementSibling; if (!(nx && nx.localName === 'tbl') && !(p.previousElementSibling && p.previousElementSibling.localName === 'tbl')) bad('Без лишних интервалов между абзацами', where, '0 пт до и после', `${pr.before / 20} / ${pr.after / 20} пт`, p); }
    /* типографика */
    ok('Типографика: двойные пробелы'); if (/\S {2,}\S/.test(t.replace(/\t/g, ' '))) bad('Типографика: двойные пробелы', where, 'один пробел', 'два и больше подряд', p);
    ok('Типографика: кавычки «ёлочки»'); if (/"/.test(t) && !/https?:\/\//.test(t)) bad('Типографика: кавычки «ёлочки»', where, '«…»', '"…"', p);
    ok('Типографика: тире'); if (/[а-яё] - [а-яё]/i.test(t)) bad('Типографика: тире', where, '«–» с пробелами', 'дефис между словами', p);
    ok('Типографика: без пробела после скобки'); if (/[(\u00ab\u201c] /.test(t)) bad('Типографика: без пробела после скобки', where, 'без пробела после «(» и ««»', 'пробел после скобки/кавычки', p);
    ok('Типографика: без пробела перед знаком'); if (/ [.,;:!?]/.test(t)) bad('Типографика: без пробела перед знаком', where, 'без пробела перед «.,;:!?»', 'пробел перед знаком', p);
    ok('Единицы: пробел между числом и единицей'); if (/\d(?:кг|мм|см|км|мин|Вт|кВт|Гц)(?![а-яёa-z])/i.test(t)) warn('Единицы: пробел между числом и единицей', where, '5 кг (с пробелом)', 'число и единица слитно');
    ok('Сокращения: «и т. д.»'); if (/и\s+т\.д\./i.test(t)) warn('Сокращения: «и т. д.»', where, 'и т. д.', 'и т.д.');
    ok('Сокращения: «и т. п.»'); if (/и\s+т\.п\./i.test(t)) warn('Сокращения: «и т. п.»', where, 'и т. п.', 'и т.п.');
    ok('Сокращения: недопустимые сокращения'); { const m = t.match(/(?:^|[^а-яёa-z])(т\.\s?н\.|вм\.|т\.\s?о\.|напр\.|т\.\s?ч\.|п\.\s?ч\.)/i); if (m) warn('Сокращения: недопустимые сокращения', where, 'без «' + m[1] + '»', 'недопустимое сокращение'); }
  }

  /* 3. таблицы: положение и текст в ячейках (п. 4.9.7, 4.9.10). Титульный лист пропускаем — у него своя форма. */
  const startEl = P[start] || null;
  for (const tbl of body.getElementsByTagNameNS(W, 'tbl')) {
    if (startEl && (tbl.compareDocumentPosition(startEl) & 4)) continue;   // DOCUMENT_POSITION_FOLLOWING: таблица до начала основной части
    const tblPr = kid(tbl, 'tblPr');
    ok('Таблица: по центру');
    if (at(kid(tblPr, 'jc'), 'val') !== 'center') bad('Таблица: по центру', 'таблица', 'по центру', at(kid(tblPr, 'jc'), 'val') || 'слева', tbl);
    for (const cp of tbl.getElementsByTagNameNS(W, 'p')) {
      const txt = textOf(cp).replace(/\s+/g, ' ').trim(); if (!txt) continue;
      const cpr = paraProps(T, cp), cruns = ownRuns(cp).filter(r => r.getElementsByTagNameNS(W, 't').length);
      if (!cruns.length) continue;
      const CR = cruns.map(r => runProps(T, r, cpr, theme));
      const cwhere = '«' + (txt.length > 40 ? txt.slice(0, 37) + '…' : txt) + '»';
      ok('Текст таблицы: одинарный интервал'); if (cpr.line !== 1) bad('Текст таблицы: одинарный интервал', cwhere, 'одинарный', typeof cpr.line === 'number' ? String(cpr.line).replace('.', ',') : 'точный', cp);
      ok('Текст таблицы: кегль на 1–2 пт меньше'); if (CR.some(x => x.sz > size - .5 || x.sz < 10)) bad('Текст таблицы: кегль на 1–2 пт меньше', cwhere, (size - 2) + '–' + (size - 1) + ' пт', [...new Set(CR.map(x => x.sz))].join(', ') + ' пт', cp);
      ok('Текст таблицы: без абзацного отступа'); if (Math.abs(cm(cpr.firstLine + cpr.left)) > .06) bad('Текст таблицы: без абзацного отступа', cwhere, 'без абзацного отступа', cm(cpr.firstLine) + ' см', cp);
    }
  }

  /* 5. ссылки на рисунки и таблицы и сноски — рекомендации (п. 4.14.10, 4.10) */
  const capRe = /^(рисунок|таблица)\s/i;
  const plain = texts.filter(t => !capRe.test(t)).join(' ').toLowerCase();
  const rx = s2 => s2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seenFig = new Set(), seenTab = new Set();
  for (const t of texts) {
    let m = t.match(/^рисунок\s+([\dА-ЯA-Z]+(?:\.\d+)*)/i); if (m) seenFig.add(m[1].toLowerCase());
    m = t.match(/^таблица\s+([\dА-ЯA-Z]+(?:\.\d+)*)/i); if (m) seenTab.add(m[1].toLowerCase());
  }
  ok('Ссылки на рисунки в тексте');
  for (const n of seenFig) if (!new RegExp('рисун[а-яё]*\\s+' + rx(n) + '(?![\\d.])').test(plain)) warn('Ссылка на рисунок в тексте', 'рисунок ' + n, 'ссылка «в соответствии с рисунком N»', 'в тексте ссылки нет');
  ok('Ссылки на таблицы в тексте');
  for (const n of seenTab) if (!new RegExp('таблиц[а-яё]*\\s+' + rx(n) + '(?![\\d.])').test(plain)) warn('Ссылка на таблицу в тексте', 'таблица ' + n, 'ссылка «в таблице N»', 'в тексте ссылки нет');
  ok('Формулы: номер в круглых скобках');
  for (let i = start; i < P.length; i++) {
    const p = P[i]; if (!p.getElementsByTagNameNS('*', 'oMath').length) continue;
    const txt = texts[i].trim(), letters = (txt.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
    if (letters <= 3 && !/\(\d+(\.\d+)*\)\s*$/.test(txt)) warn('Формула: номер в круглых скобках', txt.slice(0, 40) || 'формула', 'номер у правого поля: (1)', 'номера нет');
  }
  const fns = get('word/footnotes.xml');
  if (fns) {
    ok('Сноски: кегль на 1–2 пт меньше');
    const fd = new DOMParser().parseFromString(fns, 'application/xml');
    for (const fn of fd.getElementsByTagNameNS(W, 'footnote')) {
      const id = at(fn, 'id'); if (!id || id === '-1' || id === '0') continue;
      for (const r of fn.getElementsByTagNameNS(W, 'r')) {
        const szv = at(kid(kid(r, 'rPr'), 'sz'), 'val');
        if (szv && (+szv / 2 < 9 || +szv / 2 > 12)) warn('Сноска: кегль на 1–2 пт меньше', 'сноска ' + id, '10–12 пт', (+szv / 2) + ' пт');
      }
    }
  }

  /* 4. номера страниц */
  let pageNum = false, pageNumBad = null;
  for (const f of files) {
    if (!/^word\/footer\d*\.xml$/.test(f.name)) continue;
    const xml = dec.decode(f.data); if (!/PAGE(?![A-Z])/.test(xml)) continue;
    pageNum = true;
    const fd = new DOMParser().parseFromString(xml, 'application/xml');
    const szs = [...fd.getElementsByTagNameNS(W, 'sz')].map(e => +at(e, 'val') / 2);
    if (szs.length && szs.some(sz => sz < 11 || sz > 15)) pageNumBad = [...new Set(szs)].join(', ');
  }
  ok('Номера страниц'); if (!pageNum) bad('Номера страниц', 'колонтитулы', 'внизу по центру', 'нет');
  ok('Номер страницы: кегль 12–14'); if (pageNumBad) bad('Номер страницы: кегль 12–14', 'колонтитулы', '12–14 пт', pageNumBad + ' пт');

  const byRule = {};
  for (const x of issues) (byRule[x.rule] = byRule[x.rule] || []).push(x);
  const failed = Object.keys(byRule).length, total = rules.size;
  const score = total ? Math.round(100 * (total - failed) / total) : 100;
  const grade = score === 100 ? 'Готово к сдаче' : score >= 90 ? 'Почти готово' : score >= 70 ? 'Есть замечания' : 'Много замечаний';
  return { checked, checks, rules: [...rules], issues, byRule, warnings, ok: !issues.length, failed, total, score, grade };
}

global.StoInspect = { inspect };
})(typeof window !== 'undefined' ? window : globalThis);
