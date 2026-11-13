/* Айсберг — проверка текста на заимствования прямо в браузере.
   Своего сервера нет: текст сравнивается здесь же, на устройстве. Википедия отвечает браузеру напрямую,
   а страницы сайтов, выдачу поисковиков и КиберЛенинку скачивает маленький помощник
   (antiplagiat-api/ в репозитории: функция Yandex Cloud или Cloudflare Worker). Помощник ничего не хранит. */
(function (global) {
'use strict';

/* =====================================================================
   Текст: очистка, слова, основы слов, приёмы обхода
   ===================================================================== */
const ZERO_WIDTH = '​‌‍⁠﻿‎‏‪‫‬‭‮⁡⁢⁣⁤᠎';
const ZW_RE = new RegExp('[' + ZERO_WIDTH + ']', 'g');
// невидимые символы удаляются; мягкий перенос и ударения (обычны в PDF и Википедии) — тоже, но молча
const STRIP_RE = new RegExp('[' + ZERO_WIDTH + '­́̀]', 'g');
const CYR = /[А-Яа-яЁё]/, CYR_G = /[А-Яа-яЁё]/g, LAT = /[A-Za-z]/, LAT_G = /[A-Za-z]/g;
const DIGITS = /^\p{N}+$/u;

function charMap(a, b) { const m = new Map(); for (let i = 0; i < a.length; i++) m.set(a[i], b[i]); return m; }
// буквы-двойники: латиница, неотличимая на вид от кириллицы, и наоборот
const LAT2CYR = charMap('ABCEHKMOPTXYaceopxyk', 'АВСЕНКМОРТХУасеорхук');
const CYR2LAT = charMap('АВСЕНКМОРТХУасеорхук', 'ABCEHKMOPTXYaceopxyk');
function translate(w, m) { let s = ''; for (const ch of w) s += m.get(ch) || ch; return s; }

const RU_STOP = new Set(`и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет
о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя
ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж
тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех
никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три
эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это также
который которая которые которого которых которой которым которыми которое которую котором является являются либо
то есть лишь однако поэтому причем притом пока этим этими эта свой своя свое свои своего своей своих своим своими
наш наша наше наши ваш ваша ваше ваши весь вся всем всеми всей такие такая такое таких таким такими такого такой
тд тп др пр см рис табл стр гг им ее её них оно те ту той тех тому теми та`.split(/\s+/));
const EN_STOP = new Set(`a an the and or but if while of at by for with about against between into through during before after above below to
from up down in out on off over under again further then once here there when where why how all any both each few more
most other some such no nor not only own same so than too very s t can will just don should now is are was were be been
being have has had having do does did doing i me my myself we our ours ourselves you your yours yourself he him his
himself she her hers herself it its itself they them their theirs themselves what which who whom this that these those
am as until because also may might must shall would could`.split(/\s+/));

// --- стеммер Портера для русского языка (Snowball) ---
const PERFECTIVE = /((ив|ивши|ившись|ыв|ывши|ывшись)|((?<=[ая])(в|вши|вшись)))$/;
const REFLEXIVE = /(с[яь])$/;
const ADJECTIVE = /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
const PARTICIPLE = /((ивш|ывш|ующ)|((?<=[ая])(ем|нн|вш|ющ|щ)))$/;
const VERB = /((ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)|((?<=[ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)))$/;
const NOUN = /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
const RVRE = /^(.*?[аеиоуыэюя])(.*)$/;
const DERIVATIONAL = /^.*[^аеиоуыэюя]+[аеиоуыэюя].*ость?$/;
const DER = /ость?$/, SUPERLATIVE = /(ейше|ейш)$/, END_I = /и$/, END_SOFT = /ь$/, END_NN = /нн$/;

function stemRu(word) {
  const m = RVRE.exec(word);
  if (!m) return word;
  const pre = m[1];
  let rv = m[2];
  let temp = rv.replace(PERFECTIVE, '');
  if (temp === rv) {
    rv = rv.replace(REFLEXIVE, '');
    temp = rv.replace(ADJECTIVE, '');
    if (temp !== rv) rv = temp.replace(PARTICIPLE, '');
    else { temp = rv.replace(VERB, ''); rv = temp === rv ? rv.replace(NOUN, '') : temp; }
  } else rv = temp;
  rv = rv.replace(END_I, '');
  if (DERIVATIONAL.test(rv)) rv = rv.replace(DER, '');
  temp = rv.replace(END_SOFT, '');
  if (temp === rv) { rv = rv.replace(SUPERLATIVE, ''); rv = rv.replace(END_NN, 'н'); } else rv = temp;
  return pre + rv;
}
const EN_SUFFIXES = ['ization', 'ational', 'fulness', 'ousness', 'iveness', 'ations', 'ation', 'ments', 'ment',
  'ingly', 'edly', 'ness', 'ings', 'ing', 'ies', 'ied', 'ely', 'ed', 'es', 'ly', 's'];
function stemEn(word) {
  if (word.length <= 3) return word;
  for (const suf of EN_SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) { word = word.slice(0, -suf.length); break; }
  }
  if (word.length > 4 && (word.endsWith('e') || word.endsWith('y'))) word = word.slice(0, -1);
  return word;
}
const stemCache = new Map();
function stem(word) {
  let s = stemCache.get(word);
  if (s === undefined) {
    s = CYR.test(word) ? stemRu(word) : LAT.test(word) ? stemEn(word) : word;
    if (stemCache.size < 400000) stemCache.set(word, s);
  }
  return s;
}

function cleanText(raw) {
  const zeroWidth = (raw.match(ZW_RE) || []).length;
  let t = raw.replace(STRIP_RE, '');
  t = t.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/\t/g, ' ');
  t = t.replace(/[ \f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return [t.trim(), zeroWidth];
}

/** Приводит слово к виду для сравнения: [слово, была ли подмена букв]. */
function normalizeWord(word) {
  let swapped = false;
  if (CYR.test(word) && LAT.test(word)) {
    const nc = (word.match(CYR_G) || []).length, nl = (word.match(LAT_G) || []).length;
    const fixed = translate(word, nc >= nl ? LAT2CYR : CYR2LAT);
    if (!(CYR.test(fixed) && LAT.test(fixed))) { word = fixed; swapped = true; }
  }
  return [word.toLowerCase().replace(/ё/g, 'е'), swapped];
}
function isContent(norm) {
  return !(norm.length < 2 || DIGITS.test(norm) || RU_STOP.has(norm) || EN_STOP.has(norm));
}

/** Текст, разобранный на слова: позиции слов, нормальные формы, основы «содержательных» слов. */
class Tokens {
  constructor(text) {
    this.text = text;
    this.starts = []; this.ends = []; this.norm = []; this.cidx = []; this.stems = []; this.swapped = [];
    const re = /[\p{L}\p{N}]+/gu;
    let m;
    while ((m = re.exec(text))) {
      const [norm, swapped] = normalizeWord(m[0]);
      const idx = this.starts.length;
      this.starts.push(m.index); this.ends.push(m.index + m[0].length); this.norm.push(norm);
      if (swapped) this.swapped.push(idx);
      if (!isContent(norm)) continue;
      this.cidx.push(idx); this.stems.push(stem(norm));
    }
  }
  get length() { return this.starts.length; }
  /** Полуинтервал номеров слов, лежащих внутри отрезка текста [start, end). */
  range(start, end) {
    const a = lowerBound(this.starts, start), b = upperBound(this.ends, end);
    return [a, Math.max(a, b)];
  }
}
function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; } return lo; }
function upperBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) lo = mid + 1; else hi = mid; } return lo; }

function sentences(text) {
  const out = [], re = /(?<=[.!?…])["»”)\]]*\s+(?=["«“(\[]*[A-ZА-ЯЁ0-9])|\n+/g;
  let pos = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > pos) out.push([pos, m.index]);
    pos = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (pos < text.length) out.push([pos, text.length]);
  return out;
}

