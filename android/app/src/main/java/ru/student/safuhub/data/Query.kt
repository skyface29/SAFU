package ru.student.safuhub.data

import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.RU
import java.time.Instant

// MARK: - Общие выборки из расписания

object ScheduleQuery {
    /** Все пары в диапазоне дней от сегодня */
    fun slots(data: ScheduleData, from: Int = 0, days: Int): List<LessonSlot> {
        val start = Cal.addDays(Cal.startOfDay(Instant.now()), from)
        return ScheduleCache.range(start, days, data)
    }

    private var subjectsCache: Pair<String, List<String>>? = null
    private val lock = Any()

    fun subjects(data: ScheduleData): List<String> {
        val key = "${data.source}|${data.ruzEvents.size}|${data.ruzEvents.firstOrNull()?.start?.epochSecond ?: 0}|" +
            "${data.ruzEvents.lastOrNull()?.start?.epochSecond ?: 0}|${data.lastSync?.epochSecond ?: 0}|" +
            data.lessons.joinToString("|") { it.subject }
        synchronized(lock) { subjectsCache?.let { if (it.first == key) return it.second } }
        val value = computeSubjects(data)
        synchronized(lock) { subjectsCache = key to value }
        return value
    }

    private fun computeSubjects(data: ScheduleData): List<String> {
        val set = HashSet<String>()
        if (data.usesRuz) {
            for (e in data.ruzEvents) {
                val c = ScheduleCache.clean(e.subject).first
                if (c.isNotEmpty()) set.add(c)
            }
        } else {
            for (l in data.lessons) set.add(l.subject)
        }
        return set.filter { it.isNotEmpty() }.sortedWith(NaturalOrder)
    }
}

/** Значок для предмета по ключевым словам */
object SubjectIcon {
    private val map = listOf(
        "алгебр" to "function", "геометр" to "triangle", "анализ" to "sum", "математ" to "x.squareroot",
        "иностран" to "character.bubble.fill", "англ" to "character.bubble.fill",
        "информацион" to "cpu.fill", "программ" to "chevron.left.forwardslash.chevron.right",
        "истори" to "building.columns.fill", "логик" to "brain.head.profile",
        "государствен" to "flag.fill", "прав" to "scalemass.fill", "финанс" to "banknote.fill",
        "цифров" to "desktopcomputer", "введение в профессию" to "lock.shield.fill",
        "безопасн" to "lock.shield.fill", "физ" to "figure.run", "физическ" to "figure.run",
        "философ" to "books.vertical.fill", "эконом" to "chart.line.uptrend.xyaxis",
        "физика" to "atom", "хими" to "flask.fill", "русск" to "text.book.closed.fill",
        "сети" to "network", "баз" to "cylinder.split.1x2.fill", "криптограф" to "key.fill",
    )

    fun name(subject: String): String {
        val s = subject.lowercase(RU)
        for ((k, icon) in map) if (s.contains(k)) return icon
        return "book.closed.fill"
    }
}

/** Кто ведёт предмет: мой преподаватель (подгруппа) или все из РУЗ */
object SubjectTeachers {
    fun text(subject: String, data: ScheduleData): String {
        val subj = subject.lowercase(RU)
        val all = data.ruzEvents.filter { ScheduleCache.clean(it.subject).first.lowercase(RU) == subj }
            .map { it.teacher }.filter { it.isNotEmpty() }.toSet().sorted()
        val pref = data.teacherPref(subject)
        if (!pref.isNullOrEmpty()) return all.firstOrNull { it.lowercase(RU).contains(pref.lowercase(RU)) } ?: pref
        if (all.isEmpty()) {
            return data.lessons.filter { it.subject == subject }.map { it.teacher }.filter { it.isNotEmpty() }.toSet().sorted().joinToString(", ")
        }
        return all.take(3).joinToString(", ") + (if (all.size > 3) " и др." else "")
    }
}
