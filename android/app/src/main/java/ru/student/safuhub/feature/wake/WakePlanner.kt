package ru.student.safuhub.feature.wake

import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.feature.commute.BusRoutes
import ru.student.safuhub.feature.commute.BusTrip
import ru.student.safuhub.feature.commute.CommutePlanner
import ru.student.safuhub.feature.commute.CommuteSettings
import ru.student.safuhub.feature.weather.WeatherCache
import ru.student.safuhub.system.Notify
import ru.student.safuhub.system.WakeAlarms
import java.time.Instant

// MARK: - Умный подъём

object WakeSettings {
    val enabled: Boolean get() = Defaults.boolOrNull("wake.on") ?: false
    val prepMinutes: Int get() = Defaults.int("wake.prep").let { if (it == 0) 40 else it }
    val coldEarlier: Boolean get() = Defaults.boolOrNull("wake.cold") ?: true
    val cycles: Int get() = Defaults.int("wake.cycles").let { if (it == 0) 5 else it }
    val bedtime: Boolean get() = Defaults.boolOrNull("wake.bed") ?: true
    val realAlarm: Boolean get() = Defaults.boolOrNull("wake.alarm") ?: true
}

data class WakePlan(
    val pair: LessonSlot,
    val bus: BusTrip?,
    val leave: Instant,
    val wake: Instant,
    val bed: Instant,
    val cold: Boolean,
    val remote: Boolean,
)

object WakePlanner {
    /** План на день: когда лечь, встать, выйти */
    fun plan(day: Instant, data: ScheduleData): WakePlan? {
        val first = ScheduleEngine.slots(day, data).firstOrNull() ?: return null
        val remote = first.isRemote
        var bus: BusTrip? = null
        val leave: Instant
        val trip = if (!remote && CommuteSettings.enabled) CommutePlanner.morning(first) else null
        if (remote) {
            leave = first.start
        } else if (trip != null) {
            bus = trip
            leave = trip.departure.minusSeconds(CommuteSettings.homeMinutes * 60L)
        } else {
            leave = first.start.minusSeconds(45 * 60)
        }
        var wake = leave.minusSeconds((if (remote) 25 else WakeSettings.prepMinutes) * 60L)
        var cold = false
        if (WakeSettings.coldEarlier && !remote) {
            val w = WeatherCache.cachedHour(bus?.departure ?: leave)
            if (w != null && w.feels <= -20) {
                wake = wake.minusSeconds(10 * 60)
                cold = true
            }
        }
        // лечь: целые циклы сна по 90 минут + 15 минут, чтобы уснуть
        val bed = wake.minusSeconds(WakeSettings.cycles * 90L * 60 + 15 * 60)
        return WakePlan(first, bus, leave, wake, bed, cold, remote)
    }

    /** Планы на неделю вперёд, у которых подъём ещё впереди */
    fun upcoming(data: ScheduleData, days: Int = 7): List<WakePlan> {
        val today = Cal.startOfDay(Instant.now())
        return (0 until days).mapNotNull { off ->
            val p = plan(Cal.addDays(today, off), data) ?: return@mapNotNull null
            if (p.wake > Instant.now()) p else null
        }
    }

    fun hm(d: Instant) = Fmt.format(d, "H:mm")

    /** Текст «пара и автобус» для уведомления */
    fun details(p: WakePlan): String {
        var s = "«${p.pair.lesson.subject}» в ${hm(p.pair.start)}"
        p.bus?.let { s += " · автобус ${BusRoutes.active.number} в ${hm(it.departure)}" }
        if (p.remote) s += " · дистанционно"
        WeatherCache.cachedHour(p.bus?.departure ?: p.leave)?.let { s += "\n" + WeatherCache.line(it) }
        return s
    }

    /** На Android настоящий будильник есть всегда */
    val alarmKitAvailable: Boolean get() = true

    /** Пересчитать уведомления и будильники */
    fun schedule(data: ScheduleData) {
        val plans = upcoming(data)
        Notify.remove(Notify.pendingIds().filter { it.startsWith("wake-") || it.startsWith("bed-") })
        val useAlarm = alarmKitAvailable && WakeSettings.realAlarm
        if (WakeSettings.enabled) {
            for ((i, p) in plans.withIndex()) {
                // подъём: если нет настоящего будильника — три громких уведомления подряд
                if (!useAlarm) {
                    for ((k, delay) in listOf(0L, 3L, 6L).withIndex()) {
                        val fire = p.wake.plusSeconds(delay * 60)
                        val title = if (k == 0) "Подъём ⏰ ${hm(p.wake)}" else "Вставай! Уже ${hm(fire)} ⏰"
                        val body = details(p) + if (p.cold) "\nМороз — будильник на 10 минут раньше" else ""
                        Notify.add("wake-$i-$k", title, body, fire, Notify.CH_ALARM)
                    }
                }
                // пора спать
                if (WakeSettings.bedtime && p.bed > Instant.now()) {
                    Notify.add("bed-$i", "Пора спать 😴",
                        "Подъём в ${hm(p.wake)} — это ${WakeSettings.cycles} циклов сна. Завтра " + details(p), p.bed, Notify.CH_GENERAL)
                }
            }
        }
        WakeAlarms.sync(plans)
    }
}