/** Отрезки текста внутри кавычек — кандидаты в оформленные цитаты. */
function quoteSpans(text) {
  const spans = [];
  for (const re of [/«([^«»]{15,2000})»/g, /“([^“”]{15,2000})”/g, /„([^„“]{15,2000})“/g, /"([^"\n]{15,1500})"/g]) {
    let m;
    while ((m = re.exec(text))) spans.push([m.index + 1, m.index + 1 + m[1].length]);
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

const BIB_RE = /^[ \t]*(?:\d+[.)]?[ \t]*)?(список\s+(?:использованн\p{L}+\s+|использ\.\s+)?(?:литературы|источников)(?:\s+и\s+литературы)?|список\s+цитируем\p{L}+\s+(?:литературы|источников)|библиографический\s+список|библиография|литература|references|bibliography|works\s+cited)[ \t]*:?[ \t]*$/gimu;
/** Позиция заголовка списка литературы (во второй половине текста) или null. */
function bibliographyStart(text) {
  let found = null, m;
  BIB_RE.lastIndex = 0;
  while ((m = BIB_RE.exec(text))) if (m.index > text.length * 0.4) found = m.index;
  return found;
}

/* =====================================================================
   Сравнение: общие тройки основ слов («шинглы», как у Антиплагиата) служат
   затравками, от которых совпадение растягивается в обе стороны и переживает
   замену, вставку и удаление отдельных слов — так ловится и перефразирование.
   ===================================================================== */
const K = 3, MIN_MATCH = 6, MIN_WEAK = 4, NEAR_DOC = 12, NEAR_SRC = 60, MAX_GAP = 3, MAX_CANDS = 40;
const SEP = '\u0001';
const key3 = (a, i) => a[i] + SEP + a[i + 1] + SEP + a[i + 2];

function shingleIndex(S) {
  const idx = new Map();
  for (let j = 0; j + K <= S.length; j++) {
    const k = key3(S, j);
    const list = idx.get(k);
    if (list) list.push(j); else idx.set(k, [j]);
  }
  return idx;
}

function extend(D, S, i, j, lo, step) {
  const n = D.length, m = S.length, pairs = [];
  let pi = i, pj = j;
  while (pi >= lo && pi < n && pj >= 0 && pj < m) {
    if (D[pi] === S[pj]) { pairs.push([pi, pj]); pi += step; pj += step; continue; }
    let found = false;
    search:
    for (let total = 1; total <= 2 * MAX_GAP; total++) {
      for (let a = Math.max(0, total - MAX_GAP); a <= Math.min(total, MAX_GAP); a++) {
        const x = pi + a * step, y = pj + (total - a) * step, x2 = x + step, y2 = y + step;
        if (x >= lo && x < n && x2 >= lo && x2 < n && y >= 0 && y < m && y2 >= 0 && y2 < m &&
            D[x] === S[y] && D[x2] === S[y2]) { pi = x; pj = y; found = true; break search; }
      }
    }
    if (!found) break;
  }
  return pairs;
}

function makeSpan(doc, src, pairs) {
  const [i0, j0] = pairs[0], [i1, j1] = pairs[pairs.length - 1];
  const matched = pairs.length;
  let sameForm = 0;
  for (const [pi, pj] of pairs) if (doc.norm[doc.cidx[pi]] === src.norm[src.cidx[pj]]) sameForm++;
  const exact = matched / (i1 - i0 + 1) >= 0.93 && matched / (j1 - j0 + 1) >= 0.93 && sameForm >= 0.93 * matched;
  let ws = doc.cidx[i0], we = doc.cidx[i1], sw = src.cidx[j0], se = src.cidx[j1];
  // захватываем служебные слова по краям, если они совпадают и в источнике
  for (let t = 0; t < 3 && ws > 0 && sw > 0 && doc.norm[ws - 1] === src.norm[sw - 1]; t++) { ws--; sw--; }
  const lastD = doc.length - 1, lastS = src.length - 1;
  for (let t = 0; t < 3 && we < lastD && se < lastS && doc.norm[we + 1] === src.norm[se + 1]; t++) { we++; se++; }
  return { ws, we, type: exact ? 'exact' : 'para', matched, sFrom: src.starts[sw], sTo: src.ends[se], i0, i1, j0, j1 };
}

/** Оставляет длинные фрагменты и короткие, стоящие рядом с другими (перестановка частей предложения). */
function keepReliable(spans) {
  const out = [];
  spans.forEach((sp, k) => {
    let keep = sp.matched >= MIN_MATCH;
    if (!keep) {
      for (const other of [spans[k - 1], spans[k + 1]]) {
        if (!other) continue;
        const gapDoc = Math.max(other.i0 - sp.i1, sp.i0 - other.i1), gapSrc = Math.max(other.j0 - sp.j1, sp.j0 - other.j1);
        if (gapDoc <= NEAR_DOC && gapSrc <= NEAR_SRC) { keep = true; sp.type = 'para'; break; }
      }
    }
    if (keep) out.push(sp);
  });
  for (const sp of out) { delete sp.i0; delete sp.i1; delete sp.j0; delete sp.j1; }
  return out;
}

function align(doc, src, index) {
  const D = doc.stems, S = src.stems;
  if (D.length < K || S.length < K) return [];
  index = index || shingleIndex(S);
  const spans = [], n = D.length;
  let i = 0, floor = 0;
  while (i <= n - K) {
    const cands = index.get(key3(D, i));
    if (!cands) { i++; continue; }
    let best = null, bj = 0;
    for (let t = 0, lim = Math.min(cands.length, MAX_CANDS); t < lim; t++) {
      const fwd = extend(D, S, i, cands[t], floor, 1);
      if (!best || fwd.length > best.length) { best = fwd; bj = cands[t]; }
    }
    if (best.length < MIN_WEAK) { i++; continue; }
    const back = i > floor && bj > 0 ? extend(D, S, i - 1, bj - 1, floor, -1) : [];
    const pairs = back.reverse().concat(best);
    spans.push(makeSpan(doc, src, pairs));
    i = pairs[pairs.length - 1][0] + 1;
    floor = i;
  }
  return keepReliable(spans);
}

/* =====================================================================
   Файлы и страницы: .docx (со скрытым текстом), PDF, HTML, кодировки
   ===================================================================== */
