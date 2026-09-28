package ru.student.safuhub.feature.fx

import android.graphics.Bitmap
import android.graphics.Paint
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.system.Notify
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.glass
import ru.student.safuhub.ui.kit.DateMode
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb
import java.time.Instant
import java.time.Year
import java.util.Locale
import java.util.UUID
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

// MARK: - Праздники и анимации
// Конфетти и поздравления: конец пар, конец недели, выполненная задача, сданный экзамен,
// праздники и день рождения. Каждый повод включается отдельно.

data class Celebration(
    val title: String,
    val subtitle: String,
    val style: Style,
    /** Пасхалки и игра показываются, даже если праздничные анимации выключены */
    val force: Boolean = false,
) {
    /** fireworks — салют из ракет + конфетти; big — длинный салют на конец недели */
    sealed class Style {
        data object Confetti : Style()
        data class Emoji(val list: List<String>) : Style()
        data class Fireworks(val big: Boolean) : Style()
    }

    val id: String = UUID.randomUUID().toString()
    /** Момент появления — от него считаются кадры анимации */
    val created: Long = System.nanoTime()

    /** Сколько висит на экране */
    val duration: Double get() = if (style is Style.Fireworks) (if (style.big) 7.5 else 6.0) else 4.2
}

object CelebrationCenter {
    val current = mutableStateOf<Celebration?>(null)

    fun fire(c: Celebration) {
        if (!Celebrations.on && !c.force) return
        AppScope.launch {
            Haptics.success()
            current.value = c
            // на салюте — ещё пара «хлопков» вибрацией
            if (c.style is Celebration.Style.Fireworks) {
                for (d in listOf(900L, 700L, 800L)) {
                    delay(d)
                    Haptics.rigid()
                }
            }
        }
        AppScope.launch {
            delay((c.duration * 1000).toLong())
            if (current.value?.id == c.id) current.value = null
        }
    }
}

object Celebrations {
    private fun flag(k: String, def: Boolean = true) = Defaults.boolOrNull(k) ?: def

    val on: Boolean get() = flag("fx.on")
    val dayEnd: Boolean get() = flag("fx.dayEnd")
    val weekEnd: Boolean get() = flag("fx.weekEnd")
    val tasks: Boolean get() = flag("fx.tasks")
    val exams: Boolean get() = flag("fx.exams")
    val holidays: Boolean get() = flag("fx.holidays")
    val birthday: Boolean get() = flag("fx.birthday")

    // MARK: разово за день

    private fun dayKey(date: Instant = Instant.now()) = "${Cal.year(date)}-${Cal.month(date)}-${Cal.day(date)}"

    private fun once(id: String): Boolean {
        val k = "fx.shown.$id.${dayKey()}"
        if (Defaults.bool(k)) return false
        Defaults.set(k, true)
        return true
    }

    // MARK: поводы

    /** Проверка при открытии приложения */
    fun checkOnOpen(data: ScheduleData) {
        if (!on) return
        val now = Instant.now()
        if (birthday && isBirthday(now) && once("bday")) {
            val name = (Defaults.string("user.name") ?: "").split(" ").firstOrNull { it.isNotEmpty() } ?: ""
            CelebrationCenter.fire(Celebration("С днём рождения${if (name.isEmpty()) "" else ", $name"}! 🎂",
                "Пусть все дедлайны будут далеко, а автоматы — близко",
                Celebration.Style.Emoji(listOf("🎂", "🎉", "🎈", "✨"))))
            return
        }
        if (holidays) {
            val h = Holiday.today(now)
            if (h != null && once("hol-${h.id}")) {
                CelebrationCenter.fire(Celebration(h.title, h.subtitle, h.style))
                return
            }
        }
        // конец пар / недели
        val today = Cal.startOfDay(now)
        val slots = ScheduleEngine.slots(today, data)
        val last = slots.lastOrNull() ?: return
        if (now < last.end || now >= last.end.plusSeconds(6 * 3600)) return
        val restOfWeekEmpty = weekDone(today, data)
        if (weekEnd && restOfWeekEmpty && once("week")) {
            CelebrationCenter.fire(Celebration("Неделя закрыта! 🎆", "Салют в твою честь — свободен до понедельника",
                Celebration.Style.Fireworks(big = true)))
        } else if (dayEnd && !restOfWeekEmpty && once("day")) {
            CelebrationCenter.fire(Celebration("Пары всё! 🎉", "${slots.size} ${pairsWord(slots.size)} позади. Можно выдохнуть",
                Celebration.Style.Fireworks(big = false)))
        }
    }

