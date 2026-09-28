package ru.student.safuhub.feature.game

import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.core.content.res.ResourcesCompat
import ru.student.safuhub.R
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.feature.eggs.Egg
import ru.student.safuhub.feature.eggs.Eggs
import ru.student.safuhub.feature.fx.Celebration
import ru.student.safuhub.feature.fx.CelebrationCenter
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfIcon
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

// MARK: - Мини-игра «Трасса 150»
// Автобус едет из Северодвинска в Архангельск. Тап — прыжок (в воздухе можно ещё раз).
// Ямы, конусы, снеговики и лоси. ☕️ — +1 км, ⚡️ — турбо: несёшься и сносишь всё на пути.
// Пять чистых прыжков подряд — бонус. По дороге день сменяется закатом и ночью с северным сиянием.
// Доехал 60 км — успел на пару.

private fun rnd(a: Double, b: Double) = Random.nextDouble(a, b)

private class GRect(val x: Double, val y: Double, val w: Double, val h: Double) {
    fun intersects(o: GRect) = x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h
}

class BusGame {
    enum class Phase { READY, RUNNING, OVER, WON }

    enum class Kind(val w: Double, val h: Double, val emoji: String, val font: Double) {
        PIT(46.0, 14.0, "🕳️", 34.0), CONE(28.0, 34.0, "🚧", 36.0), SNOWMAN(44.0, 42.0, "⛄️", 44.0), MOOSE(54.0, 56.0, "🫎", 56.0)
    }

    class Obstacle(var x: Double, val kind: Kind) {
        var cleared = false
        var flung = false
        var fy = 0.0
        var fvy = 0.0
        var spin = 0.0
    }

    class Pickup(var x: Double, val y: Double, val turbo: Boolean) { var taken = false }
    class Particle(var x: Double, var y: Double, var vx: Double, var vy: Double, val life: Double, val size: Double, val kind: Int) { var age = 0.0 }
    class Floater(val x: Double, var y: Double, val text: String, val big: Boolean) { var age = 0.0 }

    var phase = Phase.READY
    var last: Double? = null
    /** высота над дорогой */
    var y = 0.0
    var vy = 0.0
    var jumps = 0
    var speed = 260.0
    /** пиксели */
    var distance = 0.0
    var bonusKm = 0.0
    val obstacles = mutableListOf<Obstacle>()
    val pickups = mutableListOf<Pickup>()
    val particles = mutableListOf<Particle>()
    val floaters = mutableListOf<Floater>()
    var spawnIn = 1.2
    var coffeeIn = 3.0
    var turboIn = 16.0
    var exhaustIn = 0.0
    var elapsed = 0.0
    var shake = 0.0
    var squash = 0.0
    /** секунды турбо */
    var turbo = 0.0
    var combo = 0
    var bestCombo = 0
    var checkpoint = 1
    var newRecord = false
    var overAt: Double? = null
    /** Текущее время кадра (секунды) */
    var now = 0.0

    companion object {
        const val goalKm = 60.0
        const val pxPerKm = 520.0

        var best: Double
            get() = Defaults.double("game.best")
            set(v) = Defaults.set("game.best", v)
    }

    val km: Double get() = min(goalKm, distance / pxPerKm + bonusKm)

    fun reset() {
        phase = Phase.RUNNING
        last = null; y = 0.0; vy = 0.0; jumps = 0; speed = 260.0; distance = 0.0; bonusKm = 0.0
        obstacles.clear(); pickups.clear(); particles.clear(); floaters.clear()
        spawnIn = 1.2; coffeeIn = 3.0; turboIn = 16.0; exhaustIn = 0.0; elapsed = 0.0
        shake = 0.0; squash = 0.0; turbo = 0.0; combo = 0; bestCombo = 0; checkpoint = 1; newRecord = false; overAt = null
    }

    fun tap() {
        when (phase) {
            Phase.READY, Phase.WON -> {
                reset()
                Haptics.tap()
            }
            Phase.OVER -> {
                // не перезапускаем случайным тапом сразу после аварии
                overAt?.let { if (now - it < 0.7) return }
                reset()
                Haptics.tap()
            }
            Phase.RUNNING -> if (jumps < 2) {
                vy = if (jumps == 0) 820.0 else 720.0
                jumps += 1
                Haptics.tap()
            }
        }
    }

