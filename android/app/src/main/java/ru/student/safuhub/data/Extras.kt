package ru.student.safuhub.data

import kotlinx.serialization.Serializable
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.newId
import ru.student.safuhub.system.Notify
import java.time.DayOfWeek
import java.time.Instant
import java.time.temporal.TemporalAdjusters

// MARK: - Напоминания перед парами

object PairNotifier {
    val enabled: Boolean get() = Defaults.boolOrNull("notify.pairs") ?: true
    val minutes: Int get() = Defaults.int("notify.pairMinutes").let { if (it == 0) 10 else it }

    fun reschedule(data: ScheduleData) {
        Notify.removePrefix("pair-")
        if (!enabled) return
        val mins = minutes
        val now = Instant.now()
        var count = 0
        for (offset in 0 until 7) {
            val day = Cal.addDays(Cal.startOfDay(now), offset)
            for (s in ScheduleEngine.slots(day, data)) {
                val fire = s.start.minusSeconds(mins * 60L)
                if (fire <= now || count >= 40) continue
                val body = listOf(s.lesson.kind, if (s.lesson.room.isEmpty()) "" else "ауд. ${s.lesson.room}", s.address)
                    .filter { it.isNotEmpty() }.joinToString(" · ")
                Notify.add("pair-${s.start.epochSecond}-$count", "Через $mins мин: ${s.lesson.subject}", body, fire, Notify.CH_PAIRS)
                count++
            }
        }
    }
}

// MARK: - Изменения расписания

@Serializable
data class ScheduleChange(
    val id: String = newId(),
    val date: AppleDate = Instant.now(),
    val text: String = "",
)

object ChangeDetector {
    private fun key(s: LessonSlot) = "${s.start.epochSecond}|${s.lesson.subject.lowercase(RU)}"

    fun upcoming(data: ScheduleData, days: Int = 14): Map<String, LessonSlot> {
        val result = HashMap<String, LessonSlot>()
        val today = Cal.startOfDay(Instant.now())
        val now = Instant.now()
        for (offset in 0 until days) {
            for (s in ScheduleEngine.slots(Cal.addDays(today, offset), data)) if (s.end > now) result[key(s)] = s
        }
        return result
    }

    fun diff(before: Map<String, LessonSlot>, after: Map<String, LessonSlot>): List<ScheduleChange> {
        fun f(d: Instant) = Fmt.format(d, "EE d MMM, H:mm")
        val out = mutableListOf<ScheduleChange>()
        for ((k, s) in before) if (after[k] == null) {
            out.add(ScheduleChange(date = s.start, text = "Отменена: ${s.lesson.subject}, ${f(s.start)}"))
        }
        for ((k, s) in after) {
            val old = before[k]
            if (old != null) {
                if (old.lesson.room != s.lesson.room || old.address != s.address) {
                    val from = old.lesson.room.ifEmpty { "—" }
                    val to = s.lesson.room.ifEmpty { "—" }
                    out.add(ScheduleChange(date = s.start, text = "Новая аудитория: ${s.lesson.subject}, ${f(s.start)}: $from → $to"))
                }
            } else {
                out.add(ScheduleChange(date = s.start,
                    text = "Добавлена: ${s.lesson.subject}, ${f(s.start)}${if (s.lesson.room.isEmpty()) "" else ", ауд. ${s.lesson.room}"}"))
            }
        }
        return out.sortedBy { it.date }
    }

    fun notify(changes: List<ScheduleChange>) {
        if (changes.isEmpty() || !(Defaults.boolOrNull("notify.changes") ?: true)) return
        val soon = changes.any { Cal.isToday(it.date) || Cal.isTomorrow(it.date) }
        val whenText = if (changes.any { Cal.isToday(it.date) }) "сегодня" else "завтра"
        val title = if (soon) "Замена в расписании на $whenText" else "Расписание изменилось (${changes.size})"
        Notify.show(ru.student.safuhub.App.ctx, "changes-${newId()}", title, changes.take(3).joinToString("\n") { it.text }, Notify.CH_CHANGES)
    }
}

// MARK: - «Следующая пара» (ярлык приложения вместо Siri)

object NextPairAnswer {
    fun text(): String {
        val data = SharedSchedule.load()
        val (c, n) = ScheduleEngine.nowAndNext(Instant.now(), data)
        fun place(s: LessonSlot) = listOf(if (s.lesson.room.isEmpty()) "" else "аудитория ${s.lesson.room}", s.address)
            .filter { it.isNotEmpty() }.joinToString(", ")
        return when {
            c != null -> "Сейчас ${c.lesson.subject} до ${Fmt.format(c.end, "H:mm")}. ${place(c)}."
            n != null -> {
                val day = if (Cal.isToday(n.start)) "" else if (Cal.isTomorrow(n.start)) "завтра " else ""
                "Следующая пара ${day}в ${Fmt.format(n.start, "H:mm")}: ${n.lesson.subject}. ${place(n)}."
            }
            else -> "Ближайших пар нет."
        }
    }
}

// MARK: - Итоги недели (воскресенье, 19:00)

object WeeklyDigest {
    val enabled: Boolean get() = Defaults.boolOrNull("notify.digest") ?: true

    fun schedule(data: ScheduleData) {
        Notify.remove(listOf("digest"))
        if (!enabled) return
        val now = Instant.now()
        var fireZ = now.atZone(Cal.zone).with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY))
            .withHour(19).withMinute(0).withSecond(0).withNano(0)
        if (!fireZ.toInstant().isAfter(now)) fireZ = fireZ.plusWeeks(1)
        val fire = fireZ.toInstant()
        val monday = Cal.addDays(Cal.startOfDay(fire), 1)
        val slots = (0 until 6).flatMap { ScheduleEngine.slots(Cal.addDays(monday, it), data) }
        val labs = slots.count { it.lesson.kind.lowercase(RU).startsWith("лаб") }
        val exams = slots.filter { val k = it.lesson.kind.lowercase(RU); k.contains("экзам") || k.contains("зач") }
        val weekEnd = monday.plusSeconds(7 * 86_400)
        val tasks = Defaults.decode<List<StudyTask>>("tasks.v1") ?: emptyList()
        val dueCount = tasks.count { !it.done && it.due >= monday && it.due < weekEnd }
        val lines = mutableListOf("Пар: ${slots.size}, лабораторных: $labs")
        if (exams.isNotEmpty()) lines.add("Экзамены и зачёты: " + exams.joinToString(", ") { it.lesson.subject })
        lines.add(if (dueCount == 0) "Дедлайнов на неделе нет" else "Дедлайнов на неделе: $dueCount")
        Notify.add("digest", "Следующая неделя 📚", lines.joinToString("\n"), fire, Notify.CH_GENERAL)
    }
}
