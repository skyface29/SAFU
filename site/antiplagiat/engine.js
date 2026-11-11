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

/** Текст из файла, который выбрал человек: .docx, .pdf, .txt. */
async function readFile(file) {
  const name = file.name.toLowerCase(), buf = await file.arrayBuffer();
  if (/\.(doc|rtf|odt|pages)$/.test(name)) throw new Error('Этот формат не поддерживается. Сохраните документ как .docx или .pdf.');
  if (name.endsWith('.docx')) return docxToText(buf);
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
async function pingProxy() {
  if (!API) return false;
  try {
    return await timed(async signal => { const r = await fetch(API, { signal }); return r.ok && (await r.json()).ok === true; }, 8000);
  } catch (e) { return false; }
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

/** Веб-поиск с запасным поисковиком. Возвращает [результаты, имя поисковика]. */
async function searchWeb(query, cancel) {
  const words = query.split(' '), phrase = '"' + words.slice(0, 7).join(' ') + '"';
  if (ddg.available()) {
    // пока основной поисковик «отдыхает», пробуем найти дословную фразу во втором
    if (ddg.nextAt - Date.now() > 2500 && seznam.available() && words.length >= 5) {
      try { const found = await searchSeznam(phrase, cancel); if (found.length) return [found, 'seznam']; } catch (e) { /* дальше */ }
    }
    try { return [await searchDdg(query, cancel), 'ddg']; } catch (e) { if (!(e instanceof Blocked)) throw e; }
  }
  let found = words.length >= 5 ? await searchSeznam(phrase, cancel) : [];
  if (!found.length) found = await searchSeznam(query, cancel);
  return [found, 'seznam'];
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
  const r = await viaProxy(cand.url, null, 20000);
  if (r.status >= 400) return null;
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
   Проверка
   ===================================================================== */
const DEPTH = {
  fast: { web: 5, wiki: 6, sci: 12, pages: 30, rounds: 1, seconds: 80 },
  std: { web: 14, wiki: 16, sci: 36, pages: 90, rounds: 2, seconds: 240 },
  deep: { web: 36, wiki: 40, sci: 90, pages: 220, rounds: 3, seconds: 600 },
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

  const covered = new Uint8Array(nWords);
  let found = [];
  const seen = new Map();
  const stats = { web: 0, wiki: 0, sci: 0, pages: 0, candidates: 0, web_blocked: false };
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
    found.push({ url, title: (title || url).slice(0, 200), domain: url ? domainOf(url) : '', kind, spans, words });
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

  // 2. Помощник для скачивания страниц: без него остаётся только Википедия
  const proxyOk = await pingProxy();
  if (!proxyOk && (opts.web !== false || opts.science !== false)) {
    ui.say('Помощник для скачивания страниц недоступен — проверка идёт только по Википедии и вашей коллекции.');
  }
  const useWeb = opts.web !== false && proxyOk, useWiki = opts.wiki !== false, useSci = opts.science !== false && proxyOk;
  const left = { web: useWeb ? depth.web : 0, wiki: useWiki ? depth.wiki : 0, sci: useSci ? depth.sci : 0, pages: depth.pages };

  const coverage = ([ws, we]) => { let s = 0; for (let w = ws; w < we; w++) s += covered[w]; return s / (we - ws); };
  const used = { web: new Set(), wiki: new Set(), sci: new Set() };
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
    const keepTop = { web: 4, wiki: 2, sci: 3 }[kind], fresh = [];
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
    if (!(forWeb.length || forWiki.length || forSci.length || pending.size)) {
      if (rnd) ui.say('Все фрагменты либо найдены, либо уже проверены по всем источникам.');
      break;
    }
    if (rnd) ui.say(`Круг ${rnd + 1}: ищу источники для ещё не найденных фрагментов.`);
    // веб-поиск и Википедия ограничены по частоте, поэтому им достаются разные предложения
    for (const i of forWeb) {
      left.web--;
      const q = webQuery(i);
      launch('web', async () => { if (stop()) return null; const [res, engine] = await searchWeb(q, stop); engines[engine] = (engines[engine] || 0) + 1; return res; });
    }
    for (const i of forWiki) {
      const q = wikiQuery(i);
      if (!q) continue;
      left.wiki--;
      launch('wiki', () => stop() ? null : searchWikipedia(q, lang, stop));
    }
    for (const i of forSci) {
      left.sci--;
      const q = sciQuery(i);
      launch('sci', () => stop() ? null : sciSem.run(() => searchCyberleninka(q)));
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
      ui.counters({ queries: stats.web + stats.wiki + stats.sci, pages: stats.pages, sources: found.length });
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

global.Iceberg = { runCheck, readFile, setApi, pingProxy, cleanText, Tokens, align, htmlToText, docxToText, normalizeWord, stem };
})(window);
