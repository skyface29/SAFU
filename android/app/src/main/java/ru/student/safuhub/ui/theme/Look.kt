package ru.student.safuhub.ui.theme

import androidx.compose.ui.graphics.Color
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import java.time.Instant

fun rgb(r: Double, g: Double, b: Double, a: Double = 1.0) = Color(r.toFloat(), g.toFloat(), b.toFloat(), a.toFloat())
fun hex(h: Long, a: Float = 1f) = Color(((h shr 16) and 0xFF).toInt(), ((h shr 8) and 0xFF).toInt(), (h and 0xFF).toInt(), (a * 255).toInt())

/** Цвет, который сам подстраивается под светлую и тёмную тему */
data class Dyn(val light: Color, val dark: Color) {
    fun of(dark: Boolean) = if (dark) this.dark else light
}

private fun fixed(c: Color) = Dyn(c, c)
private fun dyn(l: Long, d: Long) = Dyn(hex(l), hex(d))

// MARK: - Тема

enum class AccentTheme(val raw: String, val title: String, val colorDyn: Dyn, val secondaryDyn: Dyn) {
    BLUE("blue", "Синяя", fixed(rgb(0.16, 0.45, 0.98)), fixed(rgb(0.30, 0.80, 0.98))),
    VIOLET("violet", "Фиолет", fixed(rgb(0.52, 0.35, 0.98)), fixed(rgb(0.90, 0.40, 0.90))),
    TEAL("teal", "Бирюза", fixed(rgb(0.10, 0.68, 0.66)), fixed(rgb(0.35, 0.85, 0.45))),
    ORANGE("orange", "Апельсин", fixed(rgb(0.98, 0.50, 0.18)), fixed(rgb(0.98, 0.78, 0.25))),
    PINK("pink", "Розовая", fixed(rgb(0.95, 0.30, 0.55)), fixed(rgb(0.98, 0.55, 0.40))),
    CYBER("cyber", "Кибер", fixed(rgb(0.00, 0.78, 0.95)), fixed(rgb(0.72, 0.35, 1.00))),
    AURORA("aurora", "Сияние", fixed(rgb(0.16, 0.80, 0.62)), fixed(rgb(0.45, 0.40, 0.95))),
    ICE("ice", "Лёд", fixed(rgb(0.35, 0.66, 0.95)), fixed(rgb(0.70, 0.90, 1.00))),
    LIME("lime", "Лайм", fixed(rgb(0.45, 0.80, 0.10)), fixed(rgb(0.10, 0.75, 0.60))),
    CRIMSON("crimson", "Алая", fixed(rgb(0.90, 0.16, 0.30)), fixed(rgb(1.00, 0.50, 0.30))),
    GOLD("gold", "Золото", fixed(rgb(0.92, 0.65, 0.12)), fixed(rgb(0.98, 0.40, 0.30))),
    GRAPHITE("graphite", "Графит", fixed(rgb(0.38, 0.42, 0.50)), fixed(rgb(0.62, 0.66, 0.74))),
    AUTUMN("autumn", "Осень", fixed(rgb(0.93, 0.45, 0.12)), fixed(rgb(0.80, 0.16, 0.22))),
    IOS6("ios6", "iOS 6", fixed(rgb(0.20, 0.45, 0.80)), fixed(rgb(0.42, 0.65, 0.92))),
    RUST("rust", "Ржавчина", fixed(rgb(0.72, 0.40, 0.17)), fixed(rgb(0.37, 0.56, 0.48))),
    // строгие: спокойные глубокие цвета без кислотных переходов
    NAVY("navy", "Тёмно-синяя", dyn(0x1B3A6B, 0x5B7FC4), dyn(0x2F5288, 0x7896D0)),
    SAFU("safu", "САФУ", dyn(0x004C97, 0x3D84D6), dyn(0x1F66B0, 0x6AA2E0)),
    BORDEAUX("bordeaux", "Бордо", dyn(0x7A1F2B, 0xB5525E), dyn(0x96323F, 0xC56D77)),
    FOREST("forest", "Хвоя", dyn(0x1F5A3D, 0x4F9A6E), dyn(0x2F7250, 0x6BAE86)),
    PETROL("petrol", "Петроль", dyn(0x0F5561, 0x3F939E), dyn(0x1E6C78, 0x5CA8B2)),
    SLATE("slate", "Сланец", dyn(0x3E4C5C, 0x7F8FA3), dyn(0x566578, 0x98A6B8)),
    OLIVE("olive", "Олива", dyn(0x5A5E28, 0x9A9E58), dyn(0x72773A, 0xB0B470)),
    COFFEE("coffee", "Кофе", dyn(0x6B4630, 0xA67C5E), dyn(0x86593E, 0xBA9276)),
    PLUM("plum", "Слива", dyn(0x5B2D66, 0x9A6BA6), dyn(0x74407F, 0xB085BB)),
    INK("ink", "Чернила", dyn(0x1E2126, 0x8C929C), dyn(0x3A3F47, 0xA4AAB3));

