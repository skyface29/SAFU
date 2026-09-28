package ru.student.safuhub.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import java.time.Instant

/** Общая область корутин приложения */
object AppScope : CoroutineScope by CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

object ScheduleStore {
    private var _data = mutableStateOf(ScheduleData())
    var data: ScheduleData
        get() = _data.value
        set(v) {
            _data.value = snapshotCurrentWeek(v)
            schedulePersist()
            scheduleSideEffects()
        }

    var syncing by mutableStateOf(false)
        private set
    var syncMessage by mutableStateOf<String?>(null)
    /** Сбор расписания преподавателя по группам школы: 0…1, null — не идёт */
    var teacherProgress by mutableStateOf<Double?>(null)
        private set
    /** Журнал изменений расписания из РУЗ */
    private var _changes = mutableStateOf<List<ScheduleChange>>(emptyList())
    var changes: List<ScheduleChange>
        get() = _changes.value
        set(v) { _changes.value = v; Defaults.encode("schedule.changes", v) }
    private var _unseen = mutableIntStateOf(0)
    var unseenChanges: Int
        get() = _unseen.intValue
        set(v) { _unseen.intValue = v; Defaults.set("schedule.unseen", v) }
    var loadingWeek by mutableStateOf(false)
        private set
    private val triedWeeks = HashSet<String>()
    private var persistJob: Job? = null
    private var sideJob: Job? = null
    private var loaded = false

    fun load() {
        if (loaded) return
        loaded = true
        _data.value = SharedSchedule.load()
        Defaults.decode<List<ScheduleChange>>("schedule.changes")?.let { _changes.value = it }
        _unseen.intValue = Defaults.int("schedule.unseen")
        // один раз очищаем журнал: там были ложные «изменения» из-за смены источника (iCal → страница)
        if (!Defaults.bool("changes.reset.v57")) {
            changes = emptyList()
            unseenChanges = 0
            Defaults.set("changes.reset.v57", true)
            Defaults.remove("schedule.changes")
            Defaults.set("schedule.unseen", 0)
        }
        // 7.6.1: поиск свободных аудиторий мог подмешать чужую группу — чистим память РУЗ
        if (!Defaults.bool("repair.ruz.v761")) {
            Defaults.set("repair.ruz.v761", true)
            var d = data
            if (d.usesRuz) {
                d = d.copy(ruzEvents = emptyList(), lastSync = null, syncInfo = "",
                    ruzGroupID = if (d.ruzGroupNumber.trim().isNotEmpty()) "" else d.ruzGroupID)
                _data.value = d
            }
            changes = emptyList()
            unseenChanges = 0
            Defaults.remove("schedule.changes")
            Defaults.set("schedule.unseen", 0)
            Defaults.remove("ruz.lastMethod")
        }
        _data.value = snapshotCurrentWeek(_data.value)
        SharedSchedule.save(_data.value)
    }

    /** Сохранение на диск и обновление виджета — пачкой и в фоне */
    private fun schedulePersist() {
        persistJob?.cancel()
        val snapshot = data
        persistJob = AppScope.launch {
            delay(400)
            withContext(Dispatchers.IO) { SharedSchedule.save(snapshot) }
            ru.student.safuhub.widget.Widgets.updateAll()
        }
    }

    /** Напоминания о парах и уведомление пары — пересчитываем после изменений (с задержкой) */
    fun scheduleSideEffects() {
        sideJob?.cancel()
        sideJob = AppScope.launch {
            delay(1000)
            refreshSideEffects()
        }
    }

    fun refreshSideEffects() {
        val d = data
        AppScope.launch(Dispatchers.Default) {
            try { PairNotifier.reschedule(d) } catch (_: Throwable) {}
            try { ru.student.safuhub.system.LiveLesson.update(d) } catch (_: Throwable) {}
            try { SubjectFolders.ensureAll(ScheduleQuery.subjects(d)) } catch (_: Throwable) {}
            try { ru.student.safuhub.feature.commute.CommutePlanner.scheduleNotifications(d) } catch (_: Throwable) {}
            try { WeeklyDigest.schedule(d) } catch (_: Throwable) {}
            try { ru.student.safuhub.feature.features.MorningBrief.schedule(d) } catch (_: Throwable) {}
            try { ru.student.safuhub.system.BusLive.auto(d) } catch (_: Throwable) {}
            try { ru.student.safuhub.feature.wake.WakePlanner.schedule(d) } catch (_: Throwable) {}
        }
    }

    // MARK: память прошлых недель (РУЗ)

    fun hasEvents(date: Instant): Boolean {
        val monday = WeekKey.monday(date)
        val end = monday.plusSeconds(7 * 86_400)
        return data.ruzEvents.any { it.start >= monday && it.start < end }
    }

