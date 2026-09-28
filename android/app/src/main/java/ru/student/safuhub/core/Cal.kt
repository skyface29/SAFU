package ru.student.safuhub.core

import android.icu.text.RelativeDateTimeFormatter
import android.icu.util.ULocale
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

val RU: Locale = Locale("ru", "RU")

/** Календарь телефона — как Calendar.current в iOS */
object Cal {
    val zone: ZoneId get() = ZoneId.systemDefault()
    val moscow: ZoneId = ZoneId.of("Europe/Moscow")

    fun now(): Instant = Instant.now()
    fun zdt(i: Instant): ZonedDateTime = i.atZone(zone)

    fun startOfDay(i: Instant): Instant = zdt(i).toLocalDate().atStartOfDay(zone).toInstant()
    fun addDays(i: Instant, n: Int): Instant = zdt(i).plusDays(n.toLong()).toInstant()
    fun addMonths(i: Instant, n: Int): Instant = zdt(i).plusMonths(n.toLong()).toInstant()
    fun addMinutes(i: Instant, n: Int): Instant = i.plusSeconds(n * 60L)

    fun year(i: Instant) = zdt(i).year
    fun month(i: Instant) = zdt(i).monthValue
    fun day(i: Instant) = zdt(i).dayOfMonth
    fun hour(i: Instant) = zdt(i).hour
    fun minute(i: Instant) = zdt(i).minute
    fun second(i: Instant) = zdt(i).second
    /** Как в iOS: 1 = воскресенье … 7 = суббота */
    fun weekdayApple(i: Instant): Int = zdt(i).dayOfWeek.value % 7 + 1
    /** 1 = пн … 7 = вс */
    fun weekdayMon(i: Instant): Int = zdt(i).dayOfWeek.value

    fun isSameDay(a: Instant, b: Instant) = zdt(a).toLocalDate() == zdt(b).toLocalDate()
    fun isToday(i: Instant) = isSameDay(i, now())
    fun isTomorrow(i: Instant) = isSameDay(i, addDays(now(), 1))
    fun isYesterday(i: Instant) = isSameDay(i, addDays(now(), -1))

    fun date(y: Int, m: Int, d: Int, h: Int = 0, mi: Int = 0, s: Int = 0, z: ZoneId = zone): Instant? = try {
        ZonedDateTime.of(y, m, d, h, mi, s, 0, z).toInstant()
    } catch (_: Throwable) { null }

    fun setting(day: Instant, hour: Int, minute: Int, second: Int = 0): Instant =
        zdt(day).toLocalDate().atTime(LocalTime.of(hour.coerceIn(0, 23), minute.coerceIn(0, 59), second.coerceIn(0, 59))).atZone(zone).toInstant()

    /** Понедельник недели (00:00) */
    fun monday(i: Instant): Instant =
        zdt(i).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(zone).toInstant()

    fun daysBetween(a: Instant, b: Instant): Int =
        ChronoUnit.DAYS.between(zdt(a).toLocalDate(), zdt(b).toLocalDate()).toInt()

    fun localDate(i: Instant): LocalDate = zdt(i).toLocalDate()
    fun fromLocal(d: LocalDate): Instant = d.atStartOfDay(zone).toInstant()
}

fun Instant.secondsSince(other: Instant): Double = Duration.between(other, this).toMillis() / 1000.0
val Instant.sinceNow: Double get() = secondsSince(Instant.now())
fun Instant.plusSec(s: Double): Instant = plusMillis((s * 1000).toLong())
val Instant.epochSec: Long get() = epochSecond

/** Форматтеры дат (шаблоны как в iOS) */
object Fmt {
    private val cache = ConcurrentHashMap<String, DateTimeFormatter>()

    fun formatter(pattern: String): DateTimeFormatter = cache.getOrPut(pattern) {
        DateTimeFormatter.ofPattern(pattern, RU)
    }

    fun format(i: Instant, pattern: String, zone: ZoneId = Cal.zone): String =
        try { formatter(pattern).format(i.atZone(zone)) } catch (_: Throwable) { "" }

    private val relLong by lazy { RelativeDateTimeFormatter.getInstance(ULocale("ru"), null, RelativeDateTimeFormatter.Style.LONG, android.icu.text.DisplayContext.CAPITALIZATION_NONE) }
    private val relShort by lazy { RelativeDateTimeFormatter.getInstance(ULocale("ru"), null, RelativeDateTimeFormatter.Style.SHORT, android.icu.text.DisplayContext.CAPITALIZATION_NONE) }

    /** «через 2 ч», «5 мин назад» (как RelativeDateTimeFormatter .short) */
    fun relative(date: Instant, full: Boolean = false): String {
        val f = if (full) relLong else relShort
        val diff = date.secondsSince(Instant.now())
        val a = kotlin.math.abs(diff)
        val dir = if (diff < 0) RelativeDateTimeFormatter.Direction.LAST else RelativeDateTimeFormatter.Direction.NEXT
        val (value, unit) = when {
            a < 60 -> a to RelativeDateTimeFormatter.RelativeUnit.SECONDS
            a < 3600 -> a / 60 to RelativeDateTimeFormatter.RelativeUnit.MINUTES
            a < 86400 -> a / 3600 to RelativeDateTimeFormatter.RelativeUnit.HOURS
            a < 7 * 86400 -> a / 86400 to RelativeDateTimeFormatter.RelativeUnit.DAYS
            a < 30 * 86400 -> a / (7 * 86400) to RelativeDateTimeFormatter.RelativeUnit.WEEKS
            a < 365 * 86400 -> a / (30 * 86400) to RelativeDateTimeFormatter.RelativeUnit.MONTHS
            else -> a / (365 * 86400) to RelativeDateTimeFormatter.RelativeUnit.YEARS
        }
        return try { f.format(kotlin.math.floor(value), dir, unit) } catch (_: Throwable) { "" }
    }

    fun due(date: Instant) = format(date, "d MMM, HH:mm")
    fun today() = format(Instant.now(), "EEEE, d MMMM")

    val greeting: String
        get() = when (Cal.hour(Instant.now())) {
            in 5..11 -> "Доброе утро"
            in 12..17 -> "Добрый день"
            in 18..22 -> "Добрый вечер"
            else -> "Доброй ночи"
        }
}

fun hm(d: Instant): String = Fmt.format(d, "H:mm")
fun hmString(d: Instant): String = hm(d)

fun String.capitalizedFirstLetter(): String = if (isEmpty()) this else substring(0, 1).uppercase(RU) + substring(1)
