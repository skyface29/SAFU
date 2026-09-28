package ru.student.safuhub.feature.nuke

import android.app.Activity
import android.graphics.Bitmap
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.PixelCopy
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import ru.student.safuhub.App
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh
import kotlin.random.Random

// MARK: - Пасхалка «Ядерный гриб»
// 7 тапов по иконке разработчика: экран приложения разлетается осколками,
// ослепляющая вспышка, огненный шар, ударная волна, кольцо конденсации и ядерный гриб.
// С тряской экрана, вибрацией и низким гулом взрыва.

class NukeShot(val image: ImageBitmap?, val onDone: () -> Unit)

object Nuke {
    /** Идущий взрыв (рисуется поверх всего приложения, без анимации появления) */
    val shot = mutableStateOf<NukeShot?>(null)

    /** Снимок текущего экрана — его и разнесёт взрывом */
    fun detonate(activity: Activity?, onDone: () -> Unit) {
        val win = activity?.window
        val view = win?.decorView
        if (win == null || view == null || view.width <= 0 || view.height <= 0) {
            shot.value = NukeShot(null, onDone)
            return
        }
        val bmp = try { Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888) } catch (_: Throwable) {
            shot.value = NukeShot(null, onDone); return
        }
        try {
            PixelCopy.request(win, bmp, { res ->
                shot.value = NukeShot(if (res == PixelCopy.SUCCESS) bmp.asImageBitmap() else null, onDone)
            }, Handler(Looper.getMainLooper()))
        } catch (_: Throwable) {
            shot.value = NukeShot(null, onDone)
        }
    }
}

/** Слой взрыва в корне приложения */
@Composable
fun NukeLayer() {
    val s = Nuke.shot.value ?: return
    NukeView(s.image) {
        Nuke.shot.value = null
        s.onDone()
    }
}

// MARK: - Экран взрыва

@Composable
private fun NukeView(snapshot: ImageBitmap?, dismiss: () -> Unit) {
    val scene = remember { NukeScene() }
    val start = remember { System.nanoTime() }
    var frame by remember { mutableLongStateOf(start) }
    var showHint by remember { mutableStateOf(false) }
    val sound = remember { NukeSound() }
    val rumble = remember { NukeRumble() }

    LaunchedEffect(Unit) {
        while (true) withFrameNanos { frame = it }
    }
    LaunchedEffect(Unit) {
        delay((NukeScene.detonate * 1000).toLong())
        sound.play()
        rumble.play()
        delay(6500 - (NukeScene.detonate * 1000).toLong())
        showHint = true
    }
    DisposableEffect(Unit) {
        onDispose {
            sound.stop()
            rumble.stop()
        }
    }
    BackHandler { if (showHint) dismiss() }

    Box(Modifier.fillMaxSize().background(Color.Black)
        .clickable(remember { MutableInteractionSource() }, null) { if (showHint) dismiss() }) {
        Canvas(Modifier.fillMaxSize()) {
            val t = (frame - start) / 1e9
            scene.draw(this, t, snapshot)
        }
        AnimatedVisibility(showHint, Modifier.align(Alignment.BottomCenter),
            enter = fadeIn(tween(600)) + slideInVertically(tween(600)) { it }) {
            Column(Modifier.navigationBarsPadding().padding(bottom = 40.dp, start = 16.dp, end = 16.dp).clip(RoundedCornerShape(20.dp))
                .background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 22.dp, vertical = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("☢️ Пасхалка найдена", style = ft(22f, FontWeight.ExtraBold, Design.ROUNDED), color = Color.White, textAlign = TextAlign.Center)
                Text("Тап — вернуться в то, что осталось от приложения", style = ft(Ts.footnote, FontWeight.SemiBold), color = Color.White,
                    textAlign = TextAlign.Center, modifier = Modifier.alpha(0.8f))
            }
        }
    }
}

// MARK: - Цвет и случайности

