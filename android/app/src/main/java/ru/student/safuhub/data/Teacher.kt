package ru.student.safuhub.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import ru.student.safuhub.App
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.g
import ru.student.safuhub.core.rx
import java.io.File
import java.time.Instant

// MARK: - Высшие школы

data class HigherSchool(val id: Int, val short: String, val full: String, val about: String, val icon: String) {
    companion object {
        val all = listOf(
            HigherSchool(3, "ВШИТАС", "Высшая школа информационных технологий и автоматизированных систем", "ИТ, программирование, автоматизация, связь", "cpu"),
            HigherSchool(15, "ВИШ", "Высшая инженерная школа", "Строительство, транспорт, машиностроение", "gearshape.2.fill"),
            HigherSchool(1, "ВШЕНиТ", "Высшая школа естественных наук и технологий", "Биология, химия, география, экология", "leaf.fill"),
            HigherSchool(4, "ВШСГНиМК", "Высшая школа социально-гуманитарных наук и международной коммуникации", "Филология, история, языки, журналистика", "globe.europe.africa.fill"),
            HigherSchool(28, "ВШЭУиП", "Высшая школа экономики, управления и права", "Экономика, менеджмент, юриспруденция", "chart.line.uptrend.xyaxis"),
            HigherSchool(12, "ВШЭНиГ", "Высшая школа энергетики, нефти и газа", "Энергетика, нефтегазовое дело", "bolt.fill"),
            HigherSchool(13, "ВШППиФК", "Высшая школа психологии, педагогики и физической культуры", "Психология, педагогика, спорт", "figure.run"),
            HigherSchool(36, "ВШ рыболовства", "Высшая школа рыболовства", "Рыболовство, водные биоресурсы", "fish.fill"),
        )
        fun by(id: Int) = all.firstOrNull { it.id == id }
    }
}

// MARK: - Группы из РУЗ

@Serializable
data class RuzGroup(val id: String, val number: String, val title: String, val course: Int? = null)

object RuzDirectory {
    private fun cacheKey(inst: Int) = "ruz.groups.$inst"

    @Serializable
    private data class Box(val at: AppleDate, val groups: List<RuzGroup>)

    /** Группы высшей школы. Список кешируется на неделю */
    suspend fun groups(institution: Int, force: Boolean = false): List<RuzGroup> {
        if (!force) {
            Defaults.decode<Box>(cacheKey(institution))?.let { box ->
                if (Instant.now().epochSecond - box.at.epochSecond < 7 * 86_400 && box.groups.isNotEmpty()) return box.groups
            }
        }
        val html = RuzClient.fetch("${RuzClient.base}?groups&institution=$institution")
        val list = parse(html)
        if (list.isNotEmpty()) Defaults.encode(cacheKey(institution), Box(Instant.now(), list))
        return list
    }

    /** Разбор страницы групп: ссылки «group=ID» с номером и направлением, курс — по ближайшему заголовку «N курс» */
    fun parse(html: String): List<RuzGroup> {
        val heads = mutableListOf<Pair<Int, Int>>()
        for (pattern in listOf("(\\d)\\s*курс", "course[_-]?(\\d)")) {
            for (m in html.rx(pattern, ignoreCase = true)) {
                val c = m.g(1).toIntOrNull() ?: continue
                if (c in 1..6) heads.add(m.range.first to c)
            }
        }
        heads.sortBy { it.first }
        val links = html.rx("group=(\\d+)")
        val seen = HashSet<String>()
        val out = mutableListOf<RuzGroup>()
        for ((i, m) in links.withIndex()) {
            val id = m.g(1)
            if (seen.contains(id)) continue
            val from = m.range.last + 1
            val to = if (i + 1 < links.size) links[i + 1].range.first else minOf(html.length, from + 600)
            if (to <= from) continue
            var raw = html.substring(from, minOf(to, from + 600))
            val gt = raw.indexOf('>')
            if (gt >= 0) raw = raw.substring(gt + 1)
            val end = raw.indexOf("</a>", ignoreCase = true)
            if (end >= 0) raw = raw.substring(0, end)
            val text = RuzClient.decodeEntities(RuzClient.stripTags(raw)).replace(Regex("\\s+"), " ").trim()
            val nm = text.rx("\\b(\\d{6})\\b").firstOrNull() ?: text.rx("\\b(\\d{4,7})\\b").firstOrNull() ?: continue
            val number = nm.g(1)
            val title = text.replace(number, "").trim { it in " -–—,.:()" || it.isWhitespace() }
            val course = heads.lastOrNull { it.first < m.range.first }?.second
            seen.add(id)
            out.add(RuzGroup(id, number, title, course))
        }
        return out.sortedWith(compareBy<RuzGroup> { it.course ?: 9 }.thenBy { it.number })
    }