function decodeBytes(buf, ctype) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const cands = [];
  const fromHeader = /charset=["']?([\w-]+)/i.exec(ctype || '');
  if (fromHeader) cands.push(fromHeader[1]);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  if (meta) cands.push(meta[1]);
  cands.push('utf-8', 'windows-1251');
  for (const enc of cands) {
    try { return new TextDecoder(enc, { fatal: true }).decode(bytes); } catch (e) { /* следующая кодировка */ }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

const SKIP_TAGS = 'script,style,noscript,svg,nav,footer,aside,form,template,iframe,select,button,canvas,figure';
const BLOCK_TAGS = new Set(['p', 'div', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'section', 'article', 'blockquote', 'pre', 'dd', 'dt', 'header', 'main']);
/** [заголовок, текст] страницы без меню, скриптов и разметки. */
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = ((doc.querySelector('title') || {}).textContent || '').replace(/\s+/g, ' ').trim();
  doc.querySelectorAll(SKIP_TAGS).forEach(el => el.remove());
  const parts = [];
  const stack = [doc.body || doc.documentElement];
  // обход без рекурсии: у некоторых страниц разметка вложена очень глубоко
  while (stack.length) {
    const node = stack.pop();
    if (typeof node === 'string') { parts.push(node); continue; }
    if (node.nodeType === 3) { parts.push(node.data); continue; }
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') { parts.push('\n'); continue; }
    const block = BLOCK_TAGS.has(tag);
    if (block) { parts.push('\n'); stack.push('\n'); }
    for (let c = node.lastChild; c; c = c.previousSibling) stack.push(c);
  }
  let text = parts.join('');
  text = text.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n');
  return [title, text.trim()];
}

let pdfjsReady = null;
function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        ok(global.pdfjsLib);
      };
      s.onerror = () => { pdfjsReady = null; fail(new Error('Не удалось загрузить читалку PDF.')); };
      document.head.appendChild(s);
    });
  }
  return pdfjsReady;
}
async function pdfToText(buf, maxPages = 80) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    let s = '';
    for (const it of content.items) s += it.str + (it.hasEOL ? '\n' : '');
    pages.push(s);
  }
  return pages.join('\n').replace(/-\n(?=[a-zа-яё])/g, '').replace(/([^\n.!?:;])\n(?=[a-zа-яё(«"])/g, '$1 ');
}

/** Достаёт один файл из zip-архива (а .docx — это zip). */
async function unzipEntry(buf, wanted) {
  const bytes = new Uint8Array(buf), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Файл повреждён или это не .docx.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return data;
      if (method !== 8) throw new Error('Неизвестное сжатие в .docx.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('В файле нет текста документа — это точно .docx?');
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
/** Скрыт ли фрагмент: атрибут «скрытый», белый цвет или микроскопический кегль. */
function runHidden(run) {
  const props = run.getElementsByTagNameNS(W_NS, 'rPr')[0];
  if (!props || props.parentNode !== run) return null;
  const vanish = props.getElementsByTagNameNS(W_NS, 'vanish')[0];
  if (vanish && !['0', 'false'].includes(vanish.getAttributeNS(W_NS, 'val') || 'true')) return 'скрытый текст';
  const color = props.getElementsByTagNameNS(W_NS, 'color')[0];
  if (color && ['FFFFFF', 'FEFEFE', 'FDFDFD'].includes((color.getAttributeNS(W_NS, 'val') || '').toUpperCase())) return 'белый текст';
  const size = props.getElementsByTagNameNS(W_NS, 'sz')[0];
  if (size && parseFloat(size.getAttributeNS(W_NS, 'val')) <= 4) return 'микрошрифт';  // в полупунктах: 2 pt и меньше
  return null;
}
/** Читает .docx: текст без скрытых вставок и сведения о них. */
async function docxToText(buf) {
  const xml = new TextDecoder().decode(await unzipEntry(buf, 'word/document.xml'));
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = [], kinds = {}, samples = [];
  let hiddenChars = 0;
  for (const par of doc.getElementsByTagNameNS(W_NS, 'p')) {
    let line = '';
    for (const run of par.getElementsByTagNameNS(W_NS, 'r')) {
      let piece = '';
      for (const node of run.childNodes) {
        if (node.namespaceURI !== W_NS) continue;
        if (node.localName === 't') piece += node.textContent;
        else if (node.localName === 'tab') piece += ' ';
        else if (node.localName === 'br' || node.localName === 'cr') piece += '\n';
        else if (node.localName === 'noBreakHyphen') piece += '-';
      }
      if (!piece) continue;
      const reason = runHidden(run);
      if (reason) {
        kinds[reason] = (kinds[reason] || 0) + piece.length;
        hiddenChars += piece.length;
        if (samples.length < 5 && piece.trim()) samples.push(piece.trim().slice(0, 80));
        continue;
      }
      line += piece;
    }
    paragraphs.push(line);
  }
  return { text: paragraphs.join('\n'), flags: { hidden_chars: hiddenChars, hidden_kinds: kinds, hidden_samples: samples } };
}

/* =====================================================================
   Оформление по ГОСТу (.docx): поля, шрифт, кегль, интервал, отступ,
   выравнивание, номера страниц, структура. Требования — ГОСТ 7.32-2017
   и типичные методички вузов. Считается по тексту основных абзацев.
   ===================================================================== */
async function tryEntry(buf, name) { try { return new TextDecoder().decode(await unzipEntry(buf, name)); } catch (e) { return ''; } }
const wAttr = (el, name) => el ? el.getAttributeNS(W_NS, name) : null;
const wKid = (el, name) => { if (!el) return null; for (const c of el.childNodes) if (c.namespaceURI === W_NS && c.localName === name) return c; return null; };

async function gostCheck(buf) {
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const doc = parse(await tryEntry(buf, 'word/document.xml'));
  const stylesXml = await tryEntry(buf, 'word/styles.xml'), themeXml = await tryEntry(buf, 'word/theme/theme1.xml');
  const styles = stylesXml ? parse(stylesXml) : null;
  const theme = {};
  if (themeXml) {
    const t = parse(themeXml);
    for (const [k, tag] of [['minor', 'minorFont'], ['major', 'majorFont']]) {
      const f = t.getElementsByTagNameNS('*', tag)[0], latin = f && f.getElementsByTagNameNS('*', 'latin')[0];
      if (latin) theme[k] = latin.getAttribute('typeface');
    }
  }
  /* стили: id → {based, pPr, rPr, heading} */
  const S = new Map();
  let defP = null, defR = null, defStyle = null;
  if (styles) {
    const dd = styles.getElementsByTagNameNS(W_NS, 'docDefaults')[0];
    if (dd) { defP = wKid(wKid(dd, 'pPrDefault'), 'pPr'); defR = wKid(wKid(dd, 'rPrDefault'), 'rPr'); }
    for (const st of styles.getElementsByTagNameNS(W_NS, 'style')) {
      const id = wAttr(st, 'styleId'), name = (wAttr(wKid(st, 'name'), 'val') || '').toLowerCase();
      const pPr = wKid(st, 'pPr');
      S.set(id, { based: wAttr(wKid(st, 'basedOn'), 'val'), pPr, rPr: wKid(st, 'rPr'),
        heading: /heading|заголовок|title|toc|caption|название/.test(name + ' ' + id.toLowerCase()) || !!wKid(pPr, 'outlineLvl') });
      if (wAttr(st, 'type') === 'paragraph' && ['1', 'true'].includes(wAttr(st, 'default'))) defStyle = id;
    }
  }
  const chain = id => { const out = []; for (let i = 0; id && i < 12 && S.has(id); i++) { out.push(S.get(id)); id = S.get(id).based; } return out; };
  /* значение свойства: первое найденное по цепочке */
  const pick = (list, get) => { for (const x of list) { const v = x && get(x); if (v != null && v !== '') return v; } return null; };

  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const tally = {}; const add = (k, v, n) => { (tally[k] = tally[k] || new Map()).set(v, (tally[k].get(v) || 0) + n); };
  const headings = [];
  let bodyChars = 0;
  for (const p of body ? body.getElementsByTagNameNS(W_NS, 'p') : []) {
    let inTable = false;
    for (let a = p.parentNode; a && a !== body; a = a.parentNode) if (a.localName === 'tbl') { inTable = true; break; }
    if (inTable) continue;
    const pPr = wKid(p, 'pPr'), sid = wAttr(wKid(pPr, 'pStyle'), 'val') || defStyle;
    const sts = chain(sid), text = [...p.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent).join('').trim();
    if (!text) continue;
    const isHead = sts.some(s => s.heading) || !!wKid(pPr, 'outlineLvl') || (text.length < 80 && !/[.!?;:,]$/.test(text) && /^[\dIVX.\s]*[A-ZА-ЯЁ]/.test(text) && text === text.toUpperCase());
    if (isHead || text.length < 25) { if (text.length < 120) headings.push(text); continue; }
    const pp = [pPr, ...sts.map(s => s.pPr), defP];
    const spacing = pick(pp, x => wKid(x, 'spacing') && wAttr(wKid(x, 'spacing'), 'line') ? wKid(x, 'spacing') : null);
    const line = spacing ? +wAttr(spacing, 'line') / 240 : 1, rule = spacing ? wAttr(spacing, 'lineRule') || 'auto' : 'auto';
    const ind = pick(pp, x => { const i = wKid(x, 'ind'); return i && (wAttr(i, 'firstLine') != null || wAttr(i, 'hanging') != null) ? i : null; });
    const first = ind ? (+wAttr(ind, 'firstLine') || 0) - (+wAttr(ind, 'hanging') || 0) : 0;
    const jc = pick(pp, x => wAttr(wKid(x, 'jc'), 'val')) || 'left';
    for (const r of p.getElementsByTagNameNS(W_NS, 'r')) {
      const n = [...r.getElementsByTagNameNS(W_NS, 't')].reduce((s, t) => s + t.textContent.length, 0);
      if (!n) continue;
      const rPr = wKid(r, 'rPr'), rs = chain(wAttr(wKid(rPr, 'rStyle'), 'val'));
      const rr = [rPr, ...rs.map(s => s.rPr), ...sts.map(s => s.rPr), defR];
      let font = pick(rr, x => { const f = wKid(x, 'rFonts'); if (!f) return null;
        const th = wAttr(f, 'asciiTheme') || wAttr(f, 'hAnsiTheme'); if (th) return theme[/major/i.test(th) ? 'major' : 'minor'] || null;
        return wAttr(f, 'hAnsi') || wAttr(f, 'ascii') || wAttr(f, 'cs'); }) || theme.minor || 'Calibri';
      const sz = +(pick(rr, x => wAttr(wKid(x, 'sz'), 'val')) || 20) / 2;
      add('font', font, n); add('size', sz, n);
      add('line', rule === 'auto' ? Math.round(line * 100) / 100 : 'точно ' + Math.round(+wAttr(spacing, 'line') / 20) + ' пт', n);
      add('indent', Math.round(first / 567 * 100) / 100, n); add('jc', jc, n);
      bodyChars += n;
    }
  }
  const top = k => { const m = tally[k]; if (!m) return [null, 0]; let best = null, c = 0, all = 0; for (const [v, x] of m) { all += x; if (x > c) { best = v; c = x; } } return [best, c / all]; };
  const share = (k, ok) => { const m = tally[k]; if (!m) return 1; let good = 0, all = 0; for (const [v, x] of m) { all += x; if (ok(v)) good += x; } return good / all; };
  const pct = x => Math.round(x * 100) + '%';
  const items = [];
  const item = (name, ok, need, found) => items.push({ name, ok, need, found });

  /* поля и формат листа — по последнему разделу */
  const sect = body && [...body.getElementsByTagNameNS(W_NS, 'sectPr')].pop();
  const mar = wKid(sect, 'pgMar'), sz = wKid(sect, 'pgSz');
  const mm = v => Math.round((+v || 0) / 56.7);
  if (sz) { const w = mm(wAttr(sz, 'w')), h = mm(wAttr(sz, 'h')); const a4 = Math.abs(Math.min(w, h) - 210) <= 2 && Math.abs(Math.max(w, h) - 297) <= 2;
    item('Формат листа', a4, 'A4 (210 × 297 мм)', `${w} × ${h} мм`); }
  if (mar) {
    const L = mm(wAttr(mar, 'left')), R = mm(wAttr(mar, 'right')), T = mm(wAttr(mar, 'top')), B = mm(wAttr(mar, 'bottom'));
    item('Поля', L >= 24 && L <= 31 && R >= 10 && R <= 15 && Math.abs(T - 20) <= 1 && Math.abs(B - 20) <= 1,
      'левое 25–30, правое 10–15, верхнее и нижнее 20 мм', `левое ${L}, правое ${R}, верхнее ${T}, нижнее ${B} мм`);
  }
  if (bodyChars > 200) {
    const [f] = top('font'), [s] = top('size'), [l] = top('line'), [i] = top('indent'), [j] = top('jc');
    const okFont = share('font', v => /times new roman/i.test(v));
    item('Шрифт', okFont >= .9, 'Times New Roman', okFont >= .9 ? 'Times New Roman' : `${f}${okFont > 0 ? ` (Times New Roman — ${pct(okFont)} текста)` : ''}`);
    const okSize = share('size', v => v >= 12 && v <= 14);
    item('Размер шрифта', okSize >= .9, '12–14 пт (чаще требуют 14)', okSize >= .9 || okSize === 0 ? `${s} пт` : `${s} пт, в норме ${pct(okSize)} текста`);
    const okLine = share('line', v => v === 1.5);
    item('Межстрочный интервал', okLine >= .9, 'полуторный (1,5)', typeof l === 'number' ? String(l).replace('.', ',') + (okLine < .9 && okLine > 0 ? `, полуторный у ${pct(okLine)} текста` : '') : l);
    const okInd = share('indent', v => Math.abs(v - 1.25) <= .05);
    item('Абзацный отступ', okInd >= .9, '1,25 см', (i ? String(i).replace('.', ',') + ' см' : 'нет') + (okInd < .9 && okInd > 0 ? `, верно у ${pct(okInd)} абзацев` : ''));
    const okJc = share('jc', v => v === 'both' || v === 'distribute');
    item('Выравнивание', okJc >= .9, 'по ширине', { both: 'по ширине', left: 'по левому краю', start: 'по левому краю', center: 'по центру', right: 'по правому краю', end: 'по правому краю' }[j] || j);
  }
  /* номера страниц — поле PAGE в колонтитулах */
  let pageNum = false;
  for (const kind of ['footer', 'header']) for (let k = 1; k <= 6 && !pageNum; k++) {
    const x = await tryEntry(buf, `word/${kind}${k}.xml`);
    if (x && /PAGE(?![A-Z])/.test(x)) pageNum = true;
  }
  item('Номера страниц', pageNum, 'есть, обычно внизу по центру', pageNum ? 'есть' : 'не найдены');
  /* структура */
  const H = headings.map(h => h.toLowerCase());
  const has = re => H.some(h => re.test(h));
  const parts = [['Содержание', /^(содержание|оглавление)/], ['Введение', /^введение/], ['Заключение', /^(заключение|выводы)/],
    ['Список литературы', /(список\s+(использованн\S*\s+)?(литературы|источников)|библиограф|литература$)/]];
  const missing = parts.filter(([, re]) => !has(re)).map(([n]) => n);
  item('Структура работы', !missing.length, 'содержание, введение, заключение, список литературы', missing.length ? 'не найдено: ' + missing.join(', ').toLowerCase() : 'все разделы на месте');
  return { items, problems: items.filter(x => !x.ok).length };
}

/** Текст из файла, который выбрал человек: .docx, .pdf, .txt. */
async function readFile(file) {
  const name = file.name.toLowerCase(), buf = await file.arrayBuffer();
  if (/\.(doc|rtf|odt|pages)$/.test(name)) throw new Error('Этот формат не поддерживается. Сохраните документ как .docx или .pdf.');
  if (name.endsWith('.docx')) { const r = await docxToText(buf); try { r.gost = await gostCheck(buf); } catch (e) { r.gost = null; } return r; }
  if (name.endsWith('.pdf')) return { text: await pdfToText(buf, 400), flags: {} };
  return { text: decodeBytes(buf, ''), flags: {} };
}

/* =====================================================================
   Источники: помощник, поисковики, Википедия, КиберЛенинка
   ===================================================================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
let API = '';
function setApi(url) { API = (url || '').replace(/\/$/, ''); }

class Blocked extends Error {}

/** Ограничитель частоты запросов: при отказах пауза растёт, на время «остывания» запросы не идут. */
class Throttle {
  constructor(base, max) { this.base = base; this.interval = base; this.max = max; this.nextAt = 0; this.blockedUntil = 0; this.cooldown = 30000; this.turn = 0; }
  available() { return Date.now() >= this.blockedUntil; }
  async wait(cancel) {
    const start = Math.max(Date.now(), this.nextAt);
    this.nextAt = start + this.interval;
    const turn = ++this.turn;
    while (Date.now() < start) {
      if ((cancel && cancel()) || !this.available()) return null;
      await sleep(Math.min(200, start - Date.now()));
    }
    return this.available() ? turn : null;
  }
  blocked() {
    this.blockedUntil = Date.now() + this.cooldown;
    this.cooldown = Math.min(this.cooldown * 2, 300000);
    this.interval = Math.min(this.interval * 1.5, this.max);
    this.nextAt = this.blockedUntil;
  }
  ok() { this.cooldown = 30000; this.interval = Math.max(this.base, this.interval * 0.95); }
  pause(ms) { this.nextAt = Math.max(this.nextAt, Date.now() + ms); this.interval = Math.min(this.interval * 1.5, this.max); }
}
const ddg = new Throttle(9000, 16000);     // проверено: при паузе 9–10 с поисковик не отказывает
const seznam = new Throttle(3000, 8000);
const wiki = new Throttle(6000, 12000);    // API Википедии без входа пускает около 10 запросов в минуту

async function timed(promiseFn, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { return await promiseFn(ctl.signal); } finally { clearTimeout(t); }
}

/** Запрос через помощника. Возвращает {status, ctype, url, bytes}. */
async function viaProxy(url, body, ms = 16000) {
  if (!API) throw new Error('помощник не настроен');
  const target = API + (API.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(url);
  return timed(async signal => {
    const r = await fetch(target, body ? { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, signal } : { signal });
    if (!r.ok) throw new Error('помощник ответил ' + r.status);
    return { status: +(r.headers.get('x-status') || 200), ctype: (r.headers.get('content-type') || '').toLowerCase(),
      url: r.headers.get('x-final-url') || url, bytes: new Uint8Array(await r.arrayBuffer()) };
  }, ms);
}
let YANDEX = false;   // помощник умеет искать через Yandex Search API (включается в облаке)
let PAID = false;     // поиск Яндекса платный: нужен билет полной проверки (antiplagiat-api/pay.js)
let TICKET = '';      // билет текущей полной проверки
function setTicket(t) { TICKET = t || ''; }
const yandexReady = () => YANDEX && (!PAID || !!TICKET);
async function pingProxy() {
  if (!API) return false;
  try {
    return await timed(async signal => {
      const r = await fetch(API, { signal }); if (!r.ok) return false;
      const d = await r.json(); YANDEX = d.yandex === true; PAID = d.paid === true; return d.ok === true;
    }, 8000);
  } catch (e) { return false; }
}
/** Поиск Яндекса через помощника (отложенный режим: результат может быть готов не сразу). */
async function searchYandex(query, cancel) {
  const ask = async qs => timed(async signal => {
    const r = await fetch(API + (API.includes('?') ? '&' : '?') + qs, { signal });
    const d = await r.json().catch(() => ({}));
    if (r.status === 402) { TICKET = ''; throw new Blocked('yandex'); }
    if (r.status === 429 || r.status === 503) { YANDEX = false; throw new Blocked('yandex'); }
    if (!r.ok) throw new Error(d.error || 'поиск Яндекса ответил ' + r.status);
    return d;
  }, 20000);
  let d = await ask('ysearch=' + encodeURIComponent(query) + (TICKET ? '&t=' + encodeURIComponent(TICKET) : ''));
  for (let i = 0; i < 30 && !d.done; i++) {
    if (cancel && cancel()) return [];
    await sleep(2000);
    d = await ask('yop=' + encodeURIComponent(d.op));
  }
  return d.done ? d.results || [] : [];
}

// разбор в отдельном «немом» документе: скрипты и картинки из чужой разметки там не запускаются и не грузятся
const stripTags = s => (new DOMParser().parseFromString((s || '').replace(/<[^>]+>/g, ' '), 'text/html').body.textContent || '')
  .replace(/\s+/g, ' ').trim();

const DDG_HTML = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
const DDG_HTML2 = /href="([^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>(?:[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
const DDG_LITE = /href="([^"]+)"[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>(?:[\s\S]*?class='result-snippet'[^>]*>([\s\S]*?)<\/td>)?/g;
function ddgUnwrap(href) {
  href = stripTags(href.replace(/&amp;/g, '&'));
  if (href.includes('duckduckgo.com/y.js')) return null;  // реклама
  const m = /[?&]uddg=([^&]+)/.exec(href);
  if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return null; } }
  return href.startsWith('//') ? 'https:' + href : href;
}
function allMatches(re, s) { re.lastIndex = 0; const out = []; let m; while ((m = re.exec(s))) out.push(m); return out; }

async function searchDdg(query, cancel) {
  const turn = await ddg.wait(cancel);
  if (turn === null) throw new Blocked('ddg');
  const lite = turn % 2 === 0;
  const base = lite ? 'https://lite.duckduckgo.com/lite/?' : 'https://html.duckduckgo.com/html/?';
  const r = await viaProxy(base + new URLSearchParams({ q: query, kl: 'ru-ru' }));
  const page = decodeBytes(r.bytes, r.ctype);
  if (r.status === 202 || r.status === 403 || r.status === 429 || page.slice(0, 20000).includes('anomaly')) { ddg.blocked(); throw new Blocked('ddg'); }
  ddg.ok();
  let found = lite ? allMatches(DDG_LITE, page) : allMatches(DDG_HTML, page);
  if (!lite && !found.length) found = allMatches(DDG_HTML2, page);
  const out = [];
  for (const m of found) {
    const url = ddgUnwrap(m[1]);
    if (url) out.push({ url, title: stripTags(m[2]), snippet: stripTags(m[3] || '') });
  }
  return out;
}

const SEZNAM = /<a\b[^>]*data-e-a="heading"[^>]*>([\s\S]*?)<\/a>/g;
async function searchSeznam(query, cancel) {
  if ((await seznam.wait(cancel)) === null) throw new Blocked('seznam');
  const r = await viaProxy('https://search.seznam.cz/?' + new URLSearchParams({ q: query }));
  if (r.status === 403 || r.status === 429) { seznam.blocked(); throw new Blocked('seznam'); }
  const page = decodeBytes(r.bytes, r.ctype), out = [], seen = new Set();
  for (const m of allMatches(SEZNAM, page)) {
    const href = /href="([^"]+)"/.exec(m[0]);
    if (!href) continue;
    const url = href[1].replace(/&amp;/g, '&').split('#')[0];
    if (seen.has(url) || url.includes('seznam.cz')) continue;
    seen.add(url);
    out.push({ url, title: stripTags(m[1]), snippet: '' });
  }
  seznam.ok();
  return out;
}

