package ru.student.safuhub.feature.grades

import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.appleSecondsToInstant
import ru.student.safuhub.core.toAppleSeconds
import ru.student.safuhub.feature.web.HeadlessWeb
import ru.student.safuhub.feature.web.SessionKeeper
import ru.student.safuhub.feature.web.parseJSONAny
import java.net.URI
import java.time.Instant
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

// MARK: - Автоматическая БРС
// Баллы подтягиваются сами, из двух мест, где у студента уже есть вход в приложении:
// 1) Sakai — журнал оценок (gradebook) каждого курса через стандартный API Sakai;
// 2) Личный кабинет lk.narfu.ru — страница открывается невидимо, приложение читает таблицы
//    и ответы сервера и ищет строки с названиями твоих предметов и баллами.
// Названия курсов сопоставляются с предметами из расписания автоматически.

data class FoundGrade(
    /** как называется на сайте */
    val subject: String,
    /** за что (лаба, тест, итог) */
    val item: String,
    val points: Double,
    val outOf: Double,
    /** "Sakai" / "ЛК" */
    val source: String,
)

/** Число как Double(String) в Swift: без суффиксов и шестнадцатеричных записей */
internal fun strictDouble(s: String): Double? {
    if (!Regex("^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)([eE][+-]?\\d+)?$").matches(s)) return null
    return s.toDoubleOrNull()
}

object GradeSync {
    class NotLoggedIn(site: String) : Exception("Нет входа в $site. Открой $site на главной, войди один раз — дальше всё само.")

    val auto: Boolean get() = Defaults.boolOrNull("brs.auto") ?: true
    val lastRun: Instant?
        get() {
            val v = Defaults.double("brs.last")
            return if (v == 0.0) null else appleSecondsToInstant(v)
        }

    /** Отчёт последней синхронизации — чтобы можно было скинуть разработчику */
    var report: String
        get() = Defaults.string("brs.report") ?: ""
        set(v) = Defaults.set("brs.report", v.take(20_000))

    // MARK: запуск

    suspend fun run(subjects: List<String>): String {
        val found = mutableListOf<FoundGrade>()
        val notes = mutableListOf<String>()
        var log = "БРС ${Fmt.format(Instant.now(), "dd.MM.yyyy, HH:mm")}\n"

        try {
            val s = sakai()
            found += s
            notes.add("Sakai: ${s.size}")
            log += "Sakai: вход есть, оценок найдено ${s.size}\n" + sakaiLog
        } catch (e: Throwable) {
            notes.add("Sakai: нет входа")
            log += "Sakai: ${e.message ?: "ошибка"}\n"
        }

        val lk = PersonalCabinet.scrape()
        Defaults.set("brs.lk.ok", lk.loggedIn)
        found += lk.grades
        log += lk.log
        notes.add(if (lk.loggedIn) "ЛК: ${lk.grades.size}" else "ЛК: нет входа")

        val (matched, unmatched) = GradesStore.apply(found, subjects)
        log += "\nСопоставлено: $matched, не нашлось предмета: ${unmatched.size}\n"
        for (u in unmatched.take(40)) log += "  ? $u\n"
        report = log
        Defaults.set("brs.last", Instant.now().toAppleSeconds())

        if (found.isEmpty()) {
            return "Баллов не нашлось (${notes.joinToString(", ")}). Войди через кнопки «Войти» выше."
        }
        return "Обновлено: $matched ${if (matched == 1) "предмет" else "предметов"} · " + notes.joinToString(", ")
    }

    /** Тихо, не чаще раза в 3 часа */
    suspend fun autoRun(subjects: List<String>) {
        if (!auto) return
        lastRun?.let { if (Instant.now().epochSecond - it.epochSecond < 3 * 3600) return }
        run(subjects)
    }

    // MARK: Sakai

