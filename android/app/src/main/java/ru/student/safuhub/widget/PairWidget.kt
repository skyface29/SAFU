package ru.student.safuhub.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.student.safuhub.App
import ru.student.safuhub.MainActivity
import ru.student.safuhub.R
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.core.hm
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.SharedSchedule
import ru.student.safuhub.data.TeacherMode
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.design.widgetSubjectColor
import ru.student.safuhub.ui.theme.rgb
import java.time.Instant

// MARK: - Виджет «Пары САФУ»
// Берёт пары прямо из приложения. Каждый стиль — отдельный виджет в списке (как на iPhone):
// «Пары САФУ» (Ночь), Сияние, Графит, Бордо, Хвоя, Закат, Светлый и Прозрачный.

class WidgetStyle(val id: String, val name: String, val background: Int, val accent: Color, val ink: Color, val clear: Boolean = false)

object WidgetStyles {
    val night = WidgetStyle("night", "Ночь", R.drawable.widget_bg_night, rgb(0.50, 0.78, 1.0), Color.White)
    val aurora = WidgetStyle("aurora", "Сияние", R.drawable.widget_bg_aurora, rgb(0.45, 1.0, 0.78), Color.White)
    val graphite = WidgetStyle("graphite", "Графит", R.drawable.widget_bg_graphite, rgb(0.80, 0.84, 0.90), Color.White)
    val bordeaux = WidgetStyle("bordeaux", "Бордо", R.drawable.widget_bg_bordeaux, rgb(1.0, 0.62, 0.66), Color.White)
    val forest = WidgetStyle("forest", "Хвоя", R.drawable.widget_bg_forest, rgb(0.58, 0.95, 0.66), Color.White)
    val sunset = WidgetStyle("sunset", "Закат", R.drawable.widget_bg_sunset, rgb(1.0, 0.90, 0.55), Color.White)
    val light = WidgetStyle("light", "Светлый", R.drawable.widget_bg_light, rgb(0.10, 0.40, 0.90), rgb(0.08, 0.10, 0.16))
    /** Без фона: сквозь виджет видны обои, а если вырезан кусок обоев — рисуется он */
    val clear = WidgetStyle("clear", "Прозрачный", 0, rgb(0.45, 0.75, 1.0), Color.White, clear = true)
}

// MARK: - Данные

class PairEntry(
    val date: Instant,
    val group: String,
    val current: LessonSlot?,
    val next: LessonSlot?,
    val dayTitle: String,
    val daySlots: List<LessonSlot>,
    val tomorrowInfo: String,
    val lastSync: Instant?,
    val status: String?,
)

object WidgetData {
    fun pairsWord(n: Int): String {
        val m10 = n % 10
        val m100 = n % 100
        if (m10 == 1 && m100 != 11) return "пара"
        if (m10 in 2..4 && m100 !in 12..14) return "пары"
        return "пар"
    }

    fun dayName(d: Instant, now: Instant): String = when {
        Cal.isSameDay(d, now) -> "сегодня"
        Cal.isSameDay(d, Cal.addDays(now, 1)) -> "завтра"
        else -> Fmt.format(d, "EEEE, d MMM")
    }

    fun group(data: ScheduleData): String =
        if (TeacherMode.isOn) TeacherMode.query else data.ruzGroupNumber

    fun status(data: ScheduleData): String? = when {
        data.usesRuz && data.ruzGroupNumber.isEmpty() && !TeacherMode.isOn && data.lessons.isEmpty() -> "Открой САФУ и выбери группу"
        data.usesRuz && data.ruzEvents.isEmpty() -> if (data.lastSync == null) "Расписание ещё не загружено" else "В РУЗ нет пар на эти недели"
        else -> null
    }

