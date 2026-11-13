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
    head: { indent: true, after: 12, subBefore: 12, chapterNewPage: true },
    fig: { word: 'Рисунок', sep: '. ', sizeDelta: -2, around: 12 },
    tab: { word: 'Таблица', sep: '. ', before: 6, after: 6, afterTable: 12, cellSizeDelta: -2, borderSz: 6 },
    bib: { line: 1.5, plain: true },
    foot: { size: 10 },
    listing: { size: 10 },
    appendix: { line: 1, after: 12 },
    hideNumbersOn: ['лист для замечаний', 'реферат', 'аннотация', 'abstract'],
    bibTitle: 'Список использованных источников', listsDash: true,
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
function fixTypography(p, stats, bib) {
  const ts = ownTexts(p);
  if (!ts.length) return;
  const full = ts.map(t => t.textContent).join('');
  const cyr = CYR.test(full);
  let prev = '', quoteOpen = false, changed = false;
  ts.forEach((t, k) => {
    let s = t.textContent, o = s;
    if (k === 0 || !prev.trim()) s = s.replace(/^[  ]+/, '');
    if (prev.endsWith(' ')) s = s.replace(/^ +/, '');
    s = s.replace(/ {2,}/g, ' ');
    s = s.replace(bib ? / +([,.!?)\]»])/g : / +([,.;:!?)\]»])/g, '$1');
    s = s.replace(/([(\[«]) +/g, '$1');
    s = s.replace(/(\S) +[-—] +(?=\S)/g, '$1 – ').replace(/(\S) -- (?=\S)/g, '$1 – ');
    if (/^[-—] /.test(s) && prev.endsWith(' ') && k > 0) s = '–' + s.slice(1);
    if (cyr) s = nbsp(s);
    if (cyr && s.includes('"')) {
      s = s.replace(/"/g, (m, i) => {
        const before = i > 0 ? s[i - 1] : prev.slice(-1);
        const open = !before || /[\s(\[«—–-]/.test(before);
        quoteOpen = open; return open ? '«' : '»';
      });
    }
    if (k > 0 && (bib ? /^[,.!?)»]/ : /^[,.;:!?)»]/).test(s) && ts[k - 1].textContent.endsWith(' ')) ts[k - 1].textContent = ts[k - 1].textContent.replace(/ +$/, '');
    if (k === ts.length - 1) s = s.replace(/[  ]+$/, '');
    if (s !== o) { t.textContent = s; changed = true; }
    if (/^\s|\s$/.test(s)) t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    prev = (prev + s).slice(-3);
  });
  if (changed) stats.typo++;
}
/** Неразрывные пробелы (п. 4.1.14 СТО): инициалы, числа с единицами, сокращения, №. */
const NB = '\u00A0';
function nbsp(s) {
  return s
    .replace(/(^|[\s(«])([А-ЯЁ]\.) (?=[А-ЯЁ][.а-яё])/g, '$1$2' + NB)
    .replace(/([А-ЯЁ]\.) ([А-ЯЁ]\.)/g, '$1' + NB + '$2')
    .replace(/(\d) (?=(с\.|г\.|гг\.|в\.|вв\.|руб\.|млн|млрд|тыс\.|%|кг|км|мм|см|м|ч|мин|л\.)(?=[\s.,;:)»]|$))/g, '$1' + NB)
    .replace(/(^|[\s(])(№|§|г\.|ул\.|пер\.|д\.|кв\.|стр\.|рис\.|табл\.|гл\.|ст\.|п\.|пп\.|ч\.|с\.) (?=[\dА-ЯЁA-Z])/g, '$1$2' + NB)
    .replace(/(?<!\p{L})(т|и т)\. (?=[едкп]\.)/gu, '$1.' + NB);
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

/* ---------------------------- распознавание ---------------------------- */
const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').replace(/[.:;]+$/, '').trim();
const STRUCT_SET = new Set(STRUCT_SAFU.map(norm));
function structName(text, raw) {
  if (/\t/.test(raw) || /\.{3,}|…/.test(raw) || /\s\d{1,3}$/.test(text.trim())) return null;
  const n = norm(text.replace(/^\d+\s+/, ''));
  if (n.length > 110) return null;
  if (STRUCT_SET.has(n)) return n;
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
  const stats = { body: 0, heads: 0, struct: 0, figs: 0, figCaps: 0, tabCaps: 0, tables: 0, bib: 0, empty: 0, typo: 0, breaks: 0, listings: 0, foot: 0, toc: false, tocAdded: false, appx: 0, lists: 0, renamed: false };
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
    else if (APPX.test(text) && text.length < 90) x.kind = 'appendix';
    else if (FIG.test(text) && text.length < 300 && !/^рис\S*\s+\d+\s+[а-яё]/.test(text) && /^рис/i.test(text) && (B[i - 1] && hasDrawing(B[i - 1]) || /^рисунок\s/i.test(text) && text.length < 200)) x.kind = 'figcap';
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
  const titleEnd = firstStruct >= 0 ? firstStruct : (firstHead > 0 && firstHead < 40 ? firstHead : 0);
  let zone = 'title';
  B.forEach((b, i) => {
    const x = info.get(b);
    if (i >= titleEnd && zone === 'title') zone = 'main';
    if (x.kind === 'struct') zone = isTocName(x.name) ? 'toc' : isBibName(x.name) ? 'bib' : 'main';
    else if (x.kind === 'appendix') zone = 'appx';
    else if (x.kind === 'head' && zone === 'toc' && !/\t|\.{3,}|…|\d$/.test(x.raw)) zone = 'main';
    x.zone = zone;
    if (zone === 'toc' && x.kind === 'body') x.kind = 'tocline';
    if (zone === 'toc' && x.kind === 'head' && /\t|\d$/.test(x.raw)) { x.kind = 'tocline'; }
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
        const sid = styleId(1); if (sid) ensure(pPr, 'pStyle', { val: sid });
        drop(pPr, 'numPr', 'outlineLvl');
        setSpacing(pPr, 0, prof.struct.after, prof.line); setIndent(pPr, 0, 0); setJc(pPr, 'center');
        ensure(pPr, 'keepNext'); ensure(pPr, 'suppressAutoHyphens');
        runsOf(p, r => setRun(r, prof, size, { bold: true, italic: false, underline: false }));
        if (opts.typography) fixTypography(p, stats);
        replaceFirst(p, /^\d+\s+/, '');
        replaceLastTrailing(p, /\.\s*$/, '');
        recase(p, s => s);
        if (prof.struct.case === 'upper') recase(p, s => s.toUpperCase());
        else { const all = ownTexts(p).map(t => t.textContent).join(''); const fixed = all.toLowerCase().replace(/^\s*[а-яёa-z]/, c => c.toUpperCase()).replace(/\(ии\)/, '(ИИ)'); setParaText(p, fixed); }
        if (prof.bibTitle && isBibName(x.name) && norm(paraText(p)) !== norm(prof.bibTitle)) { setParaText(p, prof.struct.case === 'upper' ? prof.bibTitle.toUpperCase() : prof.bibTitle); stats.renamed = true; }
        if (prof.struct.newPage) pageStart.add(p);
        return;
      }
      case 'appendix': {
        stats.appx++;
        drop(pPr, 'numPr');
        setSpacing(pPr, 0, 0, prof.appendix.line); setIndent(pPr, 0, 0); setJc(pPr, 'center'); ensure(pPr, 'keepNext');
        const sid = styleId(1); if (sid) ensure(pPr, 'pStyle', { val: sid });
        runsOf(p, r => setRun(r, prof, size, { bold: true, italic: false, underline: false }));
        replaceLastTrailing(p, /\.\s*$/, '');
        if (isAllCaps(x.text) && prof.struct.case !== 'upper') recase(p, s => s.replace(/ПРИЛОЖЕНИЕ/, 'Приложение'));
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
        if (opts.typography) fixTypography(p, stats);
        replaceFirst(p, /^(\s*(?:(?:глава|раздел|часть)\s+)?\d+(?:\.\d+)*)\.(?=\s|[А-ЯЁA-Z])/i, '$1');
        replaceFirst(p, /^(\s*(?:(?:глава|раздел|часть)\s+)?\d+(?:\.\d+)*)(?=[А-ЯЁA-Z])/i, '$1 ');
        replaceLastTrailing(p, /([^.])\.\s*$/, '$1');
        if (isAllCaps(x.text)) { recase(p, s => s); const all = ownTexts(p).map(t => t.textContent).join(''); setParaText(p, sentence(all)); }
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
        if (opts.typography) fixTypography(p, stats, opts.profile !== 'safu');
        if (!replaceFirst(p, /^\s*\[?\d{1,3}\s*[\].)]?\s*(?=\S)/, n + ' ')) { const t = ownTexts(p)[0]; if (t) { t.textContent = n + ' ' + t.textContent.replace(/^\s+/, ''); t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); } }
        else if (hadNum) { /* номер был и в автонумерации, и в тексте — оставили текстовый */ }
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
        if (opts.typography) { fixTypography(p, stats); replaceFirst(p, /^[•·▪●◦]\s*/, '- '); }
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
  const hasToc = B.some(b => { const x = info.get(b); return x && x.kind === 'struct' && isTocName(x.name); });
  if (!hasToc && opts.toc) {
    const intro = B.find(b => { const x = info.get(b); return x && x.kind === 'struct' && x.name === 'введение'; });
    const heads = B.filter(b => { const x = info.get(b); return x && ['struct', 'head', 'appendix'].includes(x.kind); });
    if (intro && heads.length >= 3) {
      const h = mk(doc, 'p'), hp = h.appendChild(mk(doc, 'pPr'));
      const sid = styleId(1);
      if (sid) hp.appendChild(mk(doc, 'pStyle', { val: sid }));
      hp.appendChild(mk(doc, 'keepNext')); hp.appendChild(mk(doc, 'pageBreakBefore'));
      const title = prof.struct.case === 'upper' ? 'СОДЕРЖАНИЕ' : 'Содержание';
      hp.appendChild(mk(doc, 'spacing', { before: 0, after: prof.struct.after * 20, line: Math.round(prof.line * 240), lineRule: 'auto' }));
      hp.appendChild(mk(doc, 'ind', { firstLine: 0, left: 0 })); hp.appendChild(mk(doc, 'jc', { val: 'center' }));
      // заголовок «Содержание» не должен попадать в само содержание
      hp.appendChild(mk(doc, 'outlineLvl', { val: 9 }));
      h.appendChild(runEl(doc, prof, size, title, true));
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
      const items = heads.map(b => paraText(b).replace(/\s+/g, ' ').trim()).filter(Boolean);
      const ps = items.map((t, k) => tocP(t, k === 0, k === items.length - 1));
      intro.parentNode.insertBefore(h, intro);
      for (const p of ps) intro.parentNode.insertBefore(p, intro);
      info.set(h, { kind: 'struct', name: 'содержание', zone: 'toc' });
      ps.forEach(p => info.set(p, { kind: 'tocline', zone: 'toc' }));
      pageStart.add(h);
      stats.tocAdded = true; tocField = true;
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
        const s = lastSect.cloneNode(true);
        drop(s, 'headerReference', 'footerReference', 'titlePg', 'pgNumType', 'type');
        ensure(s, 'type', { val: 'nextPage' });
        let holder = prev;
        if (prev.localName !== 'p') { holder = mk(doc, 'p'); prev.parentNode.insertBefore(holder, prev.nextSibling); }
        const hp = pPrOf(holder); drop(hp, 'sectPr'); hp.appendChild(s);
        drop(pPrOf(B[numStart]), 'pageBreakBefore');
        removePageBreaks(holder);
        if (!paraText(holder).trim() && !hasDrawing(holder)) setSpacing(hp, 0, 0, 1);
      } else drop(pPrOf(B[numStart]), 'pageBreakBefore');
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

  /* ---------- 9. настройки: автоперенос, обновление содержания ---------- */
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
  else if (tocField) list.push('Содержание обновится при открытии в Word');
  if (stats.figs || stats.figCaps) list.push(`Рисунки (${stats.figs}) по центру, подписи (${stats.figCaps}) в виде «${prof.fig.word} 1${prof.fig.sep}Название», кегль ${capSize}`);
  if (stats.tabCaps || stats.tables) list.push(`Таблицы (${stats.tables}): по центру, текст ${cellSize} пт с одинарным интервалом; заголовки (${stats.tabCaps}) «${prof.tab.word} 1${prof.tab.sep}Название» над таблицей слева`);
  if (stats.bib) list.push(`Список источников: ${stats.bib} ${pl(stats.bib, 'запись', 'записи', 'записей')} пронумерованы «1 …» с абзацного отступа${prof.bib.plain ? ', без полужирного и курсива' : ''}`);
  if (stats.title) list.push(stats.title === 'replaced' ? 'Титульный лист заменён на сгенерированный по форме СТО САФУ (приложение Б)' : 'Добавлен титульный лист по форме СТО САФУ (приложение Б)');
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

global.Formatter = { formatDocx, PROFILES, zipFiles: zip };
})(typeof window !== 'undefined' ? window : globalThis);
