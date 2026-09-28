package ru.student.safuhub.ui.design

import android.graphics.BlurMaskFilter
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.CardStyle
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.LocalInk
import ru.student.safuhub.ui.theme.rgb

/** Тень как в iOS: размытие radius, сдвиг x/y */
fun Modifier.iosShadow(color: Color, radius: Dp, x: Dp = 0.dp, y: Dp = 0.dp, shape: Shape = RoundedCornerShape(0.dp)): Modifier =
    if (color.alpha <= 0f) this else drawBehind {
        val r = radius.toPx()
        val outline = shape.createOutline(size, layoutDirection, this)
        drawIntoCanvas { canvas ->
            val paint = Paint()
            val fp = paint.asFrameworkPaint()
            fp.isAntiAlias = true
            fp.color = color.toArgb()
            if (r > 0.5f) fp.maskFilter = BlurMaskFilter(r, BlurMaskFilter.Blur.NORMAL)
            canvas.save()
            canvas.translate(x.toPx(), y.toPx())
            when (outline) {
                is Outline.Rectangle -> canvas.drawRect(outline.rect, paint)
                is Outline.Rounded -> {
                    val p = Path().apply { addRoundRect(outline.roundRect) }
                    canvas.drawPath(p, paint)
                }
                is Outline.Generic -> canvas.drawPath(outline.path, paint)
            }
            canvas.restore()
        }
    }

/** Рамка по контуру фигуры внутрь (strokeBorder) */
fun Modifier.strokeBorder(brush: Brush, width: Dp, shape: Shape, offset: Offset = Offset.Zero): Modifier = drawWithContent {
    drawContent()
    val w = width.toPx()
    val inset = w / 2
    val s = Size((size.width - w).coerceAtLeast(0f), (size.height - w).coerceAtLeast(0f))
    val outline = shape.createOutline(s, layoutDirection, this)
    translateSafe(inset + offset.x, inset + offset.y) {
        drawOutline(outline, brush, style = Stroke(w))
    }
}

fun Modifier.strokeBorder(color: Color, width: Dp, shape: Shape): Modifier =
    if (color.alpha <= 0f) this else strokeBorder(androidx.compose.ui.graphics.SolidColor(color), width, shape)

private inline fun androidx.compose.ui.graphics.drawscope.DrawScope.translateSafe(x: Float, y: Float, block: androidx.compose.ui.graphics.drawscope.DrawScope.() -> Unit) {
    drawContext.transform.translate(x, y)
    try { block() } finally { drawContext.transform.translate(-x, -y) }
}

/** Раскрасить содержимое (значок, текст) градиентом */
fun Modifier.gradientTint(brush: Brush): Modifier = graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        drawRect(brush, blendMode = BlendMode.SrcAtop)
    }

/** Нажатие «как кнопка iOS»: чуть уменьшается и бледнеет */
fun Modifier.pressScale(source: MutableInteractionSource, scale: Float = 0.95f): Modifier = composed {
    val pressed by source.collectIsPressedAsState()
    val animations = Defaults.boolOrNull("animations") ?: true
    val k by animateFloatAsState(if (pressed && animations) scale else 1f, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow), label = "press")
    val a by animateFloatAsState(if (pressed) 0.85f else 1f, label = "pressA")
    graphicsLayer { scaleX = k; scaleY = k; alpha = a }
}

/** Скругление карточек с учётом ползунка «насколько скруглены углы» */
@Composable
fun cardRadius(radius: Dp): Dp {
    val scale = Defaults.doubleOrNull("ui.radius") ?: 1.0
    return maxOf(4.dp, radius * scale.toFloat())
}

private val rustyInk = rgb(0.15, 0.14, 0.09)

/**
 * Карточка в выбранном стиле (Стекло, Сплошные, Цветные, Неон, Контур, Объём, Чистые, iOS 6, Ржавые).
 * lite — строка длинного списка: вместо стекла лёгкая подложка.
 */
@Composable
fun Glass(
    radius: Dp = 24.dp,
    modifier: Modifier = Modifier,
    interactive: Boolean = false,
    lite: Boolean = false,
    contentAlignment: Alignment = Alignment.TopStart,
    content: @Composable BoxScope.() -> Unit,
) {
    val style = CardStyle.of(Defaults.int("cardStyle"))
    val r = cardRadius(radius)
    val shape = RoundedCornerShape(r)
    when (style) {
        CardStyle.SKEUO -> CompositionLocalProvider(LocalDark provides false, LocalContentColor provides Color.Black) {
            Box(modifier.skeuoCard(shape), contentAlignment = contentAlignment, content = content)
        }
        CardStyle.RUSTY -> CompositionLocalProvider(LocalDark provides false, LocalInk provides rustyInk, LocalContentColor provides rustyInk) {
            Box(modifier.rustyCard(shape), contentAlignment = contentAlignment) {
                content()
                Rivets()
            }
        }
        else -> Box(modifier.glassBackground(style, shape, lite), contentAlignment = contentAlignment, content = content)
    }
}

