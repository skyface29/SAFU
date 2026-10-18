package ru.student.safuhub.system

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import ru.student.safuhub.App
import ru.student.safuhub.MainActivity
import ru.student.safuhub.R
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.SharedSchedule
import ru.student.safuhub.feature.commute.BusDirection
import ru.student.safuhub.feature.commute.BusRoutes
import ru.student.safuhub.feature.commute.CityLocator
import ru.student.safuhub.feature.commute.CommutePlanner
import ru.student.safuhub.feature.commute.CommuteSettings
import ru.student.safuhub.feature.commute.HomeCity
import ru.student.safuhub.feature.commute.colorFromHex
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.theme.rgb
import java.time.Instant

// MARK: - Темы «пары на экране блокировки» (как Live Activity)

enum class LiveTheme(val raw: String, val title: String) {
    NIGHT("night", "Ночь"), GLASS("glass", "Стекло"), CLEAR("clear", "Прозрачная"), BLACK("black", "Чёрная"),
    KIND("kind", "Цвет пары"), AURORA("aurora", "Северное сияние"), SUNSET("sunset", "Закат"), ARCTIC("arctic", "Арктика");

    /** Фон самой плашки (null — системный) */
    val tint: Color?
        get() = when (this) {
            NIGHT -> rgb(0.05, 0.10, 0.25)
            GLASS -> null
            CLEAR -> Color.Transparent
            BLACK -> Color.Black
            KIND, AURORA, SUNSET, ARCTIC -> Color.Black.copy(alpha = 0.35f)
        }

    /** Цвета градиента поверх и направление (true — по диагонали) */
    fun gradient(kind: String): Pair<List<Color>, Boolean>? = when (this) {
        KIND -> { val c = KindStyle.of(kind).color; listOf(c.copy(alpha = 0.85f), c.copy(alpha = 0.45f)) to true }
        AURORA -> listOf(rgb(0.10, 0.55, 0.50), rgb(0.30, 0.20, 0.60)) to false
        SUNSET -> listOf(rgb(0.95, 0.45, 0.25), rgb(0.75, 0.20, 0.50)) to false
        ARCTIC -> listOf(rgb(0.25, 0.55, 0.85), rgb(0.10, 0.25, 0.50)) to true
        else -> null
    }

    val adaptiveText: Boolean get() = this == GLASS

    fun primary(dark: Boolean): Color = if (adaptiveText) (if (dark) Color.White else Color.Black) else Color.White
    fun secondary(dark: Boolean): Color = if (adaptiveText) (if (dark) Color(0x99EBEBF5) else Color(0x993C3C43)) else Color.White.copy(alpha = 0.68f)

    val accent: Color
        get() = when (this) {
            KIND, AURORA, SUNSET, ARCTIC -> Color.White
            GLASS -> rgb(0.20, 0.50, 1.0)
            else -> rgb(0.50, 0.78, 1.0)
        }

    val needsShadow: Boolean get() = this == CLEAR

    companion object { fun of(raw: String?) = entries.firstOrNull { it.raw == raw } ?: NIGHT }
}

enum class LiveLayout(val raw: String, val title: String) {
    FULL("full", "Подробно"), MEDIUM("medium", "Средне"), THIN("thin", "Тонко");
    companion object { fun of(raw: String?) = entries.firstOrNull { it.raw == raw } ?: FULL }
}

/** Состояние «пары на экране блокировки» */
data class LiveState(
    val subject: String, val kind: String, val room: String, val address: String, val teacher: String,
    val start: Instant, val end: Instant, val isNow: Boolean, val pair: Int,
    val nextSubject: String = "", val nextRoom: String = "", val nextStart: Instant? = null,
    val theme: String = "night", val layout: String = "full", val island: String = "timer",
) {
    /** Переключение по времени без обновления от приложения */
    fun effective(now: Instant = Instant.now()): LiveState {
        var s = this
        if (!s.isNow && now >= s.start && now < s.end) s = s.copy(isNow = true)
        val next = s.nextStart
        if (now >= s.end && next != null && s.nextSubject.isNotEmpty()) {
            s = s.copy(subject = s.nextSubject, room = s.nextRoom, kind = "", teacher = "", start = next,
                end = next.plusSeconds(95 * 60), isNow = now >= next, pair = if (s.pair > 0) s.pair + 1 else 0,
                nextSubject = "", nextRoom = "", nextStart = null)
        }
        return s
    }

    companion object {
        fun sample(theme: String, layout: String): LiveState {
            val now = Instant.now()
            return LiveState("Алгебра и геометрия", "Лекция", "24", "наб. Северной Двины, д. 2", "Кочкин С.А.",
                now.plusSeconds(31 * 60), now.plusSeconds(126 * 60), false, 2, theme = theme, layout = layout)
        }
    }
}