    /** Номера всех школ и филиалов с главной страницы РУЗ (кешируется на неделю) */
    suspend fun allInstitutions(): List<Int> {
        val at = Defaults.date("ruz.institutions.at")
        val cached = (Defaults.obj("ruz.institutions") as? List<*>)?.mapNotNull { (it as? Number)?.toInt() }
        if (at != null && Instant.now().epochSecond - at.epochSecond < 7 * 86_400 && !cached.isNullOrEmpty()) return cached
        val ids = RuzClient.institutions.map { it.first }.toMutableList()
        try {
            val html = RuzClient.fetch(RuzClient.base)
            for (m in html.rx("institution=(\\d+)")) {
                val n = m.g(1).toIntOrNull() ?: continue
                if (!ids.contains(n)) ids.add(n)
            }
            Defaults.set("ruz.institutions", ids)
            Defaults.set("ruz.institutions.at", Instant.now())
        } catch (_: Throwable) {}
        return ids
    }
}

// MARK: - Режим преподавателя

object TeacherMode {
    const val betaNote = "Режим преподавателя в разработке: пары собираются из РУЗ по расписаниям групп и могут быть неполными. Сверяйтесь с официальным расписанием."
    const val kindKey = "user.kind"
    const val queryKey = "teacher.query"

    val isOn: Boolean get() = Defaults.string(kindKey) == "teacher"
    val query: String get() = Defaults.string(queryKey) ?: ""

    data class Who(val surname: String, val initials: List<Char>)

    private fun words(s: String) = s.lowercase(RU).split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }

    /** «Иванов И.И.», «Иванов Иван», «иванов» → фамилия и первые буквы имени и отчества */
    fun parse(q: String): Who {
        val parts = words(q)
        val surname = parts.firstOrNull() ?: return Who("", emptyList())
        return Who(surname, parts.drop(1).mapNotNull { it.firstOrNull() }.take(2))
    }

    /** Ведёт ли пару этот человек. В паре может быть несколько преподавателей через запятую */
    fun matches(teacher: String, who: Who): Boolean {
        if (who.surname.isEmpty()) return false
        val w = words(teacher)
        for ((i, x) in w.withIndex()) {
            if (x != who.surname) continue
            val rest = w.drop(i + 1).take(who.initials.size).mapNotNull { it.firstOrNull() }
            if (rest == who.initials) return true
        }
        return false
    }

    data class ScanResult(val events: List<RuzEvent>, val groups: List<String>)

    suspend fun scan(institution: Int, query: String, force: Boolean = false, progress: (Int, Int) -> Unit): ScanResult {
        val school = SchoolTimetable
        school.ensure(institution, force, progress)
        if (school.events.isEmpty()) school.error?.let { throw Exception(it) }
        val merged = merge(school.events(query))
        return ScanResult(merged, merged.flatMap { groups(it.teacher) }.toSet().sorted())
    }

    /** Одна и та же пара у нескольких групп (поток) — одна запись, вместо фамилии список групп */
    fun merge(list: List<SchoolEvent>): List<RuzEvent> {
        val merged = LinkedHashMap<String, Pair<RuzEvent, MutableSet<String>>>()
        for (x in list) {
            val key = "${x.e.start.epochSecond}|${x.e.subject.lowercase(RU)}|${x.e.room}"
            val m = merged[key]
            if (m != null) m.second.add(x.group) else merged[key] = x.e to mutableSetOf(x.group)
        }
        return merged.values.map { (e, gs) ->
            val l = gs.sorted()
            e.copy(teacher = (if (l.size == 1) "Группа " else "Группы ") + l.joinToString(", "))
        }.sortedBy { it.start }
    }

    fun groups(teacherField: String): List<String> =
        teacherField.replace("Группы ", "").replace("Группа ", "").split(", ").filter { it.isNotEmpty() && it.all { c -> c.isDigit() } }

    /** Группы, у которых преподаватель ведёт пары (из уже загруженного расписания) */
    fun myGroups(data: ScheduleData): List<String> = data.ruzEvents.flatMap { groups(it.teacher) }.toSet().sorted()
}

// MARK: - Расписание всей школы

@Serializable
data class SchoolEvent(val e: RuzEvent, val group: String)

object SchoolTimetable {
    var events: List<SchoolEvent> by mutableStateOf(emptyList())
        private set
    private var teacherCache: List<Pair<String, List<String>>>? = null
    var institution by mutableStateOf(0)
        private set
    var scannedAt by mutableStateOf<Instant?>(null)
        private set
    var progress by mutableStateOf<Double?>(null)
        private set
    var failedGroups by mutableStateOf(0)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    @Serializable
    private data class Blob(val institution: Int, val at: AppleDate, val events: List<SchoolEvent>, val failed: Int)

