package ru.student.safuhub.feature.web

import org.json.JSONArray
import ru.student.safuhub.core.RU

// Скачивание с сайтов (как iPhone 19.8 и Windows 19.7): в какую папку класть файл и как найти все файлы на странице

object SiteFiles {
    data class PageFile(val u: String, val t: String)

    private val fileExt = Regex("\\.(pdf|docx?|rtf|odt|txt|xlsx?|ods|csv|pptx?|ppsx?|odp|djvu?|epub|fb2|zip|rar|7z|jpe?g|png|gif|webp|heic|mp3|m4a|wav|mp4|mov|webm)(\\?|#|$)", RegexOption.IGNORE_CASE)

    /** Адрес похож на файл, а не на страницу */
    fun looksLikeFile(url: String): Boolean = runCatching { fileExt.containsMatchIn(java.net.URI(url).path ?: "") }.getOrDefault(false)

    /** Корни слов: «математический» и «математика» → «матема» */
    private fun tokens(s: String) = s.lowercase(RU).split(Regex("[^\\p{L}]+")).filter { it.length >= 3 }.map { it.take(6) }.toSet()

    /** Лучший предмет из расписания для названия с сайта (заголовок курса Sakai) */
    fun bestSubject(raw: String, subjects: List<String>): String? {
        val low = raw.lowercase(RU).trim()
        if (low.isEmpty()) return null
        subjects.firstOrNull { val l = it.lowercase(RU); l.length > 2 && (low.contains(l) || l.contains(low)) }?.let { return it }
        val a = tokens(raw)
        if (a.isEmpty()) return null
        var best: Pair<String, Double>? = null
        for (s in subjects) {
            val b = tokens(s)
            if (b.isEmpty()) continue
            val score = a.count { it in b }.toDouble() / minOf(a.size, b.size)
            if (score >= 0.6 && score > (best?.second ?: 0.0)) best = s to score
        }
        return best?.first
    }

    /** Ищет на странице ссылки на файлы: документы по расширению, ресурсы Sakai, ссылки download, встроенные PDF */
    val findScript = """(function(){
      var exts = /\.(pdf|docx?|rtf|odt|txt|xlsx?|ods|csv|pptx?|ppsx?|odp|djvu?|epub|fb2|zip|rar|7z|jpe?g|png|gif|webp|heic|mp3|m4a|wav|mp4|mov|webm)(\?|#|$)/i;
      var out = [], seen = {};
      function add(u, t){ try { var a = new URL(u, location.href);
        if (!/^https?:$/.test(a.protocol) || seen[a.href]) return; seen[a.href] = 1;
        out.push({ u: a.href, t: String(t || '').replace(/\s+/g, ' ').trim().slice(0, 120) }); } catch (e) {} }
      function sakai(h){ return /\/access\/content\//.test(h) && !/\/$/.test(h); }
      function scan(doc, depth){
        if (!doc || depth > 3) return;
        doc.querySelectorAll('a[href]').forEach(function(a){ var h = a.href || '';
          if (exts.test(a.getAttribute('href') || '') || sakai(h) || a.hasAttribute('download')) add(h, a.textContent || a.getAttribute('title') || ''); });
        doc.querySelectorAll('embed[src], object[data], iframe[src]').forEach(function(e){ var s = e.src || e.data || '';
          if (exts.test(s) || sakai(s)) add(s, e.title || ''); });
        doc.querySelectorAll('iframe, frame').forEach(function(f){ try { scan(f.contentDocument, depth + 1); } catch (e) {} });
      }
      scan(document, 0);
      return JSON.stringify(out.slice(0, 200));
    })()"""

    /** Ответ скрипта (строка JSON в кавычках) → список файлов */
    fun parse(raw: String?): List<PageFile> = runCatching {
        val s = org.json.JSONTokener(raw ?: "").nextValue() as? String ?: return emptyList()
        val a = JSONArray(s)
        (0 until a.length()).map { a.getJSONObject(it).let { o -> PageFile(o.optString("u"), o.optString("t")) } }
    }.getOrDefault(emptyList())

    /** Понятное имя: текст ссылки или имя файла из адреса */
    fun name(f: PageFile): String = f.t.ifBlank {
        runCatching { java.net.URLDecoder.decode(java.net.URI(f.u).path.split('/').last { it.isNotEmpty() }, "UTF-8") }.getOrDefault("Файл")
    }
}