    /** После этого дня до конца недели пар больше нет? */
    fun weekDone(day: Instant, data: ScheduleData): Boolean {
        val wd = ScheduleEngine.weekday(day)
        if (wd >= 7) return true
        for (i in 1..(7 - wd)) {
            if (ScheduleEngine.slots(Cal.addDays(Cal.startOfDay(day), i), data).isNotEmpty()) return false
        }
        return true
    }

    /** Конец сегодняшней последней пары, если он ещё впереди */
    fun nextFinish(data: ScheduleData): Instant? {
        val last = ScheduleEngine.slots(Cal.startOfDay(Instant.now()), data).lastOrNull() ?: return null
        return if (last.end > Instant.now()) last.end else null
    }

    /**
     * «Пары всё!» и «Неделя закрыта!» уведомлением на 8 дней вперёд — придут, даже если приложение закрыто.
     * Нажал — открывается приложение, и там салют.
     */
    fun scheduleNotifications(data: ScheduleData) {
        Notify.remove((0 until 8).map { "fx.end.$it" })
        if (!on || !(dayEnd || weekEnd)) return
        val today = Cal.startOfDay(Instant.now())
        for (i in 0 until 8) {
            val day = Cal.addDays(today, i)
            val slots = ScheduleEngine.slots(day, data)
            val last = slots.lastOrNull() ?: continue
            if (last.end <= Instant.now()) continue
            val isWeek = weekDone(day, data)
            if (!(if (isWeek) weekEnd else dayEnd)) continue
            Notify.add("fx.end.$i",
                if (isWeek) "Неделя закрыта! 🎆" else "Пары всё! 🎉",
                if (isWeek) "Свободен до понедельника — открой, там салют в твою честь"
                else "${slots.size} ${pairsWord(slots.size)} позади. Можно выдохнуть",
                last.end.plusSeconds(20), Notify.CH_FUN)
        }
    }

    fun taskDone(title: String, left: Int) {
        if (!on || !tasks) return
        CelebrationCenter.fire(Celebration(if (left == 0) "Все задачи сделаны! 🏆" else "Готово! ✅",
            if (left == 0) "Ни одного хвоста — красота" else "«$title» закрыта. Осталось $left",
            Celebration.Style.Confetti))
    }

    fun examPassed(subject: String, grade: String) {
        if (!on || !exams) return
        CelebrationCenter.fire(Celebration("Сдано! 🎓", "$subject — $grade", Celebration.Style.Emoji(listOf("🎓", "🎉", "⭐️", "🔥"))))
    }

    fun test() {
        CelebrationCenter.fire(Celebration("Вот так это выглядит 🎆", "Салют и конфетти на месте", Celebration.Style.Fireworks(big = true)))
    }

    // MARK: день рождения

    val birthdayDate: Instant?
        get() {
            val v = Defaults.double("user.birthday")
            return if (v == 0.0) null else Instant.ofEpochMilli((v * 1000).toLong())
        }

    private fun isBirthday(now: Instant): Boolean {
        val b = birthdayDate ?: return false
        return Cal.day(b) == Cal.day(now) && Cal.month(b) == Cal.month(now)
    }

    fun pairsWord(n: Int): String {
        val m10 = n % 10
        val m100 = n % 100
        if (m10 == 1 && m100 != 11) return "пара"
        if (m10 in 2..4 && m100 !in 12..14) return "пары"
        return "пар"
    }
}

// MARK: - Праздники

