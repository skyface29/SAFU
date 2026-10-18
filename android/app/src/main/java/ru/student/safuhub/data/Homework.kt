package ru.student.safuhub.data

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import ru.student.safuhub.App
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.hm
import ru.student.safuhub.core.newId
import ru.student.safuhub.system.Notify
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindStyle
import java.io.File
import java.time.Instant
import java.util.concurrent.Executors

// Домашка (как Sources/Homework.swift на iPhone).
// ДЗ привязано к паре, на которой его задали, а срок — к паре, к которой сдавать
// («к следующей практике», «через одну пару»). Если РУЗ перенесёт или отменит пару, срок сам подстроится.
// Хранится в настройках под ключом homework.v1 в том же JSON, что на iPhone: копии и синхронизация общие.

enum class HWKind(val raw: String, val title: String, val icon: String, val color: Color, val emoji: String) {
    EXERCISES("exercises", "Задачи", "list.number", Color(0xFF4085FF), "🔢"),
    READING("reading", "Прочитать", "book.fill", Color(0xFF29B873), "📖"),
    NOTES("notes", "Конспект", "doc.text.fill", Color(0xFF1AB3C7), "📝"),
    LAB("lab", "Лаба / отчёт", "flask.fill", Color(0xFFFF8C1A), "🧪"),
    PREP("prep", "Подготовиться", "brain.head.profile", Color(0xFF9E66F2), "🧠"),
    PROJECT("project", "Проект", "rectangle.on.rectangle.angled", Color(0xFFED4D9E), "📽️"),
    OTHER("other", "Другое", "square.and.pencil", Color(0xFF8C94A6), "✏️");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw } ?: OTHER

        /** Угадываем тип по тексту задания */
        fun guess(text: String): HWKind? {
            val t = text.lowercase(RU)
            if (t.isEmpty()) return null
            fun has(w: List<String>) = w.any { t.contains(it) }
            return when {
                has(listOf("лаб", "отчёт", "отчет", "протокол")) -> LAB
                has(listOf("проект", "презентац", "курсов")) -> PROJECT
                has(listOf("контрольн", "тест", "опрос", "коллоквиум", "подготов", "выучить", "выучи", "повтор", "экзамен", "зачёт", "зачет")) -> PREP
                has(listOf("конспект", "реферат", "эссе", "доклад", "сочинен", "написать")) -> NOTES
                has(listOf("прочит", "параграф", "§", "глав", "читать", "статью")) -> READING
                has(listOf("№", "номер", "задач", "упр", "пример", "стр.", "решить", "реши")) -> EXERCISES
                else -> null
            }
        }
    }
}

@Serializable
data class HWStep(val id: String = newId(), val text: String = "", val done: Boolean = false)

@Serializable
data class HWReminders(
    val evening: Boolean = true,
    val morning: Boolean = false,
    val hourBefore: Boolean = true,
    val custom: AppleDate? = null,
) {
    companion object {
        val defaults: HWReminders get() = HWReminders(HWPrefs.remindEvening, HWPrefs.remindMorning, HWPrefs.remindHour, null)
    }
}

@Serializable
data class Homework(
    val id: String = newId(),
    val subject: String = "",
    val text: String = "",
    val kind: String = "exercises",
    /** Пара, на которой задали (начало) и её тип */
    val givenAt: AppleDate = Instant.now(),
    val givenKind: String = "",
    val fromPair: Boolean = false,
    /** Срок и правило, по которому он считается: pair — N-я пара предмета после якоря, date — конкретное время */
    val due: AppleDate = Instant.now(),
    val rule: String = "date",
    val anchor: AppleDate = Instant.now(),
    val skip: Int = 0,
    /** «Следующая практика»: тип пары, к которой сдавать ("" — любая пара предмета) */
    val matchKind: String = "",
    /** Следить за расписанием: пару перенесли — срок переехал вместе с ней */
    val follow: Boolean = true,
    /** Дистанционные пары не считаются парой сдачи */
    val skipRemote: Boolean = true,
    val dueKind: String = "",
    val dueRoom: String = "",
    /** Срок посчитан по прошлым неделям: РУЗ ещё не выложил эту неделю */
    val dueEstimated: Boolean = false,
    /** «Пару перенесли: было …» */
    val shiftNote: String = "",
    val steps: List<HWStep> = emptyList(),
    val important: Boolean = false,
    val note: String = "",
    val photos: List<String> = emptyList(),
    val reminders: HWReminders = HWReminders(),
    val done: Boolean = false,
    val doneAt: AppleDate? = null,
    val created: AppleDate = Instant.now(),
) {
    val hwKind: HWKind get() = HWKind.of(kind)
    val byPair: Boolean get() = rule == "pair"
    val isOverdue: Boolean get() = !done && due < Instant.now()
    val stepsDone: Int get() = steps.count { it.done }
    val stepsProgress: Float get() = if (steps.isEmpty()) 0f else stepsDone.toFloat() / steps.size

    /** Заголовок для списков: текст (аккуратно оформленный, в одну строку), а если его нет — первый подпункт */
    val title: String
        get() {
            val t = text.trim()
            if (t.isNotEmpty()) return HWPretty.line(t)
            return steps.firstOrNull()?.let { HWPretty.clean(it.text) } ?: "Без описания"
        }

    fun isSameSubject(other: String) = HWPlanner.key(subject) == HWPlanner.key(other)

    companion object {
        fun new(subject: String, text: String, due: Instant) = Homework(
            subject = subject, text = text, due = due, reminders = HWReminders.defaults
        )
    }
}

