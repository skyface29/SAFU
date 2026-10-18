package ru.student.safuhub.feature.commute

import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.hmString
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.feature.weather.WeatherCache
import ru.student.safuhub.system.Notify
import java.time.Instant

object CommuteSettings {
    val enabled: Boolean get() = Defaults.boolOrNull("commute.enabled") ?: true
    val walkMinutes: Int get() = Defaults.int("commute.walk").let { if (it == 0) 15 else it }
    val homeMinutes: Int get() = Defaults.int("commute.home").let { if (it == 0) 10 else it }
    val travelMinutes: Int get() = BusRoutes.active.travelMinutes
    val leadMinutes: Int get() = BusRoutes.active.leadMinutes
    val notify: Boolean get() = Defaults.boolOrNull("commute.notify") ?: true
}

object CommutePlanner {
    /** Для 150 — пара в 8:20 → автобус 7:00, пара в 10:10 → автобус 8:30. Иначе — последний рейс за «выезд за» минут до начала */
    fun latestDeparture(start: Instant, route: BusRoute = BusRoutes.active): Instant {
        if (route.builtIn) {
            val hm = Cal.hour(start) * 60 + Cal.minute(start)
            if (hm <= 8 * 60 + 20) return Cal.setting(start, 7, 0)
            if (hm <= 10 * 60 + 10) return Cal.setting(start, 8, 30)
        }
        return start.minusSeconds(route.leadMinutes * 60L)
    }

    /** Автобус из дома к первой паре */
    fun morning(first: LessonSlot): BusTrip? {
        val route = BusRoutes.active
        val latest = latestDeparture(first.start, route)
        return route.trips(BusDirection.TO_CAMPUS, first.start).lastOrNull { it.departure <= latest }
    }

    /** Ближайшие автобусы домой после пар */
    fun afterClasses(time: Instant, count: Int = 3): List<BusTrip> {
        val ready = time.plusSeconds(CommuteSettings.walkMinutes * 60L)
        return BusRoutes.active.trips(BusDirection.TO_HOME, time).filter { it.departure >= ready }.take(count)
    }

    fun firstPair(day: Instant, data: ScheduleData): LessonSlot? = ScheduleEngine.slots(day, data).firstOrNull { !it.isRemote }
    fun lastPair(day: Instant, data: ScheduleData): LessonSlot? = ScheduleEngine.slots(day, data).lastOrNull { !it.isRemote }

    /** Напоминания «пора выходить» на неделю вперёд */
    fun scheduleNotifications(data: ScheduleData) {
        Notify.removePrefix("commute-")
        if (!(CommuteSettings.enabled && CommuteSettings.notify)) return
        val home = CommuteSettings.homeMinutes * 60L
        for (offset in 0 until 7) {
            val day = Cal.addDays(Cal.startOfDay(Instant.now()), offset)
            val first = firstPair(day, data) ?: continue
            val trip = morning(first) ?: continue
            val fire = trip.departure.minusSeconds(home + 10 * 60)
            if (fire <= Instant.now()) continue
            val r = BusRoutes.active
            val stop = if (r.homeStop.isEmpty()) "" else " с ${r.homeStop}"
            var body = "Автобус ${r.number} в ${hmString(trip.departure)}$stop. Пара «${first.lesson.subject}» в ${hmString(first.start)}."
            WeatherCache.cachedHour(trip.departure)?.let { w ->
                body += "\n" + WeatherCache.line(w) + (WeatherCache.advice(w)?.let { ". $it" } ?: "")
            }
            Notify.add("commute-$offset", "Через 10 мин выходи 🚌", body, fire, Notify.CH_PAIRS)
        }
    }
}

fun minutesText(m: Int): String = if (m < 60) "$m мин" else "${m / 60} ч ${m % 60} мин"

/** Какой ближайший автобус (для ярлыка «Мой автобус») */
object NextBusAnswer {
    fun text(): String {
        val data = ru.student.safuhub.data.SharedSchedule.load()
        val now = Instant.now()
        val today = Cal.startOfDay(now)
        val r = BusRoutes.active
        if (!(r.useGeo && CityLocator.cityNow == HomeCity.ARKHANGELSK)) {
            val p = ScheduleEngine.slots(today, data).firstOrNull { !it.isRemote && it.start > now }
            val trip = p?.let { CommutePlanner.morning(it) }
            if (p != null && trip != null && trip.departure > now) {
                return "Автобус ${r.number} в ${hmString(trip.departure)}, успеешь к паре в ${hmString(p.start)}"
            }
        }
        CommutePlanner.afterClasses(now, 1).firstOrNull()?.let { return "Ближайший ${r.number} домой в ${hmString(it.departure)}" }
        return "Сегодня подходящих рейсов больше нет"
    }
}
