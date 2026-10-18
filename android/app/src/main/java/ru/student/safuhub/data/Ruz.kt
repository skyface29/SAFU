package ru.student.safuhub.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.g
import ru.student.safuhub.core.rx
import ru.student.safuhub.core.squeezed
import java.nio.charset.Charset
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

// MARK: - Пара из РУЗ

@Serializable
data class RuzEvent(
    val start: AppleDate,
    val end: AppleDate,
    val subject: String = "",
    val kind: String = "",
    val teacher: String = "",
    val room: String = "",
    val address: String = "",
    val note: String = "",
) {
    val id: String get() = "${start.epochSecond}-$subject-$room"
}

data class RuzResult(val events: List<RuzEvent>, val method: String, val notice: String?)

// MARK: - Разбор текста пары: «Лекции Предмет ( Иванов И.И.) Подгруппа … ауд. 42, адрес»

object EventText {
    val kinds = listOf(
        "Лабораторная работа", "Лабораторные работы", "Лабораторные занятия", "Лабораторное занятие",
        "Практическое занятие", "Практические занятия", "Дифференцированный зачет", "Зачет с оценкой",
        "Курсовое проектирование", "Контрольная работа", "Консультация", "Экзамен", "Семинар",
        "Лекции", "Лекция", "Зачет", "Зачёт"
    )

    data class Parsed(
        var kind: String = "Занятие",
        var subject: String = "",
        var teacher: String = "",
        var room: String = "",
        var address: String = "",
        var note: String = "",
    )

    fun shortKind(k: String): String {
        val l = k.lowercase(RU)
        if (l.startsWith("лекц")) return "Лекция"
        if (l.startsWith("практ")) return "Практика"
        if (l.startsWith("лаб")) return "Лабораторная"
        return k
    }

    fun parseLocation(raw: String): Pair<String, String> {
        val t = raw.squeezed
        val r = t.indexOf("ауд.")
        if (r < 0) return "" to t
        val rest = t.substring(r + 4).trim()
        val comma = rest.indexOf(',')
        if (comma >= 0) {
            return rest.substring(0, comma).trim() to rest.substring(comma + 1).trim()
        }
        return rest to ""
    }

    fun parse(raw: String): Parsed {
        val p = Parsed()
        var t = raw.squeezed
        for (k in kinds) {
            if (t.lowercase(RU).startsWith(k.lowercase(RU))) {
                p.kind = shortKind(k)
                t = t.drop(k.length).trim()
                break
            }
        }
        val r = t.indexOf("ауд.")
        if (r >= 0) {
            val loc = parseLocation(t.substring(r))
            p.room = loc.first
            p.address = loc.second
            t = t.substring(0, r).trim()
        }
        // Преподаватель — последние скобки с инициалами: «( Яковленкова А.О.)»
        val parens = t.rx("\\(([^()]*)\\)")
        val m = parens.lastOrNull { it.g(1).rx("[А-ЯЁ]\\.").isNotEmpty() }
        if (m != null) {
            p.teacher = m.g(1).squeezed
            p.subject = t.substring(0, m.range.first).squeezed
            p.note = t.substring(m.range.last + 1).squeezed
        } else {
            p.subject = t
        }
        val cleaned = cleanSubject(p.subject)
        p.subject = cleaned.first
        if (cleaned.second.isNotEmpty()) p.note = (cleaned.second + " " + p.note).squeezed
        return p
    }

    val subjectMarkers = listOf("ссылка на курс", "курс лекций", "http", "подгруппа", "поток ",
        "онлайн-курс", "ссылка", "платформе sakai")

    /** Отрезаем от названия предмета служебные хвосты РУЗ (ссылки на курсы, подгруппы, потоки) */
    fun cleanSubject(raw: String): Pair<String, String> {
        val t = raw.squeezed
        val low = t.lowercase(RU)
        var cut: Int? = null
        for (m in subjectMarkers) {
            val i = low.indexOf(m)
            if (i >= 0 && (cut == null || i < cut)) cut = i
        }
        val c = cut ?: return t to ""
        val subject = t.substring(0, c).trim { it in " ,;:-–—" }
        return subject to t.substring(c).squeezed
    }
}

