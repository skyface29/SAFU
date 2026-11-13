/* =====================================================================
   Айсберг — оформление работы по СТО вуза (.docx → .docx).
   Работает в браузере: распаковывает .docx, правит word/document.xml,
   стили, сноски и колонтитулы, собирает файл обратно. Сервер не нужен.

   Профиль вуза — набор чисел и правил (PROFILES ниже). Новый вуз =
   новый профиль; САФУ — по «Методическим указаниям по оформлению…
   СТО 2026», ГОСТ — по ГОСТ 7.32-2017.
   ===================================================================== */
(function (global) {
'use strict';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const TW_MM = 56.6929;           // twips в миллиметре
const TW_CM = 566.929;

/* ---------------------------- профили ---------------------------- */
const STRUCT_SAFU = ['лист для замечаний', 'реферат', 'аннотация', 'abstract', 'оглавление', 'содержание', 'нормативные ссылки',
  'определения', 'обозначения и сокращения', 'определения, обозначения и сокращения', 'термины и определения', 'перечень сокращений',
  'перечень сокращений и обозначений', 'список сокращений', 'введение', 'заключение', 'выводы', 'заключение/выводы',
  'список использованных источников', 'список использованной литературы', 'список литературы', 'список источников',
  'библиографический список', 'список использованных источников и литературы', 'литература', 'приложения',
  'информация об использовании технологий искусственного интеллекта',
  'информация об использовании технологий искусственного интеллекта (ии)'];

const PROFILES = {
  safu: {
    id: 'safu', name: 'САФУ — СТО 2026', short: 'СТО САФУ',
    margins: { left: 25, right: 15, top: 20, bottom: 20 }, bindingLeft: 30,
    font: 'Times New Roman', size: 14, line: 1.5, indent: 1.25,
    struct: { case: 'sentence', after: 12, newPage: true },
    head: { indent: true, after: 12, subBefore: 12, chapterNewPage: true, dropWord: true },
    fig: { word: 'Рисунок', sep: '. ', sizeDelta: -2, around: 12 },
    tab: { word: 'Таблица', sep: '. ', before: 6, after: 6, afterTable: 12, cellSizeDelta: -2, borderSz: 6 },
    bib: { line: 1.5, plain: true },
    foot: { size: 10 },
    listing: { size: 10 },
    appendix: { line: 1, after: 12 },
    hideNumbersOn: ['лист для замечаний', 'реферат', 'аннотация', 'abstract'],
    bibTitle: 'Список использованных источников', tocTitle: 'Оглавление', listsDash: true,
    source: 'СТО САФУ 2026 «Методические указания по оформлению и изложению документов образовательной и научной деятельности обучающихся»'
  },
  gost: {
    id: 'gost', name: 'ГОСТ 7.32-2017 (любой вуз)', short: 'ГОСТ 7.32',
    margins: { left: 30, right: 15, top: 20, bottom: 20 }, bindingLeft: 30,
    font: 'Times New Roman', size: 14, line: 1.5, indent: 1.25,
    struct: { case: 'upper', after: 12, newPage: true },
    head: { indent: true, after: 12, subBefore: 12, chapterNewPage: true },
    fig: { word: 'Рисунок', sep: ' – ', sizeDelta: 0, around: 12 },
    tab: { word: 'Таблица', sep: ' – ', before: 6, after: 0, afterTable: 12, cellSizeDelta: -2, borderSz: 4 },
    bib: { line: 1.5, plain: false },
    foot: { size: 10 },
    listing: { size: 10 },
    appendix: { line: 1.5, after: 12 },
    hideNumbersOn: [],
    source: 'ГОСТ 7.32-2017'
  }
};

/* ---------------------------- zip ---------------------------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function inflate(data) { return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
async function deflate(data) { return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }

async function unzip(buf) {
  const bytes = new Uint8Array(buf), v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Файл повреждён или это не .docx.');
  const count = v.getUint16(eocd + 10, true), dec = new TextDecoder();
  let p = v.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nl));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + csize);
    if (!name.endsWith('/')) out.push({ name, data: method === 0 ? raw.slice() : method === 8 ? await inflate(raw) : null });
    p += 46 + nl + xl + cl;
  }
  if (out.some(e => !e.data)) throw new Error('Неизвестное сжатие в .docx.');
  return out;
}

async function zip(entries) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const now = new Date(), dosT = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosD = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data);
    const store = e.name === 'mimetype' || /\.(png|jpe?g|gif|emf|wmf)$/i.test(e.name) && e.data.length > 0;
    const body = store ? e.data : await deflate(e.data), method = store ? 0 : 8;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
    h.setUint16(10, dosT, true); h.setUint16(12, dosD, true); h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true); h.setUint32(22, e.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true);
    c.setUint32(24, e.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + body.length;
  }
  const csize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ------------------------- помощники XML ------------------------- */
/* Порядок дочерних элементов важен: Word отказывается открывать файл, если он нарушен. */
const ORDER = {
  pPr: ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs',
    'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd',
    'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment',
    'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'],
  rPr: ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof',
    'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd',
    'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath', 'rPrChange'],
  sectPr: ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType',
    'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'],
  tblPr: ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd',
    'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription', 'tblPrChange'],
  trPr: ['cnfStyle', 'divId', 'gridBefore', 'gridAfter', 'wBefore', 'wAfter', 'cantSplit', 'trHeight', 'tblHeader', 'tblCellSpacing', 'jc', 'hidden', 'ins', 'del', 'trPrChange'],
  style: ['name', 'aliases', 'basedOn', 'next', 'link', 'autoRedefine', 'hidden', 'uiPriority', 'semiHidden', 'unhideWhenUsed', 'qFormat', 'locked',
    'personal', 'personalCompose', 'personalReply', 'rsid', 'pPr', 'rPr', 'tblPr', 'trPr', 'tcPr', 'tblStylePr'],
  p: ['pPr'], r: ['rPr'], tbl: ['tblPr'], tr: ['tblPrEx', 'trPr'],
  settings: ['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries', 'displayBackgroundShape',
    'printPostScriptOverText', 'printFractionalCharacterWidth', 'printFormsData', 'embedTrueTypeFonts', 'embedSystemFonts', 'saveSubsetFonts',
    'saveFormsData', 'mirrorMargins', 'alignBordersAndEdges', 'bordersDoNotSurroundHeader', 'bordersDoNotSurroundFooter', 'gutterAtTop',
    'hideSpellingErrors', 'hideGrammaticalErrors', 'activeWritingStyle', 'proofState', 'formsDesign', 'attachedTemplate', 'linkStyles',
    'stylePaneFormatFilter', 'stylePaneSortMethod', 'documentType', 'mailMerge', 'revisionView', 'trackRevisions', 'doNotTrackMoves',
    'doNotTrackFormatting', 'documentProtection', 'autoFormatOverride', 'styleLockTheme', 'styleLockQFSet', 'defaultTabStop', 'autoHyphenation',
    'consecutiveHyphenLimit', 'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope', 'summaryLength', 'clickAndTypeStyle', 'defaultTableStyle',
    'evenAndOddHeaders', 'bookFoldRevPrinting', 'bookFold', 'bookFoldPrinting', 'drawingGridHorizontalSpacing', 'drawingGridVerticalSpacing',
    'displayHorizontalDrawingGridEvery', 'displayVerticalDrawingGridEvery', 'doNotUseMarginsForDrawingGridOrigin', 'drawingGridHorizontalOrigin',
    'drawingGridVerticalOrigin', 'doNotShadeFormData', 'noPunctuationKerning', 'characterSpacingControl', 'printTwoOnOne', 'strictFirstAndLastChars',
    'noLineBreaksAfter', 'noLineBreaksBefore', 'savePreviewPicture', 'doNotValidateAgainstSchema', 'saveInvalidXml', 'ignoreMixedContent',
    'alwaysShowPlaceholderText', 'doNotDemarcateInvalidXml', 'saveXmlDataOnly', 'useXSLTWhenSaving', 'saveThroughXslt', 'showXMLTags',
    'alwaysMergeEmptyNamespace', 'updateFields', 'hdrShapeDefaults', 'footnotePr', 'endnotePr', 'compat', 'docVars', 'rsids', 'mathPr',
    'attachedSchema', 'themeFontLang', 'clrSchemeMapping', 'doNotIncludeSubdocsInStats', 'doNotAutoCompressPictures', 'forceUpgrade', 'captions',
    'readModeInkLockDown', 'smartTagType', 'schemaLibrary', 'shapeDefaults', 'doNotEmbedSmartTags', 'decimalSymbol', 'listSeparator']
};

const kids = (el, name) => el ? [...el.childNodes].filter(c => c.nodeType === 1 && c.namespaceURI === W && (!name || c.localName === name)) : [];
const kid = (el, name) => kids(el, name)[0] || null;
const attr = (el, name) => el ? el.getAttributeNS(W, name) : null;
function setAttrs(el, obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) el.removeAttributeNS(W, k);
    else el.setAttributeNS(W, 'w:' + k, String(v));
  }
  return el;
}
function mk(doc, name, attrs) { const el = doc.createElementNS(W, 'w:' + name); if (attrs) setAttrs(el, attrs); return el; }
/** Дочерний элемент по имени; если его нет — создаётся на правильном месте. */
function ensure(parent, name, attrs) {
  let el = kid(parent, name);
  if (!el) {
    el = mk(parent.ownerDocument, name);
    const order = ORDER[parent.localName] || [], idx = order.indexOf(name);
    let before = null;
    if (idx >= 0) for (const c of parent.childNodes) {
      if (c.nodeType !== 1) continue;
      const j = c.namespaceURI === W ? order.indexOf(c.localName) : -1;
      if (j > idx || (j < 0 && c.namespaceURI === W && ORDER[parent.localName] && !['p', 'r', 'tbl', 'tr'].includes(parent.localName))) { before = c; break; }
      if (['p', 'r', 'tbl', 'tr'].includes(parent.localName) && j < 0) { before = c; break; }
    }
    parent.insertBefore(el, before);
  }
  if (attrs) setAttrs(el, attrs);
  return el;
}
function drop(parent, ...names) { for (const n of names) for (const c of kids(parent, n)) parent.removeChild(c); }
const pPrOf = p => ensure(p, 'pPr');
const rPrOf = r => ensure(r, 'rPr');

/** Абзацы и таблицы верхнего уровня по порядку (заходит в sdt и customXml). */
function blocks(body) {
  const out = [];
  (function walk(el) {
    for (const c of el.childNodes) {
      if (c.nodeType !== 1 || c.namespaceURI !== W) continue;
      if (c.localName === 'p' || c.localName === 'tbl') out.push(c);
      else if (['sdt', 'sdtContent', 'customXml', 'smartTag'].includes(c.localName)) walk(c);
    }
  })(body);
  return out;
}
/** Свои прогоны абзаца (без прогонов из надписей и вложенных абзацев). */
function ownRuns(p) {
  return [...p.getElementsByTagNameNS(W, 'r')].filter(r => { for (let a = r.parentNode; a; a = a.parentNode) { if (a === p) return true; if (a.localName === 'p' || a.localName === 'txbxContent') return false; } return false; });
}
const ownTexts = p => ownRuns(p).flatMap(r => kids(r, 't'));
function paraText(p, tabs) {
  let s = '';
  for (const r of ownRuns(p)) for (const c of kids(r)) {
    if (c.localName === 't') s += c.textContent;
    else if (c.localName === 'tab') s += tabs ? '\t' : ' ';
    else if (c.localName === 'br' && attr(c, 'type') !== 'page') s += ' ';
  }
  return s;
}
const hasDrawing = p => p.getElementsByTagNameNS(W, 'drawing').length + p.getElementsByTagNameNS(W, 'pict').length + p.getElementsByTagNameNS(W, 'object').length > 0;
const hasMath = p => p.getElementsByTagNameNS(M_NS, 'oMath').length > 0;
const inTable = (el, stop) => { for (let a = el.parentNode; a && a !== stop; a = a.parentNode) if (a.localName === 'tbl') return true; return false; };

/* ------------------------- разметка абзацев ------------------------- */
function setSpacing(pPr, before, after, line) {
  const s = ensure(pPr, 'spacing');
  setAttrs(s, { before: Math.round(before * 20), after: Math.round(after * 20), line: Math.round(line * 240), lineRule: 'auto',
    beforeAutospacing: null, afterAutospacing: null, beforeLines: null, afterLines: null });
  drop(pPr, 'contextualSpacing');
}
function setIndent(pPr, firstCm, leftCm) {
  const i = ensure(pPr, 'ind');
  setAttrs(i, { firstLine: Math.round(firstCm * TW_CM), left: Math.round((leftCm || 0) * TW_CM), start: null, right: 0, end: null, hanging: null,
    firstLineChars: null, hangingChars: null, leftChars: null, startChars: null, rightChars: null, endChars: null });
}
const setJc = (pPr, v) => ensure(pPr, 'jc', { val: v });
function setRun(r, prof, size, opt) {
  const rPr = rPrOf(r);
  const f = ensure(rPr, 'rFonts');
  const keepFont = opt && opt.keepFont;
  if (!keepFont) setAttrs(f, { ascii: prof.font, hAnsi: prof.font, cs: prof.font, eastAsia: prof.font, asciiTheme: null, hAnsiTheme: null, cstheme: null, eastAsiaTheme: null, hint: null });
  if (size) { ensure(rPr, 'sz', { val: Math.round(size * 2) }); ensure(rPr, 'szCs', { val: Math.round(size * 2) }); }
  drop(rPr, 'color', 'highlight', 'shd', 'spacing', 'w', 'position', 'kern', 'caps', 'smallCaps');
  if (opt && opt.bold === true) { ensure(rPr, 'b'); ensure(rPr, 'bCs'); drop(rPr, 'b', 'bCs'); ensure(rPr, 'b'); ensure(rPr, 'bCs'); }
  if (opt && opt.bold === false) { drop(rPr, 'b', 'bCs'); }
  if (opt && opt.italic === false) { drop(rPr, 'i', 'iCs'); }
  if (opt && opt.underline === false) { drop(rPr, 'u'); }
  if (!kids(rPr).length) r.removeChild(rPr);
}
function runsOf(p, fn) { for (const r of ownRuns(p)) fn(r); }
/** Кегль прогона по умолчанию берём из профиля; сноски и ссылки — по типу. */

