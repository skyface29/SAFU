package ru.student.safuhub.ui.design

import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import ru.student.safuhub.R
import ru.student.safuhub.core.APPLE_EPOCH_OFFSET
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.ui.theme.AccentTheme
import ru.student.safuhub.ui.theme.BackdropStyle
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Season
import ru.student.safuhub.ui.theme.rgb
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/** Время как в iOS (секунды от 2001) — чтобы анимации шли так же */
fun refTime(): Double = System.currentTimeMillis() / 1000.0 - APPLE_EPOCH_OFFSET

/** Живой фон анимируется только на верхнем видимом экране */
object AmbientCoordinator {
    private val stack = mutableStateListOf<Any>()
    val top: Any? get() = stack.lastOrNull()
    fun push(id: Any) { stack.remove(id); stack.add(id) }
    fun pop(id: Any) { stack.remove(id) }
}

/** Экран поверх всего (сайт, почта): пока он открыт, все живые фоны под ним стоят на паузе */
@Composable
fun PausesAmbient() {
    val token = remember { Any() }
    DisposableEffect(Unit) {
        AmbientCoordinator.push(token)
        onDispose { AmbientCoordinator.pop(token) }
    }
}

/** Можно ли сейчас тратить батарею на анимацию */
fun systemAllowsMotion(ctx: Context): Boolean {
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
    if (pm?.isPowerSaveMode == true) return false
    if (Build.VERSION.SDK_INT >= 29 && (pm?.currentThermalStatus ?: 0) >= PowerManager.THERMAL_STATUS_SEVERE) return false
    val scale = try { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) } catch (_: Throwable) { 1f }
    return scale > 0f
}

/** Часы для рисованных анимаций (как TimelineView .animation) */
@Composable
fun rememberTicker(active: Boolean, fps: Int, pausedValue: Double? = null): State<Double> {
    val t = remember { mutableDoubleStateOf(pausedValue ?: (refTime() % 100_000)) }
    LaunchedEffect(active) {
        if (!active) {
            if (pausedValue != null) t.doubleValue = pausedValue
            return@LaunchedEffect
        }
        var last = 0L
        val step = 1000L / fps
        while (true) {
            withFrameMillis { ms ->
                if (ms - last >= step) {
                    last = ms
                    t.doubleValue = refTime()
                }
            }
        }
    }
    return t
}

@Composable
fun AmbientBackground(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val token = remember { Any() }
    val animated = Defaults.boolOrNull("ambient") ?: true
    val styleRaw = Defaults.string("bg.style") ?: BackdropStyle.GLOW.raw
    val intensity = Defaults.doubleOrNull("bg.intensity") ?: 1.0
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    DisposableEffect(Unit) {
        AmbientCoordinator.push(token)
        onDispose { AmbientCoordinator.pop(token) }
    }
    val style = (BackdropStyle.of(styleRaw) ?: BackdropStyle.GLOW).let { if (it == BackdropStyle.SEASONAL) Season.current.backdrop else it }
    val canAnimate = animated && lifecycle.isAtLeast(Lifecycle.State.RESUMED) && AmbientCoordinator.top === token &&
        remember(lifecycle) { systemAllowsMotion(ctx) }
    AccentTheme.current
    val k = intensity
    Box(modifier.fillMaxSize().background(Ios.background).clipToBounds()) {
        when (style) {
            BackdropStyle.GLOW -> GlowLayer(k, canAnimate)
            BackdropStyle.AURORA -> AuroraLayer(canAnimate, k)
            BackdropStyle.GRID -> { GlowLayer(k * 0.7, canAnimate); TechGrid(canAnimate, k) }
            BackdropStyle.LEAVES -> { AutumnGlow(k); LeavesLayer(canAnimate, k, petals = false) }
            BackdropStyle.PETALS -> { GlowLayer(k * 0.6, canAnimate); LeavesLayer(canAnimate, k, petals = true) }
            BackdropStyle.SUMMER -> { SummerSun(k); SnowLayer(canAnimate, k, rgb(1.0, 0.85, 0.45), rising = true) }
            BackdropStyle.MATRIX -> MatrixLayer(canAnimate, k)
            BackdropStyle.SEASONAL -> {}
            BackdropStyle.SNOW -> { GlowLayer(k * 0.6, canAnimate); SnowLayer(canAnimate, k, null, rising = false) }
            BackdropStyle.WASH -> {
                val b = Brand.color; val b2 = Brand.color2
                Canvas(Modifier.fillMaxSize()) {
                    drawRect(Brush.linearGradient(listOf(b.copy(alpha = (0.22 * k).f), b2.copy(alpha = (0.10 * k).f), Color.Transparent),
                        Offset.Zero, Offset(size.width * 0.5f, size.height)))
                }
            }
            BackdropStyle.PLAIN -> {}
            BackdropStyle.SOFT -> Box(Modifier.fillMaxSize().background(Ios.groupedBackground))
            BackdropStyle.LINEN -> PinstripeLayer()
            BackdropStyle.WORKSHOP -> WorkshopLayer(canAnimate, k)
        }
    }
}