// MARK: - Клиент РУЗ

object RuzClient {
    const val base = "https://ruz.narfu.ru/"
    val moscow: ZoneId = Cal.moscow

    val institutions: List<Pair<Int, String>> = listOf(
        3 to "ВШИТАС", 15 to "Высшая инженерная школа", 1 to "ВШ естественных наук",
        4 to "ВШ соц.-гум. наук", 28 to "ВШ экономики и права", 12 to "ВШ энергетики",
        13 to "ВШ педагогики и физкультуры", 36 to "ВШ рыболовства"
    )

    fun timetableURL(groupID: String) = "$base?timetable&group=$groupID"

    fun groupID(url: String): String? {
        val q = url.substringAfter('?', "")
        for (part in q.split('&')) {
            val kv = part.split('=', limit = 2)
            if (kv.size == 2 && kv[0] == "group") {
                val v = kv[1]
                return if (v.isNotEmpty() && v.all { it.isDigit() }) v else null
            }
        }
        return null
    }

    fun groupNumber(fromTitle: String): String? = fromTitle.rx("\\b(\\d{6})\\b").firstOrNull()?.g(1)

    /** В виджете ставим меньше: системе нельзя долго ждать */
    @Volatile var requestTimeout: Long = 25
    /** iCal — лишние запросы; в виджете выключаем */
    @Volatile var useICS = true

    const val UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

    private val baseClient by lazy {
        OkHttpClient.Builder().followRedirects(true).retryOnConnectionFailure(true).build()
    }

    suspend fun fetch(url: String, timeout: Long = requestTimeout): String = withContext(Dispatchers.IO) {
        val client = baseClient.newBuilder().callTimeout(timeout, TimeUnit.SECONDS)
            .connectTimeout(timeout, TimeUnit.SECONDS).readTimeout(timeout, TimeUnit.SECONDS).build()
        val req = Request.Builder().url(url).header("User-Agent", UA).build()
        client.newCall(req).execute().use { resp ->
            val bytes = resp.body?.bytes() ?: ByteArray(0)
            decodeText(bytes, resp.header("Content-Type"))
        }
    }

    fun decodeText(bytes: ByteArray, contentType: String? = null): String {
        val cs = contentType?.substringAfter("charset=", "")?.trim()?.trim('"')?.lowercase()
        if (cs != null && (cs.contains("1251") || cs.contains("cp1251"))) return String(bytes, Charset.forName("windows-1251"))
        val decoder = Charsets.UTF_8.newDecoder()
        return try {
            decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString()
        } catch (_: Throwable) {
            try { String(bytes, Charset.forName("windows-1251")) } catch (_: Throwable) { String(bytes) }
        }
    }

    // MARK: поиск группы

    suspend fun findGroupID(number: String, institution: Int, searchAll: Boolean = true): String? {
        val order = mutableListOf(institution)
        if (searchAll) order += institutions.map { it.first }.filter { it != institution }
        for (inst in order) {
            val html = fetch("$base?groups&institution=$inst")
            extractGroupID(html, number)?.let { return it }
        }
        return null
    }

    fun extractGroupID(html: String, number: String): String? {
        val ms = html.rx("group=(\\d+)")
        for ((i, m) in ms.withIndex()) {
            val from = m.range.last + 1
            val to = if (i + 1 < ms.size) ms[i + 1].range.first else minOf(html.length, from + 600)
            if (to <= from) continue
            val segment = stripTags(html.substring(from, to))
            if (segment.contains(number)) return m.g(1)
        }
        return null
    }

    // MARK: загрузка расписания

