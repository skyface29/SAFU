package ru.student.safuhub.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import ru.student.safuhub.App
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.g
import ru.student.safuhub.core.rx
import ru.student.safuhub.core.squeezed
import java.io.File
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

// MARK: - Страница преподавателя в РУЗ (как iPhone 19.8)
// У каждого преподавателя в РУЗ своя страница со всеми парами по вузу: ?timetable&lecturer=<номер>.
// Номер берём из ссылок на ФИО на странице группы (запоминаем при каждой загрузке).

data class RuzLecturer(val id: String, val name: String)

object RuzLecturers {
    const val KEY = "ruz.lecturers"

    fun url(id: String) = "${RuzClient.base}?timetable&lecturer=$id"

    /** Ссылки на преподавателей на странице РУЗ: ФИО → номер */
    fun links(html: String): List<RuzLecturer> {
        val out = mutableListOf<RuzLecturer>()
        val seen = HashSet<String>()
        val pattern = "<a\\b[^>]*href\\s*=\\s*[\"']([^\"']*lecturer=(\\d+)[^\"']*)[\"'][^>]*>([\\s\\S]*?)</a>"
        for (m in html.rx(pattern, ignoreCase = true)) {
            val id = m.g(2)
            val name = RuzClient.stripTags(m.g(3))
            if (name.length <= 2 || name.rx("[А-ЯЁ]").isEmpty()) continue
            if (seen.add("$id|$name")) out += RuzLecturer(id, name)
        }
        return out
    }