/** Точная фраза (в кавычках) — DuckDuckGo находит по ней даже малоизвестные страницы с рефератами,
    которые по обычному запросу тонут среди похожих по теме. Если DuckDuckGo отказывает — Seznam. */
async function searchPhrase(phrase, cancel) {
  if (yandexReady()) {
    try { return [await searchYandex(phrase, cancel), 'yandex']; } catch (e) { /* дальше бесплатные */ }
  }
  if (ddg.available()) {
    try { return [await searchDdg(phrase, cancel), 'ddg']; } catch (e) { if (!(e instanceof Blocked)) throw e; }
  }
  return [await searchSeznam(phrase, cancel), 'seznam'];
}
/** Обычный запрос по началу предложения — параллельно, во втором поисковике: он хорошо находит
    энциклопедии и крупные сайты. Очередь DuckDuckGo он не трогает — тот быстро ограничивает частые запросы. */
async function searchFree(query, cancel) {
  if (seznam.available()) {
    try { const found = await searchSeznam(query, cancel); if (found.length) return [found, 'seznam']; } catch (e) { if (!(e instanceof Blocked)) throw e; }
  }
  return [[], 'none'];   // первый поисковик не трогаем: его очередь — для точных фраз
}

async function wikiGet(url, cancel) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await wiki.wait(cancel)) === null) throw new Blocked('wiki');
    const r = await timed(signal => fetch(url, { signal }), 15000);
    if (r.status === 429 && attempt < 2) { wiki.pause(5000); continue; }
    if (!r.ok) throw new Error('Википедия ответила ' + r.status);
    wiki.ok();
    return r.json();
  }
}
async function searchWikipedia(query, lang, cancel) {
  const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({ action: 'query', list: 'search', srsearch: query,
    format: 'json', srlimit: 3, srprop: 'snippet', origin: '*' });
  const data = await wikiGet(url, cancel);
  return ((data.query || {}).search || []).map(r => ({
    url: `https://${lang}.wikipedia.org/wiki/` + encodeURIComponent(r.title.replace(/ /g, '_')),
    title: r.title + ' — Википедия', snippet: stripTags(r.snippet), kind: 'wiki' }));
}