    fun entry(now: Instant, data: ScheduleData): PairEntry {
        val (cur, nxt) = ScheduleEngine.nowAndNext(now, data)
        // какой день показывать списком: сегодня, а если пары кончились — ближайший учебный
        var showDay = now
        var slots = ScheduleEngine.slots(now, data)
        if (slots.isEmpty() || slots.last().end <= now) {
            for (offset in 1 until 8) {
                val d = Cal.addDays(Cal.startOfDay(now), offset)
                val s = ScheduleEngine.slots(d, data)
                if (s.isNotEmpty()) { showDay = d; slots = s; break }
            }
        }
        var tomorrowInfo = ""
        val t = Cal.addDays(Cal.startOfDay(showDay), 1)
        val ts = ScheduleEngine.slots(t, data)
        ts.firstOrNull()?.let { first ->
            tomorrowInfo = "${dayName(t, now)}: ${ts.size} ${pairsWord(ts.size)}, с ${hm(first.start)}"
        }
        return PairEntry(now, group(data), cur, nxt, dayName(showDay, now).capitalizedFirstLetter(), slots, tomorrowInfo,
            data.lastSync, status(data))
    }
}

// MARK: - Виджет

private val SMALL = DpSize(110.dp, 110.dp)
private val MEDIUM = DpSize(250.dp, 110.dp)
private val LARGE = DpSize(250.dp, 250.dp)

abstract class PairWidget(private val style: WidgetStyle) : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entry = WidgetData.entry(Instant.now(), SharedSchedule.load())
        val walls = if (style.clear) listOf("small", "medium", "large").associateWith { f -> WidgetWallpaper.load(f)?.let(::rounded) } else emptyMap()
        provideContent { PairWidgetContent(entry, style, walls) }
    }
}

class PairWidgetNight : PairWidget(WidgetStyles.night)
class PairWidgetAurora : PairWidget(WidgetStyles.aurora)
class PairWidgetGraphite : PairWidget(WidgetStyles.graphite)
class PairWidgetBordeaux : PairWidget(WidgetStyles.bordeaux)
class PairWidgetForest : PairWidget(WidgetStyles.forest)
class PairWidgetSunset : PairWidget(WidgetStyles.sunset)
class PairWidgetLight : PairWidget(WidgetStyles.light)
class PairWidgetClear : PairWidget(WidgetStyles.clear)

class PairWidgetNightReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = PairWidgetNight() }
class PairWidgetAuroraReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = PairWidgetAurora() }
class PairWidgetGraphiteReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = PairWidgetGraphite() }
class PairWidgetBordeauxReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = PairWidgetBordeaux() }
class PairWidgetForestReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = PairWidgetForest() }
class PairWidgetSunsetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = PairWidgetSunset() }
class PairWidgetLightReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = PairWidgetLight() }
class PairWidgetClearReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = PairWidgetClear() }

/** Кусок обоев со скруглёнными углами (как у виджета) */
private fun rounded(src: Bitmap): Bitmap {
    val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
    val r = minOf(src.width, src.height) * 0.13f
    Canvas(out).drawRoundRect(RectF(0f, 0f, src.width.toFloat(), src.height.toFloat()), r, r, p)
    return out
}

/** Кнопка ↻ на виджете: обновить расписание из РУЗ, не открывая приложение */
class RefreshWidgetAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        withContext(Dispatchers.Main) {
            ScheduleStore.load()
            try { ScheduleStore.sync(force = true) } catch (_: Throwable) {}
        }
        Widgets.refresh(context)
    }
}

// MARK: - Обновление

object Widgets {
    private var pending: Job? = null

    private val all: List<GlanceAppWidget>
        get() = listOf(PairWidgetNight(), PairWidgetAurora(), PairWidgetGraphite(), PairWidgetBordeaux(),
            PairWidgetForest(), PairWidgetSunset(), PairWidgetLight(), PairWidgetClear())

    /** Перерисовать все виджеты (частые вызовы подряд склеиваются) */
    fun updateAll(ctx: Context = App.ctx) {
        val app = ctx.applicationContext
        AppScope.launch {
            pending?.cancel()
            pending = AppScope.launch(Dispatchers.Default) {
                delay(300)
                refresh(app)
            }
        }
    }

    suspend fun refresh(ctx: Context) {
        for (w in all) try { w.updateAll(ctx) } catch (_: Throwable) {}
        scheduleNext(ctx, SharedSchedule.load())
    }