    val isStrict: Boolean get() = this in strict

    companion object {
        val strict = listOf(NAVY, SAFU, BORDEAUX, FOREST, PETROL, SLATE, OLIVE, COFFEE, PLUM, INK)
        val vivid = entries.filter { it !in strict }
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw }

        val current: AccentTheme
            get() {
                if (Defaults.bool("theme.seasonal")) return Season.current.theme
                return of(Defaults.string("theme")) ?: BLUE
            }
    }
}

// MARK: - Живой фон

enum class BackdropStyle(val raw: String, val title: String, val icon: String) {
    SEASONAL("seasonal", "По сезону", "calendar.circle.fill"),
    GLOW("glow", "Свет", "circle.hexagongrid.fill"),
    LEAVES("leaves", "Листопад", "leaf.fill"),
    PETALS("petals", "Цветение", "camera.macro"),
    SUMMER("summer", "Лето", "sun.max.fill"),
    AURORA("aurora", "Сияние", "wind"),
    GRID("grid", "Сетка", "grid"),
    SNOW("snow", "Снег", "snowflake"),
    WASH("wash", "Градиент", "paintbrush.pointed.fill"),
    PLAIN("plain", "Чистый", "square"),
    MATRIX("matrix", "Матрица", "terminal.fill"),
    SOFT("soft", "Мягкий", "square.fill"),
    LINEN("linen", "iOS 6", "text.justify"),
    WORKSHOP("workshop", "Мастерская", "gearshape.2.fill");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw }
        val current: BackdropStyle get() = of(Defaults.string("bg.style")) ?: GLOW
    }
}

/** Время года — для фона и цвета «по сезону» */
enum class Season(val title: String, val backdrop: BackdropStyle, val theme: AccentTheme) {
    WINTER("зима — снег", BackdropStyle.SNOW, AccentTheme.ICE),
    SPRING("весна — цветение", BackdropStyle.PETALS, AccentTheme.PINK),
    SUMMER("лето — солнечные блики", BackdropStyle.SUMMER, AccentTheme.LIME),
    AUTUMN("осень — листопад", BackdropStyle.LEAVES, AccentTheme.AUTUMN);

    companion object {
        val current: Season get() = of(Instant.now())
        fun of(d: Instant): Season = when (Cal.month(d)) {
            12, 1, 2 -> WINTER
            3, 4, 5 -> SPRING
            6, 7, 8 -> SUMMER
            else -> AUTUMN
        }
    }
}

/** Стили карточек */
enum class CardStyle(val raw: Int, val title: String) {
    GLASS(0, "Стекло"), SOLID(1, "Сплошные"), TINTED(2, "Цветные"), NEON(3, "Неон"), MINIMAL(4, "Контур"),
    RAISED(5, "Объём"), CLEAN(6, "Чистые"), SKEUO(7, "iOS 6"), RUSTY(9, "Ржавые");