private data class RGB(val r: Double, val g: Double, val b: Double) {
    fun color(opacity: Double = 1.0) = Color(r.toFloat().coerceIn(0f, 1f), g.toFloat().coerceIn(0f, 1f), b.toFloat().coerceIn(0f, 1f),
        max(0.0, min(1.0, opacity)).toFloat())

    companion object {
        fun mix(a: RGB, b: RGB, f0: Double): RGB {
            val f = min(1.0, max(0.0, f0))
            return RGB(a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f)
        }

        /** Плавный переход по ключевым точкам времени */
        fun ramp(t: Double, keys: List<Pair<Double, RGB>>): RGB {
            if (t <= keys.first().first) return keys.first().second
            if (t >= keys.last().first) return keys.last().second
            for (i in 1 until keys.size) if (t <= keys[i].first) {
                val a = keys[i - 1]
                val b = keys[i]
                return mix(a.second, b.second, (t - a.first) / (b.first - a.first))
            }
            return keys.last().second
        }
    }
}

/** Детерминированный генератор (как в iOS-версии) — сцена всегда одинаковая */
private class Seeded(var s: ULong) {
    fun next(): Double {
        s += 0x9E3779B97F4A7C15uL
        var z = s
        z = (z xor (z shr 30)) * 0xBF58476D1CE4E5B9uL
        z = (z xor (z shr 27)) * 0x94D049BB133111EBuL
        z = z xor (z shr 31)
        return (z shr 11).toDouble() / 9_007_199_254_740_992.0
    }

    fun r(a: Double, b: Double) = a + (b - a) * next()
}

// MARK: - Сцена

private fun f(v: Double) = v.toFloat()
private fun o(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())

private class NukeScene {
    companion object {
        const val detonate = 0.35
        const val cols = 9
        const val rows = 18
    }

    class Tile(val col: Int, val row: Int, val jx: Double, val jy: Double, val spin: Double, val power: Double)
    class Puff(val a: Double, val b: Double, val size: Double, val phase: Double, val speed: Double)
    class Ember(val angle: Double, val speed: Double, val life: Double, val size: Double, val delay: Double)
    class Building(val x: Double, val w: Double, val h: Double, val windows: Int)

    private val tiles: List<Tile>
    private val dome: List<Puff>
    private val ring: List<Puff>
    private val stem: List<Puff>
    private val base: List<Puff>
    private val embers: List<Ember>
    private val city: List<Building>
    private val rays: List<Ember>
    private val rising: List<Ember>

    init {
        val rnd = Seeded(0xA7C320260150uL)
        val tl = mutableListOf<Tile>()
        for (row in 0 until rows) for (col in 0 until cols) {
            tl.add(Tile(col, row, rnd.r(-160.0, 160.0), rnd.r(-260.0, 60.0), rnd.r(-9.0, 9.0), rnd.r(0.7, 1.4)))
        }
        tiles = tl

        val d = mutableListOf<Puff>()
        repeat(90) {
            val th = rnd.r(-0.12 * Math.PI, 1.12 * Math.PI)
            val rho = 0.2 + 0.8 * sqrt(rnd.next())
            d.add(Puff(cos(th) * rho, -sin(th) * rho * 0.72 + 0.05, rnd.r(0.26, 0.44), rnd.r(0.0, 6.28), rnd.r(0.6, 1.6)))
        }
        dome = d.sortedBy { it.b }   // сначала верх, низ (горячий) поверх

        ring = List(44) { i -> Puff(i / 44.0 * 2 * Math.PI + rnd.r(-0.05, 0.05), rnd.r(0.0, 6.28), rnd.r(0.8, 1.2), rnd.r(0.0, 6.28), rnd.r(0.8, 1.3)) }
        stem = List(70) { i -> Puff(rnd.r(-1.0, 1.0), i / 69.0, rnd.r(0.8, 1.25), rnd.r(0.0, 6.28), rnd.r(0.5, 1.4)) }
        base = List(70) { Puff(rnd.r(-1.0, 1.0), rnd.next(), rnd.r(0.7, 1.4), rnd.r(0.0, 6.28), rnd.r(0.5, 1.3)) }.sortedByDescending { it.b }

        embers = List(380) { i ->
            // первая волна — мощный веер искр, дальше — искры, которые сыплются из огненного шара
            val early = i < 240
            Ember(rnd.r(0.04 * Math.PI, 0.96 * Math.PI), if (early) rnd.r(0.35, 1.6) else rnd.r(0.15, 0.8),
                rnd.r(1.4, 4.2), rnd.r(1.0, 3.2), if (early) rnd.r(0.0, 0.35) else rnd.r(0.4, 3.2))
        }
        rays = List(26) { Ember(rnd.r(0.0, 2 * Math.PI), rnd.r(0.6, 1.2), rnd.r(0.7, 1.3), rnd.r(0.02, 0.06), rnd.r(0.0, 0.12)) }
        rising = List(120) { Ember(rnd.r(-1.0, 1.0), rnd.r(0.04, 0.12), rnd.r(2.0, 4.5), rnd.r(0.8, 2.2), rnd.r(0.6, 6.0)) }

        val ct = mutableListOf<Building>()
        var x = -60.0
        while (x < 1400) {
            val bw = rnd.r(16.0, 48.0)
            ct.add(Building(x, bw, rnd.r(0.015, 0.075), rnd.r(0.0, 6.0).toInt()))
            x += bw + rnd.r(0.0, 10.0)
        }
        city = ct
    }

