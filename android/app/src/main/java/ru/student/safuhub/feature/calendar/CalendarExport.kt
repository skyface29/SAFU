package ru.student.safuhub.feature.calendar

import android.Manifest
import android.content.ContentValues
import android.net.Uri
import android.provider.CalendarContract
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import ru.student.safuhub.App
import ru.student.safuhub.core.Cal
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.system.Permissions
import java.time.Instant
import java.util.TimeZone
import kotlin.coroutines.resume

/** Пары в отдельный календарь телефона (как EventKit) */
object CalendarExporter {
    const val calendarTitle = "САФУ · Пары"
    private const val accountName = "САФУ"

    class ExportError(message: String) : Exception(message)

    private fun asSyncAdapter(uri: Uri): Uri = uri.buildUpon()
        .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, accountName)
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
        .build()

    private suspend fun requestAccess(): Boolean = suspendCancellableCoroutine { c ->
        Permissions.requestAll(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)) { c.resume(it) }
    }

    suspend fun export(data: ScheduleData, weeks: Int, alert: Boolean): Int {
        if (!requestAccess()) throw ExportError("Нет доступа к календарю. Разреши его в настройках приложения.")
        return withContext(Dispatchers.IO) {
            val cr = App.ctx.contentResolver
            // старый календарь с парами удаляем, чтобы не было дублей
            cr.query(CalendarContract.Calendars.CONTENT_URI, arrayOf(CalendarContract.Calendars._ID),
                "${CalendarContract.Calendars.CALENDAR_DISPLAY_NAME} = ?", arrayOf(calendarTitle), null)?.use { cur ->
                while (cur.moveToNext()) {
                    val id = cur.getLong(0)
                    try { cr.delete(asSyncAdapter(Uri.withAppendedPath(CalendarContract.Calendars.CONTENT_URI, id.toString())), null, null) } catch (_: Throwable) {}
                }
            }
            val cv = ContentValues().apply {
                put(CalendarContract.Calendars.ACCOUNT_NAME, accountName)
                put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
                put(CalendarContract.Calendars.NAME, calendarTitle)
                put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, calendarTitle)
                put(CalendarContract.Calendars.CALENDAR_COLOR, 0xFF007AFF.toInt())
                put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
                put(CalendarContract.Calendars.OWNER_ACCOUNT, accountName)
                put(CalendarContract.Calendars.VISIBLE, 1)
                put(CalendarContract.Calendars.SYNC_EVENTS, 1)
                put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().id)
            }
            val calUri = cr.insert(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), cv)
                ?: throw ExportError("Не нашёл, где создать календарь.")
            val calId = calUri.lastPathSegment?.toLongOrNull() ?: throw ExportError("Не нашёл, где создать календарь.")
            val today = Cal.startOfDay(Instant.now())
            var count = 0
            for (offset in 0 until weeks * 7) {
                val day = Cal.addDays(today, offset)
                for (s in ScheduleEngine.slots(day, data)) {
                    val place = listOfNotNull(s.lesson.room.takeIf { it.isNotEmpty() }?.let { "ауд. $it" }, s.address.takeIf { it.isNotEmpty() })
                    val ev = ContentValues().apply {
                        put(CalendarContract.Events.CALENDAR_ID, calId)
                        put(CalendarContract.Events.TITLE, s.lesson.subject)
                        put(CalendarContract.Events.DTSTART, s.start.toEpochMilli())
                        put(CalendarContract.Events.DTEND, s.end.toEpochMilli())
                        put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
                        put(CalendarContract.Events.EVENT_LOCATION, place.joinToString(", "))
                        put(CalendarContract.Events.DESCRIPTION, listOf(s.lesson.kind, s.lesson.teacher).filter { it.isNotEmpty() }.joinToString("\n"))
                        put(CalendarContract.Events.HAS_ALARM, if (alert) 1 else 0)
                    }
                    val evUri = cr.insert(CalendarContract.Events.CONTENT_URI, ev) ?: continue
                    if (alert) {
                        val rid = evUri.lastPathSegment?.toLongOrNull()
                        if (rid != null) {
                            cr.insert(CalendarContract.Reminders.CONTENT_URI, ContentValues().apply {
                                put(CalendarContract.Reminders.EVENT_ID, rid)
                                put(CalendarContract.Reminders.MINUTES, 15)
                                put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
                            })
                        }
                    }
                    count += 1
                }
            }
            count
        }
    }
}
