package ru.student.safuhub.data

import kotlinx.serialization.Serializable
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decodeOrNull
import ru.student.safuhub.core.encodeBytes
import ru.student.safuhub.core.newId
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale

// Общий код приложения и виджета

object Academic {
    val defaultStart: Instant
        get() {
            val now = Instant.now()
            val y = Cal.year(now)
            val m = Cal.month(now)
            return when {
                m >= 9 -> Cal.date(y, 9, 1)
                m >= 2 -> Cal.date(y, 2, 9)
                else -> Cal.date(y - 1, 9, 1)
            } ?: now
        }

    fun week(start: Instant, now: Instant = Instant.now()): Int? {
        val s = Cal.monday(start)
        val n = Cal.monday(now)
        val days = Cal.daysBetween(s, n)
        val w = days / 7 + 1
        return if (w in 1..30) w else null
    }
}

@Serializable
data class Lesson(
    val id: String = newId(),
    val subject: String = "",
    val kind: String = "Лекция",
    val weekday: Int = 1,      // 1 = пн … 6 = сб
    val pair: Int = 1,
    val parity: Int = 0,       // 0 — каждую неделю, 1 — нечётная, 2 — чётная
    val room: String = "",
    val building: String = "",
    val teacher: String = "",
) {
    companion object {
        val kinds = listOf("Лекция", "Практика", "Лабораторная", "Семинар", "Физкультура", "Другое")
        val dayNames = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб")
        val dayFullNames = listOf("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")
    }
}

@Serializable
data class Building(
    val id: String = newId(),
    val name: String = "",
    val address: String = "",
)

@Serializable
data class ScheduleData(
    val lessons: List<Lesson> = emptyList(),
    val buildings: List<Building> = defaultBuildings,
    val semesterStart: AppleDate = Academic.defaultStart,
    /** Архив: как выглядело расписание в прошлые недели (ключ — понедельник недели) */
    val history: Map<String, List<Lesson>> = emptyMap(),
    // РУЗ
    val source: Int = 0,              // 0 — вручную, 1 — РУЗ
    val ruzGroupNumber: String = "",
    val ruzInstitution: Int = 3,      // ВШИТАС
    val ruzGroupID: String = "",
    val ruzEvents: List<RuzEvent> = emptyList(),
    val lastSync: AppleDate? = null,
    val syncInfo: String = "",
    /** Мой преподаватель по предмету (для подгрупп): «Иностранный язык» → «Астахова» */
    val teacherPrefs: Map<String, String> = defaultTeacherPrefs,
) {
    val usesRuz: Boolean get() = source == 1

    /** Предпочтение для предмета (совпадение по началу названия, без учёта регистра) */
    fun teacherPref(subject: String): String? {
        val s = subject.lowercase(RU)
        for ((k, v) in teacherPrefs) {
            if (v.trim().isEmpty()) continue
            val key = k.lowercase(RU)
            if (s == key || s.startsWith(key) || key.startsWith(s)) return v
        }
        return null
    }

    /** Ведёт ли этот преподаватель данный предмет хоть где-то в расписании (результат кешируется) */
    fun teaches(teacherLower: String, subject: String): Boolean = ScheduleCache.teaches(teacherLower, subject, this)

    fun teachesUncached(teacherLower: String, subject: String): Boolean {
        val subj = subject.lowercase(RU)
        return ruzEvents.any {
            ScheduleCache.clean(it.subject).first.lowercase(RU) == subj && it.teacher.lowercase(RU).contains(teacherLower)
        }
    }

    /** Вливаем свежие пары из РУЗ: загруженный диапазон заменяется, всё остальное остаётся в кеше */
    fun mergeRuz(fresh: List<RuzEvent>): ScheduleData {
        val minD = fresh.minOfOrNull { it.start } ?: return this
        val maxD = fresh.maxOf { it.start }
        val lo = Cal.startOfDay(minD)
        val hi = Cal.addDays(Cal.startOfDay(maxD), 1)
        val seen = HashSet<String>()
        val result = ruzEvents.filter { it.start < lo || it.start >= hi }.toMutableList()
        for (e in fresh) if (seen.add(e.id)) result.add(e)
        val cutoff = Instant.now().minusSeconds(400L * 86_400)
        return copy(ruzEvents = result.filter { it.start > cutoff }.sortedBy { it.start })
    }

    /** Пары, действовавшие в неделю этого дня */
    fun activeLessons(day: Instant): List<Lesson> {
        val key = WeekKey.key(day)
        if (key < WeekKey.key(Instant.now())) history[key]?.let { return it }
        return lessons
    }

    fun isArchived(day: Instant): Boolean {
        val key = WeekKey.key(day)
        return key < WeekKey.key(Instant.now()) && history[key] != null
    }

    companion object {
        val defaultTeacherPrefs: Map<String, String> = mapOf(
            "Иностранный язык" to "Астахова",
            "Цифровая культура" to "Патронова"
        )
        val defaultBuildings = listOf(Building(name = "А-НСД17", address = "наб. Северной Двины, д. 17 (главный корпус)"))
    }
}