    private fun map(): Map<String, String> =
        ru.student.safuhub.core.Defaults.dictionary(KEY)?.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }?.toMap() ?: emptyMap()

    /** Запомнить номера преподавателей со страницы (страница группы, недели, школы) */
    fun remember(html: String) {
        val found = links(html)
        if (found.isEmpty()) return
        val m = map().toMutableMap()
        var changed = false
        for (l in found) if (m[l.name] != l.id) { m[l.name] = l.id; changed = true }
        if (changed) ru.student.safuhub.core.Defaults.set(KEY, m)
    }

    /** «Иванов И.И.», «Иванов Иван Иванович» → фамилия и первые буквы имени и отчества */
    private fun nameKey(s: String): Pair<String, List<Char>> {
        val parts = s.lowercase(RU).replace('ё', 'е').split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }
        val surname = parts.firstOrNull() ?: return "" to emptyList()
        return surname to parts.drop(1).map { it.first() }.take(2)
    }

    fun same(a: String, b: String): Boolean {
        val x = nameKey(a)
        val y = nameKey(b)
        if (x.first.isEmpty() || x.first != y.first) return false
        val n = minOf(x.second.size, y.second.size)
        return x.second.take(n) == y.second.take(n)
    }

    /** Номер преподавателя, если он уже встречался на страницах РУЗ */
    fun knownID(name: String): String? {
        val m = map()
        m[name]?.let { return it }
        val c = m.filter { same(it.key, name) }.values.toSet()
        return if (c.size == 1) c.first() else null
    }

    /** Ищем номер преподавателя на странице своей группы (и на других неделях — вдруг его пары там) */
    suspend fun findID(name: String, groupID: String): String? {
        knownID(name)?.let { return it }
        if (groupID.isEmpty()) return null
        val html = try { RuzClient.fetch(RuzClient.timetableURL(groupID)) } catch (_: Throwable) { return null }
        remember(html)
        knownID(name)?.let { return it }
        for (w in weekLinks(html, "group", groupID).take(3)) {
            val page = try { RuzClient.fetch(w.second) } catch (_: Throwable) { continue }
            remember(page)
            knownID(name)?.let { return it }
        }
        return null
    }

    private fun monday(i: Instant): LocalDate =
        i.atZone(RuzClient.moscow).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    /** Ссылки-вкладки недель («28.09.2026», «05.10.2026» …) для группы или преподавателя */
    fun weekLinks(html: String, key: String, id: String): List<Pair<LocalDate, String>> {
        val out = mutableListOf<Pair<LocalDate, String>>()
        val seen = HashSet<String>()
        for (m in html.rx("href\\s*=\\s*[\"']([^\"']*$key=$id\\b[^\"']*)[\"']", ignoreCase = true)) {
            val href = RuzClient.decodeEntities(m.g(1))
            val value = href.rx("=(\\d{2}\\.\\d{2}\\.\\d{4}|\\d{4}-\\d{2}-\\d{2})").firstOrNull()?.g(1) ?: continue
            val date = runCatching {
                LocalDate.parse(value, DateTimeFormatter.ofPattern(if (value.contains("-")) "yyyy-MM-dd" else "dd.MM.yyyy"))
            }.getOrNull() ?: continue
            val abs = when {
                href.lowercase().startsWith("http") -> href
                href.startsWith("/") -> "https://ruz.narfu.ru$href"
                else -> RuzClient.base + href
            }
            if (seen.add(abs)) out += date to abs
        }
        return out.sortedBy { it.first }
    }

    /** У преподавателя вместо ФИО в строке пары — «Группа "151512"» или «Поток "151612, 151613"» */
    fun lecturerEvent(e: RuzEvent): RuzEvent {
        val groups = mutableListOf<String>()
        val marker = Regex("(?<![А-Яа-яЁё])(?:Группы|Группа|Потоки|Поток)\\s*[«\"“„]([^»\"”“]+)[»\"”“]")
        fun take(s: String): String = marker.replace(s) { m ->
            groups += m.groupValues[1].split(',', ';').map { it.squeezed }.filter { it.isNotEmpty() }
            " "
        }.squeezed
        var subject = take(e.subject).trim { it in " ,;:-–—" }
        var note = take(e.note)
        if (groups.isEmpty()) {
            // без кавычек: «Группа 151512»
            val plain = Regex("(?<![А-Яа-яЁё])(?:Группы|Группа|Потоки|Поток)\\s+((?:\\d{4,}[ ,;]*)+)")
            for (src in listOf(subject, note)) for (m in plain.findAll(src)) groups += Regex("\\d{4,}").findAll(m.groupValues[1]).map { it.value }
            if (groups.isNotEmpty()) {
                subject = plain.replace(subject, " ").squeezed
                note = plain.replace(note, " ").squeezed
            }
        }
        val uniq = groups.distinct()
        val teacher = if (uniq.isEmpty()) e.teacher else (if (uniq.size == 1) "Группа " else "Группы ") + uniq.joinToString(", ")
        return e.copy(subject = subject, note = note, teacher = teacher)
    }

    fun parsePage(html: String): List<RuzEvent> = RuzClient.parseHTML(html).map(::lecturerEvent)

    private fun cacheFile(id: String) = File(App.ctx.cacheDir, "lecturer-$id.json")

    /** Сохранённое расписание преподавателя и когда оно загружено */
    fun cached(id: String): Pair<List<RuzEvent>, Instant>? {
        val f = cacheFile(id)
        if (!f.exists()) return null
        val ev = runCatching { AppJson.decodeFromString(ListSerializer(RuzEvent.serializer()), f.readText()) }.getOrNull() ?: return null
        return ev to Instant.ofEpochMilli(f.lastModified())
    }

    /** Все пары преподавателя по всему вузу: текущая неделя и ещё несколько вперёд */
    suspend fun load(id: String, weeks: Int = 4): List<RuzEvent> = withContext(Dispatchers.IO) {
        val html = RuzClient.fetch(url(id))
        remember(html)
        val all = parsePage(html).toMutableList()
        val thisMonday = monday(Instant.now())
        val lastMonday = thisMonday.plusWeeks(weeks.toLong())
        val covered = all.map { monday(it.start) }.toSet()
        val seenWeeks = HashSet<LocalDate>()
        val targets = weekLinks(html, "lecturer", id).filter { (d, _) ->
            val m = d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
            m >= thisMonday && m < lastMonday && m !in covered && seenWeeks.add(m)
        }.take(weeks)
        if (targets.isNotEmpty()) {
            all += coroutineScope {
                targets.map { t -> async { runCatching { parsePage(RuzClient.fetch(t.second)) }.getOrDefault(emptyList()) } }.awaitAll().flatten()
            }
        } else if (all.isNotEmpty()) {
            // вкладок нет — пробуем угадать формат ссылки на следующие недели
            for (k in 1 until maxOf(weeks, 2)) {
                val m = thisMonday.plusWeeks(k.toLong())
                if (m in covered) continue
                val found = guessWeek(id, m) ?: break
                all += found
            }
        }
        val seen = HashSet<String>()
        val result = all.filter { seen.add(it.id) }.sortedBy { it.start }
        if (result.isNotEmpty()) runCatching {
            cacheFile(id).writeText(AppJson.encodeToString(ListSerializer(RuzEvent.serializer()), result))
        }
        result
    }

    private suspend fun guessWeek(id: String, monday: LocalDate): List<RuzEvent>? {
        val start = monday.atStartOfDay(RuzClient.moscow).toInstant()
        val end = start.plusSeconds(7 * 86_400)
        for (name in listOf("date", "week", "start")) for (fmt in listOf("dd.MM.yyyy", "yyyy-MM-dd")) {
            val u = "${RuzClient.base}?timetable&lecturer=$id&$name=${monday.format(DateTimeFormatter.ofPattern(fmt))}"
            val page = try { RuzClient.fetch(u) } catch (_: Throwable) { continue }
            val ev = parsePage(page).filter { it.start >= start && it.start < end }
            if (ev.isNotEmpty()) return ev
        }
        return null
    }
}