    private const val sakaiBase = "https://sakai.narfu.ru"
    private val http by lazy { OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).followRedirects(true).build() }

    private suspend fun sakaiCookie(): String = withContext(Dispatchers.Main) {
        SessionKeeper.restore()
        try { CookieManager.getInstance().getCookie(sakaiBase) ?: "" } catch (_: Throwable) { "" }
    }

    private suspend fun json(path: String, cookie: String): Any? = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url(sakaiBase + path).header("Cookie", cookie).header("Accept", "application/json").build()
            http.newCall(req).execute().use { resp ->
                if (resp.code != 200) return@withContext null
                parseJSONAny(resp.body?.string())
            }
        } catch (_: Throwable) { null }
    }

    /**
     * JSON с Sakai: сначала через невидимый браузер (ровно та сессия, в которой ты входил),
     * если не вышло — прямым запросом с куками
     */
    private suspend fun sakaiJSON(path: String, cookie: String): Any? {
        SakaiWeb.json(path)?.let { return it }
        if (cookie.isEmpty()) return null
        return json(path, cookie)
    }

    /** Логин, под которым открыт Sakai, или null, если входа нет */
    suspend fun sakaiUser(): String? {
        try {
            val cookie = sakaiCookie()
            val s = sakaiJSON("/direct/session/current.json", cookie) as? Map<*, *> ?: return null
            for (k in listOf("userEid", "userDisplayId", "userId")) {
                val v = s[k] as? String
                if (!v.isNullOrEmpty()) return v
            }
            return null
        } finally {
            SakaiWeb.release()
        }
    }

    /** Личный кабинет открылся без запроса пароля при последней проверке */
    val lkLoggedIn: Boolean get() = Defaults.bool("brs.lk.ok")

    /** Подробности последней проверки Sakai — для отчёта «Что нашлось» */
    var sakaiLog = ""
        private set

    suspend fun sakai(): List<FoundGrade> {
        try {
            val cookie = sakaiCookie()
            val sites = sakaiJSON("/direct/site.json?_limit=200", cookie) as? Map<*, *>
            val list = sites?.get("site_collection") as? List<*> ?: throw NotLoggedIn("Sakai")

            val lines = mutableListOf("  курсов в Sakai: ${list.size}")
            val out = mutableListOf<FoundGrade>()
            val parts = coroutineScope {
                list.take(30).mapNotNull { raw ->
                    val site = raw as? Map<*, *> ?: return@mapNotNull null
                    val id = site["id"] as? String ?: return@mapNotNull null
                    if (id.startsWith("~")) return@mapNotNull null
                    val title = site["title"] as? String ?: id
                    async {
                        // 1) API журнала оценок
                        sakaiJSON("/direct/gradebook/site/$id.json", cookie)?.let { gb ->
                            val g = JSONGrades.extract(gb, title, "Sakai")
                            if (g.isNotEmpty()) return@async "  • $title: журнал API — ${g.size}" to g
                        }
                        // 2) страница инструмента «Оценки» в курсе — читаем таблицу
                        val page = SakaiWeb.gradebookRows(id)
                        val g = SakaiTable.extract(page.first, title)
                        "  • $title: ${page.second}, найдено ${g.size}" to g
                    }
                }.awaitAll()
            }
            for ((line, part) in parts) {
                lines.add(line)
                out += part
            }
            sakaiLog = lines.take(40).joinToString("\n") + "\n"
            return out
        } finally {
            SakaiWeb.release()
        }
    }
}

// MARK: - Sakai через невидимый браузер
// Запросы идут изнутри страницы sakai.narfu.ru — с теми же куками и сессией, что при входе.

object SakaiWeb {
    private const val base = "https://sakai.narfu.ru"
    private var web: HeadlessWeb? = null
    private val lock = Mutex()
    private val users = AtomicInteger(0)

    /** Один браузер на все параллельные запросы */
    private suspend fun prepare(): HeadlessWeb? = lock.withLock {
        web?.let { return@withLock it }
        val w = HeadlessWeb()
        if (!w.start()) return@withLock null
        w.load("$base/direct/session/current.json")
        // страница должна остаться на sakai.narfu.ru, иначе запросы не пройдут
        val host = try { URI(w.url() ?: "").host } catch (_: Throwable) { null }
        if (host?.contains("sakai.narfu.ru") != true) {
            w.stop()
            return@withLock null
        }
        web = w
        w
    }

    suspend fun json(path: String): Any? {
        users.incrementAndGet()
        try {
            val w = prepare() ?: return null
            val js = """
            try {
              const ctl = new AbortController();
              setTimeout(() => ctl.abort(), 20000);
              const r = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' }, signal: ctl.signal });
              if (!r.ok) return null;
              return await r.text();
            } catch (e) { return null; }
            """
            return parseJSONAny(w.callAsync(js, mapOf("url" to base + path)))
        } finally {
            users.decrementAndGet()
        }
    }