data class Holiday(val id: String, val month: Int, val day: Int, val title: String, val subtitle: String, val style: Celebration.Style) {
    companion object {
        private fun e(vararg s: String) = Celebration.Style.Emoji(s.toList())

        val all: List<Holiday> = listOf(
            Holiday("ny", 1, 1, "С Новым годом! 🎄", "Пусть сессия сдастся сама", e("🎄", "❄️", "✨", "🎆")),
            Holiday("xmas", 1, 7, "С Рождеством! ⭐️", "Тепла и уюта", e("⭐️", "❄️", "🕯️")),
            Holiday("tatiana", 1, 25, "С Днём студента! 🎓", "Татьянин день — это твой праздник", e("🎓", "📚", "🎉", "✨")),
            Holiday("feb23", 2, 23, "С 23 Февраля! 🎖️", "Сил и стойкости", e("🎖️", "⭐️")),
            Holiday("mar8", 3, 8, "С 8 Марта! 💐", "Весны и хорошего настроения", e("💐", "🌷", "🌸", "✨")),
            Holiday("cosmos", 4, 12, "С Днём космонавтики! 🚀", "Поехали!", e("🚀", "🪐", "⭐️")),
            Holiday("may1", 5, 1, "С Первомаем! 🌷", "Весна, труд и отдых", e("🌷", "🌼", "☀️")),
            Holiday("may9", 5, 9, "С Днём Победы", "Помним", e("🕊️", "🌷")),
            Holiday("jun12", 6, 12, "С Днём России!", "Хороших выходных", Celebration.Style.Confetti),
            Holiday("sep1", 9, 1, "С Днём знаний! 📚", "Новый семестр — новый уровень", e("📚", "✏️", "🎓", "🍁")),
            Holiday("prog", 9, 13, "С Днём программиста! 💻", "256-й день года — свой праздник", e("💻", "⌨️", "🐛", "✨")),
            Holiday("nov4", 11, 4, "С Днём народного единства!", "Отдыхай", Celebration.Style.Confetti),
            Holiday("students", 11, 17, "С Международным днём студента! 🎓", "Учёба подождёт пять минут", e("🎓", "🎉", "📚")),
            Holiday("security", 11, 30, "С Днём защиты информации! 🔐", "Твой профессиональный праздник", e("🔐", "🛡️", "💾", "✨")),
            Holiday("nye", 12, 31, "Последний день года! 🎆", "Ты хорошо поработал", e("🎆", "🎄", "✨", "🥂")),
        )

        fun today(now: Instant): Holiday? {
            val m = Cal.month(now)
            val dd = Cal.day(now)
            // День программиста — 256-й день года (12 сентября в високосный)
            val progDay = if (Year.isLeap(Cal.year(now).toLong())) 12 else 13
            return all.firstOrNull { h -> if (h.id == "prog") m == 9 && dd == progDay else h.month == m && h.day == dd }
        }
    }
}

// MARK: - Отрисовка