/** Та же карточка модификатором (без смены цветов текста внутри) */
@Composable
fun Modifier.glass(radius: Dp = 24.dp, lite: Boolean = false): Modifier {
    val style = CardStyle.of(Defaults.int("cardStyle"))
    val shape = RoundedCornerShape(cardRadius(radius))
    return when (style) {
        CardStyle.SKEUO -> this.skeuoCard(shape)
        CardStyle.RUSTY -> this.rustyCard(shape)
        else -> this.glassBackground(style, shape, lite)
    }
}

@Composable
private fun Modifier.glassBackground(style: CardStyle, shape: RoundedCornerShape, lite: Boolean): Modifier {
    val dark = LocalDark.current
    val primary = if (dark) Color.White else Color.Black
    return when {
        lite && style == CardStyle.GLASS -> this
            .clip(shape)
            .drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), (if (dark) rgb(0.11, 0.11, 0.12) else rgb(0.95, 0.95, 0.97)).copy(alpha = 0.62f)) }
            .strokeBorder(Color.White.copy(alpha = 0.10f), 0.6.dp, shape)
        style == CardStyle.SOLID -> this
            .clip(shape).drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), if (dark) rgb(0.11, 0.11, 0.12) else rgb(0.95, 0.95, 0.97)) }
            .strokeBorder(primary.copy(alpha = 0.06f), 0.6.dp, shape)
        style == CardStyle.TINTED -> {
            val b = Brand.color
            this.clip(shape).drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), b.copy(alpha = 0.14f)) }
                .strokeBorder(b.copy(alpha = 0.25f), 0.8.dp, shape)
        }
        style == CardStyle.NEON -> {
            val b = Brand.color
            val b2 = Brand.color2
            this.iosShadow(b.copy(alpha = 0.22f), 10.dp, shape = shape)
                .clip(shape)
                .drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), (if (dark) rgb(0.11, 0.11, 0.12) else rgb(0.95, 0.95, 0.97)).copy(alpha = 0.55f)) }
                .strokeBorder(Brush.linearGradient(listOf(b, b2.copy(alpha = 0.35f), b.copy(alpha = 0.6f)), Offset.Zero, Offset.Infinite), 1.1.dp, shape)
        }
        style == CardStyle.MINIMAL -> this.clip(shape)
            .drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), primary.copy(alpha = 0.025f)) }
            .strokeBorder(primary.copy(alpha = 0.12f), 0.7.dp, shape)
        style == CardStyle.RAISED -> this.iosShadow(Color.Black.copy(alpha = 0.10f), 14.dp, y = 6.dp, shape = shape)
            .clip(shape).drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), if (dark) rgb(0.11, 0.11, 0.12) else Color.White) }
        style == CardStyle.CLEAN -> this.iosShadow(Color.Black.copy(alpha = 0.06f), 10.dp, y = 4.dp, shape = shape)
            .clip(shape).drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), if (dark) rgb(0.11, 0.11, 0.12) else Color.White) }
            .strokeBorder(primary.copy(alpha = 0.07f), 0.5.dp, shape)
        else -> {
            // стекло: полупрозрачная подложка поверх живого фона
            val fill = if (dark) rgb(0.17, 0.17, 0.19).copy(alpha = 0.55f) else Color.White.copy(alpha = 0.58f)
            this.clip(shape)
                .drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), fill) }
                .strokeBorder(Color.White.copy(alpha = if (dark) 0.14f else 0.5f), 0.6.dp, shape)
        }
    }
}

/** iOS 6: белая ячейка с серой рамкой и «вдавленной» тенью */
fun Modifier.skeuoCard(shape: Shape): Modifier = this
    .iosShadow(Color.Black.copy(alpha = 0.10f), 1.5.dp, y = 1.dp, shape = shape)
    .clip(shape)
    .drawBehind {
        drawOutline(shape.createOutline(size, layoutDirection, this), Brush.verticalGradient(listOf(Color.White, Color(0xFFF3F3F3))))
    }
    .strokeBorder(rgb(0.67, 0.70, 0.74), 1.dp, shape)