// MARK: - Настройки

object HWPrefs {
    private fun int(k: String, def: Int) = Defaults.intOrNull(k) ?: def
    private fun bool(k: String, def: Boolean) = Defaults.boolOrNull(k) ?: def
    private fun string(k: String, def: String) = Defaults.string(k) ?: def

    val eveningHour get() = int("hw.eveningHour", 20)
    val eveningMinute get() = int("hw.eveningMinute", 0)
    val morningHour get() = int("hw.morningHour", 7)
    val morningMinute get() = int("hw.morningMinute", 30)
    val remindEvening get() = bool("hw.remind.evening", true)
    val remindMorning get() = bool("hw.remind.morning", false)
    val remindHour get() = bool("hw.remind.hour", true)

    /** practice · next · nextSame · skip1 · tomorrow · week. По умолчанию — «к следующей практике» */
    val defaultDue: String
        get() {
            if (!Defaults.bool("hw.defaultDue.practice.v1")) {
                Defaults.set("hw.defaultDue.practice.v1", true)
                if (Defaults.string("hw.defaultDue") == "next") Defaults.set("hw.defaultDue", "practice")
            }
            return string("hw.defaultDue", "practice")
        }
    val follow get() = bool("hw.follow", true)
    val skipRemote get() = bool("hw.skipRemote", true)
    val guessKind get() = bool("hw.guessKind", true)
    val notifyShift get() = bool("hw.notifyShift", true)
    val celebrate get() = bool("hw.celebrate", true)
    val badge get() = bool("hw.badge", true)
    val keepDoneDays get() = int("hw.keepDone", 30)
    val askAfter get() = bool("hw.ask", false)
    val askDelay get() = int("hw.ask.delay", 3)

    fun asks(kind: String): Boolean {
        val k = kind.lowercase(RU)
        return when {
            k.startsWith("лекц") -> bool("hw.ask.lecture", false)
            k.startsWith("практ") -> bool("hw.ask.practice", true)
            k.startsWith("лаб") -> bool("hw.ask.lab", true)
            k.startsWith("семин") -> bool("hw.ask.seminar", true)
            else -> false
        }
    }
}

// MARK: - Пары для сроков

/** Пара, к которой можно сдавать ДЗ; estimated — посчитано по прошлым неделям */
data class HWTarget(val start: Instant, val end: Instant, val kind: String, val room: String, val estimated: Boolean)

object HWPlanner {
    fun key(s: String) = s.lowercase(RU).trim()

    fun sameKind(a: String, b: String) = KindStyle.of(a).label == KindStyle.of(b).label

    /** Последний день, до которого расписание точно известно */
    fun knownUntil(data: ScheduleData): Instant? = if (!data.usesRuz) null else data.ruzEvents.maxOfOrNull { it.end }

    /** Пары предмета строго после anchor: сначала из расписания, дальше — прогноз по прошлым неделям */
    fun targets(subject: String, after: Instant, kind: String?, data: ScheduleData, limit: Int = 8,
                skipRemote: Boolean = HWPrefs.skipRemote): List<HWTarget> {
        val subj = key(subject)
        if (subj.isEmpty() || limit <= 0) return emptyList()
        val kindFilter = kind?.ifEmpty { null }
        val known = knownUntil(data)
        val today = Cal.startOfDay(Instant.now())
        var day = Cal.startOfDay(after)
        var lastDay = Cal.addDays(maxOf(today, day), 60)
        if (known != null) lastDay = minOf(lastDay, Cal.startOfDay(known))
        val out = mutableListOf<HWTarget>()
        var guard = 0
        while (day <= lastDay && guard < 200) {
            for (s in ScheduleEngine.slots(day, data)) {
                if (s.start <= after || key(s.lesson.subject) != subj) continue
                if (skipRemote && s.isRemote) continue
                if (kindFilter != null && !sameKind(kindFilter, s.lesson.kind)) continue
                if (out.lastOrNull()?.start == s.start) continue
                out += HWTarget(s.start, s.end, s.lesson.kind, s.lesson.room, false)
                if (out.size >= limit) return out
            }
            day = Cal.addDays(day, 1)
            guard++
        }
        if (known == null) return out
        val from = listOfNotNull(after, known, out.lastOrNull()?.start).max()
        for (p in predict(subj, kindFilter, from, data, known, skipRemote)) {
            out += p
            if (out.size >= limit) break
        }
        return out
    }