object WeekKey {
    fun monday(date: Instant): Instant = Cal.monday(date)
    private val keyFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US)
    fun key(date: Instant): String = keyFormatter.format(monday(date).atZone(Cal.zone))
}

data class LessonSlot(
    val lesson: Lesson,
    val start: Instant,
    val end: Instant,
    val address: String,
    val note: String = "",
) {
    val key: String get() = "${start.epochSecond}-${lesson.subject}-${lesson.room}"

    /** Дистанционная пара: РУЗ пишет это то в адресе, то вместо аудитории */
    val isRemote: Boolean get() = AddressFormat.isRemote(address) || AddressFormat.isRemote(lesson.room)

    val place: String
        get() {
            val parts = mutableListOf<String>()
            if (lesson.room.isNotEmpty()) parts.add("ауд. ${lesson.room}")
            if (lesson.building.isNotEmpty()) parts.add(lesson.building)
            return parts.joinToString(" · ")
        }
}

/** Звонки САФУ (Архангельск), как в РУЗ: пара 1 ч 35 мин, обед после 3-й пары */
object Bells {
    val times: List<IntArray> = listOf(
        intArrayOf(8, 20, 9, 55),
        intArrayOf(10, 10, 11, 45),
        intArrayOf(12, 0, 13, 35),
        intArrayOf(14, 30, 16, 5),
        intArrayOf(16, 15, 17, 50),
        intArrayOf(18, 0, 19, 35),
        intArrayOf(19, 45, 21, 20)
    )

    /** Номер пары по времени начала */
    fun pair(date: Instant): Int {
        val m = Cal.hour(date) * 60 + Cal.minute(date)
        var best = 1
        var bestDiff = Int.MAX_VALUE
        for ((i, t) in times.withIndex()) {
            val diff = kotlin.math.abs(t[0] * 60 + t[1] - m)
            if (diff < bestDiff) { bestDiff = diff; best = i + 1 }
        }
        return best
    }

    fun label(pair: Int): String {
        if (pair < 1 || pair > times.size) return ""
        val t = times[pair - 1]
        return String.format(Locale.US, "%d:%02d–%d:%02d", t[0], t[1], t[2], t[3])
    }

    fun interval(pair: Int, day: Instant): Pair<Instant, Instant>? {
        if (pair < 1 || pair > times.size) return null
        val t = times[pair - 1]
        return Cal.setting(day, t[0], t[1]) to Cal.setting(day, t[2], t[3])
    }
}

object ScheduleEngine {
    /** 1 = пн … 7 = вс */
    fun weekday(date: Instant): Int = Cal.weekdayMon(date)

    fun address(lesson: Lesson, data: ScheduleData): String =
        data.buildings.firstOrNull { it.name == lesson.building }?.address ?: lesson.building

    /** Пары дня (кешируются, пока расписание не изменилось) */
    fun slots(day: Instant, data: ScheduleData): List<LessonSlot> = ScheduleCache.slots(Cal.startOfDay(day), data)