    private fun file(inst: Int) = File(App.ctx.cacheDir, "school-$inst.json")

    val isScanning: Boolean get() = progress != null

    fun isFresh(inst: Int) = institution == inst && events.isNotEmpty() &&
        (scannedAt?.let { Instant.now().epochSecond - it.epochSecond < 12 * 3600 } ?: false)

    /** Поднять сохранённое с диска */
    fun load(inst: Int) {
        if (institution == inst && events.isNotEmpty()) return
        val f = file(inst)
        if (!f.exists()) return
        try {
            val b = AppJson.decodeFromString(Blob.serializer(), f.readText())
            setEvents(b.events)
            institution = b.institution
            scannedAt = b.at
            failedGroups = b.failed
        } catch (_: Throwable) {}
    }

    private fun setEvents(list: List<SchoolEvent>) {
        events = list
        teacherCache = null
    }

    suspend fun ensure(inst: Int, force: Boolean = false, report: ((Int, Int) -> Unit)? = null) {
        withContext(Dispatchers.IO) { load(inst) }
        if (!force && isFresh(inst)) return
        if (isScanning) {
            while (isScanning) delay(300)
            return
        }
        error = null
        progress = 0.0
        try {
            val schools = RuzDirectory.allInstitutions().toMutableList()
            schools.remove(inst)
            schools.add(0, inst)
            val plan = mutableListOf<RuzGroup>()
            val seenIDs = HashSet<String>()
            var homeCount = 0
            for ((i, school) in schools.withIndex()) {
                val list = try { RuzDirectory.groups(school) } catch (_: Throwable) { continue }
                for (g in list) if (seenIDs.add(g.id)) plan.add(g)
                if (i == 0) homeCount = plan.size
            }
            if (plan.isEmpty()) {
                error = "Нет связи с РУЗ — не удалось получить список групп"
                return
            }
            report?.invoke(0, plan.size)
            val found = mutableListOf<SchoolEvent>()
            var failed = 0
            var start = 0
            var shownHome = false
            // по 6 групп за раз и повтор при сбое — РУЗ не любит лавину запросов
            while (start < plan.size) {
                val chunk = plan.subList(start, minOf(start + 6, plan.size)).toList()
                val parts = coroutineScope { chunk.map { g -> async(Dispatchers.IO) { fetch(g) } }.awaitAll() }
                for (p in parts) if (p != null) found += p else failed++
                start += chunk.size
                progress = start.toDouble() / plan.size
                report?.invoke(start, plan.size)
                if (!shownHome && start >= homeCount && found.isNotEmpty()) {
                    shownHome = true
                    setEvents(found.toList())
                    institution = inst
                }
            }
            if (found.isEmpty()) {
                error = "РУЗ не ответил — попробуй позже"
                return
            }
            setEvents(found)
            institution = inst
            scannedAt = Instant.now()
            failedGroups = failed
            val blob = Blob(inst, Instant.now(), found, failed)
            withContext(Dispatchers.IO) {
                try { file(inst).writeText(AppJson.encodeToString(Blob.serializer(), blob)) } catch (_: Throwable) {}
            }
        } finally {
            progress = null
        }
    }

    /** Расписание одной группы; null — РУЗ не ответил дважды */
    private suspend fun fetch(g: RuzGroup): List<SchoolEvent>? {
        for (attempt in 0 until 2) {
            val html = try { RuzClient.fetch(RuzClient.timetableURL(g.id), 20) } catch (_: Throwable) { null }
            if (!html.isNullOrEmpty()) return RuzClient.parseHTML(html).map { SchoolEvent(it, g.number) }
            if (attempt == 0) delay(700)
        }
        return null
    }

    fun events(query: String): List<SchoolEvent> {
        val who = TeacherMode.parse(query)
        return events.filter { TeacherMode.matches(it.e.teacher, who) }
    }

    /** Все преподаватели школы: ФИО → предметы */
    fun teachers(): List<Pair<String, List<String>>> {
        teacherCache?.let { return it }
        val map = HashMap<String, MutableSet<String>>()
        for (x in events) {
            for (name in x.e.teacher.split(",")) {
                val n = name.trim()
                if (n.length <= 3) continue
                map.getOrPut(n) { mutableSetOf() }.add(x.e.subject)
            }
        }
        val list = map.map { it.key to it.value.sorted() }.sortedBy { it.first }
        teacherCache = list
        return list
    }
}
