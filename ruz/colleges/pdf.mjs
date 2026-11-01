// Текст PDF с координатами (pdfjs-dist). Колледжи делают расписание в Word и Excel — текст в PDF есть, но идёт
// не по порядку ячеек, поэтому раскладываем по x/y.
import fs from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Страницы → строки элементов { x, y, w, s }; y растёт вверх (как в PDF) */
export async function pdfItems(file, { grid = false } = {}) {
  const data = new Uint8Array(Buffer.isBuffer(file) ? file : fs.readFileSync(file));
  const doc = await getDocument({ data, verbosity: 0, isEvalSupported: false, useSystemFonts: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    const vp = p.getViewport({ scale: 1 });
    pages.push({ w: vp.width, h: vp.height, items: tc.items.filter(t => t.str && t.str.trim()).map(t => ({ x: t.transform[4], y: t.transform[5], w: t.width, s: t.str })), rules: grid ? await rules(p) : null });
  }
  await doc.destroy();
  return pages;
}

/** Склеить элементы одной строки по x: впритык — без пробела, с зазором — через пробел */
export function joinLine(items) {
  const a = [...items].sort((p, q) => p.x - q.x);
  let out = '', end = -1e9;
  for (const it of a) { out += (out && it.x - end > 1 ? ' ' : '') + it.s; end = it.x + it.w; }
  return out.replace(/\s+/g, ' ').trim();
}

/** Строки страницы: элементы с одинаковым y (±tol) */
export function lines(items, tol = 1.5) {
  const a = [...items].sort((p, q) => q.y - p.y || p.x - q.x), out = [];
  for (const it of a) { const l = out.at(-1); if (l && Math.abs(l.y - it.y) <= tol) l.items.push(it); else out.push({ y: it.y, items: [it] }); }
  for (const l of out) l.text = joinLine(l.items);
  return out;
}

/** Текст ячейки: сверху вниз, слева направо; перенос по дефису («ДОРОЖНО-» / «СТРОИТЕЛЬНЫЕ») склеиваем */
export function cellText(items) {
  let out = '';
  for (const l of lines(items)) out = !out ? l.text : /[А-Яа-яЁё]-$/.test(out) ? out + l.text : out + ' ' + l.text;
  return out.replace(/\s+/g, ' ').trim();
}

// Линии таблицы: Word и Excel рисуют границы ячеек тонкими залитыми прямоугольниками.
// h — горизонтальные (y, x0, x1), v — вертикальные (x, y0, y1). Смещений системы координат в этих PDF нет.
async function rules(page) {
  const ol = await page.getOperatorList(), h = [], v = [];
  const argc = { [OPS.moveTo]: 2, [OPS.lineTo]: 2, [OPS.curveTo]: 6, [OPS.curveTo2]: 4, [OPS.curveTo3]: 4, [OPS.closePath]: 0 };
  let fill = [0, 0, 0];
  ol.fnArray.forEach((f, i) => {
    if (f === OPS.setFillRGBColor) { const a = ol.argsArray[i]; fill = typeof a[0] === 'string' ? [parseInt(a[0].slice(1, 3), 16), parseInt(a[0].slice(3, 5), 16), parseInt(a[0].slice(5, 7), 16)] : a; return; }
    if (f !== OPS.constructPath) return;
    if (fill.every(c => c > 200)) return;   // белые «линии» Excel — не границы
    const [ops, args] = ol.argsArray[i];
    let k = 0;
    for (const op of ops) {
      if (op !== OPS.rectangle) { k += argc[op] || 0; continue; }
      let [x, y, w, hh] = args.slice(k, k + 4); k += 4;
      if (w < 0) { x += w; w = -w; } if (hh < 0) { y += hh; hh = -hh; }
      if (hh < 2 && w > 4) h.push({ y: y + hh / 2, x0: x, x1: x + w });
      else if (w < 2 && hh > 4) v.push({ x: x + w / 2, y0: y, y1: y + hh });
    }
  });
  return { h, v };
}

const uniq = (a, tol) => { const out = []; for (const x of [...a].sort((p, q) => p - q)) if (!out.length || x - out.at(-1) > tol) out.push(x); return out; };

/** Сетка страницы: строки между горизонтальными линиями, в каждой — ячейки между вертикальными линиями, что её пересекают.
 *  Текст раскладывается по ячейкам. Строки сверху вниз: [{ top, bottom, cells: [{ x0, x1, items }] }]; free — текст вне таблиц */
export function gridOf(page) {
  const { h, v } = page.rules || { h: [], v: [] };
  const ys = uniq(h.map(l => l.y), 2.5).reverse();
  const bands = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const top = ys[i], bottom = ys[i + 1];
    if (top - bottom < 4) continue;
    const xs = uniq(v.filter(l => l.y0 <= bottom + 2 && l.y1 >= top - 2).map(l => l.x), 2.5);
    if (xs.length < 2) continue;
    bands.push({ top, bottom, cells: xs.slice(1).map((x1, j) => ({ x0: xs[j], x1, items: [] })) });
  }
  const free = [];
  for (const it of page.items) {
    const cx = it.x + Math.min(it.w, 6) / 2, cy = it.y + 2;
    const b = bands.find(b => cy <= b.top && cy >= b.bottom);
    const c = b && b.cells.find(c => cx >= c.x0 && cx <= c.x1);
    if (c) c.items.push(it); else free.push(it);
  }
  return { bands, free };
}

/** Когда загрузчик положил файл (из <inbox>/index.json); у git-копии время изменения файлов — время checkout */
export function inboxTimes(inbox) {
  const out = new Map();
  try { for (const v of Object.values(JSON.parse(fs.readFileSync(inbox + '/index.json', 'utf8')).files || {})) out.set(v.path, v.at); } catch { /* нет списка */ }
  return rel => out.get(rel) ?? (() => { try { return fs.statSync(inbox + '/' + rel).mtimeMs; } catch { return 0; } })();
}