    /** Прогноз пар после конца известного расписания: повторяем недельный (или двухнедельный) ритм */
    private fun predict(subject: String, kind: String?, after: Instant, data: ScheduleData, known: Instant, skipRemote: Boolean): List<HWTarget> {
        val knownDay = Cal.startOfDay(known)
        val past = mutableListOf<LessonSlot>()
        for (back in 0 until 28) {
            for (s in ScheduleEngine.slots(Cal.addDays(knownDay, -back), data)) {
                if (key(s.lesson.subject) == subject && (kind == null || sameKind(kind, s.lesson.kind)) && !(skipRemote && s.isRemote)) past += s
            }
        }
        if (past.isEmpty()) return emptyList()
        val groups = past.groupBy { "${Cal.weekdayMon(it.start)}-${Cal.hour(it.start)}-${Cal.minute(it.start)}" }
        val horizon = after.plusSeconds(70L * 86_400)
        val out = mutableListOf<HWTarget>()
        for ((_, list) in groups) {
            val sorted = list.sortedBy { it.start }
            val last = sorted.last()
            val gaps = (1 until sorted.size).map { Cal.daysBetween(sorted[it - 1].start, sorted[it].start) }
            val period = if ((gaps.minOrNull() ?: 14) <= 8) 7 else 14
            val duration = last.end.epochSecond - last.start.epochSecond
            for (k in 1 until 30) {
                val t = Cal.addDays(last.start, period * k)
                if (t > horizon) break
                if (t > after) out += HWTarget(t, t.plusSeconds(duration), last.lesson.kind, last.lesson.room, true)
            }
        }
        return out.sortedBy { it.start }
    }

    /** К какому типу пары сдавать «автоматически»: к следующей очной практике (или семинару, лабораторной) */
    fun autoKind(subject: String, after: Instant, given: String?, data: ScheduleData, skipRemote: Boolean = true): String {
        if (key(subject).isEmpty()) return "Практика"
        val order = mutableListOf<String>()
        given?.let { KindStyle.of(it).label }?.let { if (it in listOf("Практика", "Семинар", "Лабораторная")) order += it }
        for (k in listOf("Практика", "Семинар", "Лабораторная")) if (k !in order) order += k
        for (k in order) if (targets(subject, after, k, data, 1, skipRemote).isNotEmpty()) return k
        return ""
    }

    fun autoTitle(kind: String) = when (kind) {
        "Практика" -> "К следующей практике"
        "Семинар" -> "К следующему семинару"
        "Лабораторная" -> "К следующей лабораторной"
        else -> "К следующей очной паре"
    }

    fun resolve(h: Homework, data: ScheduleData): HWTarget? {
        if (!h.byPair) return null
        val list = targets(h.subject, h.anchor, h.matchKind.ifEmpty { null }, data, h.skip + 1, h.skipRemote)
        return list.getOrNull(h.skip)
    }

    /** Пара, с которой логичнее всего записывать ДЗ прямо сейчас: идёт или закончилась недавно */
    fun suggestedSlot(data: ScheduleData, now: Instant = Instant.now()): LessonSlot? {
        val today = ScheduleEngine.slots(now, data)
        today.firstOrNull { it.start <= now && it.end > now }?.let { return it }
        return today.filter { it.end <= now && now.epochSecond - it.end.epochSecond < 3 * 3600 }.maxByOrNull { it.end }
    }

    fun slot(subject: String, start: Instant, data: ScheduleData): LessonSlot? =
        ScheduleEngine.slots(start, data).firstOrNull { kotlin.math.abs(it.start.epochSecond - start.epochSecond) < 90 && key(it.lesson.subject) == key(subject) }

    /** Срок по умолчанию для нового ДЗ (с пары или без) */
    data class DefaultDue(val rule: String, val due: Instant, val skip: Int, val matchKind: String, val target: HWTarget?)

    fun defaultDue(subject: String, slot: LessonSlot?, data: ScheduleData): DefaultDue {
        val mode = HWPrefs.defaultDue
        val anchor = slot?.start ?: Instant.now()
        fun endOfDayIn(days: Int) = Cal.setting(Cal.addDays(Instant.now(), days), 23, 59)
        if (mode == "tomorrow" || mode == "week" || subject.isBlank()) {
            return DefaultDue("date", endOfDayIn(if (mode == "week") 7 else 1), 0, "", null)
        }
        val matchKind = when (mode) {
            "practice" -> autoKind(subject, anchor, slot?.lesson?.kind, data)
            "nextSame" -> slot?.lesson?.kind ?: ""
            else -> ""
        }
        val skip = if (mode == "skip1") 1 else 0
        val target = targets(subject, anchor, matchKind.ifEmpty { null }, data, skip + 1).getOrNull(skip)
        if (target != null) return DefaultDue("pair", target.start, skip, matchKind, target)
        return DefaultDue("date", endOfDayIn(7), 0, "", null)
    }
}

// MARK: - Подписи дат

object HWFormat {
    fun isEndOfDay(d: Instant) = Cal.hour(d) == 23 && Cal.minute(d) == 59

