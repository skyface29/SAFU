package ru.student.safuhub.ui.design

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.RU
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.theme.AppFonts
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.ThemePack
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb

object Prefs {
    val animations: Boolean get() = Defaults.boolOrNull("animations") ?: true
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label, modifier = modifier)
}

/** Заголовок экрана: подпись сверху и крупное название */
@Composable
fun ScreenHeader(caption: String, title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    val gradTitle = Defaults.bool("ui.gradTitle")
    val pack = ThemePack.current
    val base = ft(30f, FontWeight.Bold)
    val titleStyle: TextStyle = AppFonts.titleFamily(pack)?.let { base.copy(fontFamily = it) } ?: base
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (gradTitle) Box(Modifier.size(14.dp, 3.dp).clip(CircleShape).background(Brand.gradient))
                Text(caption.uppercase(RU), style = ft(Ts.footnote, FontWeight.SemiBold).let { if (gradTitle) it.copy(letterSpacing = androidx.compose.ui.unit.TextUnit(1.2f, androidx.compose.ui.unit.TextUnitType.Sp)) else it },
                    color = Ios.secondaryLabel, maxLines = 1)
            }
            Text(title, style = if (gradTitle) titleStyle.copy(brush = Brand.gradient) else titleStyle,
                color = if (gradTitle) Color.Unspecified else Ios.label, maxLines = 1,
                softWrap = false, modifier = Modifier.autoShrink())
        }
        Row(verticalAlignment = Alignment.CenterVertically, content = trailing)
    }
}

/** Уменьшить текст, если не влезает (minimumScaleFactor) — упрощённо через ellipsis */
fun Modifier.autoShrink(): Modifier = this

@Composable
fun CircleIconButton(icon: String, onClick: (() -> Unit)? = null) {
    val content = @Composable {
        Glass(22.dp, Modifier.size(44.dp), contentAlignment = Alignment.Center) {
            SfIcon(icon, size = 20.dp, tint = Ios.label)
        }
    }
    if (onClick != null) Pressable(onClick) { content() } else content()
}

@Composable
fun EmptyState(icon: String, title: String, text: String, modifier: Modifier = Modifier) {
    Glass(26.dp, modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SfGradientIcon(icon, size = 44.dp)
            Text(title, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, textAlign = TextAlign.Center)
            Text(text, style = ft(Ts.subheadline), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun PulsingDot(color: Color = Brand.color) {
    val on = if (Prefs.animations) {
        val tr = rememberInfiniteTransition(label = "pulse")
        val v by tr.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = androidx.compose.animation.core.FastOutSlowInEasing), RepeatMode.Restart), label = "p")
        v
    } else 0f
    Box(Modifier.size(18.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(16.dp).graphicsLayer {
            val s = 0.6f + 1.1f * on
            scaleX = s; scaleY = s; alpha = 1f - on
        }.clip(CircleShape).background(color.copy(alpha = 0.4f)))
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
    }
}

@Composable
fun SpinningIcon(spinning: Boolean, size: Dp = 18.dp, tint: Color = Brand.color) {
    val angle = if (spinning) {
        val tr = rememberInfiniteTransition(label = "spin")
        val v by tr.animateFloat(0f, 360f, infiniteRepeatable(tween(1000, easing = LinearEasing)), label = "a")
        v
    } else 0f
    SfIcon("arrow.triangle.2.circlepath", size = size, tint = tint, modifier = Modifier.graphicsLayer { rotationZ = angle })
}

/** Плавное появление элементов списка по очереди */
fun Modifier.staggerIn(index: Int): Modifier = composed {
    val anim = remember { Animatable(if (Prefs.animations && index < 12) 0f else 1f) }
    LaunchedEffect(Unit) {
        if (anim.value < 1f) {
            kotlinx.coroutines.delay((35L * index))
            anim.animateTo(1f, spring(dampingRatio = 0.8f, stiffness = 300f))
        }
    }
    graphicsLayer {
        val v = anim.value
        alpha = v.coerceIn(0f, 1f)
        translationY = (1f - v) * 22.dp.toPx()
        val s = 0.94f + 0.06f * v
        scaleX = s; scaleY = s
        transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 0f)
    }
}