    fun computeSlots(day: Instant, data: ScheduleData): List<LessonSlot> {
        if (data.usesRuz) {
            val dayStart = Cal.startOfDay(day)
            return ScheduleCache.ruzEvents(dayStart, data)
                .mapNotNull { raw ->
                    // старые сохранённые пары тоже чистим от «Ссылка на курс…»
                    val c = ScheduleCache.clean(raw.subject)
                    if (c.first.isEmpty()) return@mapNotNull null
                    raw.copy(subject = c.first, note = if (c.second.isNotEmpty() && raw.note.isEmpty()) c.second else raw.note)
                }
                .sortedBy { it.start }
                .map { e ->
                    // коды корпусов РУЗ («А-НСД17/1405») → аудитория + нормальный адрес
                    val loc = AddressFormat.decode(e.room, e.address, data.buildings)
                    var teacher = e.teacher
                    if (teacher.isEmpty()) data.teacherPref(e.subject)?.let { teacher = it }
                    LessonSlot(
                        lesson = Lesson(subject = e.subject, kind = e.kind, weekday = weekday(e.start), pair = Bells.pair(e.start),
                            room = loc.first, building = loc.second, teacher = teacher),
                        start = e.start, end = e.end, address = loc.second, note = e.note
                    )
                }
                .filterMySubgroup(data)
        }
        val wd = weekday(day)
        if (wd > 6) return emptyList()
        val week = Academic.week(data.semesterStart, day) ?: 1
        val matching = data.activeLessons(day).filter { l ->
            if (l.weekday != wd) false
            else when (l.parity) {
                1 -> week % 2 == 1
                2 -> week % 2 == 0
                else -> true
            }
        }
        return matching.mapNotNull { l ->
            val iv = Bells.interval(l.pair, day) ?: return@mapNotNull null
            LessonSlot(l, iv.first, iv.second, address(l, data))
        }.sortedBy { it.start }
    }

    fun nowAndNext(date: Instant, data: ScheduleData): Pair<LessonSlot?, LessonSlot?> {
        var current: LessonSlot? = null
        var next: LessonSlot? = null
        for (offset in 0 until 8) {
            val day = Cal.addDays(Cal.startOfDay(date), offset)
            for (s in slots(day, data)) {
                if (s.start <= date && date < s.end) current = s
                else if (s.start > date && next == null) next = s
            }
            if (next != null) break
        }
        return current to next
    }

    /** Моменты, когда виджет должен обновиться (начала и концы пар) */
    fun boundaries(after: Instant, data: ScheduleData): List<Instant> {
        val result = HashSet<Instant>()
        for (offset in 0 until 2) {
            val day = Cal.addDays(Cal.startOfDay(after), offset)
            for (s in slots(day, data)) {
                if (s.start > after) result.add(s.start)
                if (s.end > after) result.add(s.end)
            }
        }
        result.add(Cal.addDays(Cal.startOfDay(after), 1))
        return result.sorted()
    }
}

/** Если в одно время по предмету несколько пар (подгруппы) — оставляем пару «моего» преподавателя */
fun List<LessonSlot>.filterMySubgroup(data: ScheduleData): List<LessonSlot> {
    val result = mutableListOf<LessonSlot>()
    val groups = LinkedHashMap<String, MutableList<LessonSlot>>()
    for (s in this) {
        val k = "${s.start.epochSecond}|${s.lesson.subject.lowercase(RU)}"
        groups.getOrPut(k) { mutableListOf() }.add(s)
    }
    for ((_, list) in groups) {
        val first = list.firstOrNull() ?: continue
        val pref = data.teacherPref(first.lesson.subject)?.lowercase(RU)
        if (pref == null) { result += list; continue }
        val mine = list.filter { it.lesson.teacher.lowercase(RU).contains(pref) }
        if (list.size > 1) {
            result += if (mine.isEmpty()) list else mine
            continue
        }
        // Одна пара: практика/лаба другого преподавателя, когда «мой» ведёт этот предмет, — это чужая подгруппа
        val isLecture = first.lesson.kind.lowercase(RU).startsWith("лекц")
        val otherTeacher = first.lesson.teacher.isNotEmpty() && mine.isEmpty()
        if (!isLecture && otherTeacher && data.teaches(pref, first.lesson.subject)) continue
        result.add(first)
    }
    return result
}