    companion object {
        fun of(raw: Int) = entries.firstOrNull { it.raw == raw } ?: GLASS
    }
}

enum class AppFont(val raw: String, val title: String) {
    ROUNDED("rounded", "Круглый"), STANDARD("standard", "Строгий"), MONO("mono", "Код"), SERIF("serif", "Книжный");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw } ?: ROUNDED
    }
}

enum class SchemePref(val raw: Int, val title: String) {
    SYSTEM(0, "Авто"), LIGHT(1, "Светлая"), DARK(2, "Тёмная");

    companion object {
        fun of(raw: Int) = entries.firstOrNull { it.raw == raw } ?: SYSTEM
    }
}

/** Размер текста в приложении */
enum class TextSizePref(val raw: Int, val title: String, val scale: Float) {
    SYSTEM(0, "Как в телефоне", 1f), SMALL(1, "Меньше", 0.94f), LARGE(2, "Крупнее", 1.12f), XLARGE(3, "Крупный", 1.24f);

    companion object {
        fun of(raw: Int) = entries.firstOrNull { it.raw == raw } ?: SYSTEM
    }
}

/** Как карточки ведут себя при прокрутке */
enum class ScrollFXStyle(val raw: Int, val title: String) {
    DEPTH(0, "Объём"), SOFT(1, "Мягко"), OFF(2, "Без");

    companion object {
        fun of(raw: Int) = entries.firstOrNull { it.raw == raw } ?: DEPTH
    }
}

// MARK: - Готовые стили

data class LookPreset(
    val id: String, val title: String, val icon: String, val theme: AccentTheme, val backdrop: BackdropStyle,
    val card: CardStyle, val font: AppFont, val radius: Double, val gradTitle: Boolean, val scheme: SchemePref,
) {
    companion object {
        val all: List<LookPreset>
            get() = listOf(
                LookPreset("strict", "Строгий", "rectangle.grid.1x2", AccentTheme.BLUE, BackdropStyle.SOFT, CardStyle.CLEAN,
                    AppFont.STANDARD, 0.7, false, SchemePref.SYSTEM),
                LookPreset("season", "По сезону", "calendar.circle.fill", Season.current.theme, BackdropStyle.SEASONAL,
                    CardStyle.GLASS, AppFont.ROUNDED, 1.05, true, SchemePref.SYSTEM),
                LookPreset("autumn", "Осень", "leaf.fill", AccentTheme.AUTUMN, BackdropStyle.LEAVES, CardStyle.GLASS,
                    AppFont.ROUNDED, 1.1, true, SchemePref.SYSTEM),
                LookPreset("tech", "Техно", "cpu", AccentTheme.CYBER, BackdropStyle.GRID, CardStyle.NEON,
                    AppFont.MONO, 0.55, true, SchemePref.DARK),
                LookPreset("arctic", "Арктика", "snowflake", AccentTheme.ICE, BackdropStyle.SNOW, CardStyle.GLASS,
                    AppFont.ROUNDED, 1.0, false, SchemePref.SYSTEM),
                LookPreset("aurora", "Сияние", "sparkles", AccentTheme.AURORA, BackdropStyle.AURORA, CardStyle.GLASS,
                    AppFont.ROUNDED, 1.15, true, SchemePref.DARK),
                LookPreset("minimal", "Минимал", "circle.dashed", AccentTheme.GRAPHITE, BackdropStyle.PLAIN, CardStyle.MINIMAL,
                    AppFont.STANDARD, 0.7, false, SchemePref.SYSTEM),
                LookPreset("paper", "Конспект", "book.closed", AccentTheme.GOLD, BackdropStyle.WASH, CardStyle.RAISED,
                    AppFont.SERIF, 0.8, false, SchemePref.LIGHT),
                LookPreset("classic", "Классика", "drop.fill", AccentTheme.BLUE, BackdropStyle.GLOW, CardStyle.GLASS,
                    AppFont.ROUNDED, 1.0, false, SchemePref.SYSTEM),
            )
    }
}