    private fun float(text: String, x: Double, y: Double, big: Boolean = false) {
        floaters.add(Floater(x, y, text, big))
    }

    private fun burst(x: Double, y: Double, count: Int, kind: Int, power: Double) {
        repeat(count) {
            val a = rnd(0.0, 2 * Math.PI)
            val v = rnd(0.3, 1.0) * power
            particles.add(Particle(x, y, cos(a) * v, sin(a) * v - power * 0.3, rnd(0.4, 1.0), rnd(2.0, 6.0), kind))
        }
    }

    fun update(t: Double, width: Double, ground: Double, busX: Double) {
        now = t
        val dt = min(1.0 / 20, t - (last ?: t))
        last = t
        shake = max(0.0, shake - dt * 2.5)
        squash = max(0.0, squash - dt * 5)

        // частицы и надписи живут и после аварии
        for (p in particles) {
            p.age += dt
            p.x += p.vx * dt
            p.y += p.vy * dt
            if (p.kind != 0) p.vy += 900 * dt
        }
        particles.removeAll { it.age > it.life }
        for (f in floaters) { f.age += dt; f.y -= 40 * dt }
        floaters.removeAll { it.age > (if (it.big) 2.2 else 1.1) }
        for (o in obstacles) if (o.flung) {
            o.fvy += 1600 * dt
            o.fy += o.fvy * dt
            o.spin += dt * 9
            o.x += 220 * dt
        }

        if (phase != Phase.RUNNING) return
        elapsed += dt

        if (turbo > 0) turbo = max(0.0, turbo - dt)
        val base = min(640.0, 260 + elapsed * 9)
        speed = if (turbo > 0) base * 1.55 else base
        distance += speed * dt

        // прыжок
        val wasAir = y > 0
        vy -= 2500 * dt
        y += vy * dt
        if (y <= 0) {
            if (wasAir && vy < -300) {
                squash = 1.0
                burst(busX, ground - 2, 6, 1, 120.0)
            }
            y = 0.0; vy = 0.0; jumps = 0
        }

        // выхлоп
        exhaustIn -= dt
        if (exhaustIn <= 0) {
            exhaustIn = if (turbo > 0) 0.025 else 0.06
            particles.add(Particle(busX - 30, ground - y - 12, -speed * 0.25 - 40, rnd(-50.0, -15.0), 0.7, rnd(5.0, 9.0), if (turbo > 0) 3 else 0))
        }

        // препятствия
        for (o in obstacles) if (!o.flung) o.x -= speed * dt
        obstacles.removeAll { it.x < -90 || it.fy > 900 }
        spawnIn -= dt
        if (spawnIn <= 0) {
            val kinds = mutableListOf(Kind.PIT, Kind.CONE, Kind.SNOWMAN, Kind.PIT, Kind.CONE)
            if (km > 12) kinds.add(Kind.MOOSE)
            if (km > 35) kinds.add(Kind.MOOSE)
            obstacles.add(Obstacle(width + 60, kinds.random()))
            spawnIn = rnd(0.75, 1.6) * (340 / speed + 0.35)
        }

        // кофе и турбо
        for (p in pickups) p.x -= speed * dt
        pickups.removeAll { it.x < -40 || it.taken }
        coffeeIn -= dt
        if (coffeeIn <= 0) {
            pickups.add(Pickup(width + 40, rnd(70.0, 150.0), false))
            coffeeIn = rnd(3.0, 6.0)
        }
        turboIn -= dt
        if (turboIn <= 0) {
            pickups.add(Pickup(width + 40, rnd(110.0, 170.0), true))
            turboIn = rnd(18.0, 28.0)
        }

        // столкновения
        val busRect = GRect(busX - 24, ground - y - 34, 50.0, 30.0)
        for (o in obstacles) {
            if (o.flung) continue
            val r = GRect(o.x - o.kind.w / 2 + 6, ground - o.kind.h + 4, o.kind.w - 12, o.kind.h - 4)
            if (busRect.intersects(r)) {
                if (turbo > 0) {
                    o.flung = true
                    o.fvy = -700.0
                    shake = max(shake, 0.4)
                    burst(o.x, ground - o.kind.h / 2, 10, 2, 320.0)
                    float(listOf("БАХ!", "ХРЯСЬ!", "С ДОРОГИ!").random(), o.x, ground - 80)
                    Haptics.tap()
                    continue
                }
                phase = Phase.OVER
                overAt = t
                shake = 1.0
                combo = 0
                burst(busX, ground - y - 20, 30, 2, 420.0)
                float("💥", busX, ground - y - 30, big = true)
                if (km > best) { best = km; newRecord = true }
                Haptics.success()
                return
            }
            // чистый прыжок через препятствие
            if (!o.cleared && o.x < busX - 30) {
                o.cleared = true
                combo += 1
                bestCombo = max(bestCombo, combo)
                if (combo % 5 == 0) {
                    bonusKm += 1
                    float("Комбо ×$combo · +1 км", busX + 40, ground - 150, big = true)
                    Haptics.success()
                }
            }
        }
        for (p in pickups) {
            if (p.taken) continue
            val r = GRect(p.x - 16, ground - p.y - 16, 32.0, 32.0)
            if (busRect.intersects(r)) {
                p.taken = true
                if (p.turbo) {
                    turbo = 4.0
                    float("ТУРБО ⚡️", busX + 30, ground - 170, big = true)
                    burst(p.x, ground - p.y, 14, 3, 260.0)
                    Haptics.success()
                } else {
                    bonusKm += 1
                    float("+1 км ☕️", p.x, ground - p.y - 20)
                    Haptics.tap()
                }
            }
        }

        // отметки на трассе
        val marks = listOf(15.0 to "15 км · держись", 30.0 to "Полпути! ☕️", 45.0 to "Финишная прямая 🔥")
        if (checkpoint <= marks.size && km >= marks[checkpoint - 1].first) {
            float(marks[checkpoint - 1].second, width / 2, ground * 0.5, big = true)
            checkpoint += 1
            Haptics.success()
        }

        if (km >= goalKm) {
            phase = Phase.WON
            best = goalKm
            Eggs.mark(Egg.ARRIVED)
            burst(busX, ground - 40, 40, 3, 500.0)
            CelebrationCenter.fire(Celebration("Доехал! Успел на пару 🎓", "60 км за ${elapsed.toInt()} сек. Ты легенда трассы 150",
                Celebration.Style.Emoji(listOf("🚌", "🎓", "☕️", "🎉")), force = true))
        }
    }
}