    /** С какой даты приложение помнит расписание */
    val memorySince: Instant? get() = data.ruzEvents.firstOrNull()?.start

    val rememberedWeeks: Int get() = data.ruzEvents.map { WeekKey.key(it.start) }.toSet().size

    /** Пробуем дозагрузить прошлую неделю из РУЗ (один раз за запуск для каждой недели) */
    suspend fun loadArchiveWeek(date: Instant) {
        if (!data.usesRuz || data.ruzGroupID.isEmpty() || hasEvents(date)) return
        val key = WeekKey.key(date)
        if (!triedWeeks.add(key)) return
        loadingWeek = true
        try {
            val events = RuzClient.loadWeek(data.ruzGroupID, WeekKey.monday(date))
            if (events.isNotEmpty()) data = data.mergeRuz(events)
        } finally {
            loadingWeek = false
        }
    }

    /** Фоновая проверка могла обновить расписание и журнал замен, пока приложение спало */
    fun reloadFromDisk() {
        val stored = SharedSchedule.load()
        val s = stored.lastSync ?: return
        if (s <= (data.lastSync ?: Instant.EPOCH)) return
        _data.value = stored
        Defaults.decode<List<ScheduleChange>>("schedule.changes")?.let { _changes.value = it }
        _unseen.intValue = Defaults.int("schedule.unseen")
    }

    /** Полная перезагрузка (после восстановления копии) */
    fun forceReload() {
        _data.value = SharedSchedule.load()
        _changes.value = Defaults.decode<List<ScheduleChange>>("schedule.changes") ?: emptyList()
        _unseen.intValue = Defaults.int("schedule.unseen")
    }

    /** Проверка РУЗ в фоне: приложение закрыто, а о заменах и отменах приходит уведомление */
    suspend fun backgroundSync() {
        var d = SharedSchedule.load()
        if (!d.usesRuz || d.ruzGroupID.isEmpty()) return
        d.lastSync?.let { if (Instant.now().epochSecond - it.epochSecond < 30 * 60) return }
        val oldTimeout = RuzClient.requestTimeout
        val oldICS = RuzClient.useICS
        RuzClient.requestTimeout = 15
        RuzClient.useICS = false
        try {
            val r = try { RuzClient.load(d.ruzGroupID) } catch (_: Throwable) { return }
            if (r.events.isEmpty()) return
            val before = ChangeDetector.upcoming(d)
            d = d.mergeRuz(r.events)
            if (before.isNotEmpty() && Defaults.string("ruz.lastMethod") == r.method) {
                val found = ChangeDetector.diff(before, ChangeDetector.upcoming(d))
                if (found.isNotEmpty()) {
                    val old = Defaults.decode<List<ScheduleChange>>("schedule.changes") ?: emptyList()
                    Defaults.encode("schedule.changes", (found + old).take(50))
                    Defaults.set("schedule.unseen", Defaults.int("schedule.unseen") + found.size)
                    ChangeDetector.notify(found)
                }
            }
            Defaults.set("ruz.lastMethod", r.method)
            d = d.copy(lastSync = Instant.now(), syncInfo = "Загружено пар: ${r.events.size} · ${r.method}")
            SharedSchedule.save(d)
        } finally {
            RuzClient.requestTimeout = oldTimeout
            RuzClient.useICS = oldICS
        }
    }

    fun markChangesSeen() { unseenChanges = 0 }

    fun clearChanges() { changes = emptyList(); unseenChanges = 0 }

    // MARK: ручное расписание

    /** Запоминаем расписание этой недели, чтобы потом можно было посмотреть его в архиве */
    private fun snapshotCurrentWeek(d: ScheduleData): ScheduleData {
        if (d.lessons.isEmpty()) return d
        val key = WeekKey.key(Instant.now())
        var history = d.history
        if (history[key] != d.lessons) history = history + (key to d.lessons)
        if (history.size > 60) {
            val keep = history.keys.sorted().takeLast(60).toSet()
            history = history.filterKeys { it in keep }
        }
        return if (history === d.history) d else d.copy(history = history)
    }

    val archivedWeeks: Int get() = data.history.size

    fun clearHistory() { data = data.copy(history = emptyMap()) }

    val hasLessons: Boolean get() = if (data.usesRuz) data.ruzEvents.isNotEmpty() else data.lessons.isNotEmpty()

    val isConfigured: Boolean get() = data.usesRuz || data.lessons.isNotEmpty()

    fun contains(l: Lesson) = data.lessons.any { it.id == l.id }

    fun upsert(l: Lesson) {
        data = data.copy(lessons = if (data.lessons.any { it.id == l.id }) data.lessons.map { if (it.id == l.id) l else it } else data.lessons + l)
    }