// MARK: - Цвета предметов и типов пар

object SubjectColor {
    fun color(subject: String): Color {
        if (!(Defaults.boolOrNull("schedule.colors") ?: true)) return Brand.theme.colorDyn.light
        return hashColor(subject, 0.55f, 0.92f)
    }

    fun hashColor(s: String, sat: Float, bright: Float): Color {
        var h = 5381UL
        for (cp in s.lowercase(RU).codePoints()) h = h * 33UL + cp.toULong()
        val hue = (h % 360UL).toFloat()
        return Color.hsv(hue, sat, bright)
    }
}

/** Цвет предмета как в виджете (насыщенность 0.5, яркость 1) */
fun widgetSubjectColor(s: String): Color = SubjectColor.hashColor(s, 0.5f, 1f)

/** Тип пары: единые цвета и значки для приложения, виджета и уведомлений */
data class KindStyle(val label: String, val color: Color, val icon: String) {
    companion object {
        fun of(kind: String): KindStyle {
            val k = kind.lowercase(RU)
            return when {
                k.startsWith("лекц") -> KindStyle("Лекция", rgb(0.25, 0.52, 1.0), "person.wave.2.fill")
                k.startsWith("практ") -> KindStyle("Практика", rgb(0.16, 0.75, 0.42), "pencil.and.ruler.fill")
                k.startsWith("лаб") -> KindStyle("Лабораторная", rgb(1.0, 0.55, 0.10), "flask.fill")
                k.startsWith("семин") -> KindStyle("Семинар", rgb(0.10, 0.72, 0.78), "bubble.left.and.bubble.right.fill")
                k.contains("экзам") -> KindStyle("Экзамен", rgb(0.95, 0.25, 0.30), "graduationcap.fill")
                k.contains("зач") -> KindStyle("Зачёт", rgb(0.93, 0.30, 0.62), "checkmark.seal.fill")
                k.contains("консул") -> KindStyle("Консультация", rgb(0.62, 0.40, 0.95), "questionmark.bubble.fill")
                else -> KindStyle(kind.ifEmpty { "Занятие" }, rgb(0.55, 0.58, 0.65), "book.fill")
            }
        }
    }
}

/** Цветная плашка типа пары */
@Composable
fun KindBadge(kind: String, size: Float = 11f, filled: Boolean = true) {
    val st = KindStyle.of(kind)
    Row(
        Modifier.clip(CircleShape).background(if (filled) st.color else st.color.copy(alpha = 0.16f))
            .padding(horizontal = (size * 0.6f).dp, vertical = (size * 0.25f).dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        SfIcon(st.icon, size = (size * 1.05f).dp, tint = if (filled) Color.White else st.color)
        Text(st.label.uppercase(RU), style = ft(size, FontWeight.ExtraBold), color = if (filled) Color.White else st.color, maxLines = 1, softWrap = false)
    }
}

/** Капсула-пилюля с иконкой (как pill на главной) */
@Composable
fun Pill(icon: String, text: String) {
    Row(
        Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.12f)).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SfIcon(icon, size = 13.dp, tint = Brand.color)
        Text(text, style = ft(Ts.footnote, FontWeight.SemiBold), color = Ios.label, maxLines = 1)
    }
}

@Composable
fun GradientCircleIcon(icon: String, size: Dp, iconSize: Dp, brush: Brush = Brand.gradient) {
    Box(Modifier.size(size).clip(CircleShape).background(brush), contentAlignment = Alignment.Center) {
        SfIcon(icon, size = iconSize, tint = Color.White)
    }
}

@Composable
fun HSpacer(w: Dp) = Spacer(Modifier.width(w))

@Composable
fun VSpacer(h: Dp) = Spacer(Modifier.height(h))