internal val Double.f: Float get() = toFloat()
private fun Double.clamp01() = min(1.0, max(0.0, this)).toFloat()

/** Мягкие пятна света */
@Composable
private fun GlowLayer(k: Double, animated: Boolean) {
    val b = Brand.color
    val b2 = Brand.color2
    val move: Float = if (animated) {
        val tr = rememberInfiniteTransition(label = "glow")
        val v by tr.animateFloat(0f, 1f, infiniteRepeatable(tween(18_000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "m")
        v
    } else 0f
    val density = LocalDensity.current.density
    Canvas(Modifier.fillMaxSize()) {
        val c = Offset(size.width / 2, size.height / 2)
        fun lerp(a: Float, b: Float) = a + (b - a) * move
        fun glow(color: Color, sizePt: Float, x0: Float, x1: Float, y0: Float, y1: Float) {
            val center = c + Offset(lerp(x0, x1) * density, lerp(y0, y1) * density)
            val r = sizePt * 0.5f * density
            drawCircle(Brush.radialGradient(listOf(color, color.copy(alpha = 0f)), center, r), r, center)
        }
        glow(b.copy(alpha = (0.20 * k).clamp01()), 340f, 90f, -120f, -180f, -300f)
        glow(b2.copy(alpha = (0.13 * k).clamp01()), 280f, -80f, 130f, 300f, 120f)
        glow(b.copy(alpha = (0.09 * k).clamp01()), 260f, 150f, 60f, -40f, 420f)
    }
}

/** Технологичная сетка с точками на пересечениях и бегущей полосой «сканера» */
@Composable
private fun TechGrid(animated: Boolean, strength: Double) {
    val dark = LocalDark.current
    val brand = Brand.color
    val scan: Float = if (animated) {
        val tr = rememberInfiniteTransition(label = "scan")
        val v by tr.animateFloat(0f, 1f, infiniteRepeatable(tween(7000, easing = LinearEasing), RepeatMode.Restart), label = "s")
        v
    } else 0f
    val density = LocalDensity.current.density
    Canvas(Modifier.fillMaxSize()) {
        val step = 26f * density
        val lineColor = (if (dark) Color.White else Color.Black).copy(alpha = ((if (dark) 0.07 else 0.05) * strength).clamp01())
        val h = size.height
        // затухание к низу
        fun fade(y: Float): Float { val p = y / h; return if (p < 0.5f) 1f - p * 1.2f else max(0f, 0.4f * (1f - (p - 0.5f) * 2f)) }
        var x = 0f
        while (x <= size.width) {
            drawLine(Brush.verticalGradient(listOf(lineColor, lineColor.copy(alpha = lineColor.alpha * 0.4f), Color.Transparent)),
                Offset(x, 0f), Offset(x, h), 0.5f * density)
            x += step
        }
        var y = 0f
        while (y <= h) {
            drawLine(lineColor.copy(alpha = lineColor.alpha * fade(y)), Offset(0f, y), Offset(size.width, y), 0.5f * density)
            y += step
        }
        val dot = brand.copy(alpha = (0.35 * strength).clamp01())
        var i = 0
        x = 0f
        while (x <= size.width) {
            y = 0f
            var j = 0
            while (y <= h) {
                if ((i + j) % 7 == 0) drawCircle(dot.copy(alpha = dot.alpha * fade(y)), 1.2f * density, Offset(x, y))
                y += step; j++
            }
            x += step; i++
        }
        val bandH = 140f * density
        val top = if (animated) -bandH + scan * (h + bandH) else -bandH
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, brand.copy(alpha = (0.10 * strength).clamp01()), Color.Transparent), top, top + bandH),
            Offset(0f, top), Size(size.width, bandH))
    }
}