async function searchCyberleninka(query) {
  const r = await viaProxy('https://cyberleninka.ru/api/search', JSON.stringify({ mode: 'articles', q: query, size: 5, from: 0 }));
  if (r.status !== 200) throw new Error('КиберЛенинка ответила ' + r.status);
  const data = JSON.parse(decodeBytes(r.bytes, 'charset=utf-8'));
  return (data.articles || []).filter(a => a.link).map(a => ({ url: 'https://cyberleninka.ru' + a.link,
    title: stripTags(a.name), snippet: stripTags(a.annotation || ''), kind: 'science' }));
}

const openalex = new Throttle(1100, 4000);
/** OpenAlex — открытый каталог научных работ (журналы, репозитории вузов, Zenodo). Отвечает браузеру напрямую,
    бесплатно около 100 поисков в день с одного адреса — у каждого посетителя свой лимит. */
async function searchOpenAlex(query, lang, cancel) {
  if ((await openalex.wait(cancel)) === null) throw new Blocked('openalex');
  const url = 'https://api.openalex.org/works?' + new URLSearchParams({ search: query, 'per-page': 6,
    select: 'id,display_name,language,best_oa_location,primary_location,open_access' });
  const r = await timed(signal => fetch(url, { signal }), 15000);
  if (r.status === 429 || r.status === 403) { openalex.blocked(); throw new Blocked('openalex'); }
  if (!r.ok) throw new Error('OpenAlex ответил ' + r.status);
  openalex.ok();
  const data = await r.json(), out = [];
  for (const w of data.results || []) {
    if (w.language && w.language !== lang) continue;
    const loc = w.best_oa_location || {}, prim = w.primary_location || {};
    const url2 = loc.pdf_url || loc.landing_page_url || (w.open_access && w.open_access.oa_url) || prim.landing_page_url;
    if (url2) out.push({ url: url2, title: w.display_name || '', snippet: '', kind: 'science' });
  }
  return out;
}