    /** «сегодня, 10:10» · «завтра, 8:20» · «пт 3 окт, 12:00» */
    fun dayTime(d: Instant): String {
        val time = if (isEndOfDay(d)) "до конца дня" else hm(d)
        if (Cal.isToday(d)) return "сегодня, $time"
        if (Cal.isTomorrow(d)) return "завтра, $time"
        if (Cal.isYesterday(d)) return "вчера, $time"
        val sameYear = Cal.year(d) == Cal.year(Instant.now())
        return "${Fmt.format(d, if (sameYear) "EE d MMM" else "EE d MMM yyyy")}, $time"
    }

    /** Короткая плашка срока: «через 3 мин», «завтра 8:20», «пн, 18:00», «просрочено» */
    fun chip(d: Instant, done: Boolean = false): String {
        val now = Instant.now()
        if (!done && d < now) {
            val days = Cal.daysBetween(d, now)
            return if (days <= 0) "просрочено" else "просрочено $days дн"
        }
        val mins = (d.epochSecond - now.epochSecond) / 60
        if (mins in 0..59) return "через ${maxOf(mins, 1)} мин"
        if (Cal.isToday(d)) return if (isEndOfDay(d)) "сегодня" else "сегодня ${hm(d)}"
        if (Cal.isTomorrow(d)) return if (isEndOfDay(d)) "завтра" else "завтра ${hm(d)}"
        val days = Cal.daysBetween(now, d)
        if (days < 7) {
            val wd = Fmt.format(d, "EE").lowercase(RU)
            return if (isEndOfDay(d)) wd else "$wd, ${hm(d)}"
        }
        return Fmt.format(d, "d MMM")
    }

    /** Цвет срочности: null — обычный второстепенный */
    fun urgency(d: Instant, done: Boolean = false, brand: Color, secondary: Color): Color {
        if (done) return secondary
        val left = d.epochSecond - Instant.now().epochSecond
        return when {
            left < 0 -> Color(0xFFFF3B30)
            left < 24 * 3600 -> Color(0xFFFF9500)
            left < 3 * 24 * 3600 -> brand
            else -> secondary
        }
    }
}

// MARK: - Красивое оформление того, что записано как попало

/**
 * «решить номер 5,6 стр 45 , упр 3-7» → «Решить № 5, 6 стр. 45, упр. 3–7».
 * «1) … 2) …» одной строкой — нумерованный список, строки без номеров — пункты с точкой.
 * Сам текст задания не меняется: оформление только при показе и при отправке ребятам.
 */
object HWPretty {
    data class Block(val id: Int, val marker: String, val text: String)

    // \b в регулярках Java по умолчанию не знает кириллицу — граница слова своя
    private const val B = "(?<![\\p{L}\\p{N}_])"
    private val url = Regex("(?i)(https?://\\S+|www\\.\\S+)")
    private val space = Regex("\\s+")
    private val num = Regex("(?iu)(?:№|${B}номера?)\\s*(?=\\d)")
    private val page = Regex("(?iu)${B}страниц[аыеу]?\\s*(?=\\d)")
    private val ex = Regex("(?iu)${B}упражнени[еяй]\\s*(?=\\d)")
    private val par = Regex("(?iu)${B}параграф[аы]?\\s*(?=\\d)")
    private val sect = Regex("§\\s*(?=\\d)")
    private val abbr = Regex("(?iu)${B}(стр|упр|зад|рис|табл|гл|пп|п)\\.?\\s*(?=\\d)")
    private val range = Regex("(\\d)\\s*[-–—]\\s*(\\d)")
    private val list = Regex("((?:№|§|стр\\.|упр\\.|зад\\.|п\\.) \\d+(?:[.–]\\d+)?(?:, \\d+(?:[.–]\\d+)?)*),(?=\\d)")
    private val beforePunct = Regex(" +([,.;:!?)])")
    private val afterParen = Regex("\\( +")
    private val afterPunct = Regex("([,;:])(?=[^\\s\\d/\\u0001])")
    private val marks = Regex("(?:(?<=\\s)|^)(\\d{1,2})(?:\\)|\\.(?!\\d))\\s*")
    private val numbered = Regex("^(\\d{1,2})(?:\\)|\\.(?!\\d)|:)\\s*(.+)$")
    private val bullet = Regex("^[-–—•*·]\\s*(.+)$")
    val ref = Regex("(?:№|§|(?:стр|упр|зад|рис|табл|гл|пп|п)\\.)\\s?\\d+(?:[.,–]\\s?\\d+)*")