/** Северное сияние: переливающиеся пятна (вместо MeshGradient) */
@Composable
private fun AuroraLayer(animated: Boolean, strength: Double) {
    val b = Brand.color
    val b2 = Brand.color2
    val time by rememberTicker(animated, 20, pausedValue = 0.0)
    Canvas(Modifier.fillMaxSize()) {
        val t = (time % 3600).toFloat()
        val k = strength
        val l = 0.5f + 0.12f * sin(t * 0.35f)
        val cx = 0.5f + 0.18f * cos(t * 0.27f)
        val cy = 0.45f + 0.12f * sin(t * 0.31f)
        val r = 0.5f + 0.12f * cos(t * 0.33f)
        val pts = listOf(
            Triple(0f, 0f, b.copy(alpha = (0.35 * k).clamp01())), Triple(0.5f, 0f, b2.copy(alpha = (0.25 * k).clamp01())),
            Triple(1f, 0f, b.copy(alpha = (0.15 * k).clamp01())), Triple(0f, l, b2.copy(alpha = (0.18 * k).clamp01())),
            Triple(cx, cy, b.copy(alpha = (0.10 * k).clamp01())), Triple(1f, r, b2.copy(alpha = (0.22 * k).clamp01())),
        )
        val rad = max(size.width, size.height) * 0.55f
        for ((px, py, c) in pts) {
            val center = Offset(px * size.width, py * size.height)
            drawRect(Brush.radialGradient(listOf(c, c.copy(alpha = 0f)), center, rad))
        }
    }
}

/** Падающий снег (летом — всплывающие блики) */
private class Flake(val x: Double, val y: Double, val r: Double, val speed: Double, val drift: Double)

private val flakes: List<Flake> by lazy {
    var seed = 42UL
    fun rnd(): Double {
        seed = seed * 6364136223846793005UL + 1442695040888963407UL
        return (seed shr 33).toDouble() / (UInt.MAX_VALUE.toULong() shr 1).toDouble()
    }
    (0 until 70).map { Flake(rnd(), rnd(), 0.8 + rnd() * 2.2, 0.015 + rnd() * 0.03, rnd() * 6.28) }
}

@Composable
private fun SnowLayer(animated: Boolean, strength: Double, tint: Color?, rising: Boolean) {
    val brand = Brand.color
    val time by rememberTicker(animated, 24)
    val density = LocalDensity.current.density
    Canvas(Modifier.fillMaxSize()) {
        val t = time % 10_000
        val color = tint ?: brand
        for (f in flakes) {
            val p = (f.y + t * f.speed * (if (rising) 0.35 else 1.0)) % 1.05
            val y = (if (rising) 1.02 - p else p).toFloat() * size.height
            val x = f.x.toFloat() * size.width + (sin(t * 0.6 + f.drift) * 14).toFloat() * density
            val r = f.r.toFloat() * density
            if (rising) {
                val big = r * 2.6f
                drawCircle(Brush.radialGradient(listOf(color.copy(alpha = (0.45 * strength).clamp01()), color.copy(alpha = 0f)), Offset(x, y), big), big, Offset(x, y))
            } else {
                drawCircle(color.copy(alpha = ((0.18 + f.r * 0.08) * strength).clamp01()), r, Offset(x, y))
            }
        }
    }
}

// MARK: - Листопад

@Composable
private fun AutumnGlow(strength: Double) {
    val dark = LocalDark.current
    val density = LocalDensity.current.density
    Canvas(Modifier.fillMaxSize()) {
        drawRect(Brush.radialGradient(listOf(rgb(1.0, 0.72, 0.30).copy(alpha = ((if (dark) 0.22 else 0.28) * strength).clamp01()), Color.Transparent),
            Offset(size.width * 0.85f, 0f), 420f * density))
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent,
            rgb(0.85, 0.35, 0.10).copy(alpha = ((if (dark) 0.16 else 0.12) * strength).clamp01()))))
    }
}