    /** Таблица оценок со страницы инструмента «Оценки» (Gradebook) в курсе */
    suspend fun gradebookRows(siteID: String): Pair<List<List<String>>, String> {
        users.incrementAndGet()
        try {
            val w = prepare() ?: return emptyList<List<String>>() to "нет браузера"
            val js = """
            try {
              const ctl = new AbortController();
              setTimeout(() => ctl.abort(), 25000);
              const pr = await fetch(base + '/direct/site/' + site + '/pages.json', { credentials: 'include', signal: ctl.signal });
              if (!pr.ok) return JSON.stringify({ note: 'страницы курса: HTTP ' + pr.status, rows: [] });
              const pages = await pr.json();
              let tool = null;
              for (const p of pages) for (const t of (p.tools || [])) {
                const tid = (t.toolId || '').toLowerCase();
                if (tid.indexOf('gradebook') >= 0 || tid.indexOf('grade') >= 0) { tool = t; break; }
              }
              if (!tool) return JSON.stringify({ note: 'нет инструмента оценок', rows: [] });
              const r = await fetch(base + '/portal/tool/' + tool.id, { credentials: 'include', signal: ctl.signal });
              if (!r.ok) return JSON.stringify({ note: 'оценки: HTTP ' + r.status, rows: [] });
              const html = await r.text();
              const doc = new DOMParser().parseFromString(html, 'text/html');
              const rows = [];
              doc.querySelectorAll('tr').forEach(tr => {
                const cells = [];
                tr.querySelectorAll('th,td').forEach(c => cells.push((c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim()));
                if (cells.length > 1) rows.push(cells);
              });
              return JSON.stringify({ note: 'таблица ' + (tool.toolId || '') + ', строк ' + rows.length, rows: rows.slice(0, 200) });
            } catch (e) { return JSON.stringify({ note: 'ошибка ' + e, rows: [] }); }
            """
            val obj = parseJSONAny(w.callAsync(js, mapOf("base" to base, "site" to siteID), 40_000)) as? Map<*, *>
                ?: return emptyList<List<String>>() to "не прочиталось"
            val rows = (obj["rows"] as? List<*>)?.mapNotNull { r -> (r as? List<*>)?.map { it?.toString() ?: "" } } ?: emptyList()
            return rows to (obj["note"] as? String ?: "")
        } finally {
            users.decrementAndGet()
        }
    }

    /** Отпускаем браузер, когда он больше никому не нужен */
    suspend fun release() = withContext(kotlinx.coroutines.NonCancellable) {
        lock.withLock {
            if (users.get() != 0) return@withLock
            web?.stop()
            web = null
        }
    }
}

// MARK: - Разбор JSON любого вида

object JSONGrades {
    private val nameKeys = listOf("itemName", "name", "title", "discipline", "disciplineName", "subject", "subjectName",
        "courseName", "course", "caption", "label")
    private val scoreKeys = listOf("grade", "score", "actualScore", "pointsEarned", "earned", "mark", "points_earned",
        "totalScore", "sumScore", "rating", "ball", "balls")
    private val maxKeys = listOf("pointsPossible", "maxPoints", "maxScore", "max", "possible", "outOf", "points")

    fun number(v: Any?): Double? = when (v) {
        is Number -> v.toDouble()
        is String -> strictDouble(v.replace(",", ".").trim())
        else -> null
    }

    /** Ищет объекты вида {название, баллы[, максимум]} на любой глубине */
    fun extract(obj: Any?, subject: String?, source: String, depth: Int = 0): List<FoundGrade> {
        if (depth >= 8) return emptyList()
        val out = mutableListOf<FoundGrade>()
        when (obj) {
            is Map<*, *> -> {
                val name = nameKeys.asSequence().mapNotNull { obj[it] as? String }.firstOrNull { it.isNotEmpty() }
                var scoreKey: String? = null
                var score: Double? = null
                for (k in scoreKeys) {
                    val v = number(obj[k])
                    if (v != null) { score = v; scoreKey = k; break }
                }
                if (name != null && score != null && score in 0.0..200.0) {
                    val mx = maxKeys.asSequence().filter { it != scoreKey }.mapNotNull { number(obj[it]) }.firstOrNull() ?: 0.0
                    out.add(FoundGrade(subject ?: name, if (subject == null) "Итог" else name, score, mx, source))
                }
                // внутри курса название курса знаем — передаём дальше
                val inner = subject ?: name?.takeIf { obj.values.any { it is List<*> } }
                for (v in obj.values) if (v is List<*> || v is Map<*, *>) out += extract(v, inner, source, depth + 1)
            }
            is List<*> -> for (v in obj.take(500)) out += extract(v, subject, source, depth + 1)
        }
        return out
    }
}

// MARK: - Личный кабинет (невидимый браузер)

object PersonalCabinet {
    data class Result(val grades: MutableList<FoundGrade> = mutableListOf(), var loggedIn: Boolean = false, var log: String = "")