    suspend fun load(groupID: String): RuzResult {
        val html = fetch(timetableURL(groupID))
        // 1. Страница РУЗ — в ней есть тип пары (лекция/практика/лаба) и преподаватель
        val page = parseHTML(html)

        // 2. iCal — часто содержит больше недель, но без типа и преподавателя.
        var extra: List<RuzEvent> = emptyList()
        if (useICS) {
            for (link in icsLinks(html).take(2)) {
                val text = try { fetch(link) } catch (_: Throwable) { null } ?: continue
                if (!text.contains("BEGIN:VCALENDAR")) continue
                val ics = ICS.parse(text)
                if (ics.isNotEmpty() && !sameGroup(page, ics)) break   // календарь чужой группы — не берём
                if (ics.isNotEmpty()) {
                    val pageDays = page.map { Cal.startOfDay(it.start) }.toSet()
                    val lo = page.minOfOrNull { it.start }
                    val hi = page.maxOfOrNull { it.start }
                    extra = if (lo != null && hi != null) {
                        val loDay = Cal.startOfDay(lo)
                        val hiDay = Cal.startOfDay(hi)
                        ics.filter {
                            val d = Cal.startOfDay(it.start)
                            (d < loDay || d > hiDay) && !pageDays.contains(d)
                        }
                    } else ics
                    break
                }
            }
        }
        val events = page + extra
        var notice: String? = null
        if (events.isEmpty()) {
            if (html.lowercase(RU).contains("modeus")) {
                notice = "В РУЗ пока нет пар для этой группы. Потяни вниз, чтобы проверить ещё раз."
            } else if (html.contains("отсутствуют")) {
                notice = "В РУЗ пока нет пар на эти недели."
            }
        }
        val method = if (page.isEmpty()) (if (extra.isEmpty()) "страница РУЗ" else "iCal") else "страница РУЗ"
        return RuzResult(events, method, notice)
    }

    /** iCal должен совпадать со страницей группы в общие дни: иначе это чужой календарь */
    fun sameGroup(page: List<RuzEvent>, ics: List<RuzEvent>): Boolean {
        if (page.isEmpty()) return true
        val pageDays = page.map { Cal.startOfDay(it.start) }.toSet()
        fun key(e: RuzEvent) = "${e.start.epochSecond}|${e.subject.lowercase(RU).take(12)}"
        val pageKeys = page.map { key(it) }.toSet()
        val shared = ics.filter { pageDays.contains(Cal.startOfDay(it.start)) }
        if (shared.size < 2) return true
        val match = shared.count { pageKeys.contains(key(it)) }
        return match.toDouble() / shared.size >= 0.5
    }

    // MARK: прошлые недели

    private fun format(d: Instant, fmt: String): String =
        DateTimeFormatter.ofPattern(fmt, java.util.Locale.US).format(d.atZone(moscow))

    /** Пытаемся загрузить конкретную неделю */
    suspend fun loadWeek(groupID: String, monday: Instant): List<RuzEvent> {
        val html = try { fetch(timetableURL(groupID)) } catch (_: Throwable) { return emptyList() }
        val candidates = mutableListOf<String>()
        val linkPattern = "href\\s*=\\s*[\"']([^\"']*group=$groupID[^\"']*)[\"']"
        for (m in html.rx(linkPattern, ignoreCase = true)) {
            val href = decodeEntities(m.g(1))
            val dm = href.rx("([A-Za-z_]+)=(\\d{2}\\.\\d{2}\\.\\d{4}|\\d{4}-\\d{2}-\\d{2})").firstOrNull()
            if (dm != null) {
                val name = dm.g(1)
                val value = dm.g(2)
                val fmt = if (value.contains("-")) "yyyy-MM-dd" else "dd.MM.yyyy"
                candidates.add("$base?timetable&group=$groupID&$name=${format(monday, fmt)}")
                break
            }
        }
        for (name in listOf("date", "week", "start")) {
            for (fmt in listOf("dd.MM.yyyy", "yyyy-MM-dd")) {
                candidates.add("$base?timetable&group=$groupID&$name=${format(monday, fmt)}")
            }
        }
        val weekEnd = monday.plusSeconds(7 * 86_400)
        val seen = HashSet<String>()
        for (c in candidates) {
            if (!seen.add(c)) continue
            val page = try { fetch(c) } catch (_: Throwable) { continue }
            val events = parseHTML(page).filter { it.start >= monday && it.start < weekEnd }
            if (events.isNotEmpty()) return events
        }
        return emptyList()
    }