private enum class LeafKind { MAPLE, OVAL, BIRCH, PETAL }

private class Leaf(
    val kind: LeafKind, val x: Double, val y: Double, val size: Double, val speed: Double, val sway: Double,
    val swayFreq: Double, val spin: Double, val flipFreq: Double, val phase: Double, val depth: Int, val colors: Pair<Color, Color>,
)

private val leafPalette = listOf(
    rgb(1.00, 0.78, 0.20) to rgb(0.95, 0.52, 0.10),
    rgb(0.99, 0.55, 0.12) to rgb(0.86, 0.28, 0.08),
    rgb(0.93, 0.30, 0.14) to rgb(0.70, 0.10, 0.10),
    rgb(0.78, 0.16, 0.20) to rgb(0.50, 0.06, 0.14),
    rgb(0.95, 0.68, 0.25) to rgb(0.62, 0.36, 0.12),
    rgb(0.86, 0.72, 0.22) to rgb(0.55, 0.55, 0.12),
)

private val petalPalette = listOf(
    rgb(1.00, 0.86, 0.92) to rgb(0.98, 0.62, 0.76),
    rgb(1.00, 0.95, 0.97) to rgb(0.96, 0.76, 0.86),
    rgb(0.99, 0.74, 0.84) to rgb(0.90, 0.45, 0.62),
)

private fun lcg(seed0: ULong): () -> Double {
    var seed = seed0
    return {
        seed = seed * 6364136223846793005UL + 1442695040888963407UL
        (seed shr 11).toDouble() / (1UL shl 53).toDouble()
    }
}

private val autumnLeaves: List<Leaf> by lazy {
    val rnd = lcg(2026UL)
    (0 until 30).map { i ->
        val depth = if (i < 12) 0 else if (i < 24) 1 else 2
        val base = if (depth == 0) 9.0 else if (depth == 1) 15.0 else 22.0
        val k = rnd()
        val kind = if (k < 0.5) LeafKind.MAPLE else if (k < 0.78) LeafKind.OVAL else LeafKind.BIRCH
        Leaf(kind, rnd(), rnd(), base + rnd() * base * 0.5,
            (0.018 + rnd() * 0.02) * (if (depth == 0) 0.7 else if (depth == 1) 1.0 else 1.35),
            18 + rnd() * 34, 0.35 + rnd() * 0.5, (rnd() - 0.5) * 1.6, 0.4 + rnd() * 1.1, rnd() * 6.283, depth,
            leafPalette[(rnd() * leafPalette.size).toInt() % leafPalette.size])
    }
}

private val springPetals: List<Leaf> by lazy {
    val rnd = lcg(314UL)
    (0 until 34).map { i ->
        val depth = if (i < 14) 0 else if (i < 27) 1 else 2
        val base = if (depth == 0) 6.0 else if (depth == 1) 9.0 else 13.0
        Leaf(LeafKind.PETAL, rnd(), rnd(), base + rnd() * base * 0.4,
            (0.014 + rnd() * 0.016) * (if (depth == 0) 0.7 else if (depth == 1) 1.0 else 1.3),
            24 + rnd() * 40, 0.4 + rnd() * 0.5, (rnd() - 0.5) * 2.4, 0.6 + rnd() * 1.4, rnd() * 6.283, depth,
            petalPalette[(rnd() * 3).toInt() % 3])
    }
}

private val maplePath: Path by lazy {
    val right = listOf(
        0.00f to -1.00f, 0.10f to -0.74f, 0.26f to -0.84f, 0.21f to -0.46f, 0.44f to -0.66f, 0.52f to -0.54f,
        0.80f to -0.62f, 0.70f to -0.34f, 0.84f to -0.26f, 0.48f to 0.02f, 0.54f to 0.18f, 0.12f to 0.12f, 0.03f to 0.30f,
    )
    Path().apply {
        moveTo(right[0].first, right[0].second)
        for (p in right.drop(1)) lineTo(p.first, p.second)
        for (p in right.drop(1).reversed()) lineTo(-p.first, p.second)
        close()
    }
}