    fun clean(raw: String): String {
        val urls = mutableListOf<String>()
        var s = url.replace(raw) { urls += it.value; "\u0001${urls.size - 1}\u0001" }
        s = space.replace(s, " ").trim()
        s = num.replace(s, "№ ")
        s = page.replace(s, "стр. ")
        s = ex.replace(s, "упр. ")
        s = par.replace(s, "§ ")
        s = sect.replace(s, "§ ")
        s = abbr.replace(s, "$1. ")
        s = range.replace(s, "$1–$2")
        repeat(12) { val t = list.replace(s, "$1, "); if (t == s) return@repeat; s = t }
        s = beforePunct.replace(s, "$1")
        s = afterParen.replace(s, "(")
        s = afterPunct.replace(s, "$1 ")
        s = s.trim().trimEnd(',', ';', ' ').trim()
        if (s.isNotEmpty() && s[0].isLowerCase()) s = s[0].uppercase(RU) + s.substring(1)
        for ((i, u) in urls.withIndex()) s = s.replace("\u0001$i\u0001", u)
        return s
    }

    private fun splitInline(line: String): List<String> {
        val seq = mutableListOf<Int>()
        var want = 1
        for (m in marks.findAll(line)) if (m.groupValues[1].toIntOrNull() == want) { seq += m.range.first; want++ }
        if (seq.size >= 2) {
            val parts = mutableListOf<String>()
            val pre = line.substring(0, seq[0]).trim()
            if (pre.isNotEmpty()) parts += pre
            for ((i, c) in seq.withIndex()) parts += line.substring(c, seq.getOrNull(i + 1) ?: line.length).trim()
            return parts
        }
        val semi = line.split(';').map { it.trim() }.filter { it.isNotEmpty() }
        return if (semi.size >= 2) semi else listOf(line)
    }

    fun blocks(raw: String): List<Block> {
        val lines = raw.replace("\r", "\n").split("\n").map { it.trim() }.filter { it.isNotEmpty() }.flatMap(::splitInline)
        val anyNumbered = lines.any { numbered.matches(it) }
        val many = lines.size > 1
        val out = mutableListOf<Block>()
        for (line in lines) {
            val id = out.size
            val n = numbered.find(line)
            val b = if (n == null) bullet.find(line) else null
            out += when {
                n != null -> Block(id, "${n.groupValues[1].toInt()}.", clean(n.groupValues[2]))
                b != null -> Block(id, "•", clean(b.groupValues[1]))
                many && !anyNumbered && !line.endsWith(":") -> Block(id, "•", clean(line))
                else -> Block(id, "", clean(line))
            }
        }
        return out.filter { it.text.isNotEmpty() }
    }

    fun line(raw: String): String {
        val b = blocks(raw)
        if (b.size <= 1) return b.firstOrNull()?.text ?: raw
        return b.joinToString(" · ") { it.text }
    }

    fun plain(raw: String) = blocks(raw).map { if (it.marker.isEmpty()) it.text else "${it.marker} ${it.text}" }
}

// MARK: - Отправить ребятам

object HWShare {
    /** «пт 17 октября, 10:10 · практика · ауд. 1405» */
    fun dueLine(h: Homework): String {
        val day = Fmt.format(h.due, "EE d MMMM")
        val parts = mutableListOf(if (HWFormat.isEndOfDay(h.due)) day else "$day, ${hm(h.due)}")
        if (h.dueKind.isNotEmpty()) parts += KindStyle.of(h.dueKind).label.lowercase(RU)
        val r = h.dueRoom.trim()
        if (r.isNotEmpty()) parts += if (AddressFormat.isRemote(r)) "дистант" else "ауд. $r"
        return parts.joinToString(" · ")
    }

    private fun body(h: Homework): List<String> {
        val lines = HWPretty.plain(h.text).toMutableList()
        for (s in h.steps) if (s.text.isNotBlank()) lines += "${if (s.done) "✅" else "▫️"} ${HWPretty.clean(s.text)}"
        val n = h.note.trim()
        if (n.isNotEmpty()) lines += "💬 $n"
        return lines
    }

    fun text(h: Homework): String {
        val lines = mutableListOf("📚 ${h.subject.ifEmpty { "ДЗ" }}${if (h.important) " ❗️" else ""}")
        lines += body(h)
        lines += "📅 Сдать: ${dueLine(h)}"
        if (h.photos.isNotEmpty()) lines += "📎 ${h.photos.size} фото"
        return lines.joinToString("\n")
    }

    fun text(list: List<Homework>, title: String): String {
        val out = mutableListOf("📚 $title")
        for (h in list.sortedBy { it.due }) {
            out += ""
            out += "▫️ ${h.subject.ifEmpty { "Без предмета" }} — ${dueLine(h)}"
            out += body(h)
        }
        return out.joinToString("\n")
    }

    /** Фото задания, которые есть на диске */
    fun photoFiles(h: Homework): List<File> = h.photos.map { HWFiles.file(h.id, it) }.filter { it.exists() }
}

// MARK: - Хранилище

object HomeworkStore {
    private const val key = "homework.v1"
    private val saver = Executors.newSingleThreadExecutor { r -> Thread(r, "homework-save").apply { isDaemon = true } }

    var items: List<Homework> by mutableStateOf(emptyList())
        private set
    /** Отсортированные списки — один раз на изменение, а не на каждую отрисовку */
    var active: List<Homework> by mutableStateOf(emptyList())
        private set
    var finished: List<Homework> by mutableStateOf(emptyList())
        private set
    private var loaded = false