/* -------------------------- типографика -------------------------- */
const CYR = /[а-яё]/i;
/** Текст абзаца как одна строка с владельцем каждого символа: правила работают поперёк границ прогонов. */
function joined(ts) { let s = '', own = []; ts.forEach((t, k) => { const x = t.textContent; s += x; for (let i = 0; i < x.length; i++) own.push(k); }); return { s, own }; }
function rep(st, re, to) {
  let out = '', own = [], last = 0;
  st.s.replace(re, (...a) => {
    const m = a[0], hasGroups = typeof a[a.length - 1] === 'object', i = a[a.length - (hasGroups ? 3 : 2)];
    const r = typeof to === 'function' ? to(...a) : to.replace(/\$(\d|&)/g, (_, g) => g === '&' ? m : (a[+g] === undefined || typeof a[+g] !== 'string' ? '' : a[+g]));
    out += st.s.slice(last, i); own.push(...st.own.slice(last, i));
    let pre = 0; while (pre < m.length && pre < r.length && m[pre] === r[pre]) pre++;
    let suf = 0; while (suf < m.length - pre && suf < r.length - pre && m[m.length - 1 - suf] === r[r.length - 1 - suf]) suf++;
    const base = st.own[i + pre] !== undefined && pre < m.length - suf ? st.own[i + pre] : (st.own[i + pre - 1] !== undefined ? st.own[i + pre - 1] : st.own[i] || 0);
    out += r; own.push(...st.own.slice(i, i + pre)); for (let k = pre; k < r.length - suf; k++) own.push(base); own.push(...st.own.slice(i + m.length - suf, i + m.length));
    last = i + m.length; return m;
  });
  out += st.s.slice(last); own.push(...st.own.slice(last));
  st.s = out; st.own = own; return st;
}
function fixTypography(p, stats, bib) {
  const ts = ownTexts(p);
  if (!ts.length) return;
  const st = joined(ts), orig = st.s;
  const cyr = CYR.test(st.s);
  rep(st, /^[ \u00a0]+/, '');
  rep(st, / {2,}/g, ' ');
  rep(st, bib ? / +([,.!?)\]»])/g : / +([,.;:!?)\]»])/g, '$1');
  rep(st, /([(\[«]) +/g, '$1');
  if (!bib) { rep(st, /([а-яё]{2}[»)]?[.!?])(?=[А-ЯЁ][а-яё])/g, '$1 '); rep(st, /([а-яё]),(?=[а-яё])/g, '$1, '); }
  rep(st, /(\S) +[-—] +(?=\S)/g, '$1 – '); rep(st, /(\S) -- (?=\S)/g, '$1 – ');
  if (cyr) nbsp(st);
  if (cyr && st.s.includes('"')) {
    const s0 = st.s;
    rep(st, /"/g, (m, i) => { const before = i > 0 ? s0[i - 1] : ''; return !before || /[\s(\[«—–-]/.test(before) ? '«' : '»'; });
  }
  rep(st, /[ \u00a0]+$/, '');
  if (st.s === orig) return;
  ts.forEach((t, k) => {
    let x = ''; for (let i = 0; i < st.s.length; i++) if (st.own[i] === k) x += st.s[i];
    if (x !== t.textContent) t.textContent = x;
    if (/^\s|\s$/.test(x)) t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  });
  stats.typo++;
}
/** Неразрывные пробелы (п. 4.1.14 СТО): инициалы, числа с единицами, сокращения, №. */
const NB = '\u00A0';
const NBSP_RULES = [
  // «Иванов, И. И. Название»: после инициалов в заголовке записи идёт название, а не фамилия
  [/(?<=^|[\s(«\u00a0]|[А-ЯЁ]\.)(?<!, [А-ЯЁ]\.[ \u00a0])([А-ЯЁA-Z]\.) (?=[А-ЯЁA-Z][.а-яёa-z])/g, '$1' + NB],
  [/(?<=[А-ЯЁ][а-яё]+) (?=[А-ЯЁ]\.[ \u00a0]?[А-ЯЁ]\.(?![А-ЯЁа-яё]))/g, NB],
  [/(?<=\S) ([–—] )/g, NB + '$1'],
  [/\b(ISBN|ISSN|DOI|УДК|ББК) (?=[\dA-Za-z])/g, '$1' + NB],
  [/([А-ЯЁ]\.) ([А-ЯЁ]\.)/g, '$1' + NB + '$2'],
  [/(\d) (?=(с\.|г\.|гг\.|в\.|вв\.|руб\.|млн|млрд|тыс\.|%|кг|км|мм|см|м|ч|мин|л\.)(?=[\s.,;:)»]|$))/g, '$1' + NB],
  [/(?<!\d|(?<![а-яёА-ЯЁA-Za-z])т\.)(^|[\s(])(№|§|г\.|ул\.|пер\.|д\.|кв\.|стр\.|рис\.|табл\.|гл\.|ст\.|п\.|пп\.|ч\.|с\.|С\.|Т\.|Вып\.) (?=[\dА-ЯЁA-Z])/g, '$1$2' + NB],
  [/(?<!\p{L})т\.(?=[едкп]\.)/gu, 'т.' + NB],
  [/(?<!\p{L})(т|и т)\. (?=[едкп]\.)/gu, '$1.' + NB],
];
function nbsp(s) {
  const st = typeof s === 'string' ? { s, own: [...s].map(() => 0) } : s;
  NBSP_RULES.forEach(([re, to]) => rep(st, re, to));
  return typeof s === 'string' ? st.s : st;
}
/** Табуляции и пробелы в начале абзаца, которыми вручную делали отступ. */
function dropLeadingTabs(p) {
  for (const r of ownRuns(p)) {
    for (const c of kids(r)) {
      if (c.localName === 'tab') { r.removeChild(c); continue; }
      if (c.localName === 't') { if (c.textContent.trim()) return; continue; }
      if (c.localName === 'rPr') continue;
      return;
    }
  }
}
function replaceFirst(p, re, to) {
  for (const t of ownTexts(p)) { if (!t.textContent) continue; const s = t.textContent.replace(re, to); if (s !== t.textContent) { t.textContent = s; return true; } return false; }
  return false;
}
/** Убирает начало абзаца, совпавшее с re, даже если оно разбито на несколько прогонов или содержит табуляцию. */
function stripLead(p, re) {
  const parts = [];
  for (const r of ownRuns(p)) for (const c of kids(r)) {
    if (c.localName === 't') parts.push({ c, s: c.textContent });
    else if (c.localName === 'tab') parts.push({ c, s: '\t' });
  }
  const m = re.exec(parts.map(x => x.s).join(''));
  if (!m || m.index !== 0 || !m[0]) return false;
  let left = m[0].length;
  for (const x of parts) {
    if (!left) break;
    if (x.c.localName === 'tab') { x.c.parentNode.removeChild(x.c); left--; continue; }
    const k = Math.min(left, x.s.length); x.c.textContent = x.s.slice(k); left -= k;
  }
  return true;
}
function replaceLastTrailing(p, re, to) {
  const ts = ownTexts(p).filter(t => t.textContent.trim());
  const t = ts[ts.length - 1]; if (!t) return false;
  const s = t.textContent.replace(re, to); if (s !== t.textContent) { t.textContent = s; return true; } return false;
}
/** Заменяет весь текст абзаца одной строкой (для подписей), формат первого прогона сохраняется. */
function setParaText(p, text) {
  const runs = ownRuns(p).filter(r => kids(r, 't').length);
  if (!runs.length) return;
  let first = true;
  for (const r of runs) for (const t of kids(r, 't')) {
    if (first) { t.textContent = text; t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); first = false; }
    else r.removeChild(t);
  }
  for (const r of runs.slice(1)) { drop(r, 'tab'); if (!kids(r).filter(c => c.localName !== 'rPr').length) r.parentNode.removeChild(r); }
  drop(runs[0], 'tab');
}
function isAllCaps(s) { const l = s.replace(/[^A-Za-zА-Яа-яЁё]/g, ''); return l.length >= 3 && l === l.toUpperCase(); }

/* ------------------- список источников: приведение записей ------------------- */
/* Образцы — приложение М СТО САФУ 2026 (по ГОСТ Р 7.0.100–2018): «Иванов, И. И. Название: учебник /
   И. И. Иванов. – Москва: Наука, 2020. – 300 с.» Правила только безопасные: что не распознали — не трогаем. */
const CITIES = [[/^М\.?$/, 'Москва'], [/^СПб\.?$/, 'Санкт-Петербург'], [/^С\.-Пб\.?$/, 'Санкт-Петербург'], [/^С\.-Петерб\.?$/, 'Санкт-Петербург'], [/^Л\.?$/, 'Ленинград'], [/^Ростов н\/Д\.?$/, 'Ростов-на-Дону'],
  [/^Н\.\s?Новгород$/, 'Нижний Новгород'], [/^Екб\.?$/, 'Екатеринбург'], [/^Арх\.?$/, 'Архангельск'], [/^Новосиб\.?$/, 'Новосибирск'], [/^К\.?$/, 'Киев'], [/^Мн\.?$/, 'Минск']];
function bibToday() { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); }
function normBib(src) {
  let s = src.replace(/[ \t\r\n]+/g, ' ').trim();
  // ссылки прячем, чтобы правила про «/» и «:» их не задели
  const urls = [];
  s = s.replace(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi, u => { urls.push(u.replace(/[.,;]+$/, '')); return '\u0001' + (urls.length - 1) + '\u0002' + (u.match(/[.,;]+$/) || [''])[0]; });
  s = s.replace(/\s*\[(электронный ресурс|текст|electronic resource)\]\s*/gi, ' ');
  s = s.replace(/\s*[.–-]?\s*[–-]?\s*Текст\s*:\s*(электронный|непосредственный)\s*\.?/gi, '.');
  // «. – » между областями; дефис внутри сокращений («С.-Петерб.», «М.-Л.», «Изд-во») не трогаем
  s = s.replace(/[ \u00a0]*\.[ \u00a0]*(?:--|[—–]|-(?=[ \u00a0]))[ \u00a0]*/g, '. – ').replace(/[ \u00a0](?:--|[-—])[ \u00a0]/g, ' – ');
  s = s.replace(/\s*\/\/\s*/g, '\u0003').replace(/\s+\/\s*|\s*\/\s+/g, ' / ').replace(/\u0003/g, ' // ');
  s = s.replace(/\s+:\s*/g, ': ').replace(/\s+;/g, ';');
  s = s.replace(/Режим доступа:\s*(?=\u0001)/gi, 'URL: ').replace(/([^–\s])\.?\s+URL:/g, '$1. – URL:').replace(/\bURL\s*:?\s*(?=\u0001)/g, 'URL: ');
  s = s.replace(/\(\s*дата обращения\s*:?\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*\)/gi, (m, d, mo, y) => '(дата обращения: ' + d.padStart(2, '0') + '.' + mo.padStart(2, '0') + '.' + (y.length === 2 ? '20' + y : y) + ')');
  // «И.И.» → «И. И.» (но не «С.-Петерб.», «М.-Л.»)
  s = s.replace(/(^|[\s(«])([А-ЯЁA-Z])\.([А-ЯЁA-Z])\.(?![-–])/g, '$1$2. $3.');
  // ссылка и дата обращения: «…/b. (дата» → «…/b (дата»
  s = s.replace(/(\u0002)[.,;]\s*(?=\(дата обращения)/g, '$1 ');
  // город издания полностью (п. 4.13.6.6.1)
  s = s.replace(/(^|– |\. )([А-ЯЁ][а-яё]{0,3}\.|СПб\.?|С\.-Пб\.?|С\.-Петерб\.|Ростов н\/Д|Н\.\s?Новгород)\s*:\s*(?=\S)/g, (m, pre, c) => {
    for (const [re, full] of CITIES) if (re.test(c.trim())) return pre + full + ': ';
    return m;
  });
  // страницы
  s = s.replace(/(\d)\s*(?:с|стр)\.(?=\s|$|\s?[–.(])/g, '$1 с.').replace(/(^|[\s.])(?:С|Стр|стр)\.\s*(\d+)\s*[-—–]\s*(\d+)/g, '$1С. $2–$3');
  // в аналитическом описании области разделяются «. – » (п. 4.13.6.10 допускает и точку, но берём как в образцах)
  const dbl = s.indexOf(' // ');
  if (dbl > 0) {
    const tail = s.slice(dbl).replace(/([^.–\s])\.\s+(?=(\d{4}\b|№|Т\.\s?\d|Vol\.|С\.\s?\d|P\.\s?\d|Вып\.))/g, '$1. – ').replace(/,\s*(?=С\.\s?\d)/g, '. – ').replace(/(\d{4}),\s*(?=№)/g, '$1. – ');
    s = s.slice(0, dbl) + tail;
  }
  // заголовок описания: «Иванов И.И.» → «Иванов, И. И.»; сведения об ответственности после заглавия, если их нет
  const AU = /^([А-ЯЁA-Z][\p{L}'-]+),?\s+([А-ЯЁA-Z]\.)\s?([А-ЯЁA-Z]\.)?/u;
  const authors = []; let rest = s, m;
  while (authors.length < 4 && (m = AU.exec(rest))) {
    authors.push({ fam: m[1], ini: [m[2], m[3]].filter(Boolean).join(' ') });
    rest = rest.slice(m[0].length).replace(/^\s*,\s*/, ',').trimStart();
    if (!rest.startsWith(',') && !/^и\s/.test(rest)) break;
    rest = rest.replace(/^,\s*|^и\s+/, '');
  }
  if (authors.length && /^[«"A-ZА-ЯЁ0-9]/u.test(rest)) {
    let body = rest;
    const cut = body.search(/ \/\/ |\. – /);
    const hasResp = (cut < 0 ? body : body.slice(0, cut)).includes(' / ');
    // сведения об ответственности ставим только туда, где граница заглавия видна точно (« – » или « // »)
    if (!hasResp && cut >= 0) {
      const resp = ' / ' + authors.map(a => a.ini + ' ' + a.fam).join(', ');
      body = body.slice(0, cut).replace(/\.$/, '') + resp + body.slice(cut);
    }
    if (authors.length <= 3) s = authors[0].fam + ', ' + authors[0].ini + ' ' + body;
    else if (hasResp || cut >= 0) s = body; // четыре автора и больше: описание начинается с заглавия (ГОСТ Р 7.0.100, 4.13.6.2)
  }
  // электронный ресурс без даты обращения
  if (urls.length && !/дата обращения|Accessed/i.test(s)) s = s.replace(/(\u0001\d+\u0002)([.,;]?)(?!.*\u0001)/, '$1 (дата обращения: ' + bibToday() + ')$2');
  s = s.replace(/\s+([.,;])/g, '$1').replace(/\.{2,}/g, '.').replace(/\s{2,}/g, ' ').trim();
  if (!/\.$/.test(s)) s += '.';
  return s.replace(/\u0001(\d+)\u0002/g, (x, i) => urls[+i]);
}

/* ---------------------------- распознавание ---------------------------- */
const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').replace(/[.:;]+$/, '').trim();
const STRUCT_SET = new Set(STRUCT_SAFU.map(norm));
function structName(text, raw) {
  if (/\t/.test(raw) || /\.{3,}|…/.test(raw) || /\s\d{1,3}$/.test(text.trim())) return null;
  const n = norm(text.replace(/^\d+\s+/, ''));
  if (n.length > 110) return null;
  if (STRUCT_SET.has(n)) return n;
  { const m = /^(содержание|оглавление) (работы|реферата|отч[её]та|проекта|курсовой работы|эссе)$/.exec(n); if (m) return m[1]; }
  if (/^список (использованн\S* )?(литературы|источников)/.test(n) && n.length < 70) return 'список использованных источников';
  return null;
}
const isBibName = n => /^(список|библиографическ|литература$)/.test(n);
const isTocName = n => n === 'содержание' || n === 'оглавление';
const APPX = /^приложение\s+([А-ЯA-Z](?:\.\d+)?|\d+)(?=[\s.:]|$)/i;
const HEAD_NUM = /^(?:(глава|раздел|часть)\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})\.?(\s+|(?=[А-ЯЁA-Z]))(\S.*)$/i;
const FIG = /^(рис(?:унок|\.)?)\s*([А-ЯA-Z]?\.?\s?\d+(?:[.\-]\d+)?)\s*[.\-–—:]?\s*(.*)$/i;
const TAB = /^(таблица|табл\.)\s*([А-ЯA-Z]?\.?\s?\d+(?:[.\-]\d+)?)\s*[.\-–—:]?\s*(.*)$/i;
const MONO = /courier|consolas|mono|menlo|lucida console|source code/i;

function buildStyles(stylesDoc) {
  const map = new Map(), byName = new Map();
  let def = null;
  if (!stylesDoc) return { map, byName, def, chain: () => [] };
  for (const st of stylesDoc.getElementsByTagNameNS(W, 'style')) {
    const id = attr(st, 'styleId'), name = (attr(kid(st, 'name'), 'val') || '').toLowerCase();
    const pPr = kid(st, 'pPr'), rPr = kid(st, 'rPr');
    const ol = attr(kid(pPr, 'outlineLvl'), 'val');
    let level = ol != null && +ol < 9 ? +ol + 1 : null;
    const m = /^(heading|заголовок)\s*(\d)/.exec(name); if (m) level = +m[2];
    map.set(id, { id, el: st, name, type: attr(st, 'type'), based: attr(kid(st, 'basedOn'), 'val'), pPr, rPr, level, title: name === 'title' });
    byName.set(name, id);
    if (attr(st, 'type') === 'paragraph' && ['1', 'true'].includes(attr(st, 'default'))) def = id;
  }
  const chain = id => { const out = []; for (let i = 0; id && i < 12 && map.has(id); i++) { out.push(map.get(id)); id = map.get(id).based; } return out; };
  return { map, byName, def, chain };
}

/* ============================ главное ============================ */
async function formatDocx(buf, opts) {
  opts = Object.assign({ profile: 'safu', binding: false, toc: true, typography: true, pageNumbers: true }, opts || {});
  const prof = PROFILES[opts.profile] || PROFILES.safu;
  const size = opts.size || prof.size;
  const entries = await unzip(buf);
  const get = n => entries.find(e => e.name === n);
  const dec = new TextDecoder(), enc = new TextEncoder();
  const parse = n => { const e = get(n); return e ? new DOMParser().parseFromString(dec.decode(e.data), 'application/xml') : null; };
  const put = (n, doc) => { const s = new XMLSerializer().serializeToString(doc); const e = get(n); const data = enc.encode(s.startsWith('<?xml') ? s : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + s); if (e) e.data = data; else entries.push({ name: n, data }); };
  const putText = (n, s) => { const e = get(n); const data = enc.encode(s); if (e) e.data = data; else entries.push({ name: n, data }); };

  const doc = parse('word/document.xml');
  if (!doc || doc.getElementsByTagName('parsererror').length) throw new Error('Не удалось прочитать документ. Сохраните его в Word как .docx и попробуйте снова.');
  const stylesDoc = parse('word/styles.xml');
  const St = buildStyles(stylesDoc);
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const stats = { body: 0, heads: 0, struct: 0, figs: 0, figCaps: 0, tabCaps: 0, tables: 0, bib: 0, empty: 0, typo: 0, breaks: 0, listings: 0, foot: 0, toc: false, tocAdded: false, appx: 0, lists: 0, renamed: false, bibFixed: 0 };
  const notes = [];

  /* ---------- 1. классификация ---------- */
  let B = blocks(body);
  const info = new Map();
  const styleLevel = p => {
    const pPr = kid(p, 'pPr'), ol = attr(kid(pPr, 'outlineLvl'), 'val');
    if (ol != null && +ol < 9) return +ol + 1;
    for (const s of St.chain(attr(kid(pPr, 'pStyle'), 'val') || St.def)) { if (s.level) return s.level; if (s.title) return 0; }
    return null;
  };
  const boldShare = p => { let b = 0, all = 0; for (const r of ownRuns(p)) { const n = kids(r, 't').reduce((s, t) => s + t.textContent.length, 0); all += n; const rp = kid(r, 'rPr'); if (rp && kid(rp, 'b') && !['0', 'false'].includes(attr(kid(rp, 'b'), 'val'))) b += n; } return all ? b / all : 0; };
  const monoShare = p => { let m = 0, all = 0; for (const r of ownRuns(p)) { const n = kids(r, 't').reduce((s, t) => s + t.textContent.length, 0); all += n; const f = kid(kid(r, 'rPr'), 'rFonts'); if (f && MONO.test((attr(f, 'ascii') || '') + (attr(f, 'hAnsi') || ''))) m += n; } return all ? m / all : 0; };

  let tocField = false;
  /* «РЕФЕРАТ» на титульном листе — это вид работы, а не структурный элемент: после него идёт «на тему…», а не текст */
  const titleWord = (name, i) => {
    if (!['реферат', 'аннотация', 'abstract'].includes(name)) return false;
    for (let j = i + 1; j < Math.min(B.length, i + 4); j++) {
      if (B[j].localName !== 'p') return false;
      const t = paraText(B[j]).trim(); if (!t) continue;
      return /^(на тему|по дисциплине|по курсу|тема|студент|выполнил)/i.test(t) || t.length < 40;
    }
    return true;
  };
  // рисунок перед подписью: пропускаем пустые абзацы между ними
  const prevDrawing = i => { for (let k = i - 1; k >= 0 && k >= i - 3; k--) { const b = B[k]; if (b.localName !== 'p') return false; if (hasDrawing(b)) return true; if (paraText(b).trim()) return false; } return false; };
  B.forEach((b, i) => {
    if (b.localName === 'tbl') { info.set(b, { kind: 'table' }); return; }
    const raw = paraText(b, true), text = raw.replace(/\s+/g, ' ').trim();
    const instr = [...b.getElementsByTagNameNS(W, 'instrText')].map(x => x.textContent).join('');
    const inToc = /\bTOC\b/.test(instr) || (() => { for (let a = b.parentNode; a && a !== body; a = a.parentNode) if (a.localName === 'sdt') { const g = a.getElementsByTagNameNS(W, 'docPartGallery')[0]; if (g && /Table of Contents/i.test(attr(g, 'val') || '')) return true; } return false; })();
    if (inToc) tocField = true;
    const x = { kind: 'body', text, raw };
    if (!text) x.kind = hasDrawing(b) ? 'figure' : 'empty';
    else if (hasDrawing(b) && text.length < 4) x.kind = 'figure';
    else if (hasMath(b) && text.replace(/\(\s*[\dА-ЯA-Z.]+\s*\)/g, '').trim().length < 4) x.kind = 'formula';
    else if (structName(text, raw) && !titleWord(structName(text, raw), i)) { x.kind = 'struct'; x.name = structName(text, raw); }
    else if (APPX.test(text) && text.length < 90 && !/\t|\.{3,}|…/.test(raw)) x.kind = 'appendix';
    else if (FIG.test(text) && text.length < 300 && !/^рис\S*\s+\d+\s+[а-яё]/.test(text) && /^рис/i.test(text) && (prevDrawing(i) || /^рисунок\s/i.test(text) && text.length < 200)) x.kind = 'figcap';
    else if (TAB.test(text) && text.length < 300 && (B[i + 1] && B[i + 1].localName === 'tbl' || B[i + 2] && B[i + 2].localName === 'tbl' && !paraText(B[i + 1]).trim())) x.kind = 'tabcap';
    else if (monoShare(b) > .8) x.kind = 'listing';
    else {
      const lvl = styleLevel(b), m = HEAD_NUM.exec(text), bold = boldShare(b);
      const short = text.length <= 160 && !/[;:,]$/.test(text) && text.split(' ').length <= 22;
      if (lvl && lvl >= 1 && short) { x.kind = 'head'; x.level = Math.min(lvl, 4); }
      else if (m && short && /^[А-ЯЁA-Z]/.test(m[4]) && (bold > .6 || lvl || (!/[.!?]$/.test(text) && text.length < 120) )) { x.kind = 'head'; x.level = m[1] ? 1 : m[2].split('.').length; x.num = m; }
      else if (short && !/[.!?]$/.test(text) && text.length < 90 && (bold > .8 && isAllCaps(text))) { x.kind = 'head'; x.level = 1; }
    }
    info.set(b, x);
  });

  /* зоны: титульная часть (до первого структурного заголовка), содержание, список источников, приложения */
  const firstStruct = B.findIndex(b => info.get(b).kind === 'struct');
  const firstHead = B.findIndex(b => ['struct', 'head'].includes(info.get(b).kind));
  let titleEnd = firstStruct >= 0 ? firstStruct : (firstHead > 0 && firstHead < 40 ? firstHead : 0);
  {
    // титул отдельным разделом (так вставляет его и сам сайт): весь первый раздел — титул
    const k = B.findIndex((b, j) => j < 60 && b.localName === 'p' && kid(kid(b, 'pPr'), 'sectPr'));
    if (k >= 0 && titleEnd < k + 1 && (firstStruct < 0 || firstStruct > k)) {
      const zoneText = B.slice(0, k + 1).map(b => b.localName === 'p' ? info.get(b).text : '').join(' ');
      if (/министерств|университет|высшая школа/i.test(zoneText) && !B.slice(0, k + 1).some(b => b.localName === 'p' && info.get(b).text.length > 250)) titleEnd = k + 1;
    }
  }
  {
    // титул кончается строкой «Архангельск 2026»: всё, что после неё, уже работа (иначе можно потерять текст при замене титула)
    const j = B.slice(0, titleEnd).findIndex(b => b.localName === 'p' && /^[А-ЯЁ][а-яё-]+,?\s+(?:19|20)\d\d(?:\s*г\.?)?$/.test(info.get(b).text));
    if (j >= 0) { titleEnd = j + 1; while (titleEnd < B.length && B[titleEnd].localName === 'p' && !info.get(B[titleEnd]).text && !hasDrawing(B[titleEnd])) titleEnd++; }
  }
  {
    // титульный лист короткий: если до первого заголовка уже идёт обычный текст, титул кончается на разрыве страницы перед ним (или его нет)
    const long = B.slice(0, titleEnd).findIndex(b => b.localName === 'p' && info.get(b).text.length > 250);
    if (long >= 0) {
      let cut = 0;
      for (let k = 0; k < long; k++) { const b = B[k]; if (b.localName === 'p' && ([...b.getElementsByTagNameNS(W, 'br')].some(e => attr(e, 'type') === 'page') || kid(kid(b, 'pPr'), 'pageBreakBefore') || kid(kid(b, 'pPr'), 'sectPr'))) cut = k + 1; }
      titleEnd = cut;
    }
  }
  let zone = 'title';
  B.forEach((b, i) => {
    const x = info.get(b);
    if (i >= titleEnd && zone === 'title') zone = 'main';
    if (x.kind === 'struct') zone = isTocName(x.name) ? 'toc' : isBibName(x.name) ? 'bib' : 'main';
    else if (x.kind === 'appendix') zone = 'appx';
    else if (x.kind === 'head' && zone === 'toc' && !/\t|\.{3,}|…|\d$/.test(x.raw)) zone = 'main';
    x.zone = zone;
    // обычный абзац текста (длинный, без номера страницы в конце) значит, что оглавление кончилось
    if (zone === 'toc' && x.kind === 'body' && !/\t|\.{3,}|…|\d\s*$/.test(x.raw) && (x.text.length > 100 || x.text.length > 50 && /[.!?:;»"]$/.test(x.text))) zone = 'main';
    x.zone = zone;
    if (zone === 'toc' && x.kind === 'body') x.kind = 'tocline';
    if (zone === 'toc' && x.kind === 'head' && /\t|\.{3,}|…|\d$/.test(x.raw)) { x.kind = 'tocline'; }
    if (zone === 'bib' && ['body', 'head'].includes(x.kind)) x.kind = 'bibitem';
    if (zone === 'title' && x.kind !== 'table') x.kind = x.kind === 'empty' ? 'empty' : 'title';
  });
  if (titleEnd === 0 && firstStruct < 0) notes.push('Не нашёл заголовков «Введение», «Заключение» и т. п. — титульный лист не выделен, оформлено всё как основной текст.');

  /* акронимы из основного текста, чтобы не испортить их при смене регистра заголовков */
  const acr = new Set();
  for (const b of B) { const x = info.get(b); if (x.kind === 'body' && !isAllCaps(x.text || '')) for (const w of (x.text.match(/(?<![\p{L}])[А-ЯЁA-Z]{2,7}(?![\p{L}])/gu) || [])) acr.add(w); }
  const sentence = s => { let first = true; return s.replace(/[A-Za-zА-Яа-яЁё]+/g, w => { const out = acr.has(w) ? w : first ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase(); first = false; return out; }); };
  const recase = (p, fn) => { for (const t of ownTexts(p)) t.textContent = fn(t.textContent); };

  /* ---------- 2. стили заголовков ---------- */
  const styleId = level => {
    if (!stylesDoc) return null;
    const name = 'heading ' + level;
    if (St.byName.has(name)) return St.byName.get(name);
    const root = stylesDoc.documentElement, id = 'Heading' + level;
    const st = mk(stylesDoc, 'style', { type: 'paragraph', styleId: id });
    st.appendChild(mk(stylesDoc, 'name', { val: name }));
    if (St.def) st.appendChild(mk(stylesDoc, 'basedOn', { val: St.def }));
    if (St.def) st.appendChild(mk(stylesDoc, 'next', { val: St.def }));
    st.appendChild(mk(stylesDoc, 'uiPriority', { val: 9 }));
    st.appendChild(mk(stylesDoc, 'qFormat'));
    const pp = mk(stylesDoc, 'pPr'); pp.appendChild(mk(stylesDoc, 'keepNext')); pp.appendChild(mk(stylesDoc, 'outlineLvl', { val: level - 1 })); st.appendChild(pp);
    root.appendChild(st); St.byName.set(name, id); St.map.set(id, { id, el: st, name, level });
    return id;
  };

  /* ---------- 3. оформление блоков ---------- */
  const pageStart = new Set();
  const capSize = Math.max(10, size + prof.fig.sizeDelta), cellSize = Math.max(10, size + prof.tab.cellSizeDelta);
  const toRemove = [];
  B.forEach((b, i) => {
    const x = info.get(b), next = B[i + 1], nx = next && info.get(next);
    if (x.kind === 'table') {
      const tbl = b;
      if (x.zone === 'title' || !tbl.parentNode) return;
      stats.tables++;
      const tblPr = ensure(tbl, 'tblPr');
      const hasMathInside = tbl.getElementsByTagNameNS(M_NS, 'oMath').length > 0;
      const brd = kid(tblPr, 'tblBorders'), styled = !!kid(tblPr, 'tblStyle');
      const visible = styled || (brd && kids(brd).some(e => !['nil', 'none'].includes(attr(e, 'val'))));
      if (!hasMathInside) {
        ensure(tblPr, 'jc', { val: 'center' }); drop(tblPr, 'tblInd');
        if (visible) {
          const bb = ensure(tblPr, 'tblBorders');
          for (const n of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) { const e = kid(bb, n) || bb.appendChild(mk(doc, n)); setAttrs(e, { val: 'single', sz: prof.tab.borderSz, space: 0, color: '000000', themeColor: null, themeShade: null, themeTint: null }); }
          // правильный порядок внутри tblBorders
          for (const n of ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV']) for (const e of kids(bb, n)) bb.appendChild(e);
        }
      }
      const rows = kids(tbl, 'tr');
      rows.forEach((tr, ri) => {
        if (ri === 0 && rows.length > 2 && !hasMathInside) ensure(ensure(tr, 'trPr'), 'tblHeader');
        for (const p of tr.getElementsByTagNameNS(W, 'p')) {
          const pPr = pPrOf(p);
          if (hasMath(p)) { runsOf(p, r => setRun(r, prof, null)); continue; }
          setSpacing(pPr, 0, 0, 1); setIndent(pPr, 0, 0); drop(pPr, 'pageBreakBefore');
          if (ri === 0 && rows.length > 1) setJc(pPr, 'center');
          runsOf(p, r => setRun(r, prof, cellSize, { keepFont: MONO.test(attr(kid(kid(r, 'rPr'), 'rFonts'), 'ascii') || '') }));
          if (opts.typography) fixTypography(p, stats);
        }
      });
      if (next && nx && nx.kind !== 'table') nx.afterTable = true;
      return;
    }
    const p = b, pPr = pPrOf(p);
    drop(pPr, 'framePr');
    switch (x.kind) {
      case 'empty': {
        if (x.zone === 'title') return;
        const keep = kid(pPr, 'sectPr') || p.getElementsByTagNameNS(W, 'fldChar').length || p.getElementsByTagNameNS(W, 'bookmarkStart').length && ![...p.getElementsByTagNameNS(W, 'bookmarkStart')].every(e => /^_GoBack$/.test(attr(e, 'name') || ''));
        const brk = [...p.getElementsByTagNameNS(W, 'br')].some(e => attr(e, 'type') === 'page') || kid(pPr, 'pageBreakBefore');
        if (keep) return;
        if (brk) { x.kind = 'break'; return; }
        toRemove.push(p); stats.empty++; return;
      }
      case 'title': {
        runsOf(p, r => { const rPr = kid(r, 'rPr'); const f = rPr && kid(rPr, 'rFonts'); if (!f || !MONO.test(attr(f, 'ascii') || '')) { const rp = rPrOf(r); setAttrs(ensure(rp, 'rFonts'), { ascii: prof.font, hAnsi: prof.font, cs: prof.font, eastAsia: prof.font, asciiTheme: null, hAnsiTheme: null, cstheme: null, eastAsiaTheme: null }); drop(rp, 'color'); } });
        return;
      }
      case 'struct': {
        stats.struct++;
        const isToc = isTocName(x.name);
        const sid = styleId(1); if (sid && !isToc) ensure(pPr, 'pStyle', { val: sid });
        if (isToc) { const st = attr(kid(pPr, 'pStyle'), 'val'); if (st && St.map.get(st) && St.map.get(st).level) drop(pPr, 'pStyle'); }
        drop(pPr, 'numPr', 'outlineLvl');
        setSpacing(pPr, 0, prof.struct.after, prof.line); setIndent(pPr, 0, 0); setJc(pPr, 'center');
        ensure(pPr, 'keepNext'); ensure(pPr, 'suppressAutoHyphens');
        runsOf(p, r => setRun(r, prof, size, { bold: true, italic: false, underline: false }));
        {
          let t = paraText(p).replace(/^\s*\d+\s+/, '').replace(/\.\s*$/, '');
          t = prof.struct.case === 'upper' ? t.toUpperCase() : t.toLowerCase().replace(/^\s*[а-яёa-z]/, c => c.toUpperCase()).replace(/\(ии\)/, '(ИИ)');
          if (t !== paraText(p)) setParaText(p, t);
        }
        if (opts.typography) fixTypography(p, stats);
        if (prof.bibTitle && isBibName(x.name) && norm(paraText(p)) !== norm(prof.bibTitle)) { setParaText(p, prof.struct.case === 'upper' ? prof.bibTitle.toUpperCase() : prof.bibTitle); stats.renamed = true; }
        // п. 3.3.1 СТО САФУ: у работы на одну тему — «Оглавление»
        if (isToc && prof.tocTitle && norm(paraText(p)) !== norm(prof.tocTitle)) { setParaText(p, prof.struct.case === 'upper' ? prof.tocTitle.toUpperCase() : prof.tocTitle); stats.tocRenamed = true; }
        if (isToc) ensure(pPr, 'outlineLvl', { val: 9 });
        if (prof.struct.newPage) pageStart.add(p);
        return;
      }
      case 'appendix': {
        stats.appx++;
        drop(pPr, 'numPr');
        setSpacing(pPr, 0, 0, prof.appendix.line); setIndent(pPr, 0, 0); setJc(pPr, 'center'); ensure(pPr, 'keepNext');
        const sid = styleId(1); if (sid) ensure(pPr, 'pStyle', { val: sid });
        runsOf(p, r => setRun(r, prof, size, { bold: true, italic: false, underline: false }));
        { let t = paraText(p).replace(/\.\s*$/, ''); if (prof.struct.case !== 'upper') t = t.replace(/^(\s*)ПРИЛОЖЕНИЕ/, '$1Приложение'); if (t !== paraText(p)) setParaText(p, t); }
        pageStart.add(p);
        // следующая строка — «(обязательное)» и/или заголовок приложения: по центру, интервал после
        let j = i + 1;
        while (B[j] && info.get(B[j]).kind !== 'table' && info.get(B[j]).text && info.get(B[j]).text.length < 160 && j <= i + 2) {
          const q = B[j], qp = pPrOf(q), qx = info.get(q);
          qx.kind = 'appxtitle';
          const last = !(B[j + 1] && info.get(B[j + 1]).text && /^\(/.test(qx.text) && j < i + 2);
          setSpacing(qp, 0, last ? prof.appendix.after : 0, prof.appendix.line); setIndent(qp, 0, 0); setJc(qp, 'center'); ensure(qp, 'keepNext');
          drop(qp, 'numPr', 'pStyle', 'outlineLvl');
          runsOf(q, r => setRun(r, prof, size, { bold: !/^\(/.test(qx.text), italic: false }));
          replaceLastTrailing(q, /\.\s*$/, '');
          if (last) break; j++;
        }
        return;
      }
      case 'appxtitle': return;
      case 'head': {
        stats.heads++;
        const lvl = Math.max(1, Math.min(4, x.level || 1));
        if (!x.inTocZone) { const sid = styleId(Math.min(lvl, 3)); if (sid) ensure(pPr, 'pStyle', { val: sid }); }
        drop(pPr, 'outlineLvl');
        const hasNum = !!kid(pPr, 'numPr');
        const prevHead = B[i - 1] && ['head', 'struct'].includes(info.get(B[i - 1]).kind);
        setSpacing(pPr, lvl >= 2 || prevHead ? prof.head.subBefore : 0, prof.head.after, prof.line);
        if (hasNum) { const ind = ensure(pPr, 'ind'); setAttrs(ind, { left: 0, start: null, hanging: null, firstLine: Math.round(prof.indent * TW_CM), right: 0 }); }
        else setIndent(pPr, prof.head.indent ? prof.indent : 0, 0);
        setJc(pPr, 'left'); ensure(pPr, 'keepNext'); ensure(pPr, 'keepLines'); ensure(pPr, 'suppressAutoHyphens');
        runsOf(p, r => setRun(r, prof, size, { bold: true, italic: false, underline: false }));
        dropLeadingTabs(p);
        {
          // весь текст заголовка целиком: номер мог быть разбит на несколько прогонов
          let t = paraText(p).replace(/^\s+/, '');
          t = t.replace(/^((?:(?:глава|раздел|часть)\s+)?\d+(?:\.\d+)*)\.(?=\s|[А-ЯЁA-Z])/i, '$1');
          t = t.replace(/^((?:(?:глава|раздел|часть)\s+)?\d+(?:\.\d+)*)(?=[А-ЯЁA-Z])/i, '$1 ');
          t = t.replace(/([^.])\.\s*$/, '$1');
          if (prof.head.dropWord && /^(?:глава|раздел|часть)\s+\d/i.test(t)) {
            t = t.replace(/^(?:глава|раздел|часть)\s+/i, '').replace(/^(\d+(?:\.\d+)*\s+)([а-яё])/, (m, a, c) => a + c.toUpperCase());
            stats.chapterWord = (stats.chapterWord || 0) + 1;
          }
          if (isAllCaps(x.text)) t = sentence(t);
          if (t !== paraText(p)) setParaText(p, t);
        }
        if (opts.typography) fixTypography(p, stats);
        if (lvl === 1 && prof.head.chapterNewPage) pageStart.add(p);
        return;
      }
      case 'figure': {
        stats.figs++;
        drop(pPr, 'numPr');
        const capNext = nx && nx.kind === 'figcap';
        setSpacing(pPr, prof.fig.around, capNext ? 0 : prof.fig.around, 1); setIndent(pPr, 0, 0); setJc(pPr, 'center');
        if (capNext) ensure(pPr, 'keepNext');
        return;
      }
      case 'figcap': {
        stats.figCaps++;
        drop(pPr, 'numPr', 'pStyle');
        const m = FIG.exec(x.text);
        let num = m[2].replace(/\s/g, '').replace(/-/g, '.'), title = (m[3] || '').replace(/\.\s*$/, '').trim();
        if (title) title = title[0].toUpperCase() + title.slice(1);
        setParaText(p, prof.fig.word + ' ' + num + (title ? prof.fig.sep + title : ''));
        setSpacing(pPr, 0, prof.fig.around, 1); setIndent(pPr, 0, 0); setJc(pPr, 'center'); drop(pPr, 'keepNext');
        runsOf(p, r => setRun(r, prof, capSize, { bold: false, italic: false, underline: false }));
        return;
      }
      case 'tabcap': {
        stats.tabCaps++;
        drop(pPr, 'numPr', 'pStyle');
        const m = TAB.exec(x.text);
        let num = m[2].replace(/\s/g, '').replace(/-/g, '.'), title = (m[3] || '').replace(/\.\s*$/, '').trim();
        if (title) title = title[0].toUpperCase() + title.slice(1);
        setParaText(p, prof.tab.word + ' ' + num + (title ? prof.tab.sep + title : ''));
        setSpacing(pPr, x.afterTable ? prof.tab.afterTable : prof.tab.before, prof.tab.after, 1); setIndent(pPr, 0, 0); setJc(pPr, 'left');
        ensure(pPr, 'keepNext'); ensure(pPr, 'keepLines');
        runsOf(p, r => setRun(r, prof, size, { bold: false, italic: false, underline: false }));
        return;
      }
      case 'formula': {
        runsOf(p, r => setRun(r, prof, size, { keepFont: false }));
        setIndent(pPr, 0, 0);
        return;
      }
      case 'listing': {
        stats.listings++;
        setSpacing(pPr, 0, 0, 1); setIndent(pPr, 0, 0); setJc(pPr, 'left');
        runsOf(p, r => setRun(r, prof, prof.listing.size, { keepFont: true }));
        return;
      }
      case 'tocline': {
        stats.toc = true;
        drop(pPr, 'numPr', 'outlineLvl');
        { const st = attr(kid(pPr, 'pStyle'), 'val'); if (st && St.map.get(st) && St.map.get(st).level) drop(pPr, 'pStyle'); }
        if (!tocField || !b.getElementsByTagNameNS(W, 'hyperlink').length) setIndent(pPr, 0, /^\s*\d+\.\d+/.test(x.text || '') ? prof.indent : 0);
        setSpacing(pPr, 0, 0, prof.line);
        runsOf(p, r => setRun(r, prof, size, { bold: false, italic: false, underline: false }));
        return;
      }
      case 'bibitem': {
        stats.bib++;
        const n = stats.bib;
        const hadNum = !!kid(pPr, 'numPr');
        drop(pPr, 'numPr', 'pStyle', 'outlineLvl');
        setSpacing(pPr, 0, 0, prof.bib.line); setIndent(pPr, prof.indent, 0); setJc(pPr, 'both');
        runsOf(p, r => setRun(r, prof, size, prof.bib.plain ? { bold: false, italic: false } : {}));
        dropLeadingTabs(p);
        if (opts.profile === 'safu' && !hasDrawing(p)) {
          const before = paraText(p).replace(/[ \t\r\n]+/g, ' ').trim().replace(/^\[?\d{1,3}[\s\u00a0]*[\].)]?[\s\u00a0]*/, '');
          const after = normBib(before);
          if (after !== before && after.length > 10) { setParaText(p, after); stats.bibFixed++; }
        }
        if (opts.typography) fixTypography(p, stats, opts.profile !== 'safu');
        // номер, набранный вручную («1.», «1)», «[1]», «1<tab>»), снимаем и ставим свой — без повторов «1 1»
        for (let k = 0; k < 2; k++) {
          const lead = /^[\s\u00a0]*\[?(\d{1,3})(?:[\s\u00a0]*[\].)]|\t)[\s\u00a0]*/;
          const plain = new RegExp('^[\\s\\u00a0]*' + n + '[\\s\\u00a0]+(?=\\S)');
          if (!stripLead(p, lead) && !stripLead(p, plain)) break;
        }
        { const t = ownTexts(p).find(t => t.textContent.length) || ownTexts(p)[0]; if (t) { t.textContent = n + ' ' + t.textContent.replace(/^[\s\u00a0]+/, ''); t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); } }
        void hadNum;
        return;
      }
      default: { // основной текст и перечисления
        stats.body++;
        const list = !!kid(pPr, 'numPr');
        drop(pPr, 'pageBreakBefore', 'outlineLvl');
        const st = attr(kid(pPr, 'pStyle'), 'val'); if (st && St.map.get(st) && St.map.get(st).level) drop(pPr, 'pStyle');
        setSpacing(pPr, x.afterTable ? prof.tab.afterTable : 0, 0, prof.line);
        if (list) { const ind = ensure(pPr, 'ind'); setAttrs(ind, { left: 0, start: null, hanging: null, firstLine: Math.round(prof.indent * TW_CM), right: 0, firstLineChars: null, leftChars: null, hangingChars: null }); }
        else setIndent(pPr, prof.indent, 0);
        setJc(pPr, 'both');
        runsOf(p, r => setRun(r, prof, size, {}));
        dropLeadingTabs(p);
        if (opts.typography) { if (stripLead(p, /^[•·▪●◦][\s\u00a0]*/)) { const t0 = ownTexts(p).find(t => t.textContent) || ownTexts(p)[0]; if (t0) t0.textContent = '- ' + t0.textContent; } fixTypography(p, stats); }
        if (nx && nx.kind === 'figure') ensure(pPr, 'keepNext');
      }
    }
  });

  /* ---------- 4. разрывы страниц ---------- */
  const removePageBreaks = p => {
    let n = 0;
    for (const br of [...p.getElementsByTagNameNS(W, 'br')]) if (attr(br, 'type') === 'page') { const r = br.parentNode; r.removeChild(br); n++; if (!kids(r).filter(c => c.localName !== 'rPr').length) r.parentNode && r.parentNode.removeChild(r); }
    drop(kid(p, 'pPr'), 'pageBreakBefore');
    return n;
  };
  for (const p of toRemove) if (p.parentNode) p.parentNode.removeChild(p);
  B = blocks(body);
  for (let i = 0; i < B.length; i++) {
    const b = B[i]; if (!pageStart.has(b)) continue;
    // ручные разрывы перед заголовком больше не нужны — Word начнёт с новой страницы сам
    for (let j = i - 1; j >= 0; j--) {
      const q = B[j], qx = info.get(q);
      if (q.localName === 'tbl') break;
      if (qx && qx.kind === 'break' && !kid(kid(q, 'pPr'), 'sectPr')) { removePageBreaks(q); if (!paraText(q).trim() && !hasDrawing(q)) { q.parentNode.removeChild(q); stats.breaks++; } continue; }
      if (qx && qx.zone === 'title' && qx.kind !== 'break') { break; }
      const n = removePageBreaks(q); stats.breaks += n ? 1 : 0;
      break;
    }
    const pPr = pPrOf(b);
    if (i > 0) ensure(pPr, 'pageBreakBefore');
    removePageBreaks(b) && ensure(pPr, 'pageBreakBefore');
    if (i > 0) ensure(pPr, 'pageBreakBefore');
  }
  B = blocks(body);

  /* ---------- 4б. титульный лист из конструктора ---------- */
  if (opts.titleXml) {
    let removed = 0;
    for (const b of B) {
      const x = info.get(b);
      if (!x || x.zone !== 'title') break;
      if (b.localName === 'p' && kid(kid(b, 'pPr'), 'sectPr')) { for (const r of ownRuns(b)) r.parentNode.removeChild(r); continue; }
      b.parentNode.removeChild(b); removed++;
    }
    const frag = new DOMParser().parseFromString(`<w:body xmlns:w="${W}" xmlns:r="${R_NS}">${opts.titleXml}</w:body>`, 'application/xml');
    if (frag.getElementsByTagName('parsererror').length) throw new Error('Не получилось собрать титульный лист.');
    const first = body.firstChild;
    for (const n of [...frag.documentElement.childNodes]) {
      const el = doc.importNode(n, true);
      body.insertBefore(el, first);
      if (el.nodeType === 1) info.set(el, { kind: el.localName === 'tbl' ? 'table' : 'title', zone: 'title', text: '' });
    }
    stats.title = removed ? 'replaced' : 'added';
    B = blocks(body);
    const firstMain = B.find(b => { const x = info.get(b); return x && x.zone !== 'title'; });
    if (firstMain && firstMain.localName === 'p') ensure(pPrOf(firstMain), 'pageBreakBefore');
  }

  /* ---------- 5. содержание ---------- */
  const tocP = (text, first, last) => {
    const p = mk(doc, 'p'), pp = p.appendChild(mk(doc, 'pPr'));
    pp.appendChild(mk(doc, 'tabs')).appendChild(mk(doc, 'tab', { val: 'right', leader: 'dot', pos: 9354 }));
    pp.appendChild(mk(doc, 'spacing', { before: 0, after: 0, line: Math.round(prof.line * 240), lineRule: 'auto' }));
    pp.appendChild(mk(doc, 'ind', { firstLine: 0, left: 0 }));
    if (first) { p.appendChild(fld(doc, 'begin')); p.appendChild(instrRun(doc, ' TOC \\o "1-3" \\h \\z \\u ')); p.appendChild(fld(doc, 'separate')); }
    p.appendChild(runEl(doc, prof, size, text, false));
    if (last) p.appendChild(fld(doc, 'end'));
    return p;
  };
  const tocLinks = [];
  const tocItems = from => B.slice(Math.max(0, B.indexOf(from))).filter(b => { const x = info.get(b); return x && x.zone !== 'toc' && ['struct', 'head', 'appendix'].includes(x.kind) && !isTocName(x.name || ''); })
    .map(b => ({ b, t: paraText(b).replace(/\s+/g, ' ').trim() })).filter(x => x.t);
  const insertToc = before => {
    const items = tocItems(before);
    const ps = items.map((it, k) => { const p = tocP(it.t, k === 0, k === items.length - 1); tocLinks.push({ p, head: it.b, lvl: (info.get(it.b) || {}).level || 1 }); return p; });
    for (const p of ps) before.parentNode.insertBefore(p, before);
    ps.forEach(p => info.set(p, { kind: 'tocline', zone: 'toc' }));
    tocField = true;
    return ps.length;
  };
  const tocHead = B.find(b => { const x = info.get(b); return x && x.kind === 'struct' && isTocName(x.name); });
  if (tocHead && !tocField && opts.toc) {
    // оглавление набрано вручную: номера страниц в нём почти всегда неверны — заменяем на автоматическое
    const old = [];
    const normToc = t => t.toLowerCase().replace(/[^а-яёa-z0-9]+/g, '');
    const laterTexts = new Set(B.slice(B.indexOf(tocHead) + 1).map(b => info.get(b)).filter(x => x && x.zone !== 'toc' && x.text && x.text.length < 160).map(x => normToc(x.text)));
    for (let k = B.indexOf(tocHead) + 1; k < B.length; k++) {
      const x = info.get(B[k]);
      if (!x || x.zone !== 'toc' || !['tocline', 'empty', 'body'].includes(x.kind)) break;
      // убираем только то, что похоже на строку оглавления: иначе можно потерять текст работы
      if (x.text && !/\t|\.{3,}|…|\d\s*$/.test(x.raw) && !laterTexts.has(normToc(x.text))) break;
      old.push(B[k]);
    }
    const next = B[B.indexOf(tocHead) + 1 + old.length];
    if (next) {
      for (const p of old) { p.parentNode.removeChild(p); info.delete(p); }
      if (insertToc(next)) { stats.tocRebuilt = true; }
      B = blocks(body);
    }
  }
  if (!tocHead && opts.toc) {
    const intro = B.find(b => { const x = info.get(b); return x && x.kind === 'struct' && x.name === 'введение'; });
    const heads = B.filter(b => { const x = info.get(b); return x && ['struct', 'head', 'appendix'].includes(x.kind); });
    if (intro && heads.length >= 3) {
      const h = mk(doc, 'p'), hp = h.appendChild(mk(doc, 'pPr'));
      const sid = styleId(1);
      if (sid) hp.appendChild(mk(doc, 'pStyle', { val: sid }));
      hp.appendChild(mk(doc, 'keepNext')); hp.appendChild(mk(doc, 'pageBreakBefore'));
      const tt = prof.tocTitle || 'Содержание';
      const title = prof.struct.case === 'upper' ? tt.toUpperCase() : tt;
      hp.appendChild(mk(doc, 'spacing', { before: 0, after: prof.struct.after * 20, line: Math.round(prof.line * 240), lineRule: 'auto' }));
      hp.appendChild(mk(doc, 'ind', { firstLine: 0, left: 0 })); hp.appendChild(mk(doc, 'jc', { val: 'center' }));
      // заголовок «Содержание» не должен попадать в само содержание
      hp.appendChild(mk(doc, 'outlineLvl', { val: 9 }));
      h.appendChild(runEl(doc, prof, size, title, true));
      intro.parentNode.insertBefore(h, intro);
      insertToc(intro);
      info.set(h, { kind: 'struct', name: 'содержание', zone: 'toc' });
      pageStart.add(h);
      stats.tocAdded = true;
      B = blocks(body);
    }
  }

  /* ---------- 6. поля, формат листа, номера страниц ---------- */
  const lastSect = kid(body, 'sectPr') || body.appendChild(mk(doc, 'sectPr'));
  const allSects = () => [...body.getElementsByTagNameNS(W, 'sectPr')].filter(s => !inTable(s, body) && s.parentNode.localName !== 'rPr' && s.parentNode.localName !== 'sectPrChange');
  const margins = Object.assign({}, prof.margins, opts.binding ? { left: prof.bindingLeft } : {});
  const setPage = s => {
    const sz = ensure(s, 'pgSz'), land = attr(sz, 'orient') === 'landscape' || (+attr(sz, 'w') > +attr(sz, 'h'));
    setAttrs(sz, land ? { w: 16838, h: 11906, orient: 'landscape' } : { w: 11906, h: 16838, orient: null, code: null });
    const m = ensure(s, 'pgMar');
    const T = Math.round(margins.top * TW_MM), Bm = Math.round(margins.bottom * TW_MM), L = Math.round(margins.left * TW_MM), Rr = Math.round(margins.right * TW_MM);
    setAttrs(m, land ? { top: Rr, right: Bm, bottom: L, left: T } : { top: T, right: Rr, bottom: Bm, left: L });
    setAttrs(m, { header: 709, footer: 567, gutter: 0 });
  };
  for (const s of allSects()) setPage(s);

  if (opts.pageNumbers) {
    // отдельный колонтитул с номером страницы по центру внизу
    const rels = parse('word/_rels/document.xml.rels');
    const relRoot = rels.documentElement;
    const used = new Set([...relRoot.getElementsByTagNameNS(PKG_REL, 'Relationship')].map(r => r.getAttribute('Id')));
    let rid = 'rIdFmt1'; for (let k = 1; used.has(rid); k++) rid = 'rIdFmt' + k;
    let fn = 'footer1.xml'; for (let k = 2; get('word/' + fn); k++) fn = 'footer' + k + '.xml';
    const rel = rels.createElementNS(PKG_REL, 'Relationship');
    rel.setAttribute('Id', rid); rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer'); rel.setAttribute('Target', fn);
    relRoot.appendChild(rel); put('word/_rels/document.xml.rels', rels);
    const r = (inner) => `<w:r><w:rPr><w:rFonts w:ascii="${prof.font}" w:hAnsi="${prof.font}" w:cs="${prof.font}"/><w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/></w:rPr>${inner}</w:r>`;
    putText('word/' + fn, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr xmlns:w="${W}" xmlns:r="${R_NS}"><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0" w:left="0"/><w:jc w:val="center"/></w:pPr>` +
      r('<w:fldChar w:fldCharType="begin"/>') + r('<w:instrText xml:space="preserve"> PAGE </w:instrText>') + r('<w:fldChar w:fldCharType="separate"/>') + r('<w:t>2</w:t>') + r('<w:fldChar w:fldCharType="end"/>') + '</w:p></w:ftr>');
    const ct = parse('[Content_Types].xml');
    const ov = ct.createElementNS(CT_NS, 'Override');
    ov.setAttribute('PartName', '/word/' + fn); ov.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml');
    ct.documentElement.appendChild(ov); put('[Content_Types].xml', ct);

    // где начинается нумерация: с содержания (СТО САФУ) или сразу после титула (ГОСТ)
    B = blocks(body);
    let numStart = B.findIndex((b, i) => { const x = info.get(b); return x && x.kind === 'struct' && !prof.hideNumbersOn.includes(x.name); });
    if (numStart < 0) numStart = B.findIndex(b => { const x = info.get(b); return x && x.zone !== 'title'; });
    const hasTitle = B.slice(0, Math.max(0, numStart)).some(b => { const x = info.get(b); return x && x.zone === 'title' && x.kind !== 'empty'; }) || numStart > 0;
    if (numStart > 0 && hasTitle) {
      const prev = B[numStart - 1];
      const prevSect = prev.localName === 'p' && kid(kid(prev, 'pPr'), 'sectPr');
      if (!prevSect) {
        // разрыв раздела: на титуле (и реферате) номеров нет, нумерация сквозная
        // берём параметры раздела, в котором стоит титул (первого), а не последнего — последний бывает альбомным
        const s = (allSects()[0] || lastSect).cloneNode(true);
        drop(s, 'headerReference', 'footerReference', 'titlePg', 'pgNumType', 'type');
        ensure(s, 'type', { val: 'nextPage' });
        let holder = prev;
        if (prev.localName !== 'p') { holder = mk(doc, 'p'); prev.parentNode.insertBefore(holder, prev.nextSibling); }
        const hp = pPrOf(holder); drop(hp, 'sectPr'); hp.appendChild(s);
        drop(pPrOf(B[numStart]), 'pageBreakBefore');
        removePageBreaks(holder);
        if (!paraText(holder).trim() && !hasDrawing(holder)) setSpacing(hp, 0, 0, 1);
      } else {
        drop(pPrOf(B[numStart]), 'pageBreakBefore');
        // разрыв после титула должен начинать новую страницу, даже если в исходнике он был «на текущей странице»
        const ps = kid(kid(prev, 'pPr'), 'sectPr'), ty = kid(ps, 'type');
        if (ty && attr(ty, 'val') === 'continuous') ty.parentNode.removeChild(ty);
        if (!paraText(prev).trim() && !hasDrawing(prev)) { drop(pPrOf(prev), 'pageBreakBefore'); removePageBreaks(prev); }
      }
    }
    B = blocks(body);
    const startBlock = numStart >= 0 ? B.findIndex(b => b === (numStart >= 0 ? blocks(body)[numStart] : null)) : 0;
    // разделы, которые заканчиваются до начала нумерации, — без колонтитула; остальные — с номером
    const order = B.map(b => b);
    const sectEnds = allSects().map(s => ({ s, at: s === lastSect ? order.length : order.indexOf(s.parentNode.parentNode) }));
    const startAt = hasTitle && numStart > 0 ? order.findIndex(b => b.localName === 'p' && kid(kid(b, 'pPr'), 'sectPr')) : -1;
    sectEnds.forEach(({ s, at }, k) => {
      drop(s, 'footerReference', 'titlePg');
      if (k > 0) drop(s, 'pgNumType');
      const before = startAt >= 0 && at <= startAt && hasTitle;
      if (!before) { const fr = mk(doc, 'footerReference', { type: 'default' }); fr.setAttributeNS(R_NS, 'r:id', rid); s.insertBefore(fr, s.firstChild); }
      else {
        // пустой колонтитул, чтобы раздел не унаследовал чужой
      }
    });
    if (startAt < 0) { // титульника нет или он не отделён: номер на всех страницах, кроме первой (если она титульная)
      if (hasTitle) ensure(lastSect, 'titlePg');
    }
    void startBlock;
  }

  /* ---------- 7. стили документа ---------- */
  if (stylesDoc) {
    const root = stylesDoc.documentElement;
    let dd = kid(root, 'docDefaults');
    if (!dd) { dd = mk(stylesDoc, 'docDefaults'); root.insertBefore(dd, root.firstChild); }
    const rd = ensure(ensure(dd, 'rPrDefault'), 'rPr');
    setAttrs(ensure(rd, 'rFonts'), { ascii: prof.font, hAnsi: prof.font, cs: prof.font, eastAsia: prof.font, asciiTheme: null, hAnsiTheme: null, cstheme: null, eastAsiaTheme: null });
    ensure(rd, 'sz', { val: size * 2 }); ensure(rd, 'szCs', { val: size * 2 });
    // порядок rPrDefault/pPrDefault
    if (kid(dd, 'pPrDefault')) dd.appendChild(kid(dd, 'pPrDefault'));
    const pd = ensure(ensure(dd, 'pPrDefault'), 'pPr');
    setAttrs(ensure(pd, 'spacing'), { before: 0, after: 0, line: Math.round(prof.line * 240), lineRule: 'auto' });
    for (const st of St.map.values()) {
      if (!st.el || !st.el.parentNode) continue;
      const name = st.name || '';
      const isHead = /^heading \d|^title$|^subtitle$/.test(name), isToc = /^toc \d/.test(name), isCap = name === 'caption', isLink = name === 'hyperlink' || name === 'followedhyperlink';
      const isNormal = st.id === St.def;
      if (!(isHead || isToc || isCap || isLink || isNormal || name === 'footnote text' || name === 'list paragraph' || name === 'no spacing')) {
        const rp = kid(st.el, 'rPr'), f = rp && kid(rp, 'rFonts');
        if (f && (attr(f, 'asciiTheme') || attr(f, 'hAnsiTheme')) && !MONO.test(attr(f, 'ascii') || '')) setAttrs(f, { ascii: prof.font, hAnsi: prof.font, cs: prof.font, asciiTheme: null, hAnsiTheme: null, cstheme: null, eastAsiaTheme: null });
        continue;
      }
      const rp = ensure(st.el, 'rPr');
      if (!isLink) setAttrs(ensure(rp, 'rFonts'), { ascii: prof.font, hAnsi: prof.font, cs: prof.font, eastAsia: prof.font, asciiTheme: null, hAnsiTheme: null, cstheme: null, eastAsiaTheme: null });
      drop(rp, 'color', 'caps', 'smallCaps', 'spacing', 'kern');
      if (isLink) drop(rp, 'u');
      if (isHead) { drop(rp, 'i', 'iCs'); ensure(rp, 'b'); ensure(rp, 'bCs'); ensure(rp, 'sz', { val: size * 2 }); ensure(rp, 'szCs', { val: size * 2 }); }
      if (isToc) { drop(rp, 'b', 'bCs', 'i', 'iCs'); ensure(rp, 'sz', { val: size * 2 }); ensure(rp, 'szCs', { val: size * 2 }); }
      if (isCap) { drop(rp, 'b', 'bCs', 'i', 'iCs'); ensure(rp, 'sz', { val: capSize * 2 }); ensure(rp, 'szCs', { val: capSize * 2 }); }
      if (name === 'footnote text') { ensure(rp, 'sz', { val: prof.foot.size * 2 }); ensure(rp, 'szCs', { val: prof.foot.size * 2 }); }
      if (isNormal) { ensure(rp, 'sz', { val: size * 2 }); ensure(rp, 'szCs', { val: size * 2 }); }
      if (!kids(rp).length) st.el.removeChild(rp);
      if (isHead || isToc || isNormal) {
        const pp = ensure(st.el, 'pPr');
        const lvl = isToc ? +name.slice(4) : 0;
        setAttrs(ensure(pp, 'spacing'), { before: isHead ? 0 : 0, after: isHead ? prof.head.after * 20 : 0, line: Math.round(prof.line * 240), lineRule: 'auto', beforeAutospacing: null, afterAutospacing: null });
        drop(pp, 'contextualSpacing');
        if (isToc) { setAttrs(ensure(pp, 'ind'), { left: lvl > 1 ? Math.round(prof.indent * TW_CM) : 0, firstLine: 0, hanging: null }); drop(pp, 'jc'); }
      }
      // rPr после pPr
      const rp2 = kid(st.el, 'rPr'), pp2 = kid(st.el, 'pPr'); if (rp2 && pp2 && pp2.compareDocumentPosition(rp2) & Node.DOCUMENT_POSITION_PRECEDING) st.el.insertBefore(pp2, rp2);
    }
    put('word/styles.xml', stylesDoc);
  }

  /* ---------- 8. сноски ---------- */
  const fdoc = parse('word/footnotes.xml');
  if (fdoc) {
    for (const fnEl of fdoc.getElementsByTagNameNS(W, 'footnote')) {
      if (attr(fnEl, 'type') && attr(fnEl, 'type') !== 'normal') continue;
      for (const p of fnEl.getElementsByTagNameNS(W, 'p')) {
        const pPr = pPrOf(p);
        setSpacing(pPr, 0, 0, 1); setIndent(pPr, 0, 0); setJc(pPr, 'both');
        runsOf(p, r => setRun(r, prof, prof.foot.size, {}));
        // убираем точку в конце сноски (п. 4.10.11)
        if (opts.profile === 'safu') replaceLastTrailing(p, /([^.])\.\s*$/, '$1');
      }
      stats.foot++;
    }
    put('word/footnotes.xml', fdoc);
  }

  /* ---------- 8б. перечисления: дефис вместо точек, «1)» вместо «1.» (п. 4.4.3–4.4.4) ---------- */
  const ndoc = prof.listsDash ? parse('word/numbering.xml') : null;
  if (ndoc) {
    const headNums = new Set();
    for (const b of blocks(body)) { const x = info.get(b); if (x && ['head', 'struct', 'appendix'].includes(x.kind)) { const id = attr(kid(kid(kid(b, 'pPr'), 'numPr'), 'numId'), 'val'); if (id) headNums.add(id); } }
    const absOfNum = new Map(); for (const n of ndoc.getElementsByTagNameNS(W, 'num')) absOfNum.set(attr(n, 'numId'), attr(kid(n, 'abstractNumId'), 'val'));
    const headAbs = new Set([...headNums].map(id => absOfNum.get(id)));
    for (const an of ndoc.getElementsByTagNameNS(W, 'abstractNum')) {
      if (headAbs.has(attr(an, 'abstractNumId'))) continue;
      for (const lvl of kids(an, 'lvl')) {
        const fmt = attr(kid(lvl, 'numFmt'), 'val'), txt = kid(lvl, 'lvlText');
        if (!txt) continue;
        const suff = kid(lvl, 'suff') || lvl.insertBefore(mk(ndoc, 'suff'), txt);
        if (fmt === 'bullet' || /^%\d\.$/.test(attr(txt, 'val') || '') && fmt === 'decimal') setAttrs(suff, { val: 'space' }); else if (!attr(suff, 'val')) lvl.removeChild(suff);
        if (fmt === 'bullet') {
          setAttrs(txt, { val: '-' }); stats.lists++;
          const rp = kid(lvl, 'rPr') || lvl.appendChild(mk(ndoc, 'rPr'));
          setAttrs(ensure(rp, 'rFonts'), { ascii: prof.font, hAnsi: prof.font, cs: prof.font, eastAsia: null, hint: null });
        } else if (fmt === 'decimal' && /^%\d\.$/.test(attr(txt, 'val') || '')) { setAttrs(txt, { val: attr(txt, 'val').replace('.', ')') }); stats.lists++; }
      }
    }
    put('word/numbering.xml', ndoc);
  }

  /* что проверить вручную */
  {
    const bl = blocks(body).map(b => [b, info.get(b)]).filter(([, x]) => x);
    const bibs = bl.filter(([, x]) => x.kind === 'bibitem').map(([b]) => paraText(b));
    const badBib = bibs.filter(t => !/(1[89]|20)\d\d/.test(t) || !/[–—-]\s/.test(t) && !/URL|http/i.test(t));
    if (badBib.length) notes.push(`Список источников: ${badBib.length} из ${bibs.length} записей похожи на неполное описание (нет года или разделителей « – »). Сверьте их с ГОСТ Р 7.0.100–2018, п. 4.13 СТО.`);
    if (!bibs.length) notes.push('Не найден «Список использованных источников» — он обязателен почти для всех видов работ (таблица 1 СТО).');
    if (stats.figs > stats.figCaps) notes.push(`Рисунков без подписи «Рисунок N. Название»: ${stats.figs - stats.figCaps}. Подпись ставится под рисунком (п. 4.5.6).`);
    if (stats.tables > stats.tabCaps) notes.push(`Таблиц без заголовка «Таблица N. Название»: ${stats.tables - stats.tabCaps}. Заголовок ставится над таблицей (п. 4.9.4).`);
    if (!bl.some(([, x]) => x.kind === 'struct' && x.name === 'введение')) notes.push('Не найден заголовок «Введение».');
    if (!bl.some(([, x]) => x.kind === 'struct' && /^(заключение|выводы)/.test(x.name))) notes.push('Не найден заголовок «Заключение» (или «Выводы»).');
    if (opts.profile === 'safu' && !bl.some(([, x]) => x.kind === 'struct' && /искусственного интеллекта/.test(x.name)))
      notes.push('Если при работе вы пользовались нейросетями, перед заключением нужен раздел «Информация об использовании технологий искусственного интеллекта (ИИ)» (п. 3.9 СТО).');
  }

  /* ---------- 8в. номера страниц в оглавлении: оцениваем сразу, Word уточнит при открытии ---------- */
  if (tocLinks.length) {
    const pages = estimatePages(blocks(body), Object.assign({ margins, size, line: prof.line, font: prof.font, cellSize }, opts.est || {}));
    if (opts.est && opts.est.debug) stats.debugPages = blocks(body).map(b => [b.localName === 'tbl' ? '[таблица]' : paraText(b).slice(0, 40), pages.get(b) || 0]);
    for (const { p, head } of tocLinks) {
      const n = pages.get(head); if (!n) continue;
      const end = [...p.childNodes].reverse().find(c => c.localName === 'r' && c.getElementsByTagNameNS(W, 'fldChar').length && attr(c.getElementsByTagNameNS(W, 'fldChar')[0], 'fldCharType') === 'end');
      const tabR = runEl(doc, prof, size, '', false); tabR.removeChild(kid(tabR, 't')); tabR.appendChild(mk(doc, 'tab'));
      const numR = runEl(doc, prof, size, String(n), false);
      p.insertBefore(tabR, end || null); p.insertBefore(numR, end || null);
    }
    // уровень вложенности: подразделы с отступом
    for (const { p, head } of tocLinks) { const t = paraText(head); if (/^\s*\d+\.\d+/.test(t)) setAttrs(ensure(pPrOf(p), 'ind'), { left: Math.round(prof.indent * TW_CM / 2), firstLine: 0 }); }
    stats.tocPages = true;
  }

  /* ---------- 9. настройки: автоперенос, обновление содержания ---------- */
  if (!get('word/settings.xml')) {
    // в файле нет настроек (так сохраняют некоторые конвертеры) — добавляем, иначе Word не обновит оглавление сам
    putText('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="${W}"/>`);
    const rels = parse('word/_rels/document.xml.rels'), rr = rels.documentElement;
    if (![...rr.getElementsByTagNameNS(PKG_REL, 'Relationship')].some(r => /\/settings$/.test(r.getAttribute('Type')))) {
      const rel = rels.createElementNS(PKG_REL, 'Relationship');
      rel.setAttribute('Id', 'rIdFmtSettings'); rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings'); rel.setAttribute('Target', 'settings.xml');
      rr.appendChild(rel); put('word/_rels/document.xml.rels', rels);
    }
    const ct = parse('[Content_Types].xml');
    const ov = ct.createElementNS(CT_NS, 'Override'); ov.setAttribute('PartName', '/word/settings.xml'); ov.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml');
    ct.documentElement.appendChild(ov); put('[Content_Types].xml', ct);
  }
  const sdoc = parse('word/settings.xml');
  if (sdoc) {
    const root = sdoc.documentElement;
    ensure(root, 'autoHyphenation', { val: 'true' });
    if (tocField) ensure(root, 'updateFields', { val: 'true' });
    put('word/settings.xml', sdoc);
  }

  put('word/document.xml', doc);
  const blob = await zip(entries);

  /* ---------- отчёт ---------- */
  const list = [];
  const pl = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
  list.push(`Лист A4, поля: левое ${margins.left}, правое ${margins.right}, верхнее ${margins.top}, нижнее ${margins.bottom} мм`);
  list.push(`Основной текст: ${prof.font} ${size} пт, интервал ${String(prof.line).replace('.', ',')}, отступ ${String(prof.indent).replace('.', ',')} см, по ширине, интервалы до и после 0 пт — ${stats.body} ${pl(stats.body, 'абзац', 'абзаца', 'абзацев')}`);
  if (stats.struct) list.push(`Заголовки структурных элементов (${stats.struct}): ${prof.struct.case === 'upper' ? 'прописными' : 'с заглавной буквы'}, по центру, полужирные, с новой страницы`);
  if (stats.heads) list.push(`Заголовки глав и подразделов (${stats.heads}): полужирные, с абзацного отступа, без точки в конце, главы с новой страницы`);
  if (stats.tocAdded) list.push('Добавлено автоматическое содержание — Word обновит номера страниц при открытии (или: правая кнопка → «Обновить поле»)');
  else if (stats.tocRebuilt) list.push('Оглавление, набранное вручную, заменено на автоматическое (номера страниц обновятся при открытии в Word)');
  else if (tocField) list.push('Содержание обновится при открытии в Word');
  if (stats.figs || stats.figCaps) list.push(`Рисунки (${stats.figs}) по центру, подписи (${stats.figCaps}) в виде «${prof.fig.word} 1${prof.fig.sep}Название», кегль ${capSize}`);
  if (stats.tabCaps || stats.tables) list.push(`Таблицы (${stats.tables}): по центру, текст ${cellSize} пт с одинарным интервалом; заголовки (${stats.tabCaps}) «${prof.tab.word} 1${prof.tab.sep}Название» над таблицей слева`);
  if (stats.bib) list.push(`Список источников: ${stats.bib} ${pl(stats.bib, 'запись', 'записи', 'записей')} пронумерованы «1 …» с абзацного отступа${prof.bib.plain ? ', без полужирного и курсива' : ''}`);
  if (stats.title) list.push(stats.title === 'replaced' ? 'Титульный лист заменён на сгенерированный по форме СТО САФУ (приложение Б)' : 'Добавлен титульный лист по форме СТО САФУ (приложение Б)');
  if (stats.bibFixed) list.push(`Описания источников приведены к образцам приложения М СТО: ${stats.bibFixed} ${pl(stats.bibFixed, 'запись', 'записи', 'записей')} (заголовок «Фамилия, И. О.», «/ И. О. Фамилия», « – », город полностью, «С. 12–25», дата обращения)`);
  if (stats.tocRenamed) list.push(`Заголовок «Содержание» заменён на «${prof.tocTitle}» (п. 3.3.1)`);
  if (stats.renamed) list.push(`Заголовок списка литературы приведён к названию «${prof.bibTitle}» (п. 4.2.1)`);
  if (stats.lists) list.push('Перечисления: маркеры заменены на дефис «-», нумерация «1.» на «1)» (п. 4.4.3–4.4.4)');
  if (stats.appx) list.push(`Приложения (${stats.appx}): с новой страницы, по центру`);
  if (stats.foot) list.push(`Сноски (${stats.foot}): ${prof.foot.size} пт, одинарный интервал`);
  if (stats.listings) list.push(`Листинги кода (${stats.listings}): моноширинный шрифт ${prof.listing.size} пт, одинарный интервал`);
  if (opts.pageNumbers) list.push('Номера страниц внизу по центру, на титульном листе' + (prof.hideNumbersOn.length ? ' и реферате' : '') + ' не ставятся');
  if (stats.empty) list.push(`Убрано пустых строк: ${stats.empty}`);
  if (stats.typo) list.push(`Исправлены пробелы, тире и кавычки в ${stats.typo} ${pl(stats.typo, 'абзаце', 'абзацах', 'абзацах')}`);
  list.push('Включён автоматический перенос слов, текст — чёрным цветом');
  return { blob, report: list, notes, stats, profile: prof };
}

const TNR_CH = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u0410\u0411\u0412\u0413\u0414\u0415\u0401\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f\u0430\u0431\u0432\u0433\u0434\u0435\u0451\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f\u00ab\u00bb\u2013\u2014\u2026\u2116\u00a0";
const TNR_R = [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541,722,574,667,578,682,611,611,896,501,722,722,667,678,889,722,722,722,556,667,611,708,790,722,722,650,1009,1009,706,872,574,660,1028,667,444,509,472,410,509,444,444,691,395,535,535,486,499,633,535,500,535,500,444,437,500,648,500,535,503,770,770,517,672,456,429,747,460,500,500,500,1000,1000,954,250], TNR_B = [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,722,661,667,636,688,667,667,989,528,778,778,725,745,944,778,778,778,611,722,667,734,859,722,778,734,1098,1098,765,982,661,678,1126,722,500,500,540,454,506,444,444,725,402,576,576,576,561,681,576,500,576,556,444,491,500,692,500,576,564,844,844,583,781,529,432,764,541,500,500,500,1000,1000,1005,250];
/** Ширина строки в пунктах по метрикам Times New Roman (совпадают с Liberation Serif). */
const TNR_IDX = new Map([...TNR_CH].map((c, i) => [c, i]));
function textW(s, size, bold) {
  const tb = bold ? TNR_B : TNR_R; let w = 0;
  for (const c of s) { const i = TNR_IDX.get(c); w += i == null ? 520 : tb[i]; }
  return w * size / 1000;
}
/** Сколько строк займёт текст при ширине колонки widthPt (жадный перенос по словам + автоперенос длинных слов). */
function countLines(text, size, bold, widthPt, firstPt) {
  const words = text.split(/[ \t]+/).filter(Boolean); if (!words.length) return 1;
  const sp = 250 * size / 1000, hy = 333 * size / 1000;
  let lines = 1, x = firstPt || 0, start = true;
  for (let w of words) {
    let ww = textW(w, size, bold);
    const need = (start ? 0 : sp) + ww;
    if (x + need <= widthPt) { x += need; start = false; continue; }
    // автоперенос: часть слова остаётся на этой строке, если влезают хотя бы 3 буквы
    const room = widthPt - x - (start ? 0 : sp) - hy;
    if (w.length >= 6 && room > 0) {
      let k = 0, acc = 0; for (const c of w) { const cw = textW(c, size, bold); if (acc + cw > room) break; acc += cw; k++; }
      if (k >= 3 && w.length - k >= 2) { w = w.slice(k); ww = textW(w, size, bold); }
    }
    lines++; x = ww; start = false;
    while (x > widthPt) { lines++; x -= widthPt; }
  }
  return lines;
}
/** Грубая вёрстка: на какой странице окажется каждый блок. Без шрифтовых метрик — по средней ширине знака
    Times New Roman; ошибка обычно ±1 страница, точные номера Word проставит, обновив поле. */
function estimatePages(B, o) {
  const MM = 25.4 / 72; // мм в пункте
  const pageH = 297 - o.margins.top - o.margins.bottom - 4;
  const textW = 210 - o.margins.left - o.margins.right;
  const LH = o.lh || 1.15;
  const lineOf = (sz, mult) => sz * LH * mult * MM;
  // высота абзаца: строки по метрикам шрифта + интервалы до/после
  const measure = (p, w) => {
    const pPr = kid(p, 'pPr'), sp = kid(pPr, 'spacing');
    const r = ownRuns(p).find(x => kids(x, 't').length) || ownRuns(p)[0], szEl = r && kid(kid(r, 'rPr'), 'sz');
    const sz = szEl ? +attr(szEl, 'val') / 2 : o.size;
    const mult = sp && attr(sp, 'line') && (attr(sp, 'lineRule') || 'auto') === 'auto' ? +attr(sp, 'line') / 240 : o.line;
    let pic = 0;
    for (const d of p.getElementsByTagNameNS(WP_NS, 'extent')) { if (d.parentNode && d.parentNode.localName === 'inline') pic += (+d.getAttribute('cy') || 0) / 36000; }
    const t = paraText(p);
    const ind = kid(pPr, 'ind'), first = ind ? (+attr(ind, 'firstLine') || 0) / 56.7 : 0;
    const bold = !!(r && kid(kid(r, 'rPr'), 'b'));
    const indL = ind ? ((+attr(ind, 'left') || 0) + (+attr(ind, 'right') || 0)) / 56.7 : 0;
    const lines = t.trim() ? countLines(t, sz, bold, (w - indL) / MM, first / MM) : (pic ? 0 : 1);
    const lh = lineOf(sz, mult);
    const before = sp ? (+attr(sp, 'before') || 0) / 20 * MM : 0, after = sp ? (+attr(sp, 'after') || 0) / 20 * MM : 0;
    return { lines, lh, before, after, pic, h: before + after + pic + lines * lh };
  };
  // 1) блоки → элементы вёрстки
  const items = [];
  for (const b of B) {
    if (b.localName === 'tbl') {
      const grid = kids(kid(b, 'tblGrid'), 'gridCol').map(g => (+attr(g, 'w') || 0) / 56.7);
      const rows = kids(b, 'tr');
      rows.forEach((tr, k) => {
        let rh = 0, col = 0;
        for (const tc of kids(tr, 'tc')) {
          const span = +attr(kid(kid(tc, 'tcPr'), 'gridSpan'), 'val') || 1;
          let cw = grid.slice(col, col + span).reduce((a, c) => a + c, 0); col += span;
          if (!cw) cw = textW / Math.max(1, kids(tr, 'tc').length);
          let ch = 0; for (const p of kids(tc, "p")) ch += measure(p, cw - 3.9).h;
          rh = Math.max(rh, ch);
        }
        items.push({ b: k === 0 ? b : null, h: rh * (o.tf || 1.05) + 0.6, whole: true, keepNext: false });
      });
      continue;
    }
    if (b.localName !== 'p') continue;
    const pPr = kid(b, 'pPr');
    if (kid(pPr, 'framePr')) { items.push({ b, h: 0, whole: true, frame: true }); continue; }
    const m = measure(b, textW);
    items.push(Object.assign(m, { b, whole: !!(kid(pPr, 'keepLines') || m.pic || m.lines <= 1), keepNext: !!kid(pPr, 'keepNext'),
      breakBefore: !!kid(pPr, 'pageBreakBefore'),
      breaksAfter: [...b.getElementsByTagNameNS(W, 'br')].filter(x => attr(x, 'type') === 'page').length +
        (kid(pPr, 'sectPr') && attr(kid(kid(pPr, 'sectPr'), 'type'), 'val') !== 'continuous' ? 1 : 0) }));
  }
  // 2) раскладка по страницам: «не отрывать от следующего», висячие строки (минимум 2 строки на странице)
  const pages = new Map();
  let page = 1, y = 0;
  const brk = () => { page++; y = 0; };
  const head = it => it.whole ? it.h : Math.min(it.h, it.before + 2 * it.lh);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.breakBefore && y > 0) brk();
    if (it.frame) { if (it.b) pages.set(it.b, page); continue; }
    let need = it.whole ? it.h : head(it);
    if (it.keepNext) { need = it.h; for (let j = i; items[j] && items[j].keepNext && items[j + 1] && j < i + 4; j++) need += items[j + 1].keepNext ? items[j + 1].h : head(items[j + 1]); }
    if (y > 0 && y + need > pageH) brk();
    if (it.b) pages.set(it.b, page);
    if (it.whole || y + it.h <= pageH) { y += it.h; while (y > pageH + 0.5) { y -= pageH; page++; } }
    else {
      // абзац рвётся: на этой странице минимум 2 строки, на следующей тоже минимум 2
      let lines = it.lines, fit = Math.floor((pageH - y - it.before) / it.lh);
      if (lines - fit < 2) fit = lines - 2;
      if (fit < 2) { brk(); if (it.b) pages.set(it.b, page); y = it.h; }
      else {
        lines -= fit; page++;
        const per = Math.floor(pageH / it.lh);
        while (lines > per) { lines -= per; page++; }
        y = lines * it.lh + it.after;
      }
    }
    for (let k = 0; k < (it.breaksAfter || 0); k++) brk();
  }
  return pages;
}

function runEl(doc, prof, size, text, bold) {
  const r = mk(doc, 'r'), rp = r.appendChild(mk(doc, 'rPr'));
  rp.appendChild(mk(doc, 'rFonts', { ascii: prof.font, hAnsi: prof.font, cs: prof.font, eastAsia: prof.font }));
  if (bold) { rp.appendChild(mk(doc, 'b')); rp.appendChild(mk(doc, 'bCs')); }
  rp.appendChild(mk(doc, 'sz', { val: size * 2 })); rp.appendChild(mk(doc, 'szCs', { val: size * 2 }));
  const t = r.appendChild(mk(doc, 't')); t.textContent = text; t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  return r;
}
function fld(doc, type) { const r = mk(doc, 'r'); r.appendChild(mk(doc, 'fldChar', { fldCharType: type })); return r; }
function instrRun(doc, s) { const r = mk(doc, 'r'), t = r.appendChild(mk(doc, 'instrText')); t.textContent = s; t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); return r; }

/* ------------------- данные со старого титульного листа ------------------- */
/** Читает титульник работы: вид, дисциплина, тема, ФИО, группа, руководитель… Чтобы собрать титул по форме СТО без ручного ввода. */
async function readTitle(buf) {
  const entries = await unzip(buf);
  const e = entries.find(x => x.name === 'word/document.xml'); if (!e) return null;
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(e.data), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0]; if (!body) return null;
  const lines = [];
  const pushP = p => { const t = paraText(p).replace(/[\s ]+/g, ' ').trim(); if (t) lines.push(t); };
  outer: for (const b of kids(body)) {
    const ps = b.localName === 'p' ? [b] : b.localName === 'tbl' ? [...b.getElementsByTagNameNS(W, 'p')] : b.localName === 'sdt' ? [...b.getElementsByTagNameNS(W, 'p')] : [];
    for (const p of ps) {
      const t = paraText(p).replace(/[\s ]+/g, ' ').trim();
      if (/^(содержание|оглавление|введение)\.?$/i.test(t) || lines.length > 70 || t.length > 250) break outer;
      pushP(p);
      if (lines.length > 3 && b.localName === 'p' && ([...p.getElementsByTagNameNS(W, 'br')].some(e => attr(e, 'type') === 'page') || kid(kid(p, 'pPr'), 'sectPr'))) break outer;
      if (/^(архангельск|северодвинск|коряжма)(?![а-яёА-ЯЁA-Za-z]).*\b(19|20)\d\d(?![а-яёА-ЯЁA-Za-z])/i.test(t)) break outer;
    }
  }
  if (!lines.length) return null;
  const all = lines.join('\n');
  const d = {};
  const TYPES = [[/^реферат(?![а-яёА-ЯЁA-Za-z])/i, 'referat'], [/^эссе(?![а-яёА-ЯЁA-Za-z])/i, 'esse'], [/^контрольная работа(?![а-яёА-ЯЁA-Za-z])/i, 'kontrol'], [/^расч[её]тно-графическая(?![а-яёА-ЯЁA-Za-z])/i, 'rgr'],
    [/^курсовая работа(?![а-яёА-ЯЁA-Za-z])/i, 'kursovaya'], [/^курсовой проект(?![а-яёА-ЯЁA-Za-z])/i, 'kproekt'], [/^отч[её]т(?![а-яёА-ЯЁA-Za-z]).*практик|^отч[её]т$/i, 'praktika']];
  for (const l of lines) { const hit = TYPES.find(([re]) => re.test(l)); if (hit) { d.type = hit[1]; break; } }
  const clean = s => {
    s = s.replace(/\s*_{2,}\s*/g, ' ').trim().replace(/\.$/, '');
    s = s.replace(/(\S) +(?:[-—]|--) +(?=\S)/g, '$1 – ');
    // кавычки снимаем, только если они обрамляют всю строку или стоят без пары
    const bal = x => (x.match(/«/g) || []).length === (x.match(/»/g) || []).length;
    if (/^[«"“„]/.test(s) && /[»"”]$/.test(s) && bal(s.slice(1, -1))) s = s.slice(1, -1);
    else if (!bal(s)) s = s.replace(/^«(?!.*»)|(?<!«.*)»$/g, '');
    if (/^"[^"]*$/.test(s) || /^[^"]*"$/.test(s)) s = s.replace(/"/g, '');
    return s.trim();
  };
  const after = (re, stop) => {
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]); if (!m) continue;
      let v = lines[i].slice(m.index + m[0].length).replace(/^[\s:–—-]+/, '');
      if (!clean(v) && lines[i + 1] && !(stop && stop.test(lines[i + 1]))) v = lines[i + 1];
      v = clean(v); if (v && !/^_+$/.test(v)) return v;
    }
    return '';
  };
  d.discipline = after(/(?:^|\s)по (?:дисциплине|курсу|предмету)(?![а-яёА-ЯЁA-Za-z])/i, /тем/i);
  d.topic = after(/(?:^|\s)(?:на тему|тема(?: работы)?)(?![а-яёА-ЯЁA-Za-z])/i, /выполнил|студент|обучающ/i);
  if (d.topic) d.topic = d.topic.replace(/^(?:на тему|тема)\s*:?\s*/i, '');
  const sch = lines.find(l => /^(высшая\s+\S*\s*школа|высшая школа|институт|колледж|филиал)/i.test(l) && l.length < 140); if (sch) d.school = sch.replace(/\s*\(.*$/, '');
  const FIO = /([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)\s+(?:([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+(?:вич|вна|ична|оглы|кызы))|([А-ЯЁ])\.\s?([А-ЯЁ])\.?)/;
  const FIO2 = /([А-ЯЁ])\.\s?([А-ЯЁ])\.\s?([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)/;
  const fioFrom = s => { let m = FIO.exec(s); if (m) return m[2] ? m[1] + ' ' + m[2] + ' ' + m[3] : m[1] + ' ' + m[4] + '. ' + m[5] + '.'; m = FIO2.exec(s); return m ? m[3] + ' ' + m[1] + '. ' + m[2] + '.' : ''; };
  const iStud = lines.findIndex(l => /выполнил|обучающ|студент(ка)?(?![а-яёА-ЯЁA-Za-z])|автор/i.test(l));
  const iTeach = lines.findIndex(l => /проверил|руководител|преподавател|принял/i.test(l));
  if (iStud >= 0) {
    for (let i = iStud; i < Math.min(lines.length, iStud + 4) && (iTeach < 0 || i < iTeach || i === iStud); i++) { const f = fioFrom(lines[i].replace(/^.*?(выполнил[аи]?|студент(ка)?|обучающ\S*)\s*:?/i, '')); if (f) { d.student = f; break; } }
    if (/выполнила|обучающаяся|студентка/i.test(lines[iStud])) d.gender = 'f';
  }
  if (iTeach >= 0) {
    for (let i = iTeach; i < Math.min(lines.length, iTeach + 3); i++) {
      const raw = lines[i].replace(/^.*?(проверил[аи]?|руководитель( практики)?( от университета)?|научный руководитель|преподаватель|принял[аи]?)\s*:?\s*/i, '');
      const f = fioFrom(raw);
      if (f) { const rank = (raw.match(/(профессор|доцент|ст(арший|\.)\s*преподаватель|преподаватель|ассистент|канд\.[^,]*наук|д-р[^,]*наук|к\.\s?\S+\.?\s?н\.|д\.\s?\S+\.?\s?н\.)/gi) || []).join(', '); d.teacher = f + (rank ? ', ' + rank : ''); break; }
    }
  }
  let m;
  if ((m = /групп[аы]\s*[:№]?\s*(\d{4,7})/i.exec(all))) d.group = m[1];
  if ((m = /(\d)\s*-?\s*(?:го\s*)?курса?(?![а-яёА-ЯЁA-Za-z])/i.exec(all) || /курс\s*:?\s*(\d)(?![а-яёА-ЯЁA-Za-z])/i.exec(all))) d.course = m[1];
  if ((m = /(?<![\d.])(\d{2}\.\d{2}\.\d{2})(?![\d.])\s*[«"]?([А-ЯЁа-яё][^»"\n]*)/.exec(all))) d.direction = (m[1] + ' ' + m[2].replace(/[»"]/g, '')).trim();
  if ((m = /(?:архангельск|северодвинск|коряжма)[\s,]*((?:19|20)\d\d)/i.exec(all))) d.year = m[1];
  for (const k of Object.keys(d)) if (!d[k]) delete d[k];
  // пересобираем титул, только если узнали из него главное — иначе оставляем титульник автора как есть
  d.found = !!(d.topic || d.student);
  return d;
}

global.Formatter = { formatDocx, readTitle, PROFILES, zipFiles: zip, normBib, _countLines: countLines, _textW: textW, _nbsp: nbsp };
})(typeof window !== 'undefined' ? window : globalThis);