private val mapleVeins: Path by lazy {
    Path().apply {
        moveTo(0f, 0.75f); lineTo(0f, -0.9f)
        for (s in listOf(1f, -1f)) {
            moveTo(0f, 0.1f); lineTo(0.72f * s, -0.55f)
            moveTo(0f, 0.1f); lineTo(0.72f * s, -0.24f)
            moveTo(0f, 0.1f); lineTo(0.42f * s, 0.12f)
        }
    }
}

private val ovalPath: Path by lazy {
    Path().apply {
        moveTo(0f, -1f)
        cubicTo(0.62f, -0.55f, 0.48f, 0.45f, 0f, 0.72f)
        cubicTo(-0.48f, 0.45f, -0.62f, -0.55f, 0f, -1f)
        close()
    }
}

private val ovalVeins: Path by lazy {
    Path().apply {
        moveTo(0f, 1f); lineTo(0f, -0.85f)
        for ((y, len) in listOf(-0.45f to 0.28f, -0.1f to 0.36f, 0.25f to 0.30f)) {
            moveTo(0f, y + 0.12f); lineTo(len, y - 0.08f)
            moveTo(0f, y + 0.12f); lineTo(-len, y - 0.08f)
        }
    }
}

private val birchPath: Path by lazy {
    Path().apply {
        moveTo(0f, -0.85f)
        cubicTo(0.35f, -0.55f, 0.95f, 0.35f, 0f, 0.55f)
        cubicTo(-0.95f, 0.35f, -0.35f, -0.55f, 0f, -0.85f)
        close()
    }
}

private val birchVeins: Path by lazy {
    Path().apply {
        moveTo(0f, 0.85f); lineTo(0f, -0.7f)
        for (y in listOf(-0.3f, 0.05f, 0.35f)) {
            moveTo(0f, y); lineTo(0.38f, y - 0.18f)
            moveTo(0f, y); lineTo(-0.38f, y - 0.18f)
        }
    }
}

private val petalPath: Path by lazy {
    Path().apply {
        moveTo(0f, -0.72f)
        quadraticTo(0.18f, -1.05f, 0.42f, -1.0f)
        cubicTo(0.9f, -0.6f, 0.45f, 0.6f, 0f, 1.0f)
        cubicTo(-0.45f, 0.6f, -0.9f, -0.6f, -0.42f, -1.0f)
        quadraticTo(-0.18f, -1.05f, 0f, -0.72f)
        close()
    }
}

private val petalVeins: Path by lazy { Path().apply { moveTo(0f, 0.85f); lineTo(0f, -0.45f) } }

@Composable
private fun LeavesLayer(animated: Boolean, strength: Double, petals: Boolean) {
    val dark = LocalDark.current
    val time by rememberTicker(animated, 24, pausedValue = 1234.0)
    val density = LocalDensity.current.density
    Canvas(Modifier.fillMaxSize()) {
        val t = if (animated) time % 100_000 else 1234.0
        val list = if (petals) springPetals else autumnLeaves
        for (leaf in list) drawLeaf(leaf, t, dark, strength, density)
    }
}