    fun icsLinks(html: String): List<String> {
        val result = mutableListOf<String>()
        val seen = HashSet<String>()
        for (m in html.rx("href\\s*=\\s*[\"']([^\"']+)[\"']", ignoreCase = true)) {
            var href = decodeEntities(m.g(1))
            val l = href.lowercase()
            if (!(l.contains("ical") || l.contains(".ics") || l.contains("calendar") || l.startsWith("webcal"))) continue
            if (l.startsWith("webcal://")) href = "https://" + href.drop("webcal://".length)
            val absolute = when {
                href.lowercase().startsWith("http") -> href
                href.startsWith("//") -> "https:$href"
                href.startsWith("/") -> "https://ruz.narfu.ru$href"
                else -> base + href
            }
            if (seen.add(absolute)) result.add(absolute)
        }
        return result
    }

    // MARK: HTML → текст

    private val entityMap = listOf("&nbsp;" to " ", "&quot;" to "\"", "&amp;" to "&", "&lt;" to "<", "&gt;" to ">", "&#39;" to "'",
        "&laquo;" to "«", "&raquo;" to "»", "&ndash;" to "–", "&mdash;" to "—", "&apos;" to "'")

    fun decodeEntities(s: String): String {
        var r = s
        for ((k, v) in entityMap) r = r.replace(k, v)
        r = Regex("&#(\\d+);").replace(r) { m ->
            val code = m.groupValues[1].toIntOrNull()
            if (code != null && Character.isValidCodePoint(code)) String(Character.toChars(code)) else m.value
        }
        return r
    }

    fun stripTags(s: String): String = decodeEntities(s.replace(Regex("<[^>]+>"), " ")).squeezed

    fun htmlToText(html: String): String {
        var s = html
        s = s.replace(Regex("<script[\\s\\S]*?</script>", RegexOption.IGNORE_CASE), " ")
        s = s.replace(Regex("<style[\\s\\S]*?</style>", RegexOption.IGNORE_CASE), " ")
        s = s.replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
        s = s.replace(Regex("</(div|p|li|tr|h[1-6]|ul|table|section)>", RegexOption.IGNORE_CASE), "\n")
        s = s.replace(Regex("<[^>]+>"), " ")
        s = decodeEntities(s)
        s = s.replace(Regex("[ \\t\\u00A0]+"), " ")
        s = s.replace(Regex("\\s*\\n\\s*"), "\n")
        return s
    }

    private fun makeDate(y: Int, mo: Int, d: Int, h: Int, mi: Int): Instant? = Cal.date(y, mo, d, h, mi, 0, moscow)

    private fun stripTrailingPairNumbers(text: String): String {
        var t = text.trim()
        val re = Regex("\\s+[1-8]$")
        while (true) {
            val m = re.find(t) ?: break
            val before = t.substring(0, m.range.first)
            if (before.endsWith(".") || before.endsWith(",") || before.lowercase(RU).endsWith("корп")) break
            t = before.trim()
        }
        return t
    }

    fun parseHTML(html: String): List<RuzEvent> {
        var src = html
        val dm = Regex("понедельник|вторник|среда|четверг|пятница|суббота", RegexOption.IGNORE_CASE).find(html)
        if (dm != null) src = html.substring(maxOf(0, dm.range.first - 1500))
        val text = htmlToText(src)
        val days = text.rx("(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье),?\\s*(\\d{2})\\.(\\d{2})\\.(\\d{4})", ignoreCase = true)
        val result = mutableListOf<RuzEvent>()
        for ((i, d) in days.withIndex()) {
            val from = d.range.last + 1
            val to = if (i + 1 < days.size) days[i + 1].range.first else text.length
            if (to <= from) continue
            val block = text.substring(from, to)
            val day = d.g(2).toIntOrNull() ?: 1
            val month = d.g(3).toIntOrNull() ?: 1
            val year = d.g(4).toIntOrNull() ?: 2026
            val evs = block.rx("(?:^|\\s)([1-8])\\s+(\\d{1,2}):(\\d{2})\\s*[–—-]\\s*(\\d{1,2}):(\\d{2})")
            for ((j, m) in evs.withIndex()) {
                val tFrom = m.range.last + 1
                val tTo = if (j + 1 < evs.size) evs[j + 1].range.first else block.length
                if (tTo <= tFrom) continue
                val body = stripTrailingPairNumbers(block.substring(tFrom, tTo).replace("\n", " ").squeezed)
                if (body.length <= 2) continue
                val start = makeDate(year, month, day, m.g(2).toIntOrNull() ?: 8, m.g(3).toIntOrNull() ?: 0) ?: continue
                val end = makeDate(year, month, day, m.g(4).toIntOrNull() ?: 9, m.g(5).toIntOrNull() ?: 35) ?: continue
                val p = EventText.parse(body)
                result.add(RuzEvent(start, end, p.subject, p.kind, p.teacher, p.room, p.address, p.note))
            }
        }
        return result
    }
}