    // MARK: рисование

    fun draw(scope: DrawScope, t: Double, snapshot: ImageBitmap?) = with(scope) {
        val d = density
        val w = size.width / d.toDouble()
        val h = size.height / d.toDouble()
        val tau = t - detonate
        val cx = w / 2
        val ground = h * 0.80

        // ——— до детонации: экран приложения и растущая точка света
        if (tau < 0) {
            if (snapshot != null) drawImage(snapshot, dstSize = IntSize(size.width.roundToInt(), size.height.roundToInt()))
            withTransform({ scale(d, d, Offset.Zero) }) {
                val k = t / detonate
                val r = 6 + 60 * k * k
                val c = o(cx, ground)
                drawCircle(Brush.radialGradient(listOf(Color.White, Color(1f, 0.92f, 0.7f, 0.85f), Color.Transparent), c, f(r)), f(r), c)
                drawRect(Color.White.copy(alpha = f(0.25 * k * k).coerceIn(0f, 1f)), o(-60.0, -60.0), Size(f(w + 120), f(h + 120)))
            }
            return@with
        }

        // ——— тряска: взрыв и приход ударной волны
        var amp = 12 * exp(-tau / 0.7)
        if (tau > 1.1) amp += 14 * exp(-(tau - 1.1) / 0.6) * min(1.0, (tau - 1.1) / 0.05)
        amp += 1.2 * exp(-tau / 6)
        val shakeX = sin(t * 57) * amp + sin(t * 23) * amp * 0.5
        val shakeY = cos(t * 49) * amp * 0.7 + sin(t * 31) * amp * 0.3

        withTransform({ scale(d, d, Offset.Zero); translate(f(shakeX), f(shakeY)) }) {
            scene(w, h, tau, cx, ground)
        }

        // ——— осколки экрана приложения: летят без тряски — иначе казалось, что приложение просто съехало вбок
        if (snapshot != null && tau < 2.4) {
            val tw = w / cols
            val th = h / rows
            val srcW = snapshot.width.toDouble() / cols
            val srcH = snapshot.height.toDouble() / rows
            for (tile in tiles) {
                val c0x = (tile.col + 0.5) * tw
                val c0y = (tile.row + 0.5) * th
                val dx = c0x - cx
                val dy = c0y - ground
                val dist = max(1.0, sqrt(dx * dx + dy * dy))
                val tt = max(0.0, tau - dist / h * 0.05)
                val v = 1500 * tile.power / (0.45 + dist / h)
                val px = c0x + dx / dist * v * tt + tile.jx * tt
                val py = c0y + dy / dist * v * tt + tile.jy * tt + 900 * tt * tt
                val alpha = max(0.0, 1 - tt / 1.1)
                if (alpha <= 0) continue
                val s = 1 - 0.3 * min(1.0, tt)
                withTransform({
                    scale(d, d, Offset.Zero)
                    translate(f(px), f(py))
                    rotateRad(f(tile.spin * tt), Offset.Zero)
                    scale(f(s), f(s), Offset.Zero)
                }) {
                    val local = Rect(f(-tw / 2), f(-th / 2), f(tw / 2), f(th / 2))
                    clipRect(local.left, local.top, local.right, local.bottom) {
                        // кусок снимка в пикселях экрана
                        scale(1f / d, 1f / d, Offset.Zero) {
                            val sx0 = (tile.col * srcW).roundToInt()
                            val sy0 = (tile.row * srcH).roundToInt()
                            val sx1 = ((tile.col + 1) * srcW).roundToInt().coerceAtMost(snapshot.width)
                            val sy1 = ((tile.row + 1) * srcH).roundToInt().coerceAtMost(snapshot.height)
                            val dw = (tw * d).roundToInt()
                            val dh = (th * d).roundToInt()
                            drawImage(snapshot, IntOffset(sx0, sy0), IntSize(sx1 - sx0, sy1 - sy0), IntOffset(-dw / 2, -dh / 2), IntSize(dw, dh),
                                alpha = f(alpha))
                        }
                        drawRect(Color(1f, 0.5f, 0.1f, f(0.5 * min(1.0, tt * 3) * (1 - min(1.0, tt)) * alpha)), local.topLeft, local.size)
                        drawRect(Color.Black.copy(alpha = f(min(0.7, tt * 0.8) * alpha)), local.topLeft, local.size)
                        // раскалённые края трещин
                        drawRect(Color(1f, 0.75f, 0.3f, f(0.9 * (1 - min(1.0, tt * 1.5)) * alpha)), local.topLeft, local.size, style = Stroke(1.5f))
                    }
                }
            }
        }

        withTransform({ scale(d, d, Offset.Zero); translate(f(shakeX), f(shakeY)) }) {
            // ——— виньетка
            val vc = o(cx, h * 0.45)
            val inner = w * 0.45
            val outer = max(w, h) * 0.85
            drawRect(Brush.radialGradient(0f to Color.Transparent, f(inner / outer) to Color.Transparent, 1f to Color.Black.copy(alpha = 0.55f),
                center = vc, radius = f(outer)), o(-60.0, -60.0), Size(f(w + 120), f(h + 120)))
            // ——— вспышка
            val flash = if (tau < 0.06) tau / 0.06 else exp(-(tau - 0.06) / 0.4)
            if (flash > 0.005) drawRect(Color(1f, 0.99f, 0.94f, f(flash).coerceIn(0f, 1f)), o(-60.0, -60.0), Size(f(w + 120), f(h + 120)))
        }
    }

