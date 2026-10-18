package ru.student.safuhub.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.sp
import ru.student.safuhub.R
import ru.student.safuhub.core.Defaults

/** Тёмная ли сейчас тема (внутри карточек iOS 6 и Machinarium — всегда светлая) */
val LocalDark = compositionLocalOf { false }
/** Цвет «основного» текста внутри текущего контейнера (Machinarium красит всё чернилами) */
val LocalInk = compositionLocalOf<Color?> { null }
val LocalTextScale = staticCompositionLocalOf { 1f }

val Nunito = FontFamily(
    Font(R.font.nunito_400, FontWeight.Normal),
    Font(R.font.nunito_500, FontWeight.Medium),
    Font(R.font.nunito_600, FontWeight.SemiBold),
    Font(R.font.nunito_700, FontWeight.Bold),
    Font(R.font.nunito_800, FontWeight.ExtraBold),
    Font(R.font.nunito_900, FontWeight.Black),
)

/** Системные цвета iOS */
object Ios {
    val dark: Boolean @Composable @ReadOnlyComposable get() = LocalDark.current
    private fun pick(dark: Boolean, l: Color, d: Color) = if (dark) d else l

    val background: Color @Composable get() = pick(dark, Color.White, Color.Black)
    val secondaryBackground: Color @Composable get() = pick(dark, hex(0xF2F2F7), hex(0x1C1C1E))
    val tertiaryBackground: Color @Composable get() = pick(dark, Color.White, hex(0x2C2C2E))
    val groupedBackground: Color @Composable get() = pick(dark, hex(0xF2F2F7), Color.Black)
    val secondaryGrouped: Color @Composable get() = pick(dark, Color.White, hex(0x1C1C1E))
    val tertiaryGrouped: Color @Composable get() = pick(dark, hex(0xF2F2F7), hex(0x2C2C2E))

    val label: Color @Composable get() = LocalInk.current ?: pick(dark, Color.Black, Color.White)
    val secondaryLabel: Color @Composable get() = LocalInk.current?.copy(alpha = 0.7f) ?: pick(dark, Color(0x993C3C43), Color(0x99EBEBF5))
    val tertiaryLabel: Color @Composable get() = LocalInk.current?.copy(alpha = 0.45f) ?: pick(dark, Color(0x4D3C3C43), Color(0x4DEBEBF5))
    val quaternaryLabel: Color @Composable get() = pick(dark, Color(0x2E3C3C43), Color(0x29EBEBF5))
    val separator: Color @Composable get() = pick(dark, Color(0x4A3C3C43), Color(0x99545458))
    val fill: Color @Composable get() = pick(dark, Color(0x33787880), Color(0x5C787880))
    val secondaryFill: Color @Composable get() = pick(dark, Color(0x29787880), Color(0x52787880))
    val tertiaryFill: Color @Composable get() = pick(dark, Color(0x1F767680), Color(0x3D767680))

    /** «primary» в SwiftUI */
    val primary: Color @Composable get() = label

    val red: Color @Composable get() = pick(dark, hex(0xFF3B30), hex(0xFF453A))
    val orange: Color @Composable get() = pick(dark, hex(0xFF9500), hex(0xFF9F0A))
    val yellow: Color @Composable get() = pick(dark, hex(0xFFCC00), hex(0xFFD60A))
    val green: Color @Composable get() = pick(dark, hex(0x34C759), hex(0x30D158))
    val mint: Color @Composable get() = pick(dark, hex(0x00C7BE), hex(0x63E6E2))
    val teal: Color @Composable get() = pick(dark, hex(0x30B0C7), hex(0x40CBE0))
    val cyan: Color @Composable get() = pick(dark, hex(0x32ADE6), hex(0x64D2FF))
    val blue: Color @Composable get() = pick(dark, hex(0x007AFF), hex(0x0A84FF))
    val indigo: Color @Composable get() = pick(dark, hex(0x5856D6), hex(0x5E5CE6))
    val purple: Color @Composable get() = pick(dark, hex(0xAF52DE), hex(0xBF5AF2))
    val pink: Color @Composable get() = pick(dark, hex(0xFF2D55), hex(0xFF375F))
    val brown: Color @Composable get() = pick(dark, hex(0xA2845E), hex(0xAC8E68))
    val gray: Color @Composable get() = pick(dark, hex(0x8E8E93), hex(0x8E8E93))
}

/** Цвет темы приложения */
object Brand {
    val theme: AccentTheme get() = AccentTheme.current
    val color: Color @Composable get() = theme.colorDyn.of(LocalDark.current)
    val color2: Color @Composable get() = theme.secondaryDyn.of(LocalDark.current)
    val gradient: Brush @Composable get() = Brush.linearGradient(listOf(color, color2), Offset.Zero, Offset.Infinite)
    fun colorFor(dark: Boolean): Color = theme.colorDyn.of(dark)
    fun color2For(dark: Boolean): Color = theme.secondaryDyn.of(dark)
}