const SKIP_HOSTS = ['youtube.com', 'youtu.be', 'rutube.ru', 'vk.com', 'vkvideo.ru', 't.me', 'instagram.com', 'facebook.com',
  'twitter.com', 'x.com', 'tiktok.com', 'pinterest.', 'ok.ru', 'ozon.ru', 'wildberries.ru', 'market.yandex.',
  'play.google.com', 'apps.apple.com', 'duckduckgo.com', 'translate.google.', 'maps.google.', 'yandex.ru/maps'];
const SKIP_EXT = /\.(jpe?g|png|gif|zip|rar|mp4|mp3|docx?|xlsx?|pptx?|djvu|exe)$/;
function usableUrl(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  const low = url.toLowerCase(), host = u.hostname.toLowerCase();
  if (SKIP_HOSTS.some(s => host.includes(s) || low.slice(0, 60).includes(s))) return false;
  return !SKIP_EXT.test(u.pathname.toLowerCase());
}

/** Скачивает источник: Википедию — напрямую, остальное — через помощника. [заголовок, текст] или null. */
async function fetchPage(cand) {
  const u = new URL(cand.url);
  const wikiHost = /^([a-z-]+)\.(?:m\.)?wikipedia\.org$/.exec(u.hostname);
  if (wikiHost && u.pathname.startsWith('/wiki/')) {
    const title = decodeURIComponent(u.pathname.slice(6));
    const html = await timed(async signal => {
      const r = await fetch(`https://${wikiHost[1]}.wikipedia.org/api/rest_v1/page/html/` + encodeURIComponent(title), { signal });
      return r.ok ? r.text() : null;
    }, 20000);
    if (html) { const [, text] = htmlToText(html); return [cand.title || title.replace(/_/g, ' ') + ' — Википедия', text]; }
  }
  if (!API) return null;
  let r;
  try { r = await viaProxy(cand.url, null, 20000); } catch (e) { r = null; }
  if (!r || [404, 410, 451, 500, 502, 503, 504].includes(r.status)) {
    // страница пропала или не отвечает — берём последний снимок из веб-архива (только то, что было открыто)
    try { r = await viaProxy('https://web.archive.org/web/2id_/' + cand.url, null, 25000); } catch (e) { return null; }
    if (r.status >= 400) return null;
  } else if (r.status >= 400) return null;
  if (r.ctype.includes('pdf') || (r.bytes[0] === 0x25 && r.bytes[1] === 0x50 && r.bytes[2] === 0x44 && r.bytes[3] === 0x46)) {
    try { return [cand.title || cand.url, await pdfToText(r.bytes)]; } catch (e) { return null; }
  }
  if (r.ctype && !/html|xml|text\/plain/.test(r.ctype)) return null;
  const page = decodeBytes(r.bytes, r.ctype);
  if (r.ctype.includes('text/plain')) return [cand.title || cand.url, page];
  const [title, text] = htmlToText(page);
  return [title || cand.title || cand.url, text];
}


/* =====================================================================
   «Кольцо САФУ» — общая база работ, которые студенты добавили сами.
   Сравнение по «отпечаткам»: хеши троек основ слов, из которых оставлен каждый
   минимальный в окне из 4 (winnowing). Любое совпадение от 6 значимых слов
   подряд обязательно даёт общий отпечаток, а сервер получает не текст, а числа.
   ===================================================================== */
let RING = '';
function setRing(url) { RING = (url || '').replace(/\/$/, ''); }
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** Отпечатки текста: [[хеш, позиция начала в тексте], ...]. */
function fingerprints(text, tokens) {
  const t = tokens || new Tokens(text), S = t.stems, hs = [];
  for (let i = 0; i + 2 < S.length; i++) hs.push(fnv1a(S[i] + SEP + S[i + 1] + SEP + S[i + 2]));
  const W = 4, out = [];
  let last = -1;
  for (let i = 0; i + W <= hs.length; i++) {
    let m = i;
    for (let j = i + 1; j < i + W; j++) if (hs[j] <= hs[m]) m = j;
    if (m !== last) { out.push([hs[m], t.starts[t.cidx[m]]]); last = m; }
  }
  if (hs.length && hs.length < W) out.push([hs[0], t.starts[t.cidx[0]]]);
  return out;
}
async function ringCall(body, ms = 20000) {
  if (!RING) throw new Error('Кольцо САФУ пока не подключено.');
  return timed(async signal => {
    const r = await fetch(RING, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) throw new Error(data.error || 'Кольцо САФУ не ответило (' + r.status + ')');
    return data;
  }, ms);
}
/** Добавить работу в кольцо. Возвращает {id, key} — ключ нужен, чтобы потом удалить работу. */
async function ringAdd(title, rawText) {
  const [text] = cleanText(rawText);
  const bib = bibliographyStart(text);
  const body = (bib !== null ? text.slice(0, bib) : text).slice(0, 600000);
  const fps = fingerprints(body);
  if (fps.length < 30) throw new Error('Текст слишком короткий для Кольца.');
  return ringCall({ action: 'add', title: String(title || '').slice(0, 160), text: body, fps }, 30000);
}
async function ringDelete(id, key) { return ringCall({ action: 'delete', id, key }); }
async function ringPing() { return !!RING && ringCall({ action: 'ping' }, 8000).then(d => d.ok === true).catch(() => false); }

/* =====================================================================
   Проверка
   ===================================================================== */
const DEPTH = {
  fast: { web: 6, wiki: 6, sci: 12, oa: 6, pages: 45, rounds: 1, seconds: 80 },
  std: { web: 22, wiki: 16, sci: 36, oa: 18, pages: 150, rounds: 2, seconds: 240 },
  deep: { web: 60, wiki: 40, sci: 90, oa: 45, pages: 360, rounds: 3, seconds: 600 },
};
const MAX_SOURCE_CHARS = 700000, MIN_SOURCE_WORDS = 8, MAX_SOURCES = 80;

class Sem {
  constructor(n) { this.n = n; this.q = []; }
  async run(fn) {
    if (this.n > 0) this.n--; else await new Promise(r => this.q.push(r));
    try { return await fn(); } finally { const next = this.q.shift(); if (next) next(); else this.n++; }
  }
}