/** Аудитория и адрес в нормальном виде */
data class LivePlace(val room: String, val address: String) {
    val roomText: String get() = if (room.isEmpty()) "" else "ауд. $room"
    val line: String get() = listOf(roomText, address).filter { it.isNotEmpty() }.joinToString(" · ")

    companion object {
        fun of(s: LiveState): LivePlace {
            if (AddressFormat.isRemote(s.address) || AddressFormat.isRemote(s.room)) return LivePlace(s.room, "Дистанционно")
            val d = AddressFormat.decode(s.room, s.address, emptyList())
            return LivePlace(d.first, d.second)
        }
    }
}

object LiveFormat {
    fun hmText(d: Instant) = Fmt.format(d, "H:mm")
    /** Пара не сегодня и нескоро — вместо таймера пишем день и время («пн 8:20») */
    fun isFar(d: Instant) = !Cal.isToday(d) && d.epochSecond - Instant.now().epochSecond > 6 * 3600
    fun dayTime(d: Instant) = Fmt.format(d, "EE").lowercase() + " " + hmText(d)
}

// MARK: - Пара на экране блокировки

object LiveLesson {
    const val NOTIF_ID = 7001
    private const val ACTION_TICK = "ru.student.safuhub.LIVE_TICK"

    val enabled: Boolean get() = Defaults.boolOrNull("live.enabled") ?: true
    /** Висеть всегда: даже когда сегодня пар нет — показывать следующую */
    val always: Boolean get() = Defaults.boolOrNull("live.always") ?: true

    @Volatile var current: LiveState? = null
        private set

    fun state(data: ScheduleData): LiveState? {
        val now = Instant.now()
        val (cur, nxt) = ScheduleEngine.nowAndNext(now, data)
        var main: LessonSlot? = cur
        var isNow = true
        if (main == null && nxt != null && (always || nxt.start.epochSecond - now.epochSecond < 90 * 60)) {
            main = nxt
            isNow = false
        }
        val s = main ?: return null
        val next = if (isNow) nxt else ScheduleEngine.nowAndNext(s.start.plusSeconds(60), data).second
        val sameDayNext = next?.takeIf { Cal.isSameDay(it.start, s.start) }
        return LiveState(s.lesson.subject, s.lesson.kind, s.lesson.room, s.address, s.lesson.teacher, s.start, s.end, isNow,
            s.lesson.pair, sameDayNext?.lesson?.subject ?: "", sameDayNext?.lesson?.room ?: "", sameDayNext?.start,
            Defaults.string("live.theme") ?: LiveTheme.NIGHT.raw, Defaults.string("live.layout") ?: LiveLayout.FULL.raw,
            Defaults.string("live.island") ?: "timer")
    }

    fun update(data: ScheduleData = SharedSchedule.load()) {
        val ctx = App.ctx
        val st = if (enabled) state(data) else null
        if (st == null || !Notify.permitted) {
            endAll()
            return
        }
        current = st
        post(ctx, st.effective())
        scheduleTick(ctx, st.effective())
    }

    fun endAll() {
        current = null
        NotificationManagerCompat.from(App.ctx).cancel(NOTIF_ID)
        cancelTick(App.ctx)
    }

    val isRunning: Boolean get() = current != null

