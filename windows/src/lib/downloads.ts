// Скачивание с сайтов: в какую папку класть файл и как найти все файлы на странице.
// Из GradeSync.swift (SubjectMatch) и WebScreen.swift (WebFile.findScript).

/** Корни слов: «математический» и «математика» → «матема» */
function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^\p{L}]+/u).filter(w => w.length >= 3).map(w => w.slice(0, 6)))
}

/** Лучший предмет из расписания для названия с сайта (заголовок курса Sakai) или null */
export function bestSubject(raw: string, subjects: string[]): string | null {
  const low = raw.toLowerCase().trim()
  if (!low) return null
  const exact = subjects.find(s => { const l = s.toLowerCase(); return l.length > 2 && (low.includes(l) || l.includes(low)) })
  if (exact) return exact
  const a = tokens(raw)
  if (!a.size) return null
  let best: [string, number] | null = null
  for (const s of subjects) {
    const b = tokens(s)
    if (!b.size) continue
    let common = 0
    for (const t of a) if (b.has(t)) common++
    const score = common / Math.min(a.size, b.size)
    if (score >= 0.6 && score > (best?.[1] ?? 0)) best = [s, score]
  }
  return best?.[0] ?? null
}

/** Адрес похож на файл, а не на страницу */
export const FILE_EXT = /\.(pdf|docx?|rtf|odt|txt|xlsx?|ods|csv|pptx?|ppsx?|odp|djvu?|epub|fb2|zip|rar|7z|jpe?g|png|gif|webp|heic|mp3|m4a|wav|mp4|mov|webm)(\?|#|$)/i

export function looksLikeFile(url: string): boolean {
  try { return FILE_EXT.test(new URL(url).pathname) } catch { return false }
}

/** Ищет на странице ссылки на файлы: документы по расширению, ресурсы Sakai (/access/content/…),
 *  ссылки с атрибутом download, встроенные PDF; заглядывает в рамки того же сайта */
export const FIND_FILES_SCRIPT = `(function(){
  var exts = ${FILE_EXT.toString()};
  var out = [], seen = {};
  function add(u, t){
    try {
      var a = new URL(u, location.href);
      if (!/^https?:$/.test(a.protocol) || seen[a.href]) return;
      seen[a.href] = 1;
      out.push({ u: a.href, t: String(t || '').replace(/\\s+/g, ' ').trim().slice(0, 120) });
    } catch (e) {}
  }
  function sakai(h){ return /\\/access\\/content\\//.test(h) && !/\\/$/.test(h); }
  function scan(doc, depth){
    if (!doc || depth > 3) return;
    doc.querySelectorAll('a[href]').forEach(function(a){
      var h = a.href || '';
      if (exts.test(a.getAttribute('href') || '') || sakai(h) || a.hasAttribute('download'))
        add(h, a.textContent || a.getAttribute('title') || '');
    });
    doc.querySelectorAll('embed[src], object[data], iframe[src]').forEach(function(e){
      var s = e.src || e.data || '';
      if (exts.test(s) || sakai(s)) add(s, e.title || '');
    });
    doc.querySelectorAll('iframe, frame').forEach(function(f){ try { scan(f.contentDocument, depth + 1); } catch (e) {} });
  }
  scan(document, 0);
  return out.slice(0, 200);
})()`

export type PageFile = { u: string; t: string }

/** Понятное имя для пункта списка: текст ссылки или имя файла из адреса */
export function pageFileName(f: PageFile): string {
  if (f.t) return f.t
  try { return decodeURIComponent(new URL(f.u).pathname.split('/').filter(Boolean).pop() || 'Файл') } catch { return 'Файл' }
}