    private const val hook = """
    (function(){
      if (window.__safuHooked) return; window.__safuHooked = true;
      window.__safuJSON = [];
      function keep(t){ try{ if(t && t.length < 400000 && (t[0]=='{'||t[0]=='[')) window.__safuJSON.push(t); }catch(e){} }
      var of = window.fetch;
      if (of) window.fetch = function(){ return of.apply(this, arguments).then(function(r){
        try{ r.clone().text().then(keep); }catch(e){} return r; }); };
      var oo = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(){ this.addEventListener('load', function(){
        try{ keep(this.responseText); }catch(e){} }); return oo.apply(this, arguments); };
    })();
    """

    private const val collect = """
    (function(){
      var rows = [];
      document.querySelectorAll('tr').forEach(function(tr){
        var cells = []; tr.querySelectorAll('th,td').forEach(function(c){ cells.push((c.innerText||'').trim()); });
        if (cells.length > 1) rows.push(cells);
      });
      var links = [];
      document.querySelectorAll('a').forEach(function(a){
        var t = (a.innerText||'').toLowerCase();
        if (/успеваем|зач[её]т|оценк|рейтинг|брс|балл|ведомост/.test(t) && a.href) links.push(a.href);
      });
      var body = (document.body && document.body.innerText) || '';
      return JSON.stringify({ url: location.href, rows: rows.slice(0, 600),
                              json: (window.__safuJSON||[]).slice(-40), links: links.slice(0, 10),
                              pw: !!document.querySelector('input[type=password]'),
                              title: document.title || '', len: body.length,
                              text: body.replace(/\s+/g, ' ').slice(0, 400) });
    })();
    """