    /** Следующая перерисовка: начало или конец пары, во время пары — каждые 5 минут (полоска), иначе не реже раза в час */
    private fun scheduleNext(ctx: Context, data: ScheduleData) {
        val now = Instant.now()
        val (cur, _) = ScheduleEngine.nowAndNext(now, data)
        var at = ScheduleEngine.boundaries(now, data).firstOrNull() ?: now.plusSeconds(3600)
        if (cur != null) at = minOf(at, now.plusSeconds(300))
        at = minOf(at, now.plusSeconds(3600)).plusSeconds(1)
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val pi = PendingIntent.getBroadcast(ctx, 7400, Intent(ctx, WidgetTickReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val t = at.toEpochMilli()
        try {
            // RTC без пробуждения: спящий телефон виджет не будит, обновится при включении экрана
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExact(AlarmManager.RTC, t, pi)
            else am.set(AlarmManager.RTC, t, pi)
        } catch (_: Throwable) {
            am.set(AlarmManager.RTC, t, pi)
        }
    }
}

class WidgetTickReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val done = goAsync()
        AppScope.launch(Dispatchers.Default) {
            try { Widgets.refresh(context.applicationContext) } finally { done.finish() }
        }
    }
}

// MARK: - Вид

private enum class Family { SMALL, MEDIUM, LARGE }