// MARK: - Экран

@Composable
fun BusGameScreen() {
    val dismiss = LocalDismiss.current
    val ctx = LocalContext.current
    val game = remember { BusGame() }
    var frame by remember { mutableLongStateOf(0L) }
    var box by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current.density
    val text = remember { GameText(ResourcesCompat.getFont(ctx, R.font.nunito_800) ?: Typeface.DEFAULT_BOLD) }

    LaunchedEffect(Unit) {
        while (true) {
            withFrameNanos { n ->
                val w = box.width / density.toDouble()
                val h = box.height / density.toDouble()
                if (w > 0) game.update(n / 1e9, w, h * 0.70, w * 0.22)
                frame = n
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black).onSizeChanged { box = it }.pointerInput(Unit) { detectTapGestures { game.tap() } }) {
        val t = (frame / 1e9) % 10_000
        val p = if (game.phase == BusGame.Phase.READY) 0.0 else game.km / BusGame.goalKm
        val night = min(1.0, max(0.0, (p - 0.55) / 0.3))
        Box(Modifier.fillMaxSize().graphicsLayer {
            if (game.shake > 0) {
                translationX = (sin(t * 60) * 9 * game.shake * density).toFloat()
                translationY = (cos(t * 47) * 5 * game.shake * density).toFloat()
            }
        }) {
            Canvas(Modifier.fillMaxSize()) { frame; inPoints { w, h -> drawSky(w, h, t, p, night) } }
            // северное сияние — размытыми полосами, вспышки складываются
            if (night > 0) {
                Canvas(Modifier.fillMaxSize().graphicsLayer {
                    if (Build.VERSION.SDK_INT >= 31) renderEffect = BlurEffect(14 * density, 14 * density, TileMode.Decal)
                    blendMode = BlendMode.Plus
                }) { frame; inPoints { w, h -> drawAurora(w, h, t, night) } }
            }
            Canvas(Modifier.fillMaxSize()) { frame; inPoints { w, h -> drawWorld(game, text, w, h, t, p, night) } }
        }
        Pressable(dismiss, Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(end = 18.dp, top = 8.dp)) {
            Box(Modifier.size(38.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                SfIcon("xmark", size = 17.dp, tint = Color.White)
            }
        }
    }
}

/** Рисуем в точках (как в iOS): масштаб плотности экрана */
private inline fun DrawScope.inPoints(block: DrawScope.(w: Double, h: Double) -> Unit) {
    val d = density
    withTransform({ scale(d, d, Offset.Zero) }) { block(size.width / d.toDouble(), size.height / d.toDouble()) }
}

// MARK: цвета по ходу поездки: день → закат → ночь

private data class Tint(val r: Double, val g: Double, val b: Double) {
    fun color(o: Double = 1.0) = Color(r.toFloat().coerceIn(0f, 1f), g.toFloat().coerceIn(0f, 1f), b.toFloat().coerceIn(0f, 1f),
        o.toFloat().coerceIn(0f, 1f))

    companion object {
        fun mix(a: Tint, b: Tint, f0: Double): Tint {
            val f = min(1.0, max(0.0, f0))
            return Tint(a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f)
        }

        fun ramp(p: Double, keys: List<Pair<Double, Tint>>): Tint {
            if (p <= keys.first().first) return keys.first().second
            for (i in 1 until keys.size) if (p <= keys[i].first) {
                return mix(keys[i - 1].second, keys[i].second, (p - keys[i - 1].first) / (keys[i].first - keys[i - 1].first))
            }
            return keys.last().second
        }
    }
}

private fun noise(i: Int): Double {
    val v = sin(i * 12.9898 + 78.233) * 43758.5453
    return v - floor(v)
}

private fun skyTop(p: Double) = Tint.ramp(p, listOf(0.0 to Tint(0.36, 0.64, 0.96), 0.4 to Tint(0.3, 0.42, 0.82),
    0.62 to Tint(0.2, 0.14, 0.4), 0.85 to Tint(0.03, 0.04, 0.13)))

private fun skyBottom(p: Double) = Tint.ramp(p, listOf(0.0 to Tint(0.82, 0.92, 1.0), 0.4 to Tint(1.0, 0.74, 0.48),
    0.62 to Tint(0.96, 0.42, 0.32), 0.85 to Tint(0.1, 0.1, 0.26)))

private fun f(v: Double) = v.toFloat()
private fun o(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())

private fun DrawScope.oval(x: Double, y: Double, w: Double, h: Double, color: Color, blend: BlendMode = BlendMode.SrcOver) =
    drawOval(color, o(x, y), Size(f(w), f(h)), blendMode = blend)

private fun DrawScope.rect(x: Double, y: Double, w: Double, h: Double, color: Color) = drawRect(color, o(x, y), Size(f(w), f(h)))

private fun DrawScope.drawSky(w: Double, h: Double, t: Double, p: Double, night: Double) {
    val ground = h * 0.70
    // небо
    val top = skyTop(p)
    val bottom = skyBottom(p)
    drawRect(Brush.verticalGradient(listOf(top.color(), bottom.color()), 0f, f(ground)), o(-20.0, -20.0), Size(f(w + 40), f(ground + 20)))
    // звёзды
    if (night > 0) {
        for (i in 0 until 70) {
            val stx = noise(i) * w
            val sty = noise(i + 500) * ground * 0.75
            val tw = 0.5 + 0.5 * sin(t * (1 + noise(i + 900) * 3) + i)
            val r = 0.6 + noise(i + 300) * 1.2
            oval(stx - r, sty - r, r * 2, r * 2, Color.White.copy(alpha = f(night * (0.35 + 0.65 * tw))))
        }
    }
}

private fun DrawScope.drawAurora(w: Double, h: Double, t: Double, night: Double) {
    val ground = h * 0.70
    for (band in 0 until 3) {
        val path = Path()
        val baseY = ground * (0.18 + band * 0.09)
        path.moveTo(-20f, f(baseY))
        var ax = -20.0
        while (ax <= w + 20) {
            val yy = baseY + sin(ax / 70 + t * 0.6 + band * 2) * 18 + sin(ax / 31 - t * 0.9) * 7
            path.lineTo(f(ax), f(yy))
            ax += 10
        }
        path.lineTo(f(w + 20), f(baseY + 90))
        path.lineTo(-20f, f(baseY + 90))
        path.close()
        val c = if (band == 1) Color(0.4f, 0.6f, 1f) else Color(0.25f, 1f, 0.55f)
        val strength = if (Build.VERSION.SDK_INT >= 31) 0.55 else 0.4
        drawPath(path, Brush.verticalGradient(listOf(c.copy(alpha = f(strength * night)), c.copy(alpha = 0f)), f(baseY - 20), f(baseY + 90)))
    }
}

/** Шрифты для надписей на холсте */
private class GameText(private val rounded: Typeface) {
    private val cache = HashMap<String, TextPaint>()

    fun paint(size: Double, kind: Int = 0, color: Color = Color.White): TextPaint {
        val key = "$size|$kind"
        val p = cache.getOrPut(key) {
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = size.toFloat()
                typeface = when (kind) {
                    1 -> rounded                                   // .heavy .rounded
                    2 -> Typeface.DEFAULT_BOLD                      // .bold
                    3 -> Typeface.create("sans-serif-medium", Typeface.NORMAL) // .semibold
                    else -> Typeface.DEFAULT                        // эмодзи
                }
            }
        }
        p.color = color.toArgb()
        return p
    }
}

/** Надпись с опорной точкой: 0 — по центру, -1 — слева, 1 — справа */
private fun DrawScope.text(s: String, x: Double, y: Double, paint: TextPaint, anchor: Int = 0) {
    val fm = paint.fontMetrics
    val base = f(y) - (fm.ascent + fm.descent) / 2
    val width = paint.measureText(s)
    val left = when (anchor) {
        -1 -> f(x)
        1 -> f(x) - width
        else -> f(x) - width / 2
    }
    drawContext.canvas.nativeCanvas.drawText(s, left, base, paint)
}

private fun DrawScope.drawWorld(game: BusGame, tx: GameText, w: Double, h: Double, t: Double, p: Double, night: Double) {
    val ground = h * 0.70
    val busX = w * 0.22
    val top = skyTop(p)
    val bottom = skyBottom(p)

    // солнце садится, луна встаёт
    val sunY = ground * (0.18 + p * 1.05)
    if (sunY < ground + 40) {
        val sunC = Tint.mix(Tint(1.0, 0.95, 0.7), Tint(1.0, 0.45, 0.2), p * 1.6)
        val c = o(w * 0.74, sunY)
        drawCircle(Brush.radialGradient(listOf(sunC.color(0.5), sunC.color(0.0)), c, 70f), 70f, c)
        drawCircle(sunC.color(), 24f, c)
    }
    if (night > 0) {
        val my = ground * (0.55 - 0.35 * night)
        oval(w * 0.3 - 16, my - 16, 32.0, 32.0, Color(0.95f, 0.95f, 0.85f, f(night)))
        oval(w * 0.3 - 9, my - 19, 32.0, 32.0, top.color(night))
    }

    // дальние холмы
    val hill = Tint.mix(Tint.mix(bottom, Tint(0.2, 0.3, 0.4), 0.55), Tint(0.04, 0.05, 0.1), night)
    val hills = Path()
    hills.moveTo(-20f, f(ground))
    var hx = -20.0
    val hoff = game.distance * 0.04
    while (hx <= w + 20) {
        val yy = ground - 50 - sin((hx + hoff) / 120) * 18 - sin((hx + hoff) / 47) * 8
        hills.lineTo(f(hx), f(yy))
        hx += 12
    }
    hills.lineTo(f(w + 20), f(ground))
    hills.close()
    drawPath(hills, hill.color())

    // дома (параллакс)
    val city = Tint.mix(Tint.mix(bottom, Tint(0.1, 0.12, 0.18), 0.6), Tint(0.03, 0.03, 0.07), night)
    val off = game.distance * 0.15
    var x = -(off % 90)
    var i = (off / 90).toInt()
    while (x < w + 90) {
        val bh = 30.0 + (i * 37) % 60
        rect(x, ground - bh - 26, 64.0, bh + 26, city.color(0.95))
        if (night > 0.2) {
            var wy = ground - bh - 18
            while (wy < ground - 20) {
                for (wx in listOf(x + 10, x + 28, x + 46)) {
                    if (((wx + wy).toInt() / 7 + i) % 3 == 0) rect(wx, wy, 6.0, 7.0, Color(1f, 0.8f, 0f, f(0.7 * night)))
                }
                wy += 14
            }
        }
        x += 90; i += 1
    }

    // ёлки у дороги
    val pine = Tint.mix(Tint(0.1, 0.32, 0.22), Tint(0.02, 0.07, 0.06), night)
    val poff = game.distance * 0.4
    var px = -(poff % 38)
    var pineIdx = (poff / 38).toInt()
    while (px < w + 40) {
        val ph = 34 + noise(pineIdx) * 40
        val tree = Path().apply {
            moveTo(f(px), f(ground - ph)); lineTo(f(px + 15), f(ground - 4)); lineTo(f(px - 15), f(ground - 4)); close()
        }
        drawPath(tree, pine.color())
        if (night < 0.5) {
            // снег на макушке
            val cap = Path().apply {
                moveTo(f(px), f(ground - ph)); lineTo(f(px + 5), f(ground - ph + 10)); lineTo(f(px - 5), f(ground - ph + 10)); close()
            }
            drawPath(cap, Color.White.copy(alpha = f(0.85 * (1 - night * 2)).coerceIn(0f, 1f)))
        }
        px += 38; pineIdx += 1
    }

    // дорога с обочиной
    val kerb = f(0.85 - 0.6 * night)
    rect(-20.0, ground - 4, w + 40, 6.0, Color(kerb, kerb, kerb))
    val r1 = f(0.3 - 0.16 * night)
    val r2 = f(0.18 - 0.12 * night)
    drawRect(Brush.verticalGradient(listOf(Color(r1, r1, r1), Color(r2, r2, r2)), f(ground), f(h)), o(-20.0, ground), Size(f(w + 40), f(h - ground + 20)))
    var dx = -(game.distance % 60)
    while (dx < w) {
        rect(dx, ground + 34, 30.0, 4.0, Color.White.copy(alpha = 0.7f))
        dx += 60
    }
    // столбики со светоотражателями
    val postGap = 180.0
    var sx = -(game.distance % postGap)
    while (sx < w + 20) {
        rect(sx, ground + 44, 4.0, 18.0, Color.White.copy(alpha = 0.8f))
        rect(sx, ground + 46, 4.0, 5.0, Color(1f, 0.58f, 0f, f(0.6 + 0.4 * night)))
        sx += postGap
    }
    // километровые знаки каждые 5 км
    val signGap = BusGame.pxPerKm * 5
    val firstSign = ceil(game.distance / signGap)
    val signX = firstSign * signGap - game.distance + busX
    if (firstSign > 0 && signX < w + 60) {
        val n = firstSign.toInt() * 5
        rect(signX - 1.5, ground - 58, 3.0, 58.0, Color(0.55f, 0.55f, 0.55f))
        drawRoundRect(Color(0.1f, 0.45f, 0.25f), o(signX - 26, ground - 82), Size(52f, 26f), CornerRadius(4f))
        drawRoundRect(Color.White, o(signX - 24, ground - 80), Size(48f, 22f), CornerRadius(3f), style = Stroke(1f))
        text("$n км", signX, ground - 69, tx.paint(12.0, 1))
    }

    // фары ночью
    if (night > 0.25) {
        val by = ground - game.y - 14
        val beam = Path().apply {
            moveTo(f(busX + 26), f(by)); lineTo(f(busX + 230), f(by - 30)); lineTo(f(busX + 230), f(by + 36)); close()
        }
        drawPath(beam, Brush.horizontalGradient(listOf(Color(1f, 0.8f, 0f, f(0.45 * night)), Color.Transparent), f(busX + 26), f(busX + 230)),
            blendMode = BlendMode.Plus)
    }

    // препятствия
    for (ob in game.obstacles) {
        translate(f(ob.x), f(ground - ob.kind.h / 2 + (if (ob.kind == BusGame.Kind.PIT) 6 else 0) + ob.fy)) {
            rotateRad(if (ob.flung) f(ob.spin) else 0f, Offset.Zero) {
                // лось смотрит на автобус
                scale(if (ob.kind == BusGame.Kind.MOOSE) -1f else 1f, 1f, Offset.Zero) {
                    text(ob.kind.emoji, 0.0, 0.0, tx.paint(ob.kind.font))
                }
            }
        }
    }
    // кофе и турбо
    for (pk in game.pickups) {
        val bob = sin(t * 4 + pk.x / 40) * 5
        val pt = o(pk.x, ground - pk.y + bob)
        if (pk.turbo) {
            drawCircle(Brush.radialGradient(listOf(Color(1f, 0.8f, 0f, 0.7f), Color.Transparent), pt, 26f), 26f, pt, blendMode = BlendMode.Plus)
        }
        text(if (pk.turbo) "⚡️" else "☕️", pk.x, ground - pk.y + bob, tx.paint(if (pk.turbo) 30.0 else 26.0))
    }

    // частицы
    for (pt in game.particles) {
        val a = max(0.0, 1 - pt.age / pt.life)
        val r = if (pt.kind == 0) pt.size * (1 + pt.age * 2) else pt.size
        when (pt.kind) {
            0 -> oval(pt.x - r, pt.y - r, r * 2, r * 2, Color(0.75f, 0.75f, 0.75f, f(0.45 * a)))
            1 -> oval(pt.x - r, pt.y - r, r * 2, r * 2, Color(0.8f, 0.75f, 0.7f, f(0.7 * a)))
            2 -> oval(pt.x - r, pt.y - r, r * 2, r * 2, Color(1f, f(0.6 * a + 0.2), 0.1f, f(a)))
            else -> oval(pt.x - r, pt.y - r, r * 2, r * 2, Color(1f, 0.85f, 0.3f, f(a)), BlendMode.Plus)
        }
    }

    // автобус (эмодзи смотрит влево — отражаем)
    val busY = ground - game.y - 20
    if (game.turbo > 0) {
        val pulse = 0.6 + 0.4 * sin(t * 20)
        drawOval(Brush.radialGradient(listOf(Color(1f, 0.8f, 0f, f(0.55 * pulse)), Color.Transparent), o(busX, busY), 50f),
            o(busX - 50, busY - 44), Size(100f, 88f), blendMode = BlendMode.Plus)
        text("🔥", busX - 40, busY + 6, tx.paint(26.0))
    }
    translate(f(busX), f(busY + game.squash * 6)) {
        val tilt = if (game.y > 0) max(-14.0, min(10.0, -game.vy / 80)) else 0.0
        rotate(f(tilt + if (game.phase == BusGame.Phase.OVER) 18.0 else 0.0), Offset.Zero) {
            scale(f(-(1 + game.squash * 0.12)), f(1 - game.squash * 0.15), Offset.Zero) {
                text("🚌", 0.0, 0.0, tx.paint(50.0))
            }
        }
    }

    // всплывающие надписи
    for (fl in game.floaters) {
        val a = max(0.0, 1 - fl.age / (if (fl.big) 2.2 else 1.1))
        val s = if (fl.big) 24.0 else 17.0
        val pop = if (fl.age < 0.15) 0.6 + fl.age / 0.15 * 0.4 else 1.0
        translate(f(fl.x), f(fl.y)) {
            scale(f(pop), f(pop), Offset.Zero) {
                text(fl.text, 0.0, 0.0, tx.paint(s, 1, Color.White.copy(alpha = f(a))))
            }
        }
    }

    // табло
    val km = game.km
    text("${km.toInt()} / ${BusGame.goalKm.toInt()} км", 24.0, 60.0, tx.paint(24.0, 1), anchor = -1)
    var sub = "рекорд ${BusGame.best.toInt()} км"
    if (game.combo >= 2) sub += "  ·  комбо ×${game.combo}"
    text(sub, 24.0, 86.0, tx.paint(13.0, 2, Color.White.copy(alpha = 0.85f)), anchor = -1)
    // прогресс по трассе
    val barW = w - 48
    drawRoundRect(Color.White.copy(alpha = 0.25f), o(24.0, 104.0), Size(f(barW), 6f), CornerRadius(3f))
    drawRoundRect(Brush.horizontalGradient(listOf(Color(1f, 0.58f, 0f), Color(1f, 0.8f, 0f)), 24f, f(24 + barW)), o(24.0, 104.0),
        Size(f(barW * km / BusGame.goalKm), 6f), CornerRadius(3f))
    translate(f(24 + barW * km / BusGame.goalKm), 106f) {
        scale(-1f, 1f, Offset.Zero) { text("🚌", 0.0, 0.0, tx.paint(14.0)) }
    }
    text("Северодвинск", 24.0, 124.0, tx.paint(10.0, 2, Color.White.copy(alpha = 0.8f)), anchor = -1)
    text("Архангельск", w - 24, 124.0, tx.paint(10.0, 2, Color.White.copy(alpha = 0.8f)), anchor = 1)
    if (game.turbo > 0) {
        drawRoundRect(Color.White.copy(alpha = 0.2f), o(24.0, 136.0), Size(90f, 5f), CornerRadius(2.5f))
        drawRoundRect(Color(1f, 0.8f, 0f), o(24.0, 136.0), Size(f(90 * game.turbo / 4), 5f), CornerRadius(2.5f))
    }

    // экраны
    val cx = w / 2
    val cy = h * 0.36
    when (game.phase) {
        BusGame.Phase.READY -> banner(tx, cx, cy, "Трасса 150",
            "Тап — прыжок, в воздухе ещё раз.\n☕️ +1 км · ⚡️ турбо · берегись лосей.\nНужно 60 км до пары.")
        BusGame.Phase.OVER -> banner(tx, cx, cy, if (game.newRecord) "Новый рекорд! ${km.toInt()} км 🏆" else "Авария на ${km.toInt()} км 💥",
            "Лучшее комбо ×${game.bestCombo}.\nТап — ещё раз. Автобус не ждёт!")
        BusGame.Phase.WON -> banner(tx, cx, cy, "Доехал! 🎓", "Успел на пару. Комбо ×${game.bestCombo}.\nТап — поехать снова")
        BusGame.Phase.RUNNING -> {}
    }
}

private fun DrawScope.banner(tx: GameText, x: Double, y: Double, title: String, body: String) {
    val bx = x - 160
    val by = y - 66
    drawRoundRect(Color.Black.copy(alpha = 0.5f), o(bx, by), Size(320f, 138f), CornerRadius(24f))
    drawRoundRect(Color.White.copy(alpha = 0.15f), o(bx, by), Size(320f, 138f), CornerRadius(24f), style = Stroke(1f))
    text(title, x, y - 30, tx.paint(24.0, 1))
    val paint = tx.paint(13.0, 3, Color.White.copy(alpha = 0.85f))
    val layout = StaticLayout.Builder.obtain(body, 0, body.length, paint, 320 - 32).setAlignment(Layout.Alignment.ALIGN_NORMAL).build()
    val nc = drawContext.canvas.nativeCanvas
    nc.save()
    nc.translate(f(bx + 16), f(y - 8))
    layout.draw(nc)
    nc.restore()
}