@Composable
fun CelebrationOverlay() {
    val c = CelebrationCenter.current.value
    // последнее поздравление остаётся на время анимации ухода
    var last by remember { mutableStateOf<Celebration?>(null) }
    LaunchedEffect(c) { if (c != null) last = c }
    val s = c ?: last
    Box(Modifier.fillMaxSize()) {
        if (s != null) {
            val fw = s.style as? Celebration.Style.Fireworks
            AnimatedVisibility(c != null && fw != null, enter = fadeIn(), exit = fadeOut(tween(400))) {
                Box(Modifier.fillMaxSize()) {
                    // лёгкое затемнение, чтобы салют было видно и в светлой теме
                    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))
                    if (fw != null) androidx.compose.runtime.key(s.id) { FireworksShow(s.created, fw.big) }
                }
            }
            AnimatedVisibility(c != null, enter = fadeIn(), exit = fadeOut(tween(400))) {
                androidx.compose.runtime.key("confetti-${s.id}") { ConfettiBurst(s.style, s.created) }
            }
            AnimatedVisibility(c != null, Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically { it } + fadeIn() + scaleIn(initialScale = 0.9f),
                exit = slideOutVertically { it } + fadeOut() + scaleOut(targetScale = 0.9f)) {
                Column(
                    Modifier.padding(bottom = 110.dp, start = 16.dp, end = 16.dp).widthIn(max = 340.dp)
                        .shadow(18.dp, RoundedCornerShape(26.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
                        .glass(26.dp)
                        .clickable(remember { MutableInteractionSource() }, null) { CelebrationCenter.current.value = null }
                        .padding(horizontal = 22.dp, vertical = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(s.title, style = ft(Ts.title3, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label, textAlign = TextAlign.Center)
                    Text(s.subtitle, style = ft(Ts.subheadline), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
                }
            }
            // своя страховка: поздравление уходит само
            LaunchedEffect(s.id) {
                delay(((s.duration + 0.3) * 1000).toLong())
                if (CelebrationCenter.current.value?.id == s.id) CelebrationCenter.current.value = null
            }
        }
    }
}

/** Секунды с момента start; кадры идут, пока не пройдёт life */
@Composable
private fun rememberClock(start: Long, life: Double): Float {
    var t by remember { mutableFloatStateOf(((System.nanoTime() - start) / 1e9).toFloat()) }
    LaunchedEffect(start) {
        while (t < life) {
            withFrameNanos { now -> t = ((now - start) / 1e9).toFloat().coerceAtLeast(((System.nanoTime() - start) / 1e9).toFloat()) }
        }
    }
    return t
}

private class Piece(
    val x0: Double, val vx: Double, val vy: Double,
    val spin: Double, val flutter: Double, val phase: Double,
    val size: Double, val shape: Int, val color: Int, val emoji: Int,
)

private val confettiColors = listOf(
    rgb(1.00, 0.36, 0.36), rgb(1.00, 0.75, 0.20), rgb(0.30, 0.80, 0.45),
    rgb(0.25, 0.60, 1.00), rgb(0.70, 0.40, 1.00), rgb(1.00, 0.45, 0.75),
)

/**
 * Взрыв конфетти (или эмодзи) с гравитацией, вращением и трепетом.
 * Экономно: эмодзи растеризуются один раз, кадры перестают считаться, как только всё упало.
 */
@Composable
private fun ConfettiBurst(style: Celebration.Style, start: Long) {
    val life = 4.0
    val emojis = (style as? Celebration.Style.Emoji)?.list ?: emptyList()
    val density = LocalDensity.current.density
    val pieces = remember(start) {
        fun r(a: Double, b: Double) = Random.nextDouble(a, b)
        List(if (emojis.isEmpty()) 110 else 55) {
            Piece(r(0.1, 0.9), r(-0.35, 0.35), r(-1.25, -0.55), r(-8.0, 8.0), r(2.0, 6.0), r(0.0, 6.28),
                r(6.0, 11.0), r(0.0, 2.99).toInt(), r(0.0, 5.99).toInt(), r(0.0, 9.99).toInt())
        }
    }
    val symbols: List<ImageBitmap> = remember(emojis, density) { emojis.map { emojiBitmap(it, 26f * density * 1.2f) } }
    val t = rememberClock(start, life).toDouble()
    if (t >= life) return
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width.toDouble()
        val h = size.height.toDouble()
        val fade = max(0.0, min(1.0, (life - t) / 0.8)).toFloat()
        for (p in pieces) {
            // старт снизу-из центра вверх, потом падение
            val x = (p.x0 + p.vx * t + sin(t * p.flutter + p.phase) * 0.02) * w
            val y = (1.02 + p.vy * t + 0.55 * t * t) * h
            if (y > h + 40 * density) continue
            translate(x.toFloat(), y.toFloat()) {
                rotateRad((p.spin * t).toFloat(), Offset.Zero) {
                    if (symbols.isNotEmpty()) {
                        val img = symbols[p.emoji % symbols.size]
                        drawImage(img, Offset(-img.width / 2f, -img.height / 2f), alpha = fade)
                    } else {
                        scale(cos(t * p.flutter + p.phase).toFloat(), 1f, Offset.Zero) {
                            val s = (p.size * density).toFloat()
                            val hgt = if (p.shape == 0) s / 2 else s
                            val color = confettiColors[p.color % confettiColors.size].copy(alpha = fade)
                            if (p.shape == 2) drawOval(color, Offset(-s / 2, -s / 4), Size(s, hgt))
                            else drawRoundRect(color, Offset(-s / 2, -s / 4), Size(s, hgt), CornerRadius(1.5f * density))
                        }
                    }
                }
            }
        }
    }
}

/** Эмодзи → картинка (один раз на показ) */
private fun emojiBitmap(emoji: String, px: Float): ImageBitmap {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = px; textAlign = Paint.Align.CENTER }
    val fm = paint.fontMetrics
    val w = (paint.measureText(emoji) + 4).toInt().coerceAtLeast(1)
    val h = (fm.descent - fm.ascent + 4).toInt().coerceAtLeast(1)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    android.graphics.Canvas(bmp).drawText(emoji, w / 2f, -fm.ascent + 2, paint)
    return bmp.asImageBitmap()
}

private class Rocket(
    /** когда стартует, с */
    val launch: Double,
    /** откуда (доля ширины) */
    val x: Double,
    /** где взрывается (доли экрана) */
    val tx: Double, val ty: Double,
    val hue: Int, val count: Int,
    /** кольцо или шар */
    val ring: Boolean,
)

private val fireworksPalette = listOf(
    rgb(1.00, 0.35, 0.35) to rgb(1.00, 0.85, 0.55),
    rgb(1.00, 0.80, 0.25) to Color.White,
    rgb(0.35, 0.85, 1.00) to rgb(0.80, 0.95, 1.00),
    rgb(0.55, 1.00, 0.45) to rgb(0.95, 1.00, 0.70),
    rgb(0.85, 0.45, 1.00) to rgb(1.00, 0.75, 1.00),
    rgb(1.00, 0.55, 0.80) to Color.White,
)

/** Салют: ракеты со светящимся хвостом взлетают и разрываются шарами искр, которые оседают и гаснут */
@Composable
private fun FireworksShow(start: Long, big: Boolean) {
    val rockets = remember(start) {
        fun r(a: Double, b: Double) = Random.nextDouble(a, b)
        val n = if (big) 11 else 6
        val span = if (big) 4.6 else 3.0
        List(n) { i ->
            Rocket(i.toDouble() / n * span + r(0.0, 0.25), r(0.15, 0.85), r(0.15, 0.85), r(0.14, 0.42),
                r(0.0, 5.99).toInt(), r(34.0, 54.0).toInt(), r(0.0, 1.0) < 0.3)
        }
    }
    // после последней ракеты кадры больше не считаем
    val t = rememberClock(start, (if (big) 4.85 else 3.25) + 0.85 + 1.9 + 0.2).toDouble()
    val dp = LocalDensity.current.density
    // вспышки складываются и светятся
    Canvas(Modifier.fillMaxSize().graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }) {
        val w = size.width.toDouble()
        val h = size.height.toDouble()
        for ((i, rk) in rockets.withIndex()) {
            val lt = t - rk.launch
            if (lt <= 0) continue
            val rise = 0.85
            val colors = fireworksPalette[rk.hue % fireworksPalette.size]
            val sx = rk.x * w
            val sy = h + 10 * dp
            val ex = rk.tx * w
            val ey = rk.ty * h
            if (lt < rise) {
                // взлёт с замедлением и хвостом из искр
                val p = 1 - (1 - lt / rise).pow(2)
                val x = sx + (ex - sx) * p
                val y = sy + (ey - sy) * p
                for (k in 0 until 7) {
                    val back = k * 0.035
                    val pp = max(0.0, 1 - (1 - max(0.0, lt - back) / rise).pow(2))
                    val tx = sx + (ex - sx) * pp
                    val ty = sy + (ey - sy) * pp
                    val rr = (2.4 - k * 0.28) * dp
                    drawCircle(colors.second.copy(alpha = (0.9f - k * 0.12f).coerceIn(0f, 1f)), rr.toFloat(), Offset(tx.toFloat(), ty.toFloat()),
                        blendMode = BlendMode.Plus)
                }
                drawCircle(Color.White, 3 * dp, Offset(x.toFloat(), y.toFloat()), blendMode = BlendMode.Plus)
                continue
            }
            // взрыв
            val bt = lt - rise
            val life = 1.9
            if (bt >= life) continue
            val fade = max(0.0, 1 - bt / life)
            // вспышка в момент разрыва
            if (bt < 0.18) {
                val fr = ((40 * (1 - bt / 0.18) + 10) * dp).toFloat()
                val center = Offset(ex.toFloat(), ey.toFloat())
                drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.8f), colors.first.copy(alpha = 0f)), center, fr), fr, center,
                    blendMode = BlendMode.Plus)
            }
            val speed = (if (big) 150.0 else 125.0) * (if (rk.ring) 1.1 else 1.0) * dp
            // разлёт с торможением и лёгкой гравитацией
            val dist = speed * (1 - exp(-2.6 * bt))
            val fall = 38 * bt * bt * dp
            for (j in 0 until rk.count) {
                val a = j.toDouble() / rk.count * 2 * Math.PI + i * 0.37
                val jitter = if (rk.ring) 1.0 else 0.55 + 0.45 * abs(sin(j * 12.9898 + i))
                val px = ex + cos(a) * dist * jitter
                val py = ey + sin(a) * dist * jitter + fall
                // мерцание в конце
                val twinkle = if (bt > life * 0.55) 0.5 + 0.5 * sin(bt * 40 + j) else 1.0
                val rr = 1.9 * (0.6 + 0.4 * fade) * dp
                val col = (if (j % 3 == 0) colors.second else colors.first).copy(alpha = (fade * twinkle).toFloat().coerceIn(0f, 1f))
                drawCircle(col, rr.toFloat(), Offset(px.toFloat(), py.toFloat()), blendMode = BlendMode.Plus)
                // короткий след искры
                if (bt < 0.9) {
                    drawLine(colors.first.copy(alpha = (0.35 * fade).toFloat()), Offset(px.toFloat(), py.toFloat()),
                        Offset((ex + cos(a) * dist * jitter * 0.82).toFloat(), (ey + sin(a) * dist * jitter * 0.82 + fall * 0.8).toFloat()),
                        strokeWidth = 1.1f * dp, blendMode = BlendMode.Plus)
                }
            }
        }
    }
}