private fun DrawScope.drawLeaf(leaf: Leaf, t: Double, dark: Boolean, strength: Double, density: Float) {
    val travel = size.height + 80 * density
    val prog = ((leaf.y + t * leaf.speed) % 1.0)
    val y = prog.toFloat() * travel - 40 * density
    val x = leaf.x.toFloat() * size.width + (sin(t * leaf.swayFreq + leaf.phase) * leaf.sway).toFloat() * density
    val angle = sin(t * leaf.swayFreq + leaf.phase + 1.2) * 0.8 + t * leaf.spin * 0.25
    val flip = cos(t * leaf.flipFreq + leaf.phase)
    val flipX = (if (flip >= 0) max(flip, 0.12) else min(flip, -0.12)).toFloat()
    val s = leaf.size.toFloat() / 2 * density
    val baseOpacity = if (leaf.depth == 0) 0.38 else if (leaf.depth == 1) 0.75 else 0.92
    val opacity = min(1.0, baseOpacity * (if (dark) 0.9 else 1.0) * strength).toFloat()
    val back = flip < 0
    val (shape, veins) = when (leaf.kind) {
        LeafKind.MAPLE -> maplePath to mapleVeins
        LeafKind.OVAL -> ovalPath to ovalVeins
        LeafKind.BIRCH -> birchPath to birchVeins
        LeafKind.PETAL -> petalPath to petalVeins
    }
    val top = if (back) leaf.colors.first.copy(alpha = 0.85f) else leaf.colors.first
    val bottom = if (back) leaf.colors.first else leaf.colors.second
    withTransform({
        translate(x, y)
        rotateRad(angle.toFloat(), Offset.Zero)
        scale(s * flipX, s, Offset.Zero)
    }) {
        if (leaf.depth == 2) {
            translate(0.12f, 0.18f) { drawPath(shape, Color.Black.copy(alpha = (if (dark) 0.35f else 0.12f) * opacity)) }
        }
        drawPath(shape, Brush.linearGradient(listOf(top, bottom), Offset(-0.4f, -1f), Offset(0.4f, 0.8f)), alpha = opacity)
        if (leaf.depth > 0) {
            drawPath(shape, Brush.radialGradient(listOf(Color.White.copy(alpha = 0.22f), Color.Transparent), Offset(-0.25f, -0.45f), 0.9f), alpha = opacity)
            drawPath(veins, leaf.colors.second.copy(alpha = if (back) 0.35f else 0.55f), alpha = opacity,
                style = Stroke(width = 1.0f / s * 0.9f * density, cap = StrokeCap.Round))
        }
    }
}

@Composable
private fun SummerSun(strength: Double) {
    val density = LocalDensity.current.density
    Canvas(Modifier.fillMaxSize()) {
        drawRect(Brush.radialGradient(listOf(rgb(1.0, 0.86, 0.40).copy(alpha = (0.35 * strength).clamp01()), Color.Transparent),
            Offset(size.width * 0.9f, size.height * 0.02f), 380f * density))
        drawRect(Brush.radialGradient(listOf(rgb(0.40, 0.85, 0.60).copy(alpha = (0.14 * strength).clamp01()), Color.Transparent),
            Offset(0f, size.height), 420f * density))
    }
}

// MARK: - Цифровой дождь

private const val matrixGlyphs = "01アイウエオカキクケコサシスセソタチツテトナニヌネ0101"

@Composable
private fun MatrixLayer(animated: Boolean, strength: Double) {
    val time by rememberTicker(animated, 20, pausedValue = 500.0)
    val density = LocalDensity.current.density
    val paint = remember {
        android.graphics.Paint().apply {
            isAntiAlias = true
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.NORMAL)
            textAlign = android.graphics.Paint.Align.CENTER
        }
    }
    val headPaint = remember {
        android.graphics.Paint().apply {
            isAntiAlias = true
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)
            textAlign = android.graphics.Paint.Align.CENTER
            color = android.graphics.Color.WHITE
        }
    }
    Canvas(Modifier.fillMaxSize()) {
        val t = if (animated) time % 10_000 else 500.0
        paint.textSize = 13f * density
        headPaint.textSize = 13f * density
        val green = rgb(0.25, 1.0, 0.45).toArgb()
        val step = 16f * density
        val cols = (size.width / step).toInt() + 1
        val nc = drawContext.canvas.nativeCanvas
        for (col in 0 until cols) {
            val seed = ((col * 7919) % 101) / 101.0
            val speed = (70 + seed * 110) * density
            val span = size.height + 320.0 * density
            val headY = (seed * span + t * speed) % span - 160 * density
            for (k in 0 until 16) {
                val y = headY - k * 16.0 * density
                if (y <= -16 * density || y >= size.height + 16 * density) continue
                val op = ((if (k == 0) 0.9 else max(0.0, 0.55 - k * 0.035)) * strength).clamp01()
                val x = col * step + step / 2
                val baseY = (y + 5 * density).toFloat()
                if (k == 0) {
                    headPaint.alpha = (op * 255).toInt()
                    nc.drawText("1", x, baseY, headPaint)
                } else {
                    val idx = abs((col * 31 + k * 17 + (t * 5).toInt()) % matrixGlyphs.length)
                    paint.color = green
                    paint.alpha = (op * 255).toInt()
                    nc.drawText(matrixGlyphs[idx].toString(), x, baseY, paint)
                }
            }
        }
    }
}

// MARK: - iOS 6: полоски как в «Настройках»