    private fun tickIntent(ctx: Context): PendingIntent =
        PendingIntent.getBroadcast(ctx, 7101, Intent(ctx, LiveReceiver::class.java).setAction(ACTION_TICK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** Следующее обновление: начало/конец пары (точно), а во время пары — прогресс раз в 2 минуты */
    private fun scheduleTick(ctx: Context, s: LiveState) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val now = System.currentTimeMillis()
        val boundary = (if (s.isNow) s.end else s.start).toEpochMilli() + 1000
        val at = if (s.isNow) minOf(boundary, now + 120_000) else boundary
        val pi = tickIntent(ctx)
        try {
            if (at == boundary && (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.set(AlarmManager.RTC, at, pi)
        } catch (_: Throwable) { am.set(AlarmManager.RTC, at, pi) }
    }

    private fun cancelTick(ctx: Context) {
        ctx.getSystemService(AlarmManager::class.java)?.cancel(tickIntent(ctx))
    }

    private fun openIntent(ctx: Context, url: String, code: Int): PendingIntent =
        PendingIntent.getActivity(ctx, code, Intent(Intent.ACTION_VIEW, Uri.parse(url), ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun isDark(ctx: Context) = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    fun post(ctx: Context, s: LiveState) {
        val theme = LiveTheme.of(s.theme)
        val layout = LiveLayout.of(s.layout)
        val dark = isDark(ctx)
        val small = views(ctx, s, theme, layout, dark)
        val big = views(ctx, s, theme, LiveLayout.FULL, dark)
        val target = if (s.isNow) s.end else s.start
        val title = s.subject
        val text = (if (s.isNow) "до ${LiveFormat.hmText(s.end)}" else "в ${LiveFormat.hmText(s.start)}") +
            LivePlace.of(s).line.let { if (it.isEmpty()) "" else " · $it" }
        val b = NotificationCompat.Builder(ctx, Notify.CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_snowflake)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(s.island == "timer" && !LiveFormat.isFar(target))
            .setWhen(target.toEpochMilli())
            .setUsesChronometer(s.island == "timer" && !LiveFormat.isFar(target))
            .setChronometerCountDown(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setContentIntent(openIntent(ctx, "safu://schedule", 7201))
            .setColor(KindStyle.of(s.kind).color.toArgb())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        try { NotificationManagerCompat.from(ctx).notify(NOTIF_ID, b.build()) } catch (_: SecurityException) {}
    }

    /** Для превью в настройках: та же плашка, что в уведомлении */
    fun previewViews(ctx: Context, s: LiveState): RemoteViews = views(ctx, s, LiveTheme.of(s.theme), LiveLayout.of(s.layout), isDark(ctx))

    private fun views(ctx: Context, s: LiveState, theme: LiveTheme, layout: LiveLayout, dark: Boolean): RemoteViews {
        val res = when (layout) {
            LiveLayout.FULL -> R.layout.notif_lesson_full
            LiveLayout.MEDIUM -> R.layout.notif_lesson_medium
            LiveLayout.THIN -> R.layout.notif_lesson_thin
        }
        val v = RemoteViews(ctx.packageName, res)
        val primary = theme.primary(dark).toArgb()
        val secondary = theme.secondary(dark).toArgb()
        val accent = theme.accent.toArgb()
        LiveBitmaps.background(theme, s.kind)?.let { v.setImageViewBitmap(R.id.bg, it) } ?: v.setViewVisibility(R.id.bg, View.GONE)
        val st = KindStyle.of(s.kind)
        val place = LivePlace.of(s)
        val target = if (s.isNow) s.end else s.start
        // таймер
        v.setTextViewText(R.id.timerLabel, if (s.isNow) "ещё" else if (LiveFormat.isFar(target)) "в" else "через")
        v.setTextColor(R.id.timerLabel, secondary)
        if (LiveFormat.isFar(target)) {
            v.setViewVisibility(R.id.timer, View.GONE)
            v.setViewVisibility(R.id.timerStatic, View.VISIBLE)
            v.setTextViewText(R.id.timerStatic, LiveFormat.dayTime(target))
            v.setTextColor(R.id.timerStatic, accent)
        } else {
            val base = SystemClock.elapsedRealtime() + (target.toEpochMilli() - System.currentTimeMillis())
            v.setChronometer(R.id.timer, base, null, true)
            v.setChronometerCountDown(R.id.timer, true)
            v.setTextColor(R.id.timer, accent)
        }
        val timeText = (if (s.pair > 0) "${s.pair} пара · " else "") + "${LiveFormat.hmText(s.start)}–${LiveFormat.hmText(s.end)}"
        when (layout) {
            LiveLayout.FULL -> {
                kindBadge(v, st, 10f)
                v.setTextViewText(R.id.time, timeText); v.setTextColor(R.id.time, secondary)
                v.setTextViewText(R.id.subject, s.subject); v.setTextColor(R.id.subject, primary)
                v.setTextViewText(R.id.room, place.roomText.let { if (it.isEmpty()) "" else "📍 $it" }); v.setTextColor(R.id.room, primary)
                v.setTextViewText(R.id.address, place.address); v.setTextColor(R.id.address, secondary)
                v.setTextViewText(R.id.teacher, if (s.teacher.isEmpty()) "" else "👤 ${s.teacher}"); v.setTextColor(R.id.teacher, secondary)
                if (s.isNow) {
                    val total = (s.end.toEpochMilli() - s.start.toEpochMilli()).coerceAtLeast(1)
                    val done = (System.currentTimeMillis() - s.start.toEpochMilli()).coerceIn(0, total)
                    v.setProgressBar(R.id.progress, 1000, (done * 1000 / total).toInt(), false)
                    v.setViewVisibility(R.id.progress, View.VISIBLE)
                    tintProgress(v, R.id.progress, accent)
                } else v.setViewVisibility(R.id.progress, View.GONE)
                camera(ctx, v, s.isNow, accent)
            }
            LiveLayout.MEDIUM -> {
                kindBadge(v, st, 9f)
                v.setTextViewText(R.id.subject, s.subject); v.setTextColor(R.id.subject, primary)
                v.setTextViewText(R.id.line, listOf(timeText, place.line).filter { it.isNotEmpty() }.joinToString(" · ")); v.setTextColor(R.id.line, secondary)
                camera(ctx, v, s.isNow, accent)
            }
            LiveLayout.THIN -> {
                v.setTextViewText(R.id.subject, st.label); v.setTextColor(R.id.subject, primary)
                v.setTextViewText(R.id.line, if (place.roomText.isEmpty()) "" else "· ${place.roomText}"); v.setTextColor(R.id.line, secondary)
            }
        }
        return v
    }

    private fun kindBadge(v: RemoteViews, st: KindStyle, size: Float) {
        v.setTextViewText(R.id.kind, st.label.uppercase())
        v.setTextViewTextSize(R.id.kind, TypedValue.COMPLEX_UNIT_SP, size)
        // капсула цвета типа пары
        v.setInt(R.id.kind, "setBackgroundResource", R.drawable.pill)
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(R.id.kind, "setBackgroundTintList", android.content.res.ColorStateList.valueOf(st.color.toArgb()))
        else v.setInt(R.id.kind, "setBackgroundColor", st.color.toArgb())
    }

    private fun tintProgress(v: RemoteViews, id: Int, color: Int) {
        if (Build.VERSION.SDK_INT >= 31) {
            v.setColorStateList(id, "setProgressTintList", android.content.res.ColorStateList.valueOf(color))
            v.setColorStateList(id, "setProgressBackgroundTintList", android.content.res.ColorStateList.valueOf(0x40FFFFFF))
        }
    }

    private fun camera(ctx: Context, v: RemoteViews, show: Boolean, tint: Int) {
        v.setViewVisibility(R.id.camera, if (show) View.VISIBLE else View.GONE)
        if (show) {
            v.setInt(R.id.camera, "setColorFilter", tint)
            v.setOnClickPendingIntent(R.id.camera, openIntent(ctx, "safu://board", 7202))
        }
    }

    internal fun onTick(ctx: Context) {
        Defaults.init(ctx)
        update(SharedSchedule.load())
        BusLive.onTick(ctx)
    }
}

/** Картинки фона для уведомлений (градиенты тем) */
object LiveBitmaps {
    private val cache = HashMap<String, Bitmap>()

    fun background(theme: LiveTheme, kind: String): Bitmap? {
        val grad = theme.gradient(kind)
        val tint = theme.tint
        if (grad == null && (tint == null || tint == Color.Transparent)) return null
        val key = theme.raw + "|" + (if (theme == LiveTheme.KIND) KindStyle.of(kind).label else "")
        synchronized(cache) { cache[key]?.let { return it } }
        val w = 480; val h = 160
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        tint?.let { c.drawColor(it.toArgb()) }
        if (grad != null) {
            val (colors, diag) = grad
            val p = Paint()
            p.shader = LinearGradient(0f, 0f, w.toFloat(), if (diag) h.toFloat() else 0f, colors[0].toArgb(), colors[1].toArgb(), Shader.TileMode.CLAMP)
            c.drawRect(0f, 0f, w.toFloat(), h.toFloat(), p)
            // лёгкий блик сверху
            val hl = Paint()
            hl.shader = LinearGradient(0f, 0f, 0f, h / 2f, 0x29FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP)
            c.drawRect(0f, 0f, w.toFloat(), h / 2f, hl)
        }
        synchronized(cache) { cache[key] = bmp }
        return bmp
    }
}

// MARK: - Автобус на экране блокировки

object BusLive {
    const val NOTIF_ID = 7002
    private const val ACTION_STOP = "ru.student.safuhub.BUS_STOP"

    data class State(val departure: Instant, val arrival: Instant, val from: String, val to: String, val theme: String,
                     val route: String, val colorHex: String, val direction: String)

    @Volatile var current: State? = null
        private set

    val isRunning: Boolean get() = current?.let { it.arrival > Instant.now() } ?: false

    fun start(departure: Instant, direction: BusDirection) {
        if (!(Defaults.boolOrNull("busLive.on") ?: true) || !Notify.permitted) return
        val route = BusRoutes.active
        val arrival = departure.plusSeconds(route.travelMinutes * 60L)
        val from = route.fromStop(direction).ifEmpty { route.fromCity(direction) }
        val to = route.toCity(direction).ifEmpty { route.toStop(direction) }
        val st = State(departure, arrival, from, to, Defaults.string("live.theme") ?: LiveTheme.NIGHT.raw,
            route.number, route.colorHex, direction.raw)
        current = st
        Defaults.set("busLive.lastStarted", departure.epochSecond.toDouble())
        Defaults.set("busLive.state", listOf(departure.epochSecond.toString(), arrival.epochSecond.toString(), from, to, st.theme, st.route, st.colorHex, st.direction))
        post(App.ctx, st)
    }

    fun stop() {
        current = null
        Defaults.remove("busLive.state")
        NotificationManagerCompat.from(App.ctx).cancel(NOTIF_ID)
    }

    /** Пользователь сам убрал — сегодня в эту сторону больше не запускаем */
    fun stopByUser() {
        BusLiveDismissal.markAllDismissed()
        stop()
    }

    private fun restore() {
        if (current != null) return
        val l = Defaults.stringArray("busLive.state") ?: return
        if (l.size < 8) return
        current = State(Instant.ofEpochSecond(l[0].toLong()), Instant.ofEpochSecond(l[1].toLong()), l[2], l[3], l[4], l[5], l[6], l[7])
    }

    /** Автозапуск: ближайший нужный рейс в пределах окна */
    fun auto(data: ScheduleData) {
        restore()
        current?.let { if (it.arrival < Instant.now()) stop() }
        if (!(Defaults.boolOrNull("busLive.on") ?: true)) { stop(); return }
        if (!(Defaults.boolOrNull("busLive.auto") ?: true) || isRunning || !CommuteSettings.enabled) return
        val route = BusRoutes.active
        val now = Instant.now()
        val window = (Defaults.intOrNull("busLive.window") ?: 60) * 60L
        val today = Cal.startOfDay(now)
        val city = if (route.useGeo) CityLocator.cityNow else null
        var candidate: Pair<Instant, BusDirection>? = null
        val upcoming = ScheduleEngine.slots(today, data).firstOrNull { !it.isRemote && it.start > now }
        val trip = upcoming?.let { CommutePlanner.morning(it) }
        if (trip != null && trip.departure > now && city != HomeCity.ARKHANGELSK) candidate = trip.departure to BusDirection.TO_CAMPUS
        if (candidate == null) {
            val last = CommutePlanner.lastPair(today, data)
            if (last != null && now > last.end.minusSeconds(30 * 60) && city != HomeCity.SEVERODVINSK) {
                CommutePlanner.afterClasses(maxOf(now, last.end), 1).firstOrNull()?.let { candidate = it.departure to BusDirection.TO_HOME }
            }
        }
        val c = candidate ?: return
        if (c.first.epochSecond - now.epochSecond > window) return
        if (BusLiveDismissal.isDismissed(c.second.raw)) return
        if (Defaults.double("busLive.lastStarted") == c.first.epochSecond.toDouble()) return
        start(c.first, c.second)
    }

    internal fun onTick(ctx: Context) {
        restore()
        val st = current ?: return
        if (st.arrival < Instant.now()) stop() else post(ctx, st)
    }

    private fun isDark(ctx: Context) = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private fun post(ctx: Context, s: State) {
        val theme = LiveTheme.of(s.theme)
        val dark = isDark(ctx)
        val color = (colorFromHex(s.colorHex) ?: Color(0xFFF28C1A)).toArgb()
        val v = RemoteViews(ctx.packageName, R.layout.notif_bus)
        LiveBitmaps.background(theme, "")?.let { v.setImageViewBitmap(R.id.bg, it) } ?: v.setViewVisibility(R.id.bg, View.GONE)
        v.setTextViewText(R.id.route, "🚌 ${s.route}")
        v.setInt(R.id.route, "setBackgroundResource", R.drawable.pill)
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(R.id.route, "setBackgroundTintList", android.content.res.ColorStateList.valueOf(color))
        v.setTextViewText(R.id.fromTo, "${s.from} → ${s.to}")
        v.setTextColor(R.id.fromTo, theme.primary(dark).toArgb())
        v.setTextColor(R.id.timerLabel, theme.secondary(dark).toArgb())
        if (LiveFormat.isFar(s.departure)) {
            v.setViewVisibility(R.id.timer, View.GONE)
            v.setViewVisibility(R.id.timerStatic, View.VISIBLE)
            v.setTextViewText(R.id.timerStatic, LiveFormat.dayTime(s.departure))
            v.setTextColor(R.id.timerStatic, theme.accent.toArgb())
        } else {
            v.setChronometer(R.id.timer, SystemClock.elapsedRealtime() + (s.departure.toEpochMilli() - System.currentTimeMillis()), null, true)
            v.setChronometerCountDown(R.id.timer, true)
            v.setTextColor(R.id.timer, theme.accent.toArgb())
        }
        v.setTextViewText(R.id.dep, LiveFormat.hmText(s.departure)); v.setTextColor(R.id.dep, theme.primary(dark).toArgb())
        v.setTextViewText(R.id.arr, "~" + LiveFormat.hmText(s.arrival)); v.setTextColor(R.id.arr, theme.secondary(dark).toArgb())
        val total = (s.arrival.toEpochMilli() - s.departure.toEpochMilli()).coerceAtLeast(1)
        val done = (System.currentTimeMillis() - s.departure.toEpochMilli()).coerceIn(0, total)
        v.setProgressBar(R.id.progress, 1000, (done * 1000 / total).toInt(), false)
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(R.id.progress, "setProgressTintList", android.content.res.ColorStateList.valueOf(color))
        v.setInt(R.id.close, "setColorFilter", theme.secondary(dark).toArgb())
        val stopPi = PendingIntent.getBroadcast(ctx, 7301, Intent(ctx, LiveReceiver::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        v.setOnClickPendingIntent(R.id.close, stopPi)
        val open = PendingIntent.getActivity(ctx, 7203, Intent(Intent.ACTION_VIEW, Uri.parse("safu://home"), ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, Notify.CH_BUS)
            .setSmallIcon(R.drawable.ic_stat_bus)
            .setContentTitle("Автобус ${s.route}: ${s.from} → ${s.to}")
            .setContentText("Отправление в ${LiveFormat.hmText(s.departure)}, прибытие ~${LiveFormat.hmText(s.arrival)}")
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setWhen(s.departure.toEpochMilli()).setUsesChronometer(!LiveFormat.isFar(s.departure)).setChronometerCountDown(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .addAction(0, "Убрать автобус", stopPi)
            .setColor(color)
            .setCustomContentView(v)
            .setCustomBigContentView(v)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setTimeoutAfter((s.arrival.toEpochMilli() - System.currentTimeMillis()).coerceAtLeast(60_000))
            .build()
        try { NotificationManagerCompat.from(ctx).notify(NOTIF_ID, n) } catch (_: SecurityException) {}
    }

    internal fun onStopAction() {
        stopByUser()
    }

    const val STOP = ACTION_STOP
}

/** Какие рейсы пользователь сам убрал — чтобы автозапуск не возвращал их обратно */
object BusLiveDismissal {
    private const val key = "busLive.dismissed"

    private fun dayKey(d: Instant) = "${Cal.year(d)}-${Cal.month(d)}-${Cal.day(d)}"

    fun markDismissed(direction: String, day: Instant = Instant.now()) {
        val list = (Defaults.stringArray(key) ?: emptyList()).filter { it.startsWith(dayKey(day)) } + "${dayKey(day)}|$direction"
        Defaults.set(key, list)
    }

    fun markAllDismissed() {
        val dirs = BusLive.current?.let { listOf(it.direction) } ?: listOf("toCampus", "toHome")
        for (d in dirs) markDismissed(d)
    }

    fun isDismissed(direction: String, day: Instant = Instant.now()) =
        (Defaults.stringArray(key) ?: emptyList()).contains("${dayKey(day)}|$direction")

    fun clearToday() = Defaults.remove(key)
}

class LiveReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Defaults.init(context)
        when (intent.action) {
            BusLive.STOP -> BusLive.onStopAction()
            else -> LiveLesson.onTick(context)
        }
    }
}