    fun load() {
        if (loaded) return
        loaded = true
        setItems(Defaults.decode<List<Homework>>(key) ?: emptyList(), save = false)
    }

    fun reload() { loaded = false; load() }

    private fun setItems(list: List<Homework>, save: Boolean = true) {
        items = list
        active = list.filter { !it.done }.sortedBy { it.due }
        finished = list.filter { it.done }.sortedByDescending { it.doneAt ?: it.due }
        if (save) {
            // запись в фоне, чтобы галочка ставилась мгновенно
            val snapshot = list
            saver.execute { Defaults.encode(key, snapshot) }
        }
    }

    val overdue: List<Homework> get() = active.filter { it.due < Instant.now() }

    fun item(id: String): Homework? = items.firstOrNull { it.id == id }

    /** Бейдж: просроченные и те, что сдавать в ближайшие сутки */
    val badgeCount: Int get() { val limit = Instant.now().plusSeconds(86_400); return active.count { it.due < limit } }

    fun openItems(subject: String) = active.filter { it.isSameSubject(subject) }
    fun openCount(subject: String) = openItems(subject).size

    /** ДЗ, которое надо сдать на этой паре */
    fun due(slot: LessonSlot): List<Homework> =
        items.filter { it.isSameSubject(slot.lesson.subject) && kotlin.math.abs(it.due.epochSecond - slot.start.epochSecond) < 90 }
            .sortedBy { it.done }

    /** ДЗ, которое задали на этой паре */
    fun given(slot: LessonSlot): List<Homework> =
        items.filter { it.fromPair && it.isSameSubject(slot.lesson.subject) && kotlin.math.abs(it.givenAt.epochSecond - slot.start.epochSecond) < 90 }

    /** Сделано за неделю и сколько всего было к сдаче */
    val weekStats: Pair<Int, Int>
        get() {
            val from = Instant.now().minusSeconds(7 * 86_400)
            val to = Instant.now().plusSeconds(7 * 86_400)
            val w = items.filter { (it.due >= from && it.due <= to) || (it.doneAt ?: Instant.EPOCH) >= from }
            return w.count { it.done } to w.size
        }

    /** Предметы с открытым ДЗ, ближайшие сроки — первыми */
    val subjects: List<String>
        get() {
            val out = mutableListOf<String>()
            for (h in active) if (out.none { HWPlanner.key(it) == HWPlanner.key(h.subject) }) out += h.subject
            return out
        }

    fun upsert(h: Homework) {
        val n = h.copy(text = h.text.trim())
        setItems(if (items.any { it.id == n.id }) items.map { if (it.id == n.id) n else it } else items + n)
        HWNotifier.schedule(n)
    }

    fun toggle(id: String) {
        val cur = item(id) ?: return
        val nowDone = !cur.done
        val n = cur.copy(done = nowDone, doneAt = if (nowDone) Instant.now() else null,
            steps = if (nowDone) cur.steps.map { it.copy(done = true) } else cur.steps)
        setItems(items.map { if (it.id == id) n else it })
        if (nowDone) {
            Haptics.success()
            if (HWPrefs.celebrate) ru.student.safuhub.feature.fx.Celebrations.taskDone(n.title, active.size)
        } else Haptics.tap()
        HWNotifier.schedule(n)
    }

    fun markDone(id: String) { val h = item(id) ?: return; if (!h.done) toggle(id) }

    fun toggleStep(id: String, stepId: String) {
        val cur = item(id) ?: return
        val steps = cur.steps.map { if (it.id == stepId) it.copy(done = !it.done) else it }
        var n = cur.copy(steps = steps)
        Haptics.tap()
        if (!cur.done && steps.isNotEmpty() && steps.all { it.done }) {
            n = n.copy(done = true, doneAt = Instant.now())
            Haptics.success()
            if (HWPrefs.celebrate) ru.student.safuhub.feature.fx.Celebrations.taskDone(n.title, active.size - 1)
            HWNotifier.schedule(n)
        }
        setItems(items.map { if (it.id == id) n else it })
    }

    fun delete(id: String) {
        val h = item(id) ?: return
        HWNotifier.cancel(h)
        HWFiles.removeAll(h.id)
        setItems(items.filter { it.id != id })
    }

    /** Общая версия после синхронизации с компьютером: напоминания — только для изменившихся */
    fun applySync(list: List<Homework>) {
        val old = items.associateBy { it.id }
        val ids = list.map { it.id }.toSet()
        for (h in items) if (h.id !in ids) HWNotifier.cancel(h)
        setItems(list)
        for (h in list) if (old[h.id] != h) HWNotifier.schedule(h)
    }

    fun clearFinished() {
        for (h in finished) HWFiles.removeAll(h.id)
        setItems(items.filter { !it.done })
    }