// MARK: - Темы-пакеты

enum class ThemePack(val raw: String, val title: String, val subtitle: String, val appIcon: String?, val preview: String) {
    NONE("none", "Своя", "Всё настраиваешь сам", null, "IconPreview-Classic"),
    CLEAR("clear", "Ясный", "Чистый и спокойный: ничего лишнего, всё читается сразу", null, "IconPreview-Mono"),
    IOS6("ios6", "iOS 6", "Глянцевые панели, полоски и ячейки как в 2012-м", "AppIcon-iOS6", "IconPreview-iOS6"),
    MACHINARIUM("machinarium", "Machinarium", "Свалка в смоге: горы ржавого хлама, дирижабль, туман", "AppIcon-Machinarium", "IconPreview-Machinarium");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw } ?: NONE
        val current: ThemePack get() = of(Defaults.string("look.pack"))
    }

    /** Все настройки оформления разом */
    fun apply() {
        val d = Defaults
        d.set("look.pack", raw)
        if (this == NONE) return
        data class S(val t: AccentTheme, val b: BackdropStyle, val c: CardStyle, val f: AppFont, val r: Double, val s: Int)
        val set = when (this) {
            NONE, CLEAR -> S(AccentTheme.BLUE, BackdropStyle.SOFT, CardStyle.CLEAN, AppFont.STANDARD, 0.85, 0)
            IOS6 -> S(AccentTheme.IOS6, BackdropStyle.LINEN, CardStyle.SKEUO, AppFont.STANDARD, 0.45, 1)
            MACHINARIUM -> S(AccentTheme.RUST, BackdropStyle.WORKSHOP, CardStyle.RUSTY, AppFont.ROUNDED, 0.6, 1)
        }
        d.set("theme.seasonal", false)
        d.set("theme", set.t.raw)
        d.set("bg.style", set.b.raw)
        d.set("cardStyle", set.c.raw)
        d.set("ui.font", set.f.raw)
        d.set("ui.radius", set.r)
        d.set("ui.scheme", set.s)
        d.set("ui.gradTitle", false)
        d.set("bg.intensity", 1.0)
    }
}

/** Оформление по умолчанию для новых студентов: тёмно-синее, как в первых версиях приложения */
object FirstLook {
    fun applyIfNew() {
        val d = Defaults
        if (d.bool("look.firstDefault")) return
        d.set("look.firstDefault", true)
        if (d.bool("onboarded") || d.has("theme")) return
        d.set("theme", AccentTheme.BLUE.raw)
        d.set("bg.style", BackdropStyle.GLOW.raw)
        d.set("cardStyle", CardStyle.GLASS.raw)
        d.set("ui.font", AppFont.ROUNDED.raw)
        d.set("ui.radius", 1.0)
        d.set("ui.gradTitle", false)
        d.set("theme.seasonal", false)
        d.set("ui.scheme", SchemePref.DARK.raw)
        d.set("look.pack", "")
    }
}

/** Возврат прежнего вида после 9.9 */
object StrictLook {
    fun applyOnce() {
        val d = Defaults
        if (!d.bool("look.strict.99") || d.bool("look.strict.undo")) return
        d.set("look.strict.undo", true)
        val p = LookPreset.all.firstOrNull { it.id == "season" } ?: return
        if (d.int("cardStyle") != CardStyle.CLEAN.raw || d.string("bg.style") != BackdropStyle.SOFT.raw) return
        d.set("theme.seasonal", true)
        d.set("theme", p.theme.raw)
        d.set("bg.style", p.backdrop.raw)
        d.set("cardStyle", p.card.raw)
        d.set("ui.font", p.font.raw)
        d.set("ui.radius", p.radius)
        d.set("ui.gradTitle", p.gradTitle)
    }
}