@Composable
private fun PairWidgetContent(entry: PairEntry, style: WidgetStyle, walls: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val size = LocalSize.current
    val family = when {
        size.width < 200.dp -> Family.SMALL
        size.height >= 220.dp -> Family.LARGE
        else -> Family.MEDIUM
    }
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("safu://schedule"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    var root = GlanceModifier.fillMaxSize().clickable(actionStartActivity(open))
    if (Build.VERSION.SDK_INT >= 31) root = root.cornerRadius(22.dp)
    val wall = if (style.clear) walls[family.name.lowercase()] else null
    root = when {
        wall != null -> root.background(ImageProvider(wall), ContentScale.Crop)
        style.clear -> root
        else -> root.background(ImageProvider(style.background), ContentScale.FillBounds)
    }
    val v = WidgetView(entry, style)
    Box(root.padding(if (family == Family.MEDIUM) 12.dp else 14.dp)) {
        when (family) {
            Family.SMALL -> v.Small()
            Family.MEDIUM -> v.Medium()
            Family.LARGE -> v.Large()
        }
    }
}

private class WidgetView(val entry: PairEntry, val style: WidgetStyle) {
    val ink = style.ink
    val accent = style.accent
    /** Светлые буквы на тёмном фоне (все стили, кроме «Светлого») */
    val lightInk = style.ink == Color.White
    val slot: LessonSlot? = entry.current ?: entry.next
    val isNow = entry.current != null

    fun color(c: Color) = ColorProvider(c)

    fun ts(size: TextUnit, weight: FontWeight = FontWeight.Normal, c: Color = ink) = TextStyle(color = color(c), fontSize = size, fontWeight = weight)

    @Composable
    fun Icon(res: Int, c: Color, s: Int) {
        Image(ImageProvider(res), null, GlanceModifier.size(s.dp), colorFilter = ColorFilter.tint(color(c)))
    }

    @Composable
    fun RefreshButton() {
        // полупрозрачные подложки — готовыми картинками: до Android 12 Glance красит их неверно
        Box(GlanceModifier.size(24.dp).background(ImageProvider(if (lightInk) R.drawable.widget_circle_w else R.drawable.widget_circle_d))
            .clickable(actionRunCallback<RefreshWidgetAction>()), contentAlignment = Alignment.Center) {
            Icon(R.drawable.widget_ic_refresh, ink, 13)
        }
    }

    val updatedText: String get() = entry.lastSync?.let { "РУЗ ${hm(it)}" } ?: "не обновлялось"

    @Composable
    fun Header(text: String, c: Color = accent) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(if (isNow) R.drawable.widget_ic_live else R.drawable.ic_stat_snowflake, c, 12)
            Spacer(GlanceModifier.width(4.dp))
            Text(text, style = ts(11.sp, FontWeight.Bold, c), maxLines = 1)
        }
    }

    @Composable
    fun KindBadge(kind: String, size: Int = 9) {
        val k = KindStyle.of(kind)
        Box(GlanceModifier.background(ImageProvider(R.drawable.pill), ContentScale.FillBounds, ColorFilter.tint(color(k.color)))
            .padding(horizontal = (size * 0.7f).dp, vertical = (size * 0.2f).dp)) {
            Text(k.label.uppercase(), style = ts(size.sp, FontWeight.Bold, Color.White), maxLines = 1)
        }
    }

    fun whenText(s: LessonSlot): String {
        val name = WidgetData.dayName(s.start, entry.date)
        return if (name == "сегодня") "в ${hm(s.start)}" else "$name в ${hm(s.start)}"
    }

    /** Живой обратный отсчёт до момента t */
    @Composable
    fun Countdown(t: Instant, c: Color, size: Float = 11f) {
        val ctx = LocalContext.current
        val rv = RemoteViews(ctx.packageName, R.layout.widget_timer).apply {
            val left = t.toEpochMilli() - System.currentTimeMillis()
            setChronometer(R.id.timer, SystemClock.elapsedRealtime() + left, null, true)
            setChronometerCountDown(R.id.timer, true)
            setTextColor(R.id.timer, c.toArgb())
            setTextViewTextSize(R.id.timer, TypedValue.COMPLEX_UNIT_SP, size)
        }
        AndroidRemoteViews(rv)
    }

    @Composable
    fun TimeInfo(s: LessonSlot) {
        if (isNow) {
            val total = maxOf(60L, s.end.epochSecond - s.start.epochSecond).toFloat()
            val done = ((entry.date.epochSecond - s.start.epochSecond) / total).coerceIn(0f, 1f)
            Column {
                LinearProgressIndicator(done, GlanceModifier.fillMaxWidth().height(4.dp),
                    color = color(widgetSubjectColor(s.lesson.subject)), backgroundColor = color(ink.copy(alpha = 0.2f)))
                Spacer(GlanceModifier.height(3.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("до ${hm(s.end)} · ", style = ts(11.sp, FontWeight.Medium, ink.copy(alpha = 0.8f)), maxLines = 1)
                    Countdown(s.end, ink.copy(alpha = 0.8f))
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(whenText(s), style = ts(11.sp, FontWeight.Medium, accent), maxLines = 1)
                if (Cal.isSameDay(s.start, entry.date)) {
                    Text(" · через ", style = ts(11.sp, FontWeight.Medium, accent), maxLines = 1)
                    Countdown(s.start, accent)
                }
            }
        }
    }

    /** Аудитория и ПОЛНЫЙ адрес корпуса */
    @Composable
    fun PlaceBlock(s: LessonSlot, addressLines: Int = 2, size: Int = 12) {
        Column {
            if (s.lesson.room.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(R.drawable.widget_ic_door, ink, size)
                    Spacer(GlanceModifier.width(4.dp))
                    Text("ауд. ${s.lesson.room}", style = ts(size.sp, FontWeight.Bold), maxLines = 1)
                }
            }
            if (s.address.isNotEmpty()) {
                Row {
                    Icon(R.drawable.widget_ic_pin, ink.copy(alpha = 0.85f), size - 1)
                    Spacer(GlanceModifier.width(4.dp))
                    Text(AddressFormat.full(s.address), style = ts((size - 1).sp, FontWeight.Medium, ink.copy(alpha = 0.85f)), maxLines = addressLines)
                }
            }
        }
    }

    @Composable
    fun Empty() {
        Column(GlanceModifier.fillMaxSize()) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(GlanceModifier.defaultWeight()) { Header(if (entry.group.isEmpty()) "САФУ" else "САФУ · ${entry.group}") }
                if (entry.group.isNotEmpty()) RefreshButton()
            }
            Spacer(GlanceModifier.defaultWeight())
            Text(entry.status ?: "Пар на неделе нет", style = ts(14.sp, FontWeight.Bold))
            Text(if (entry.group.isEmpty()) "Группа берётся из приложения" else "Нажми ↻, чтобы загрузить из РУЗ",
                style = ts(10.sp, c = ink.copy(alpha = 0.6f)))
            Spacer(GlanceModifier.defaultWeight())
        }
    }

    // MARK: маленький

    @Composable
    fun Small() {
        val s = slot ?: return Empty()
        Column(GlanceModifier.fillMaxSize()) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(GlanceModifier.defaultWeight()) {
                    Header(if (isNow) "СЕЙЧАС · ${s.lesson.pair}" else "ДАЛЕЕ · ${s.lesson.pair}", widgetSubjectColor(s.lesson.subject))
                }
                RefreshButton()
            }
            Spacer(GlanceModifier.height(4.dp))
            KindBadge(s.lesson.kind)
            Spacer(GlanceModifier.height(4.dp))
            Text(s.lesson.subject, style = ts(14.sp, FontWeight.Bold), maxLines = 2)
            Spacer(GlanceModifier.defaultWeight())
            if (s.lesson.room.isNotEmpty() || s.address.isNotEmpty()) PlaceBlock(s, addressLines = 1, size = 11)
            TimeInfo(s)
        }
    }

    // MARK: средний

    @Composable
    fun Medium() {
        val s = slot ?: return Empty()
        Row(GlanceModifier.fillMaxSize()) {
            Column(GlanceModifier.defaultWeight().fillMaxHeight()) {
                Header(if (isNow) "СЕЙЧАС · ${s.lesson.pair} ПАРА" else "ДАЛЕЕ · ${s.lesson.pair} ПАРА", widgetSubjectColor(s.lesson.subject))
                Spacer(GlanceModifier.height(4.dp))
                Text(s.lesson.subject, style = ts(16.sp, FontWeight.Bold), maxLines = 2)
                Spacer(GlanceModifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    KindBadge(s.lesson.kind)
                    Spacer(GlanceModifier.width(5.dp))
                    Text("${hm(s.start)}–${hm(s.end)}", style = ts(11.sp, FontWeight.Medium, ink.copy(alpha = 0.75f)), maxLines = 1)
                }
                Spacer(GlanceModifier.defaultWeight())
                if (s.lesson.room.isNotEmpty() || s.address.isNotEmpty()) PlaceBlock(s)
                TimeInfo(s)
            }
            Spacer(GlanceModifier.width(12.dp))
            Column(GlanceModifier.width(124.dp).fillMaxHeight()) {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(entry.dayTitle.uppercase(), style = ts(10.sp, FontWeight.Bold, ink.copy(alpha = 0.6f)), maxLines = 1,
                        modifier = GlanceModifier.defaultWeight())
                    RefreshButton()
                }
                Spacer(GlanceModifier.height(4.dp))
                val rest = entry.daySlots.filter { it.key != s.key && it.end > entry.date }.take(3)
                if (rest.isEmpty()) {
                    Text(entry.tomorrowInfo.ifEmpty { "Больше пар нет" }.capitalizedFirstLetter(),
                        style = ts(11.sp, FontWeight.Medium, ink.copy(alpha = 0.8f)))
                } else {
                    // в строке или столбце виджета не больше 10 элементов — список отдельным столбцом
                    Column { for (r in rest) MiniRow(r) }
                }
                Spacer(GlanceModifier.defaultWeight())
                Text(updatedText, style = ts(9.sp, FontWeight.Medium, ink.copy(alpha = 0.45f)))
            }
        }
    }

    @Composable
    fun MiniRow(r: LessonSlot) {
        val k = KindStyle.of(r.lesson.kind)
        Row(GlanceModifier.padding(bottom = 4.dp)) {
            Box(GlanceModifier.width(3.dp).height(26.dp).background(k.color)) {}
            Spacer(GlanceModifier.width(6.dp))
            Column {
                Text("${hm(r.start)} · ${k.label}${if (r.lesson.room.isEmpty()) "" else " · ${r.lesson.room}"}",
                    style = ts(10.sp, FontWeight.Medium, ink.copy(alpha = 0.7f)), maxLines = 1)
                Text(r.lesson.subject, style = ts(11.sp, FontWeight.Bold), maxLines = 1)
            }
        }
    }

    // MARK: большой — весь день

    @Composable
    fun Large() {
        if (entry.daySlots.isEmpty() && slot == null) return Empty()
        Column(GlanceModifier.fillMaxSize()) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(GlanceModifier.defaultWeight()) {
                    Text(entry.dayTitle, style = ts(18.sp, FontWeight.Bold), maxLines = 1)
                    Text("Группа ${entry.group} · ${entry.daySlots.size} ${WidgetData.pairsWord(entry.daySlots.size)}",
                        style = ts(11.sp, FontWeight.Medium, ink.copy(alpha = 0.65f)), maxLines = 1)
                }
                RefreshButton()
            }
            Spacer(GlanceModifier.height(8.dp))
            val s = slot
            if (s != null && isNow) {
                Column(GlanceModifier.fillMaxWidth().background(ImageProvider(if (lightInk) R.drawable.widget_card_w else R.drawable.widget_card_d))
                    .padding(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Header("СЕЙЧАС", widgetSubjectColor(s.lesson.subject))
                        Spacer(GlanceModifier.width(6.dp))
                        KindBadge(s.lesson.kind)
                    }
                    Spacer(GlanceModifier.height(4.dp))
                    Text(s.lesson.subject, style = ts(15.sp, FontWeight.Bold), maxLines = 1)
                    if (s.lesson.room.isNotEmpty() || s.address.isNotEmpty()) PlaceBlock(s, addressLines = 1)
                    TimeInfo(s)
                }
                Spacer(GlanceModifier.height(8.dp))
            }
            Column(GlanceModifier.fillMaxWidth()) {
                for (r in entry.daySlots.take(if (s != null && isNow) 5 else 7)) LargeRow(r)
            }
            Spacer(GlanceModifier.defaultWeight())
            Row(GlanceModifier.fillMaxWidth()) {
                Text(entry.tomorrowInfo.capitalizedFirstLetter(), style = ts(10.sp, FontWeight.Medium, ink.copy(alpha = 0.55f)), maxLines = 1,
                    modifier = GlanceModifier.defaultWeight())
                Text(updatedText, style = ts(10.sp, FontWeight.Medium, ink.copy(alpha = 0.55f)), maxLines = 1)
            }
        }
    }

    @Composable
    fun LargeRow(r: LessonSlot) {
        val active = r.start <= entry.date && entry.date < r.end
        val past = r.end <= entry.date
        val a = if (past) 0.45f else 1f
        val k = KindStyle.of(r.lesson.kind)
        // отступ снаружи, подсветка текущей пары — внутри
        Box(GlanceModifier.fillMaxWidth().padding(bottom = 5.dp)) {
            var m = GlanceModifier.fillMaxWidth()
            if (active) m = m.background(ImageProvider(if (lightInk) R.drawable.widget_row_w else R.drawable.widget_row_d))
            Row(m.padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(GlanceModifier.width(34.dp), horizontalAlignment = Alignment.End) {
                    Text(hm(r.start), style = ts(11.sp, FontWeight.Bold, ink.copy(alpha = a)), maxLines = 1)
                    Text(hm(r.end), style = ts(9.sp, c = ink.copy(alpha = 0.6f * a)), maxLines = 1)
                }
                Spacer(GlanceModifier.width(8.dp))
                Box(GlanceModifier.width(4.dp).height(30.dp).background(k.color.copy(alpha = a))) {}
                Spacer(GlanceModifier.width(8.dp))
                Column(GlanceModifier.defaultWeight()) {
                    Text(r.lesson.subject, style = ts(12.sp, FontWeight.Bold, ink.copy(alpha = a)), maxLines = 1)
                    Text(listOf(if (r.lesson.room.isEmpty()) "" else "ауд. ${r.lesson.room}", AddressFormat.full(r.address), r.lesson.teacher)
                        .filter { it.isNotEmpty() }.joinToString(" · "),
                        style = ts(10.sp, FontWeight.Medium, ink.copy(alpha = 0.75f * a)), maxLines = 1)
                }
                if (active) {
                    Spacer(GlanceModifier.width(6.dp))
                    Box(GlanceModifier.size(7.dp).background(ImageProvider(R.drawable.widget_dot), ContentScale.FillBounds,
                        ColorFilter.tint(color(widgetSubjectColor(r.lesson.subject))))) {}
                }
            }
        }
    }
}