    /** Перенести на следующую пару (или на день, если срок — дата) */
    fun postpone(id: String, data: ScheduleData) {
        val h = item(id) ?: return
        var n = h
        if (n.byPair) {
            n = n.copy(skip = n.skip + 1)
            val t = HWPlanner.resolve(n, data)
            n = if (t != null) n.copy(due = t.start, dueKind = t.kind, dueRoom = t.room, dueEstimated = t.estimated)
            else n.copy(skip = n.skip - 1, rule = "date", due = h.due.plusSeconds(7 * 86_400))
        } else {
            n = n.copy(due = h.due.plusSeconds(86_400))
        }
        upsert(n.copy(shiftNote = ""))
        Haptics.tap()
    }

    fun duplicate(id: String) {
        val h = item(id) ?: return
        upsert(h.copy(id = newId(), done = false, doneAt = null, created = Instant.now(), photos = emptyList(),
            steps = h.steps.map { HWStep(text = it.text) }))
    }

    fun dismissShift(id: String) = setItems(items.map { if (it.id == id) it.copy(shiftNote = "") else it })

    /** Расписание обновилось: сроки «к паре» переезжают вслед за парами */
    fun reconcile(data: ScheduleData) {
        if (if (data.usesRuz) data.ruzEvents.isEmpty() else data.lessons.isEmpty()) return
        val now = Instant.now()
        val touched = mutableListOf<Homework>()
        val list = items.map { h ->
            if (h.done || !h.byPair || !h.follow) return@map h
            val t = HWPlanner.resolve(h, data) ?: return@map h
            var n = h
            var changed = false
            if (kotlin.math.abs(t.start.epochSecond - h.due.epochSecond) > 60) {
                // уже сданное по сроку не двигаем назад в прошлое
                if (h.due < now && t.start < now) return@map h
                if (!h.dueEstimated && h.due > now) {
                    n = n.copy(shiftNote = "Пару перенесли: было ${HWFormat.dayTime(h.due)}")
                    if (HWPrefs.notifyShift) HWNotifier.notifyShift(n, t.start)
                }
                n = n.copy(due = t.start)
                changed = true
            }
            if (n.dueKind != t.kind || n.dueRoom != t.room || n.dueEstimated != t.estimated) {
                n = n.copy(dueKind = t.kind, dueRoom = t.room, dueEstimated = t.estimated)
                changed = true
            }
            if (changed) touched += n
            n
        }
        if (touched.isEmpty()) return
        setItems(list)
        touched.forEach(HWNotifier::schedule)
    }

    /** Старое сделанное ДЗ убираем, чтобы список не разрастался */
    fun cleanupFinished() {
        val days = HWPrefs.keepDoneDays
        if (days <= 0) return
        val limit = Instant.now().minusSeconds(days * 86_400L)
        val old = items.filter { it.done && (it.doneAt ?: it.due) < limit }
        if (old.isEmpty()) return
        old.forEach { HWFiles.removeAll(it.id) }
        val ids = old.map { it.id }.toSet()
        setItems(items.filter { it.id !in ids })
    }

    /** ДЗ, записанное в прошлой версии как задача («ДЗ» в заметке), переносим сюда — один раз */
    fun migrateFromTasks() {
        val flag = "homework.migrated.v1"
        if (Defaults.bool(flag)) return
        Defaults.set(flag, true)
        TaskStore.load()
        val old = TaskStore.tasks.filter { it.note.startsWith("ДЗ") }
        if (old.isEmpty()) return
        val added = old.map { t ->
            Homework.new(t.subject, t.title, t.due).copy(
                kind = (HWKind.guess(t.title) ?: HWKind.OTHER).raw, done = t.done, doneAt = if (t.done) t.due else null,
                reminders = HWReminders(t.remind, false, t.remind, null), follow = false
            )
        }
        old.forEach { TaskStore.delete(it) }
        setItems(items + added)
        added.forEach(HWNotifier::schedule)
    }

    fun rescheduleAll() = items.forEach(HWNotifier::schedule)
}

// MARK: - Фото к ДЗ

object HWFiles {
    val root: File get() = File(App.ctx.filesDir, "Homework")
    fun dir(id: String) = File(root, id)
    fun file(id: String, name: String) = File(dir(id), name)

    /** Сохраняем уменьшенную копию (до 2000 px), возвращаем имя файла */
    fun save(src: File, id: String): String? = try {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(src.path, opts)
        var sample = 1
        while (maxOf(opts.outWidth, opts.outHeight) / (sample * 2) >= 2000) sample *= 2
        val bmp = BitmapFactory.decodeFile(src.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: error("bad image")
        val rotated = ru.student.safuhub.system.ImageOrientation.upright(bmp, src)
        val side = maxOf(rotated.width, rotated.height)
        val scaled = if (side > 2000) {
            val k = 2000f / side
            Bitmap.createScaledBitmap(rotated, (rotated.width * k).toInt(), (rotated.height * k).toInt(), true)
        } else rotated
        dir(id).mkdirs()
        val name = newId().take(8) + ".jpg"
        File(dir(id), name).outputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 80, it) }
        name
    } catch (_: Throwable) { null }

    fun remove(id: String, name: String) { file(id, name).delete() }
    fun removeAll(id: String) { dir(id).deleteRecursively() }
}

