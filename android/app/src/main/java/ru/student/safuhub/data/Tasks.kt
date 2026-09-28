package ru.student.safuhub.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import ru.student.safuhub.system.Notify
import ru.student.safuhub.ui.design.Haptics
import java.time.Instant

@Serializable
data class StudyTask(
    val id: String = newId(),
    val title: String = "",
    val subject: String = "",
    val due: AppleDate = Instant.now(),
    val note: String = "",
    val done: Boolean = false,
    val remind: Boolean = true,
) {
    companion object {
        fun blank(): StudyTask {
            val tomorrow = Instant.now().plusSeconds(86_400)
            return StudyTask(due = Cal.setting(tomorrow, 23, 59))
        }
    }
}

data class TaskGroup(val title: String, val items: List<StudyTask>)

object TaskStore {
    private const val key = "tasks.v1"

    var tasks: List<StudyTask> by mutableStateOf(emptyList())
        private set
    private var loaded = false

    fun load() {
        if (loaded) return
        loaded = true
        tasks = Defaults.decode<List<StudyTask>>(key) ?: emptyList()
    }

    fun reload() { loaded = false; load() }

    private fun set(list: List<StudyTask>) {
        tasks = list
        Defaults.encode(key, list)
    }

    val active: List<StudyTask> get() = tasks.filter { !it.done }.sortedBy { it.due }
    val nextOpen: StudyTask? get() = active.firstOrNull()

    fun contains(t: StudyTask) = tasks.any { it.id == t.id }

    fun groups(): List<TaskGroup> {
        val now = Instant.now()
        val weekAhead = now.plusSeconds(7 * 86_400)
        val list = active
        val overdue = list.filter { it.due < now }
        val today = list.filter { it.due >= now && Cal.isToday(it.due) }
        val week = list.filter { it.due >= now && !Cal.isToday(it.due) && it.due < weekAhead }
        val later = list.filter { it.due >= weekAhead }
        val done = tasks.filter { it.done }.sortedByDescending { it.due }
        return listOf(
            TaskGroup("Просрочено", overdue), TaskGroup("Сегодня", today), TaskGroup("На неделе", week),
            TaskGroup("Позже", later), TaskGroup("Выполнено", done)
        ).filter { it.items.isNotEmpty() }
    }

    fun upsert(t: StudyTask) {
        set(if (tasks.any { it.id == t.id }) tasks.map { if (it.id == t.id) t else it } else tasks + t)
        TaskNotifier.schedule(t)
    }

    fun toggle(t: StudyTask) {
        val cur = tasks.firstOrNull { it.id == t.id } ?: return
        val updated = cur.copy(done = !cur.done)
        set(tasks.map { if (it.id == t.id) updated else it })
        if (updated.done) {
            Haptics.success()
            val left = tasks.count { !it.done }
            ru.student.safuhub.feature.fx.Celebrations.taskDone(updated.title, left)
        } else Haptics.tap()
        TaskNotifier.schedule(updated)
    }

    fun delete(t: StudyTask) {
        TaskNotifier.cancel(t)
        set(tasks.filter { it.id != t.id })
    }

    fun clearDone() = set(tasks.filter { !it.done })

    /** Добавить сразу несколько (импорт из Sakai) */
    fun addAll(list: List<StudyTask>) {
        if (list.isEmpty()) return
        set(tasks + list)
        list.forEach { TaskNotifier.schedule(it) }
    }
}

// MARK: - Напоминания о дедлайнах

object TaskNotifier {
    fun cancel(t: StudyTask) = Notify.remove(listOf("${t.id}-0", "${t.id}-1"))

    fun schedule(t: StudyTask) {
        cancel(t)
        if (!t.remind || t.done) return
        val plan = listOf(86_400L to "Завтра дедлайн", 3_600L to "Через час дедлайн")
        for ((index, item) in plan.withIndex()) {
            val fire = t.due.minusSeconds(item.first)
            if (fire <= Instant.now()) continue
            Notify.add("${t.id}-$index", item.second, if (t.subject.isEmpty()) t.title else "${t.subject}: ${t.title}", fire, Notify.CH_TASKS)
        }
    }
}