// MARK: - Настройки

@Composable
fun CelebrationSettingsScreen() {
    var on by prefBool("fx.on", true)
    var dayEnd by prefBool("fx.dayEnd", true)
    var weekEnd by prefBool("fx.weekEnd", true)
    var tasks by prefBool("fx.tasks", true)
    var exams by prefBool("fx.exams", true)
    var holidays by prefBool("fx.holidays", true)
    var birthday by prefBool("fx.birthday", true)
    val birthdayTS = Defaults.double("user.birthday")
    val bday = if (birthdayTS == 0.0) Cal.date(2007, 1, 1) ?: Instant.now() else Instant.ofEpochMilli((birthdayTS * 1000).toLong())

    FormScreen("Праздники") {
        FormSection(footer = "Конфетти и короткое поздравление внизу экрана. Не мешает: пропадает само через пару секунд, тап — сразу.") {
            toggle("Праздничные анимации", on, { on = it }, icon = "party.popper.fill")
            if (on) button("Показать сейчас", "sparkles") { Celebrations.test() }
        }
        if (on) {
            FormSection("Когда") {
                toggle("Закончились пары на сегодня", dayEnd, { dayEnd = it })
                toggle("Закончилась учебная неделя", weekEnd, { weekEnd = it })
                toggle("Выполнил задачу", tasks, { tasks = it })
                toggle("Сдал экзамен или зачёт", exams, { exams = it })
                toggle("Праздники", holidays, { holidays = it })
                toggle("День рождения", birthday, { birthday = it })
                if (birthday) date("Дата рождения", bday, { Defaults.set("user.birthday", it.toEpochMilli() / 1000.0) }, DateMode.DATE)
            }
            FormSection("Какие праздники", footer = "Среди них — День студента, День программиста и 30 ноября — День защиты информации.") {
                for (h in Holiday.all) row {
                    Text(h.title, style = ft(Ts.subheadline), color = Ios.label, modifier = Modifier.weight(1f))
                    Text("${h.day}.${String.format(Locale.US, "%02d", h.month)}", style = ft(Ts.caption, mono = true), color = Ios.secondaryLabel)
                }
            }
        }
    }
}