@Composable
fun PinstripeLayer() {
    val dark = LocalDark.current
    val density = LocalDensity.current.density
    Canvas(Modifier.fillMaxSize()) {
        val base = if (dark) rgb(0.19, 0.20, 0.22) else rgb(0.776, 0.804, 0.835)
        val stripe = if (dark) rgb(0.22, 0.23, 0.25) else rgb(0.800, 0.827, 0.855)
        drawRect(base)
        var x = 0f
        while (x < size.width) {
            drawRect(stripe, Offset(x, 0f), Size(4f * density, size.height))
            x += 7f * density
        }
    }
}

// MARK: - Machinarium: живая картина свалки

private fun noise(i: Int): Double {
    val v = sin(i * 12.9898 + 78.233) * 43758.5453
    return v - kotlin.math.floor(v)
}

@Composable
private fun WorkshopLayer(animated: Boolean, strength: Double) {
    val scene = ImageBitmap.imageResource(R.drawable.mach_scene)
    val ship = ImageBitmap.imageResource(R.drawable.mach_ship)
    val time by rememberTicker(animated, 24, pausedValue = 0.0)
    val density = LocalDensity.current.density
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width.toDouble()
        val h = size.height.toDouble()
        val sceneW = 1290.0; val sceneH = 2796.0
        // картина заполняет экран (как scaledToFill), в пунктах iOS
        val k = max(w / sceneW, h / sceneH)
        val dw = sceneW * k; val dh = sceneH * k
        val ox = (w - dw) / 2; val oy = (h - dh) / 2
        drawImage(scene, IntOffset.Zero, IntSize(scene.width, scene.height), IntOffset(ox.toInt(), oy.toInt()),
            IntSize(dw.toInt(), dh.toInt()), filterQuality = FilterQuality.High)
        val t = if (animated) time % 3600 else 0.0
        // дирижабль плывёт в шапке экрана — там его не закрывают карточки
        val shipW = 642.0; val shipH = 475.0
        val sw = min(w * 0.34, shipW * k * 0.7)
        val sh = sw * shipH / shipW
        val cx = w * 0.72 + sin(t * 0.06) * w * 0.1
        val cy = sh * 0.36 + sin(t * 0.55) * 5 * density
        withTransform({ rotateRad((sin(t * 0.4) * 1.6 * Math.PI / 180).toFloat(), Offset(cx.toFloat(), cy.toFloat())) }) {
            drawImage(ship, IntOffset.Zero, IntSize(ship.width, ship.height), IntOffset((cx - sw / 2).toInt(), (cy - sh / 2).toInt()),
                IntSize(sw.toInt(), sh.toInt()), filterQuality = FilterQuality.High)
        }
        drawMachAir(t, strength, density)
    }
}

/** Туман и пыль поверх картины */
fun DrawScope.drawMachAir(t: Double, k: Double, density: Float) {
    val w = size.width.toDouble(); val h = size.height.toDouble()
    for (i in 0 until 4) {
        val y = h * (0.45 + i * 0.14)
        val fw = w * (1.1 + noise(i) * 0.6)
        val x = (t * (6 + noise(i + 10) * 8) * density + noise(i + 20) * w) % (w + fw) - fw
        val rect = Rect(x.toFloat(), (y - 60 * density).toFloat(), (x + fw).toFloat(), (y + 60 * density).toFloat())
        drawOval(Brush.radialGradient(listOf(rgb(0.66, 0.67, 0.56).copy(alpha = (0.22 * k).clamp01()), Color.Transparent),
            rect.center, (fw / 2).toFloat()), rect.topLeft, rect.size)
    }
    val dustColor = rgb(0.16, 0.15, 0.10).copy(alpha = (0.45 * k).clamp01())
    for (i in 0 until 40) {
        val x = (noise(i + 100) * w + t * (3 + noise(i + 200) * 6) * density) % w
        var y = (noise(i + 300) * h + t * (4 + noise(i + 400) * 7) * density) % h
        y += sin(t * 0.8 + i) * 6 * density
        val r = (0.8 + noise(i + 500) * 1.8) * density
        drawCircle(dustColor, (r / 2).toFloat(), Offset((x + r / 2).toFloat(), (y + r / 2).toFloat()))
    }
}