object SharedSchedule {
    const val key = "schedule.v1"

    fun load(): ScheduleData = decodeOrNull<ScheduleData>(Defaults.data(key)) ?: ScheduleData()

    fun save(data: ScheduleData) {
        Defaults.set(key, encodeBytes(data))
    }
}

// MARK: - Кеш расписания (ускорение)

object ScheduleCache {
    private val lock = Any()
    private var token: Int? = null
    private var lastRef: ScheduleData? = null
    private val days = HashMap<Instant, List<LessonSlot>>()
    private val ranges = HashMap<String, List<LessonSlot>>()
    private var dayIndex: Map<Instant, List<RuzEvent>>? = null
    private val teachMemo = HashMap<String, Boolean>()
    private val cleanMemo = HashMap<String, Pair<String, String>>()

    private fun fingerprint(d: ScheduleData): Int {
        var h = 17
        fun mix(x: Any?) { h = h * 31 + (x?.hashCode() ?: 0) }
        mix(d.source); mix(d.semesterStart); mix(d.lastSync); mix(d.ruzGroupID); mix(d.teacherPrefs)
        mix(d.buildings); mix(d.lessons); mix(d.history.size)
        val ev = d.ruzEvents
        mix(ev.size)
        if (ev.isNotEmpty()) {
            val step = maxOf(1, ev.size / 64)
            var i = 0
            while (i < ev.size) { mix(ev[i]); i += step }
            mix(ev[ev.size - 1])
        }
        return h
    }

    /** Проверить отпечаток и при необходимости сбросить кеш. Вызывать под замком. */
    private fun sync(d: ScheduleData) {
        if (d === lastRef && token != null) return
        lastRef = d
        val t = fingerprint(d)
        if (t != token) {
            token = t
            days.clear()
            ranges.clear()
            dayIndex = null
            teachMemo.clear()
        }
    }

    /** Пары за несколько дней подряд (из кеша, если уже собирали) */
    fun range(start: Instant, count: Int, data: ScheduleData): List<LessonSlot> = synchronized(lock) {
        sync(data)
        val key = "${start.epochSecond}|$count"
        ranges[key]?.let { return it }
        val out = mutableListOf<LessonSlot>()
        for (offset in 0 until maxOf(0, count)) {
            out += slots(Cal.startOfDay(Cal.addDays(start, offset)), data)
        }
        if (ranges.size > 40) ranges.clear()
        ranges[key] = out
        out
    }

    fun slots(dayStart: Instant, data: ScheduleData): List<LessonSlot> = synchronized(lock) {
        sync(data)
        days[dayStart]?.let { return it }
        val result = ScheduleEngine.computeSlots(dayStart, data)
        if (days.size > 800) days.clear()
        days[dayStart] = result
        result
    }

    fun ruzEvents(dayStart: Instant, data: ScheduleData): List<RuzEvent> = synchronized(lock) {
        if (dayIndex == null) {
            val idx = HashMap<Instant, MutableList<RuzEvent>>()
            for (e in data.ruzEvents) idx.getOrPut(Cal.startOfDay(e.start)) { mutableListOf() }.add(e)
            dayIndex = idx
        }
        dayIndex?.get(dayStart) ?: emptyList()
    }

    fun teaches(teacherLower: String, subject: String, data: ScheduleData): Boolean = synchronized(lock) {
        val k = teacherLower + "|" + subject.lowercase(RU)
        teachMemo[k]?.let { return it }
        val v = data.teachesUncached(teacherLower, subject)
        teachMemo[k] = v
        v
    }

    fun clean(raw: String): Pair<String, String> = synchronized(lock) {
        cleanMemo[raw]?.let { return it }
        val c = EventText.cleanSubject(raw)
        if (cleanMemo.size > 3000) cleanMemo.clear()
        cleanMemo[raw] = c
        c
    }
}