// MARK: - Напоминания

object HWNotifier {
    const val idExtra = "hw.id"
    private val suffixes = listOf("e", "m", "h", "c")

    fun ids(h: Homework) = suffixes.map { "hw-${h.id}-$it" }

    fun cancel(h: Homework) = Notify.remove(ids(h))

    fun schedule(h: Homework) {
        cancel(h)
        if (h.done) return
        val plan = mutableListOf<Triple<String, Instant, String>>()
        if (h.reminders.evening) {
            plan += Triple("e", Cal.setting(Cal.addDays(h.due, -1), HWPrefs.eveningHour, HWPrefs.eveningMinute), "Завтра сдавать ДЗ")
        }
        if (h.reminders.morning) {
            val t = Cal.setting(h.due, HWPrefs.morningHour, HWPrefs.morningMinute)
            if (t < h.due) plan += Triple("m", t, "Сегодня сдавать ДЗ")
        }
        if (h.reminders.hourBefore && !HWFormat.isEndOfDay(h.due)) plan += Triple("h", h.due.minusSeconds(3600), "Через час сдавать ДЗ")
        h.reminders.custom?.let { plan += Triple("c", it, "Напоминание о ДЗ") }
        var body = if (h.subject.isEmpty()) h.title else "${h.subject}: ${h.title}"
        if (h.steps.isNotEmpty()) body += " (${h.stepsDone}/${h.steps.size})"
        for ((suffix, fire, title) in plan) {
            if (fire <= Instant.now()) continue
            Notify.add("hw-${h.id}-$suffix", title, body, fire, Notify.CH_TASKS, mapOf(idExtra to h.id, Notify.ACTION_DONE to h.id))
        }
    }

    fun notifyShift(h: Homework, new: Instant) {
        Notify.after("hw-shift-${h.id}", "Срок ДЗ сдвинулся", "${h.subject}: пару перенесли, теперь сдавать ${HWFormat.dayTime(new)}",
            1.0, Notify.CH_TASKS, mapOf(idExtra to h.id))
    }
}

/** «Что задали?» — уведомление после пары, чтобы не забыть записать */
object HWAsk {
    const val prefix = "hw-ask-"
    const val subjectExtra = "hw.ask.subject"
    const val startExtra = "hw.ask.start"

    fun schedule(data: ScheduleData) {
        Notify.removePrefix(prefix)
        if (!HWPrefs.askAfter) return
        val delay = HWPrefs.askDelay * 60L
        val slots = ScheduleQuery.slots(data, days = 4).filter { it.end > Instant.now() && HWPrefs.asks(it.lesson.kind) }.take(20)
        for (s in slots) {
            val fire = s.end.plusSeconds(delay)
            if (fire <= Instant.now()) continue
            Notify.add("$prefix${s.start.epochSecond}", "Что задали по «${s.lesson.subject}»?",
                "Нажми, чтобы записать ДЗ. Срок сам встанет к следующей практике.", fire, Notify.CH_TASKS,
                mapOf(subjectExtra to s.lesson.subject, startExtra to s.start.epochSecond.toString()))
        }
    }
}

/** Кнопка «Сделано» прямо в уведомлении */
class HWDoneReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(HWNotifier.idExtra) ?: return
        Defaults.init(context)
        HomeworkStore.load()
        HomeworkStore.markDone(id)
        Notify.removeDelivered(HWNotifier.ids(Homework(id = id)))
    }
}

// MARK: - Открыть редактор и карточку откуда угодно

data class HWEditorRoute(
    val homework: Homework? = null,
    val slot: LessonSlot? = null,
    val subject: String? = null,
    /** Сначала показать задание красиво оформленным (по нажатию), а не сразу редактор */
    val preview: Boolean = false,
    val token: String = newId(),
)

object HomeworkRouter {
    var editor by mutableStateOf<HWEditorRoute?>(null)

    fun new(slot: LessonSlot? = null, subject: String? = null) { editor = HWEditorRoute(slot = slot, subject = subject) }
    fun edit(h: Homework) { editor = HWEditorRoute(homework = h) }
    fun show(h: Homework) { editor = HWEditorRoute(homework = h, preview = true) }
}

/** Попросили показать день в «Парах» (например, пару, к которой сдавать ДЗ) — с подсветкой пары */
object ScheduleJump {
    var target by mutableStateOf<Instant?>(null)
    var highlight by mutableStateOf<Instant?>(null)

    fun show(date: Instant) {
        Haptics.tap()
        highlight = date
        target = date
        ru.student.safuhub.data.AppScope.launch {
            kotlinx.coroutines.delay(5000)
            if (highlight == date) highlight = null
        }
    }

    fun isHighlighted(slot: LessonSlot): Boolean {
        val h = highlight ?: return false
        return kotlin.math.abs(slot.start.epochSecond - h.epochSecond) < 90
    }
}