    private fun DrawScope.scene(w: Double, h: Double, tau: Double, cx: Double, ground: Double) {
        val rise = 1 - exp(-tau / 2.4)
        val cy = ground - h * 0.08 - h * 0.44 * rise
        val bigR = w * (0.10 + 0.27 * (1 - exp(-tau / 1.8)))
        val heat = exp(-tau / 2.6)
        val sx = 1 + 0.35 * rise
        val sy = 1 - 0.18 * rise

        // ——— небо
        val top = RGB.ramp(tau, listOf(0.0 to RGB(1.0, 1.0, 1.0), 0.5 to RGB(1.0, 0.86, 0.6), 1.6 to RGB(0.55, 0.22, 0.1),
            4.0 to RGB(0.18, 0.07, 0.06), 9.0 to RGB(0.07, 0.04, 0.05)))
        val horizon = RGB.ramp(tau, listOf(0.0 to RGB(1.0, 1.0, 1.0), 0.5 to RGB(1.0, 0.95, 0.75), 2.0 to RGB(1.0, 0.5, 0.16),
            5.0 to RGB(0.7, 0.22, 0.07), 9.0 to RGB(0.36, 0.12, 0.06)))
        drawRect(Brush.verticalGradient(listOf(top.color(), horizon.color()), -60f, f(ground)), o(-60.0, -60.0), Size(f(w + 120), f(ground + 60)))

        // ——— зарево вокруг гриба
        val glow = RGB.mix(RGB(1.0, 0.55, 0.15), RGB(1.0, 0.9, 0.6), heat)
        val gc = o(cx, cy)
        drawCircle(Brush.radialGradient(listOf(glow.color(0.55 * heat + 0.12), glow.color(0.0)), gc, f(w * 1.1)), f(w * 1.1), gc, blendMode = BlendMode.Plus)

        // ——— лучи вспышки
        val ry = ground - h * 0.05
        for (r in rays) {
            val te = tau - r.delay
            if (te <= 0 || te >= r.life) continue
            val a = (1 - te / r.life) * 0.5
            val len = max(w, h) * r.speed * (0.4 + 0.8 * te / r.life)
            val half = r.size
            val ray = Path().apply {
                moveTo(f(cx), f(ry))
                lineTo(f(cx + cos(r.angle - half) * len), f(ry - sin(r.angle - half) * len))
                lineTo(f(cx + cos(r.angle + half) * len), f(ry - sin(r.angle + half) * len))
                close()
            }
            drawPath(ray, Brush.linearGradient(listOf(Color(1f, 0.95f, 0.8f, f(a)), Color.Transparent), o(cx, ry),
                o(cx + cos(r.angle) * len, ry - sin(r.angle) * len)), blendMode = BlendMode.Plus)
        }

        // ——— ударная волна в воздухе (полусфера)
        if (tau < 1.4) {
            val sr = w * 1.6 * tau
            val a = 0.45 * (1 - tau / 1.4)
            softRing(o(cx - sr, ground - sr), Size(f(sr * 2), f(sr * 2)), Color.White, a, 5.0, 4.0)
        }

        // ——— ножка гриба
        val stemTop = cy + bigR * 0.35 * sy
        val stemGrow = 1 - exp(-tau / 2)
        for (p in stem) {
            val fb = p.b
            val y = ground - fb * (ground - stemTop)
            val hw = w * (0.03 + 0.05 * stemGrow) * (1 + 1.4 * (1 - fb).pow(3) + 0.5 * fb * fb)
            val x = cx + p.a * hw * 0.7 + sin(tau * 0.9 * p.speed + p.phase + fb * 6) * hw * 0.22
            val r = hw * 0.85 * p.size
            val fire = heat * 0.85 * fb + 0.18 * fb * exp(-tau / 6)
            val smoke = RGB.mix(RGB(0.46, 0.34, 0.26), RGB(0.3, 0.24, 0.22), fb)
            val lit = RGB.mix(smoke, fireColor(fire), min(1.0, fire * 1.5))
            puff(x, y, r, lit, RGB.mix(lit, RGB(0.07, 0.05, 0.05), 0.5), 0.95)
        }

        // ——— кольцо-тор (задняя половина)
        val ringR = bigR * 0.92
        val minor = bigR * 0.2
        fun ringPuff(p: Puff, front: Boolean) {
            val psi = p.b + tau * 1.4 * p.speed
            val z = sin(p.a)
            if ((z >= 0) != front) return
            val x = cx + (ringR + minor * cos(psi)) * cos(p.a) * sx
            val y = cy + bigR * 0.3 * sy + ringR * sin(p.a) * 0.2 - minor * sin(psi)
            val r = bigR * 0.24 * p.size
            val fire = heat * 0.95 + 0.25 * exp(-tau / 5) + 0.15 * max(0.0, sin(psi)) * exp(-tau / 4)
            val lit = RGB.mix(RGB(0.36, 0.28, 0.25), fireColor(fire), min(1.0, fire * 1.4))
            puff(x, y, r, lit, RGB.mix(lit, RGB(0.08, 0.05, 0.05), 0.45), if (front) 0.97 else 0.9)
        }
        for (p in ring) ringPuff(p, false)

        // ——— шапка гриба
        for (p in dome) {
            val bx = sin(tau * p.speed + p.phase) * 0.045
            val by = cos(tau * p.speed * 0.8 + p.phase) * 0.035
            val x = cx + (p.a + bx) * bigR * sx
            val y = cy + (p.b + by) * bigR * sy
            val r = bigR * p.size * (1 + 0.07 * sin(tau * 1.3 * p.speed + p.phase))
            val low = min(1.0, max(0.0, (p.b + 0.7) / 0.95))
            val fire = heat * (0.35 + 0.65 * low) + 0.3 * low * exp(-tau / 6)
            val smoke = RGB.mix(RGB(0.22, 0.18, 0.17), RGB(0.38, 0.3, 0.26), low)
            val lit = RGB.mix(smoke, fireColor(fire), min(1.0, fire * 1.5))
            puff(x, y, r, lit, RGB.mix(lit, RGB(0.06, 0.04, 0.04), 0.5), 0.97)
        }

        // ——— кольцо-тор (передняя половина)
        for (p in ring) ringPuff(p, true)

        // ——— раскалённое ядро
        if (tau < 3.5) {
            val a = exp(-tau / 0.9)
            val fr = bigR * (0.9 + 0.3 * (1 - a))
            val center = o(cx, cy + bigR * 0.1)
            withTransform({ scale(f(sx), 1f, o(cx, cy)) }) {
                drawCircle(Brush.radialGradient(0f to Color.White.copy(alpha = f(a)), 0.35f to Color(1f, 0.9f, 0.5f, f(a * 0.9)),
                    0.7f to Color(1f, 0.45f, 0.1f, f(a * 0.6)), 1f to Color.Transparent, center = center, radius = f(fr)),
                    f(fr), o(cx, cy), blendMode = BlendMode.Plus)
            }
        }

        // ——— кольцо конденсации (облако Вильсона)
        if (tau > 0.6 && tau < 3.4) {
            val k = (tau - 0.6) / 2.8
            val a = sin(Math.PI * k) * 0.55
            val rr = w * (0.2 + 0.35 * k)
            val yy = ground - h * 0.2 - h * 0.08 * k
            val tl = o(cx - rr, yy - rr * 0.12)
            val sz = Size(f(rr * 2), f(rr * 0.24))
            drawOval(Color.White.copy(alpha = f(a * 0.35)), tl, sz)
            softRing(tl, sz, Color.White, a, 10.0, 9.0)
        }

        // ——— искры со светящимися шлейфами
        val drag = 1.6
        for (e in embers) {
            val te = tau - e.delay
            if (te <= 0 || te >= e.life) continue
            val v = e.speed * w * 1.1
            // торможение воздухом + гравитация
            fun pos(q: Double): Offset {
                val dd = v * (1 - exp(-drag * q)) / drag
                return o(cx + cos(e.angle) * dd, cy + bigR * 0.2 - sin(e.angle) * dd + 0.5 * h * 0.35 * q * q)
            }
            val p = pos(te)
            val tail = pos(max(0.0, te - 0.07))
            val a = 1 - te / e.life
            val flick = 0.75 + 0.25 * sin(te * 38 + e.angle * 20)
            val c = RGB.mix(RGB(1.0, 0.3, 0.05), RGB(1.0, 0.97, 0.8), a)
            drawLine(c.color(a * 0.8 * flick), tail, p, f(e.size), StrokeCap.Round, blendMode = BlendMode.Plus)
            val s = e.size * 1.3
            drawCircle(RGB(1.0, 0.98, 0.9).color(a * flick), f(s), p, blendMode = BlendMode.Plus)
        }

        // ——— тлеющие искры, поднимающиеся с гриба
        for (e in rising) {
            val te = tau - e.delay
            if (te <= 0 || te >= e.life) continue
            val a = sin(Math.PI * te / e.life)
            val x = cx + e.angle * bigR * 1.1 + sin(te * 2 + e.angle * 9) * 14
            val y = cy + bigR * 0.3 - te * h * e.speed
            drawCircle(RGB(1.0, 0.6, 0.2).color(a * 0.9), f(e.size), o(x, y), blendMode = BlendMode.Plus)
        }

        // ——— земля и силуэт города
        val groundTop = RGB.mix(RGB(0.12, 0.06, 0.04), RGB(0.6, 0.35, 0.18), heat)
        drawRect(Brush.verticalGradient(listOf(groundTop.color(), RGB(0.03, 0.02, 0.02).color()), f(ground), f(h)), o(-60.0, ground),
            Size(f(w + 120), f(h - ground + 60)))
        val dark = RGB.mix(RGB(0.05, 0.03, 0.03), RGB(0.25, 0.14, 0.08), heat * 0.6)
        val rim = RGB(1.0, 0.6, 0.25)
        val blast = min(1.0, max(0.0, (tau - 0.9) / 0.8))   // ударная волна дошла до домов
        for (b in city) {
            if (b.x >= w + 60) continue
            val bh = h * b.h * (1 - 0.35 * blast * (if (abs(b.x - cx) < w * 0.35) 1.0 else 0.4))
            drawRect(dark.color(), o(b.x, ground - bh), Size(f(b.w), f(bh + 1)))
            drawRect(rim.color(0.35 + 0.6 * heat), o(b.x, ground - bh), Size(f(b.w), 1.5f))
            if (b.windows > 2 && tau < 1.0) drawRect(Color(1f, 0.8f, 0f, f(0.6 * (1 - tau))), o(b.x + 4, ground - bh + 5), Size(4f, 4f))
        }

        // ——— пылевая волна у земли
        val spread = w * 1.15 * (1 - exp(-max(0.0, tau - 0.25) / 1.7))
        for (p in base) {
            val x = cx + p.a * spread + sin(tau * p.speed + p.phase) * 8
            val y = ground - p.b * h * 0.05 * (0.6 + rise) + 4
            val r = w * 0.055 * p.size * (0.5 + 0.9 * min(1.0, tau / 2))
            val lit = RGB.mix(RGB(0.42, 0.31, 0.24), RGB(1.0, 0.55, 0.2), 0.45 * heat)
            puff(x, y, r, lit, RGB.mix(lit, RGB(0.08, 0.05, 0.04), 0.5), 0.9 * (1 - 0.35 * abs(p.a)))
        }

        // ——— ударная волна по земле
        if (tau < 1.8) {
            val rx = w * 1.3 * tau
            val a = 0.85 * (1 - tau / 1.8)
            softRing(o(cx - rx, ground - rx * 0.09), Size(f(rx * 2), f(rx * 0.18)), Color(1f, 0.95f, 0.8f), a, 4.0, 3.0)
        }
    }