    fun delete(l: Lesson) { data = data.copy(lessons = data.lessons.filter { it.id != l.id }) }

    fun clearAll() { data = data.copy(lessons = emptyList()) }

    // MARK: РУЗ

    fun connectRuz(number: String, institution: Int, id: String = "") {
        var d = data
        val newNumber = number.trim()
        // другая группа — её пары не смешиваем со старой памятью
        if (d.ruzGroupNumber.isNotEmpty() && d.ruzGroupNumber != newNumber) d = d.copy(ruzEvents = emptyList())
        d = d.copy(source = 1, ruzGroupNumber = newNumber, ruzInstitution = institution, ruzGroupID = id, lastSync = null)
        data = d
    }

    /** Преподаватель: своя школа, без группы — пары соберёт sync() */
    fun connectTeacher(institution: Int) {
        var d = data
        if (d.ruzInstitution != institution || d.ruzGroupNumber.isNotEmpty()) d = d.copy(ruzEvents = emptyList())
        data = d.copy(source = 1, ruzGroupNumber = "", ruzGroupID = "", ruzInstitution = institution, lastSync = null)
    }

    fun useManual() { data = data.copy(source = 0) }

    fun clearRuzCache() { data = data.copy(ruzEvents = emptyList(), lastSync = null, syncInfo = "") }

    val lastSyncText: String
        get() {
            val last = data.lastSync ?: return "ещё не обновлялось"
            return "обновлено " + Fmt.relative(last, full = true)
        }

    suspend fun sync(force: Boolean = false) {
        if (!data.usesRuz || syncing) return
        if (!force) data.lastSync?.let { if (Instant.now().epochSecond - it.epochSecond < 20 * 60) return }
        // преподаватель: пары собираются из расписаний всех групп школы — не чаще раза в 3 часа
        if (TeacherMode.isOn) {
            if (!force) data.lastSync?.let { if (Instant.now().epochSecond - it.epochSecond < 3 * 3600) return }
            syncing = true
            try {
                val r = TeacherMode.scan(data.ruzInstitution, TeacherMode.query, force) { done, total ->
                    teacherProgress = if (total > 0) done.toDouble() / total else 0.0
                }
                teacherProgress = null
                var d = data
                if (r.events.isNotEmpty()) d = d.mergeRuz(r.events)
                val info = if (r.events.isEmpty()) "В РУЗ не нашлось пар преподавателя «${TeacherMode.query}»"
                else "Пар: ${r.events.size} · групп: ${r.groups.size}"
                d = d.copy(lastSync = Instant.now(), syncInfo = info)
                data = d
                syncMessage = info
            } catch (e: Throwable) {
                teacherProgress = null
                syncMessage = (e.message?.takeIf { it.isNotEmpty() } ?: "Нет связи с РУЗ") + ", показываю сохранённое расписание"
            } finally {
                syncing = false
            }
            return
        }
        syncing = true
        try {
            var id = data.ruzGroupID
            if (id.isEmpty()) {
                val found = if (data.ruzGroupNumber.isEmpty()) null else RuzClient.findGroupID(data.ruzGroupNumber, data.ruzInstitution)
                if (found == null) {
                    val msg = "Группа ${data.ruzGroupNumber} не найдена в РУЗ. Открой РУЗ, найди свою группу и нажми «Сделать моим расписанием»."
                    syncMessage = msg
                    data = data.copy(syncInfo = msg)
                    return
                }
                id = found
            }
            val r = RuzClient.load(id)
            var d = data
            val before = ChangeDetector.upcoming(data)
            d = d.copy(ruzGroupID = id)
            if (r.events.isNotEmpty()) d = d.mergeRuz(r.events)
            val lastMethod = Defaults.string("ruz.lastMethod")
            Defaults.set("ruz.lastMethod", r.method)
            if (before.isNotEmpty() && r.events.isNotEmpty() && lastMethod == r.method) {
                val found = ChangeDetector.diff(before, ChangeDetector.upcoming(d))
                if (found.isNotEmpty()) {
                    changes = (found + changes).take(50)
                    unseenChanges += found.size
                    ChangeDetector.notify(found)
                }
            }
            val info = if (r.events.isEmpty()) (r.notice ?: "РУЗ не вернул пар на ближайшие недели") else "Загружено пар: ${r.events.size} · ${r.method}"
            d = d.copy(lastSync = Instant.now(), syncInfo = info)
            data = d
            syncMessage = info
        } catch (_: Throwable) {
            syncMessage = "Нет связи с РУЗ, показываю сохранённое расписание"
        } finally {
            syncing = false
        }
    }
}