    suspend fun scrape(): Result {
        val result = Result()
        val web = HeadlessWeb(hook)
        if (!web.start()) {
            result.log += "ЛК: браузер не запустился\n"
            return result
        }
        try {
            val pages = ArrayDeque(listOf("https://lk.narfu.ru"))
            val visited = HashSet<String>()
            var guessed = false
            while (pages.isNotEmpty() && visited.size < 6) {
                val url = pages.removeFirst()
                if (!visited.add(url)) continue
                web.load(url)
                // ЛК — одностраничное приложение: ждём, пока появятся данные (до ~12 с)
                var loaded: Map<*, *>? = null
                for (attempt in 0 until 6) {
                    delay(2000)
                    val p = parseJSONAny(web.eval(collect)) as? Map<*, *> ?: continue
                    loaded = p
                    val rows = (p["rows"] as? List<*>)?.size ?: 0
                    val jsons = (p["json"] as? List<*>)?.size ?: 0
                    val len = (p["len"] as? Number)?.toInt() ?: 0
                    if (rows > 0 || jsons > 0 || (len > 1500 && attempt >= 1)) break
                }
                val page = loaded
                if (page == null) {
                    result.log += "ЛК: страница $url не прочиталась\n"
                    continue
                }
                val here = page["url"] as? String ?: ""
                val pw = page["pw"] as? Boolean ?: false
                val low = here.lowercase(RU)
                if (pw || low.contains("login") || low.contains("auth") || low.contains("sso")) {
                    result.log += "ЛК: просит вход ($here)\n"
                    continue
                }
                result.loggedIn = true
                val rows = (page["rows"] as? List<*>)?.mapNotNull { r -> (r as? List<*>)?.map { it?.toString() ?: "" } } ?: emptyList()
                val jsons = (page["json"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
                val got = TableGrades.extract(rows).toMutableList()
                for (j in jsons) parseJSONAny(j)?.let { got += JSONGrades.extract(it, null, "ЛК") }
                result.grades += got
                result.log += "ЛК $here: строк ${rows.size}, ответов ${jsons.size}, найдено ${got.size}\n"
                for (r in rows.take(15)) result.log += "  | " + r.joinToString(" | ").take(160) + "\n"
                if (rows.isEmpty()) {
                    val title = page["title"] as? String ?: ""
                    val text = page["text"] as? String ?: ""
                    result.log += "  заголовок: $title\n  текст: $text\n"
                    for (j in jsons.take(3)) result.log += "  json: " + j.take(200) + "\n"
                }
                // идём по ссылкам «Успеваемость», «Зачётная книжка»…
                val links = (page["links"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
                for (l in links) if (l !in visited) pages.addLast(l)
                // ссылок не нашлось — пробуем типовые разделы
                if (links.isEmpty() && got.isEmpty() && !guessed) {
                    guessed = true
                    for (path in listOf("/record-book", "/recordbook", "/grades", "/performance", "/progress")) pages.addLast("https://lk.narfu.ru$path")
                }
            }
        } finally {
            web.stop()
        }
        return result
    }
}

// MARK: - Таблица оценок Sakai: «Лабораторная 1 | 8/10 | …»

object SakaiTable {
    private val fraction = Regex("^(\\d+(?:\\.\\d+)?)/(\\d+(?:\\.\\d+)?)$")

    fun extract(rows: List<List<String>>, subject: String): List<FoundGrade> {
        val out = mutableListOf<FoundGrade>()
        for (r in rows) {
            val name = r.firstOrNull { c -> c.any { it.isLetter() } && c.length >= 2 } ?: continue
            val low = name.lowercase(RU)
            if (listOf("название", "задание", "title", "item", "оценка", "grade").any { low == it }) continue
            var points: Double? = null
            var outOf = 0.0
            for (c in r) {
                if (c == name) continue
                val t = c.replace(",", ".").replace(" ", "")
                val m = fraction.matchEntire(t)
                if (m != null) {
                    points = m.groupValues[1].toDoubleOrNull()
                    outOf = m.groupValues[2].toDoubleOrNull() ?: 0.0
                    break
                }
                val v = strictDouble(t)
                if (v != null && v in 0.0..200.0) {
                    points = v
                    break
                }
            }
            val p = points ?: continue
            out.add(FoundGrade(subject, name, p, outOf, "Sakai"))
        }
        return out
    }
}

// MARK: - Разбор таблиц

object TableGrades {
    /** Строка таблицы: [название предмета, …, число] → итоговый балл. */
    fun extract(rows: List<List<String>>): List<FoundGrade> {
        val out = mutableListOf<FoundGrade>()
        for (r in rows) {
            // название — самая длинная ячейка с буквами
            val name = r.filter { c -> c.any { it.isLetter() } && c.length >= 4 }.maxByOrNull { it.length } ?: continue
            val nums = r.mapNotNull { cell ->
                val v = strictDouble(cell.replace(",", ".").trim()) ?: return@mapNotNull null
                if (v in 0.0..100.0) v else null
            }
            val last = nums.lastOrNull() ?: continue
            out.add(FoundGrade(name, "Итог", last, 100.0, "ЛК"))
        }
        return out
    }
}

// MARK: - Сопоставление названий

object SubjectMatch {
    private fun tokens(s: String): Set<String> =
        s.lowercase(RU).split(Regex("[^\\p{L}]+")).filter { it.length >= 3 }.map { it.take(6) }.toSet()
        // «математический» и «математика» → «матема»

    /** Лучший предмет из расписания для названия с сайта (или null) */
    fun best(raw: String, subjects: List<String>): String? {
        val low = raw.lowercase(RU)
        subjects.firstOrNull { low.contains(it.lowercase(RU)) || it.lowercase(RU).contains(low) }?.let { return it }
        val a = tokens(raw)
        if (a.isEmpty()) return null
        var best: Pair<String, Double>? = null
        for (s in subjects) {
            val b = tokens(s)
            if (b.isEmpty()) continue
            val score = a.intersect(b).size.toDouble() / minOf(a.size, b.size)
            if (score >= 0.6 && score > (best?.second ?: 0.0)) best = s to score
        }
        return best?.first
    }
}

/** Кладёт найденное: автоматические записи предмета заменяются свежими, свои — остаются. */
fun GradesStore.apply(found: List<FoundGrade>, subjects: List<String>): Pair<Int, List<String>> {
    val bySubject = LinkedHashMap<String, MutableList<FoundGrade>>()
    val unmatched = HashSet<String>()
    for (g in found) {
        val s = SubjectMatch.best(g.subject, subjects)
        if (s != null) bySubject.getOrPut(s) { mutableListOf() }.add(g)
        else unmatched.add("${g.source}: ${g.subject} — ${BRSFormat.num(g.points)}")
    }
    val list = items.toMutableList()
    for ((subject, grades) in bySubject) {
        // из одного источника — без повторов
        val seen = HashSet<String>()
        val unique = grades.filter { seen.add("${it.source}|${it.item}|${it.points}") }
        val entries = unique.map { GradeEntry(title = it.item, points = it.points, outOf = it.outOf, date = Instant.now(), source = it.source) }
        val i = list.indexOfFirst { it.subject == subject }
        if (i >= 0) list[i] = list[i].copy(entries = list[i].entries.filter { it.source.isEmpty() } + entries)
        else list.add(SubjectGrades(subject = subject, entries = entries))
    }
    items = list
    return bySubject.size to unmatched.sorted()
}