/** Machinarium: старая оливковая жесть, рыжие потёки, рисованный контур и заклёпки */
fun Modifier.rustyCard(shape: Shape): Modifier = this
    .iosShadow(rgb(0.25, 0.15, 0.05).copy(alpha = 0.3f), 6.dp, y = 3.dp, shape = shape)
    .clip(shape)
    .drawBehind {
        val o = shape.createOutline(size, layoutDirection, this)
        drawOutline(o, Brush.linearGradient(listOf(rgb(0.81, 0.80, 0.69), rgb(0.64, 0.63, 0.51)), Offset.Zero, Offset(size.width, size.height)))
        drawOutline(o, Brush.radialGradient(listOf(rgb(0.62, 0.32, 0.12).copy(alpha = 0.28f), Color.Transparent),
            center = Offset(size.width, size.height), radius = 180.dp.toPx()))
    }
    .strokeBorder(androidx.compose.ui.graphics.SolidColor(rustyInk.copy(alpha = 0.3f)), 1.dp, shape, Offset(1.2f, 1.0f))
    .strokeBorder(rustyInk, 1.6.dp, shape)

@Composable
private fun BoxScope.Rivets() {
    for (a in listOf(Alignment.TopStart, Alignment.TopEnd, Alignment.BottomStart, Alignment.BottomEnd)) {
        Box(
            Modifier.align(a).padding(7.dp).size(7.dp).clip(CircleShape)
                .drawBehind {
                    drawCircle(Brush.radialGradient(listOf(rgb(0.85, 0.64, 0.42), rgb(0.36, 0.22, 0.12)),
                        center = Offset(size.width * 0.35f, size.height * 0.3f), radius = 4.5.dp.toPx()))
                    drawCircle(rustyInk.copy(alpha = 0.7f), style = Stroke(0.6.dp.toPx()))
                }
        )
    }
}

/** Мини-образец стиля карточки для выбора */
@Composable
fun Modifier.cardSample(style: CardStyle): Modifier {
    val shape = RoundedCornerShape(8.dp)
    val dark = LocalDark.current
    val primary = if (dark) Color.White else Color.Black
    val b = Brand.color
    return when (style) {
        CardStyle.GLASS -> this.clip(shape).drawBehind { drawRect(if (dark) Color(0x55303035) else Color(0x99FFFFFF)) }.strokeBorder(primary.copy(alpha = 0.1f), 0.6.dp, shape)
        CardStyle.SOLID -> this.clip(shape).drawBehind { drawRect(Ios.run { if (dark) rgb(0.11, 0.11, 0.12) else rgb(0.95, 0.95, 0.97) }) }
        CardStyle.TINTED -> this.clip(shape).drawBehind { drawRect(b.copy(alpha = 0.18f)) }
        CardStyle.NEON -> this.iosShadow(b.copy(alpha = 0.3f), 5.dp, shape = shape).strokeBorder(Brush.linearGradient(listOf(b, Brand.color2)), 1.2.dp, shape)
        CardStyle.MINIMAL -> this.strokeBorder(primary.copy(alpha = 0.2f), 0.8.dp, shape)
        CardStyle.RAISED -> this.iosShadow(Color.Black.copy(alpha = 0.15f), 4.dp, y = 2.dp, shape = shape).clip(shape).drawBehind { drawRect(if (dark) rgb(0.11, 0.11, 0.12) else Color.White) }
        CardStyle.CLEAN -> this.iosShadow(Color.Black.copy(alpha = 0.08f), 4.dp, y = 2.dp, shape = shape).clip(shape).drawBehind { drawRect(if (dark) rgb(0.11, 0.11, 0.12) else Color.White) }.strokeBorder(primary.copy(alpha = 0.1f), 0.5.dp, shape)
        CardStyle.SKEUO -> this.clip(shape).drawBehind { drawRect(Brush.verticalGradient(listOf(Color.White, Color(0xFFF0F0F0)))) }.strokeBorder(rgb(0.67, 0.70, 0.74), 1.dp, shape)
        CardStyle.RUSTY -> this.clip(shape).drawBehind { drawRect(Brush.linearGradient(listOf(rgb(0.80, 0.79, 0.68), rgb(0.63, 0.62, 0.50)))) }.strokeBorder(rgb(0.29, 0.20, 0.12), 1.4.dp, shape)
    }
}

@Composable
fun rememberPressSource() = remember { MutableInteractionSource() }

@Composable
fun density() = LocalDensity.current.density