/** Начертание шрифта (как Font.Design) */
enum class Design { DEFAULT, ROUNDED, MONO, SERIF }

/** Стандартные размеры текста iOS (Dynamic Type «Large») */
object Ts {
    const val largeTitle = 34f
    const val title = 28f
    const val title2 = 22f
    const val title3 = 20f
    const val headline = 17f
    const val body = 17f
    const val callout = 16f
    const val subheadline = 15f
    const val footnote = 13f
    const val caption = 12f
    const val caption2 = 11f
}

object AppFonts {
    fun family(design: Design, appFont: AppFont): FontFamily = when (design) {
        Design.ROUNDED -> Nunito
        Design.MONO -> FontFamily.Monospace
        Design.SERIF -> FontFamily.Serif
        Design.DEFAULT -> when (appFont) {
            AppFont.ROUNDED -> Nunito
            AppFont.STANDARD -> FontFamily.SansSerif
            AppFont.MONO -> FontFamily.Monospace
            AppFont.SERIF -> FontFamily.Serif
        }
    }

    /** Шрифт заголовков темы-пакета */
    fun titleFamily(pack: ThemePack): FontFamily? = when (pack) {
        ThemePack.IOS6 -> FontFamily.SansSerif
        ThemePack.MACHINARIUM -> FontFamily.Cursive
        else -> null
    }
}

/**
 * Стиль текста: размер в пунктах iOS, толщина и начертание.
 * Учитывает выбранный в «Оформлении» шрифт и размер текста.
 */
@Composable
fun ft(size: Float, weight: FontWeight = FontWeight.Normal, design: Design = Design.DEFAULT, mono: Boolean = false,
       italic: Boolean = false): TextStyle {
    val appFont = AppFont.of(Defaults.string("ui.font"))
    val scale = LocalTextScale.current
    return TextStyle(
        fontFamily = AppFonts.family(design, appFont),
        fontWeight = weight,
        fontSize = (size * scale).sp,
        lineHeight = (size * scale * 1.22f).sp,
        fontFeatureSettings = if (mono) "tnum" else null,
        fontStyle = if (italic) androidx.compose.ui.text.font.FontStyle.Italic else null,
        lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
    )
}

@Composable
fun SafuTheme(content: @Composable () -> Unit) {
    val scheme = SchemePref.of(Defaults.intOrNull("ui.scheme") ?: 0)
    val dark = when (scheme) {
        SchemePref.SYSTEM -> isSystemInDarkTheme()
        SchemePref.LIGHT -> false
        SchemePref.DARK -> true
    }
    val textScale = TextSizePref.of(Defaults.int("ui.textSize")).scale
    AccentTheme.current // подписка на смену цвета
    CompositionLocalProvider(LocalDark provides dark, LocalTextScale provides textScale) {
        MaterialScheme(content)
    }
}

/** Material-компоненты (переключатели, поля, меню) в цветах темы */
@Composable
fun MaterialScheme(content: @Composable () -> Unit) {
    val dark = LocalDark.current
    val brand = Brand.color
    val colors = if (dark) darkColorScheme(
        primary = brand, onPrimary = Color.White, secondary = Brand.color2,
        background = Color.Black, surface = hex(0x1C1C1E), surfaceVariant = hex(0x2C2C2E),
        surfaceContainer = hex(0x2C2C2E), surfaceContainerHigh = hex(0x2C2C2E), surfaceContainerHighest = hex(0x3A3A3C),
        surfaceContainerLow = hex(0x1C1C1E), surfaceContainerLowest = Color.Black,
        onSurface = Color.White, onBackground = Color.White, onSurfaceVariant = Color(0x99EBEBF5),
        outline = Color(0x99545458), outlineVariant = Color(0x55545458), error = hex(0xFF453A),
    ) else lightColorScheme(
        primary = brand, onPrimary = Color.White, secondary = Brand.color2,
        background = Color.White, surface = Color.White, surfaceVariant = hex(0xF2F2F7),
        surfaceContainer = Color.White, surfaceContainerHigh = Color.White, surfaceContainerHighest = hex(0xF2F2F7),
        surfaceContainerLow = hex(0xF7F7FA), surfaceContainerLowest = Color.White,
        onSurface = Color.Black, onBackground = Color.Black, onSurfaceVariant = Color(0x993C3C43),
        outline = Color(0x4A3C3C43), outlineVariant = Color(0x2E3C3C43), error = hex(0xFF3B30),
    )
    MaterialTheme(colorScheme = colors) {
        CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides if (dark) Color.White else Color.Black) {
            content()
        }
    }
}