// MARK: - iCalendar

object ICS {
    fun parse(raw: String): List<RuzEvent> {
        val text = raw.replace("\r\n", "\n").replace("\n ", "").replace("\n\t", "")
        val events = mutableListOf<RuzEvent>()
        var cur: MutableMap<String, String>? = null
        for (line in text.split("\n")) {
            if (line == "BEGIN:VEVENT") {
                cur = HashMap()
            } else if (line == "END:VEVENT") {
                cur?.let { c -> makeEvent(c)?.let { events.add(it) } }
                cur = null
            } else if (cur != null) {
                val idx = line.indexOf(':')
                if (idx >= 0) {
                    val keyPart = line.substring(0, idx)
                    val value = line.substring(idx + 1)
                    val name = keyPart.split(';').firstOrNull() ?: keyPart
                    cur[name] = value
                    cur["$name#params"] = keyPart
                }
            }
        }
        return events
    }

    private fun unescape(s: String): String = s.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",")
        .replace("\\;", ";").replace("\\\\", "\\").squeezed

    private fun date(value: String?, params: String?): Instant? {
        if (value == null) return null
        return try {
            if (value.endsWith("Z")) {
                LocalDateTime.parse(value, DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")).toInstant(ZoneOffset.UTC)
            } else {
                var tz: ZoneId = RuzClient.moscow
                if (params != null) {
                    val r = params.indexOf("TZID=")
                    if (r >= 0) {
                        val id = params.substring(r + 5).split(';').firstOrNull()?.replace("\"", "") ?: ""
                        runCatching { tz = ZoneId.of(id) }
                    }
                }
                if (value.length == 8) {
                    java.time.LocalDate.parse(value, DateTimeFormatter.ofPattern("yyyyMMdd")).atStartOfDay(tz).toInstant()
                } else {
                    LocalDateTime.parse(value, DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")).atZone(tz).toInstant()
                }
            }
        } catch (_: Throwable) { null }
    }

    private fun makeEvent(c: Map<String, String>): RuzEvent? {
        val start = date(c["DTSTART"], c["DTSTART#params"]) ?: return null
        val end = date(c["DTEND"], c["DTEND#params"]) ?: start.plusSeconds(95 * 60)
        val summary = unescape(c["SUMMARY"] ?: "")
        val location = unescape(c["LOCATION"] ?: "")
        val description = unescape(c["DESCRIPTION"] ?: "")
        val p = EventText.parse(summary)
        if (location.isNotEmpty()) {
            val loc = EventText.parseLocation(location)
            if (p.room.isEmpty()) p.room = loc.first
            if (p.address.isEmpty()) p.address = loc.second
        }
        if (p.teacher.isEmpty()) {
            description.rx("[А-ЯЁ][а-яё-]+\\s+[А-ЯЁ]\\.\\s?[А-ЯЁ]?\\.?").firstOrNull()?.let { p.teacher = it.value }
        }
        if (p.note.isEmpty()) p.note = description
        return RuzEvent(start, end, p.subject, p.kind, p.teacher, p.room, p.address, p.note)
    }
}