    /** Размытое кольцо: несколько обводок с убывающей яркостью вместо фильтра размытия */
    private fun DrawScope.softRing(topLeft: Offset, size: Size, color: Color, alpha: Double, width: Double, blur: Double) {
        drawOval(color.copy(alpha = f(alpha * 0.25).coerceIn(0f, 1f)), topLeft, size, style = Stroke(f(width + blur * 2)))
        drawOval(color.copy(alpha = f(alpha * 0.45).coerceIn(0f, 1f)), topLeft, size, style = Stroke(f(width + blur)))
        drawOval(color.copy(alpha = f(alpha * 0.8).coerceIn(0f, 1f)), topLeft, size, style = Stroke(f(width)))
    }

    private fun fireColor(v: Double): RGB = RGB.ramp(v, listOf(0.0 to RGB(0.55, 0.16, 0.06), 0.3 to RGB(0.95, 0.35, 0.08),
        0.6 to RGB(1.0, 0.62, 0.18), 0.85 to RGB(1.0, 0.88, 0.5), 1.0 to RGB(1.0, 0.98, 0.85)))

    private fun DrawScope.puff(x: Double, y: Double, r: Double, lit: RGB, edge: RGB, alpha: Double) {
        if (r <= 0.5) return
        val center = o(x, y + r * 0.3)
        val rr = f(r * 1.15)
        drawCircle(Brush.radialGradient(0f to lit.color(alpha), 0.62f to edge.color(alpha * 0.95), 1f to edge.color(0.0), center = center, radius = rr),
            f(r), o(x, y))
    }
}