function urlKey(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
    let path = u.pathname; try { path = decodeURIComponent(path); } catch (e) { /* как есть */ }
    return host + path.replace(/\/$/, '') + (u.search || '');
  } catch (e) { return url; }
}
const domainOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
function bigramsOf(text) {
  const st = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) { const [w] = normalizeWord(m[0]); if (isContent(w)) st.push(stem(w)); }
  const out = new Set();
  for (let i = 0; i + 1 < st.length; i++) out.add(st[i] + SEP + st[i + 1]);
  return out;
}
function excerpt(text, a, b, limit = 700) {
  let piece = text.slice(a, b);
  if (piece.length > limit) { const h = limit >> 1; piece = piece.slice(0, h).trimEnd() + ' … ' + piece.slice(-h).trimStart(); }
  return piece.replace(/\s+/g, ' ');
}

/**
 * Проверяет текст. opts: depth, web, wiki, science, skip_bibliography, quotes, flags, urls, library [{name, text}].
 * ui: say(строка), set(этап, доля 0..1), counters({queries, pages, sources}), cancelled() → bool.
 */
async function runCheck(rawText, opts, ui) {
  const started = Date.now();
  const depth = DEPTH[opts.depth] || DEPTH.std;
  const deadline = started + depth.seconds * 1000;
  const stop = () => ui.cancelled() || Date.now() > deadline;

  const [text, zeroWidth] = cleanText(rawText);
  const doc = new Tokens(text);
  const nWords = doc.length;
  if (nWords < 20) throw new Error('Текст слишком короткий: для проверки нужно хотя бы 20 слов.');

  let bibPos = opts.skip_bibliography === false ? null : bibliographyStart(text);
  let areaEnd = bibPos !== null ? doc.range(0, bibPos)[1] : nWords;
  if (areaEnd < 20) { areaEnd = nWords; bibPos = null; }
  const areaChars = bibPos !== null ? bibPos : text.length;
  const cEnd = lowerBound(doc.cidx, areaEnd);
  doc.cidx = doc.cidx.slice(0, cEnd); doc.stems = doc.stems.slice(0, cEnd);
  const D = doc.stems;
  const docShingles = new Set(); for (let i = 0; i + 2 < D.length; i++) docShingles.add(key3(D, i));
  const docBigrams = new Set(); for (let i = 0; i + 1 < D.length; i++) docBigrams.add(D[i] + SEP + D[i + 1]);
  const sample = doc.norm.slice(0, 2000);
  const lang = sample.filter(w => /[а-я]/.test(w)).length >= sample.length * 0.5 ? 'ru' : 'en';

  const quotes = [];
  for (const [a, b] of quoteSpans(text.slice(0, areaChars))) { const [qa, qb] = doc.range(a, b); if (qb - qa >= 4) quotes.push([qa, qb]); }

  const sents = [];
  for (const [a, b] of sentences(text.slice(0, areaChars))) {
    const [ws, we] = doc.range(a, b);
    if (we - ws < 7) continue;
    if (lowerBound(doc.cidx, we) - lowerBound(doc.cidx, ws) >= 5) sents.push([ws, we]);
  }

  if (ui.start) ui.start({ text, starts: doc.starts, ends: doc.ends, areaEnd, sents });
  const covered = new Uint8Array(nWords);
  let found = [];
  const seen = new Map();
  const stats = { web: 0, wiki: 0, sci: 0, oa: 0, pages: 0, candidates: 0, web_blocked: false };
  const engines = {};

  function consider(title, srcText, url, kind) {
    [srcText] = cleanText(srcText.slice(0, MAX_SOURCE_CHARS));
    const src = new Tokens(srcText);
    if (src.stems.length < 20) return 0;
    const index = shingleIndex(src.stems);
    let shared = 0;
    for (const g of docShingles) if (index.has(g) && ++shared >= 3) break;
    if (shared < 3) return 0;
    const spans = align(doc, src, index);
    let words = 0;
    for (const sp of spans) words += Math.min(sp.we, areaEnd - 1) - sp.ws + 1;
    if (!spans.length || words < MIN_SOURCE_WORDS) return 0;
    for (const sp of spans) {
      sp.excerpt = excerpt(srcText, sp.sFrom, sp.sTo); delete sp.sFrom; delete sp.sTo;
      for (let w = sp.ws; w <= sp.we && w < nWords; w++) covered[w] = 1;
    }
    title = (title || '').split(/\s+[–—-]\s+тема научной статьи/)[0].trim();
    if (title && title === title.toUpperCase() && title !== title.toLowerCase()) title = title[0] + title.slice(1).toLowerCase();
    const entry = { url, title: (title || url).slice(0, 200), domain: url ? domainOf(url) : '', kind, spans, words };
    found.push(entry);
    if (ui.found) ui.found(entry);
    return words;
  }

  // 1. Своя коллекция документов
  const library = opts.library || [];
  if (library.length) {
    ui.set('Сверка с вашей коллекцией', 0.02);
    let hits = 0;
    for (const item of library) { if (consider(item.name, item.text, '', 'library')) hits++; await sleep(0); }
    ui.say(`Коллекция: проверено документов — ${library.length}, с совпадениями — ${hits}.`);
  }

  // 1б. «Кольцо САФУ»: сервер возвращает только куски чужих работ вокруг общих отпечатков
  stats.ring = 0;
  if (opts.ring !== false && RING) {
    ui.set('Сверка с Кольцом САФУ', 0.03);
    try {
      const fps = fingerprints(text, doc).map(f => f[0]);
      const res = await ringCall({ action: 'query', fps: [...new Set(fps)].slice(0, 20000) }, 25000);
      for (const d of res.docs || []) {
        const title = 'Кольцо САФУ: ' + (d.title || 'работа студента') + (d.year ? ', ' + d.year : '');
        if (consider(title, d.excerpt || '', '', 'ring')) stats.ring++;
        await sleep(0);
      }
      ui.say(stats.ring ? `Кольцо САФУ: совпадения с ${stats.ring} ${stats.ring === 1 ? 'работой' : 'работами'} студентов.` : 'Кольцо САФУ: совпадений с работами студентов нет.');
    } catch (e) { ui.say('Кольцо САФУ сейчас не ответило — проверка идёт без него.'); }
  }

  // 2. Помощник для скачивания страниц: без него остаётся только Википедия
  const proxyOk = await pingProxy();
  if (!proxyOk && (opts.web !== false || opts.science !== false)) {
    ui.say('Помощник для скачивания страниц недоступен — проверка идёт только по Википедии и вашей коллекции.');
  }
  const useWeb = opts.web !== false && proxyOk, useWiki = opts.wiki !== false, useSci = opts.science !== false && proxyOk;
  const left = { web: useWeb ? depth.web : 0, wiki: useWiki ? depth.wiki : 0, sci: useSci ? depth.sci : 0,
    oa: opts.science !== false ? depth.oa : 0, pages: depth.pages };

  const coverage = ([ws, we]) => { let s = 0; for (let w = ws; w < we; w++) s += covered[w]; return s / (we - ws); };
  const used = { web: new Set(), wiki: new Set(), sci: new Set(), oa: new Set() };
  function pick(kind, n, avoid) {
    let cands = [];
    sents.forEach((s, i) => { if (!used[kind].has(i) && coverage(s) < 0.4) cands.push(i); });
    if (n <= 0 || !cands.length) return [];
    if (avoid) { const fresh = cands.filter(i => !avoid.includes(i)); if (fresh.length >= n) cands = fresh; }
    if (cands.length > n) { const step = cands.length / n; cands = Array.from({ length: n }, (_, k) => cands[Math.floor(k * step + step / 2)]); }
    cands.forEach(i => used[kind].add(i));
    return cands;
  }
  const wordsOf = (ws, we) => { const out = []; for (let k = ws; k < we; k++) out.push(text.slice(doc.starts[k], doc.ends[k])); return out; };
  const webQuery = i => wordsOf(sents[i][0], Math.min(sents[i][1], sents[i][0] + 12)).join(' ');
  /** Самые «редкие» 7 слов подряд из предложения — по ним точная фраза находит источник. */
  const phraseQuery = i => {
    const [ws, we] = sents[i], words = wordsOf(ws, we), W = Math.min(7, words.length);
    let best = 0, bestScore = -1;
    for (let k = 0; k + W <= words.length; k++) {
      let sc = 0;
      for (let t = k; t < k + W; t++) { const [w] = normalizeWord(words[t]); if (isContent(w)) sc += Math.min(w.length, 10); }
      if (sc > bestScore) { bestScore = sc; best = k; }
    }
    return '"' + words.slice(best, best + W).join(' ') + '"';
  };
  const sciQuery = i => wordsOf(sents[i][0], Math.min(sents[i][1], sents[i][0] + 9)).join(' ');
  const wikiQuery = i => wordsOf(sents[i][0], sents[i][1]).filter(w => !DIGITS.test(w)).slice(0, 10).join(' ');

  const sciSem = new Sem(4), fetchSem = new Sem(6);
  const pending = new Set();
  let planned = 1, finished = 0;
  function launch(kind, fn, extra) {
    planned++;
    let p;
    p = (async () => { try { return { kind, v: await fn(), extra, p }; } catch (e) { return { kind, v: null, err: e, extra, p }; } })();
    pending.add(p);
  }
  function submitFetch(cand) {
    if (left.pages <= 0) return;
    left.pages--;
    launch('page', () => stop() ? null : fetchSem.run(() => fetchPage(cand)), cand);
  }
  function register(results, kind) {
    const keepTop = { web: 4, wiki: 2, sci: 3, oa: 2 }[kind], fresh = [];
    results.forEach((r, rank) => {
      if (!usableUrl(r.url || '')) return;
      const k = urlKey(r.url);
      if (seen.has(k)) { seen.get(k).hits++; return; }
      let score = 0;
      for (const g of bigramsOf((r.title || '') + ' . ' + (r.snippet || ''))) if (docBigrams.has(g)) score++;
      const cand = Object.assign({}, r, { hits: 1, score, rank, kind: r.kind || (kind === 'web' ? 'web' : kind) });
      seen.set(k, cand); stats.candidates++; fresh.push(cand);
    });
    fresh.sort((a, b) => b.score - a.score || a.rank - b.rank)
      .forEach((cand, n) => { if (n < keepTop || cand.score >= 3) submitFetch(cand); });
  }

  // ссылки, которые человек указал сам, — в первую очередь
  for (let url of opts.urls || []) {
    url = (url || '').trim();
    if (url && usableUrl(url) && !seen.has(urlKey(url)) && proxyOk) {
      const cand = { url, title: '', snippet: '', hits: 1, score: 99, rank: 0, kind: 'web' };
      seen.set(urlKey(url), cand); left.pages++; submitFetch(cand);
    }
  }

  const rounds = depth.rounds;
  for (let rnd = 0; rnd < rounds + 3; rnd++) {
    if (stop()) break;
    const roundsLeft = Math.max(1, rounds - rnd);
    const forWeb = pick('web', Math.ceil(left.web / roundsLeft));
    const forWiki = pick('wiki', Math.ceil(left.wiki / roundsLeft), forWeb);
    const forSci = pick('sci', Math.ceil(left.sci / roundsLeft));
    const forOa = pick('oa', Math.ceil(left.oa / roundsLeft), forSci);
    if (!(forWeb.length || forWiki.length || forSci.length || forOa.length || pending.size)) {
      if (rnd) ui.say('Все фрагменты либо найдены, либо уже проверены по всем источникам.');
      break;
    }
    if (rnd) ui.say(`Круг ${rnd + 1}: ищу источники для ещё не найденных фрагментов.`);
    // веб-поиск и Википедия ограничены по частоте, поэтому им достаются разные предложения
    for (const i of forWeb) {
      left.web--;
      if (ui.query) ui.query(i, 'web');
      const q = webQuery(i);
      const phrase = phraseQuery(i);
      const note = ([res, engine]) => { engines[engine] = (engines[engine] || 0) + 1; if (engine === 'yandex') stats.yandex = (stats.yandex || 0) + 1; return res; };
      launch('web', async () => stop() ? null : note(await searchPhrase(phrase, stop)));
      launch('web', async () => stop() ? null : note(await searchFree(q, stop)));
    }
    for (const i of forWiki) {
      const q = wikiQuery(i);
      if (!q) continue;
      left.wiki--;
      if (ui.query) ui.query(i, 'wiki');
      launch('wiki', () => stop() ? null : searchWikipedia(q, lang, stop));
    }
    for (const i of forSci) {
      left.sci--;
      if (ui.query) ui.query(i, 'sci');
      const q = sciQuery(i);
      launch('sci', () => stop() ? null : sciSem.run(() => searchCyberleninka(q)));
    }
    for (const i of forOa) {
      left.oa--;
      if (ui.query) ui.query(i, 'sci');
      const q = webQuery(i);
      launch('oa', () => stop() ? null : searchOpenAlex(q, lang, stop));
    }

    while (pending.size && !ui.cancelled()) {
      const r = await Promise.race(pending);
      pending.delete(r.p);
      finished++;
      if (r.kind === 'page') {
        stats.pages++;
        const page = r.v, cand = r.extra;
        if (page && page[1]) {
          const title = cand.kind === 'science' ? cand.title : page[0];
          consider(title || page[0], page[1], cand.url, cand.kind || 'web');
          await sleep(0);  // даём странице перерисоваться
        }
      } else if (r.v) {
        stats[r.kind]++;
        register(r.v, r.kind);
      }
      ui.counters({ queries: stats.web + stats.wiki + stats.sci + stats.oa, pages: stats.pages, sources: found.length });
      ui.set('Ищу источники и сравниваю тексты', 0.05 + 0.93 * finished / Math.max(planned, 1));
    }
  }
  if (ui.cancelled()) throw new Error('Проверка отменена.');

  stats.engines = engines;
  stats.web_blocked = useWeb && ddg.blockedUntil > started;
  if (stats.web_blocked) ui.say('Основной веб-поиск ограничил частоту запросов — часть поиска прошла через запасной поисковик.');
  stats.proxy = proxyOk;

  ui.set('Собираю отчёт', 0.99);
  found.sort((a, b) => b.words - a.words);
  found = found.slice(0, MAX_SOURCES);
  found.forEach((src, n) => { src.id = n; src.percent = Math.round(10000 * src.words / Math.max(1, areaEnd)) / 100; });

  const flags = opts.flags || {};
  const suspicious = {
    swapped_words: doc.swapped.length,
    swapped_samples: doc.swapped.slice(0, 12).map(i => text.slice(doc.starts[i], doc.ends[i])),
    zero_width: zeroWidth,
    hidden_chars: +flags.hidden_chars || 0,
    hidden_kinds: flags.hidden_kinds || {},
    hidden_samples: flags.hidden_samples || [],
  };
  suspicious.alert = suspicious.swapped_words >= 3 || zeroWidth >= 5 || suspicious.hidden_chars >= 20;

  const flat = [];
  for (let k = 0; k < nWords; k++) flat.push(doc.starts[k], doc.ends[k]);
  Object.assign(stats, { words: nWords, chars: text.length, sentences: sents.length,
    seconds: Math.round((Date.now() - started) / 100) / 10, sources: found.length });
  const now = new Date();
  return {
    text, words: flat, area_end: areaEnd, bibliography: bibPos !== null, quotes, sources: found,
    suspicious, stats, depth: opts.depth || 'std',
    created: now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
}

global.Iceberg = { runCheck, readFile, gostCheck, setApi, pingProxy, setTicket, yandexInfo: () => ({ yandex: YANDEX, paid: PAID }), setRing, ringAdd, ringDelete, ringPing, fingerprints, bibliographyStart, cleanText, Tokens, align, htmlToText, docxToText, normalizeWord, stem };
})(window);