// MARK: - Гул взрыва (синтез, без файлов)

private class NukeSound {
    @Volatile private var running = false
    private var track: AudioTrack? = null

    fun play() {
        if (running) return
        running = true
        thread(name = "nuke-sound") {
            val sr = 44_100
            val minBuf = AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(4096)
            val t = try {
                AudioTrack.Builder()
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(AudioFormat.Builder().setSampleRate(sr).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setBufferSizeInBytes(minBuf * 2)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build()
            } catch (_: Throwable) { running = false; return@thread }
            track = t
            try { t.play() } catch (_: Throwable) { running = false; return@thread }
            var frame = 0L
            var brown = 0.0
            var deep = 0.0
            val chunk = ShortArray(1024)
            while (running && frame < sr * 12L) {
                for (i in chunk.indices) {
                    val time = frame.toDouble() / sr
                    frame++
                    val white = Random.nextDouble(-1.0, 1.0)
                    brown = (brown + 0.02 * white) / 1.02
                    deep = (deep + 0.004 * white) / 1.004
                    // удар → долгий гул → второй удар (ударная волна) → затихание
                    var env = if (time < 0.015) time / 0.015 else exp(-(time - 0.015) / 1.7)
                    if (time > 1.1) env += 0.85 * exp(-(time - 1.1) / 1.3) * min(1.0, (time - 1.1) / 0.03)
                    env += 0.22 * exp(-time / 5)
                    var s = (brown * 3.4 + deep * 11) * env
                    if (Random.nextDouble() < 0.0015 * exp(-time / 2.5)) s += Random.nextDouble(-0.5, 0.5)
                    chunk[i] = (tanh(s * 1.5) * 0.95 * Short.MAX_VALUE).toInt().toShort()
                }
                try { t.write(chunk, 0, chunk.size) } catch (_: Throwable) { break }
            }
            try { t.stop(); t.release() } catch (_: Throwable) {}
            track = null
            running = false
        }
    }

    fun stop() {
        running = false
    }
}

// MARK: - Вибрация

private class NukeRumble {
    private val vibrator: Vibrator? by lazy {
        try {
            if (Build.VERSION.SDK_INT >= 31) (App.ctx.getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            else @Suppress("DEPRECATION") App.ctx.getSystemService(android.content.Context.VIBRATOR_SERVICE) as Vibrator
        } catch (_: Throwable) { null }
    }

    fun play() {
        if (Defaults.boolOrNull("haptics") == false) return
        val v = vibrator ?: return
        try {
            if (v.hasAmplitudeControl()) {
                // удар → гул → второй удар → долгое затухание (как кривая интенсивности в iOS)
                val step = 50L
                val timings = mutableListOf<Long>()
                val amps = mutableListOf<Int>()
                var tt = 0.0
                while (tt < 4.6) {
                    val level = when {
                        tt < 0.05 -> 1.0
                        tt < 1.0 -> 1.0 - 0.5 * (tt / 1.0)
                        tt < 1.12 -> 1.0
                        tt < 2.5 -> 1.0 - 0.45 * ((tt - 1.12) / 1.38)
                        else -> 0.55 * (1 - (tt - 2.5) / 2.1)
                    }
                    timings.add(step)
                    amps.add((level.coerceIn(0.0, 1.0) * 255).toInt().coerceIn(0, 255))
                    tt += step / 1000.0
                }
                v.vibrate(VibrationEffect.createWaveform(timings.toLongArray(), amps.toIntArray(), -1))
            } else {
                v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 60, 20, 60, 20, 60, 800, 80, 20, 60, 100, 60, 200, 80), -1))
            }
        } catch (_: Throwable) {}
    }

    fun stop() {
        try { vibrator?.cancel() } catch (_: Throwable) {}
    }
}
