package ru.student.safuhub.screens.appearance

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.student.safuhub.R
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefDouble
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.feature.eggs.Egg
import ru.student.safuhub.feature.eggs.Eggs
import ru.student.safuhub.screens.profile.AppIconPickerScreen
import ru.student.safuhub.screens.profile.AppIcons
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.ScreenHeader
import ru.student.safuhub.ui.design.glass
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.theme.AccentTheme
import ru.student.safuhub.ui.theme.AppFont
import ru.student.safuhub.ui.theme.BackdropStyle
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.CardStyle
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.LookPreset
import ru.student.safuhub.ui.theme.SchemePref
import ru.student.safuhub.ui.theme.ScrollFXStyle
import ru.student.safuhub.ui.theme.Season
import ru.student.safuhub.ui.theme.TextSizePref
import ru.student.safuhub.ui.theme.ThemePack
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb

/**
 * Оформление открывается шторкой поверх всего приложения:
 * так смена цвета не сбрасывает экран, на котором ты находишься.
 */
@Composable
fun AppearanceSheet() = DoneSheet { AppearanceScreen() }

@Composable
fun AppearanceScreen() {
    val nav = LocalNav.current
    var theme by prefString("theme", AccentTheme.BLUE.raw)
    var backdrop by prefString("bg.style", BackdropStyle.GLOW.raw)
    var intensity by prefDouble("bg.intensity", 1.0)
    var cardStyle by prefInt("cardStyle", 0)
    var radius by prefDouble("ui.radius", 1.0)
    var font by prefString("ui.font", AppFont.ROUNDED.raw)
    var scheme by prefInt("ui.scheme", 0)
    var gradTitle by prefBool("ui.gradTitle", false)
    var ambient by prefBool("ambient", true)
    var animations by prefBool("animations", true)
    var haptics by prefBool("haptics", true)
    var seasonalTheme by prefBool("theme.seasonal", false)
    var scrollFX by prefInt("ui.scrollFX", 0)
    var compact by prefBool("ui.compact", false)
    var textSize by prefInt("ui.textSize", 0)

    fun apply(p: LookPreset) {
        ThemePack.NONE.apply()   // готовый стиль заменяет тему целиком
        seasonalTheme = p.id == "season"
        theme = p.theme.raw
        backdrop = p.backdrop.raw
        cardStyle = p.card.raw
        font = p.font.raw
        radius = p.radius
        gradTitle = p.gradTitle
        scheme = p.scheme.raw
        intensity = 1.0
    }

    FormScreen("Оформление") {
        FormSection(plain = true) { raw { Preview() } }

        ThemePacksSection()

        FormSection("Готовые стили", footer = "Один тап — и всё сразу. Потом можно докрутить любую мелочь ниже.") {
            raw {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    for (p in LookPreset.all) PresetChip(p) { Haptics.success(); apply(p) }
                }
            }
        }

        FormSection("Цвет", footer = if (seasonalTheme) "Сейчас ${Season.current.title}: цвет меняется сам — зимой лёд, весной розовый, летом лайм, осенью оранжевый." else null) {
            toggle("Цвет по сезону", seasonalTheme, { seasonalTheme = it }, icon = "calendar.circle.fill")
            if (!seasonalTheme) {
                row(minHeight = 28.dp) { Text("Яркие", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel) }
                raw { ColorGrid(AccentTheme.vivid, theme) { Haptics.tap(); theme = it.raw } }
                row(minHeight = 28.dp) { Text("Строгие", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel) }
                raw { ColorGrid(AccentTheme.strict, theme) { Haptics.tap(); theme = it.raw } }
            }
        }

        FormSection("Фон", footer = "«По сезону» меняется сам: сейчас ${Season.current.title}. «Листопад» — клёны и берёзы кружатся и переворачиваются в воздухе. «Сияние» переливается как настоящее северное. «Снег» и «Сетка» почти не тратят батарею, но если жалко — выключи движение.") {
            raw {
                TileGrid(BackdropStyle.entries.filter { it != BackdropStyle.MATRIX || Eggs.has(Egg.HACKER) }) { b ->
                    OptionTile(b.icon, b.title, backdrop == b.raw) { backdrop = b.raw }
                }
            }
            if (backdrop != BackdropStyle.PLAIN.raw) {
                slider(intensity.toFloat(), { intensity = it.toDouble() }, 0.3f..1.8f, leading = "sun.min", trailing = "sun.max.fill", trailingBrand = true)
                toggle("Движение фона", ambient, { ambient = it })
            }
        }

        FormSection("Карточки", footer = "Ползунок — насколько скруглены углы: от строгих до мягких.") {
            raw {
                TileGrid(CardStyle.entries) { c ->
                    val sel = cardStyle == c.raw
                    Pressable({ Haptics.tap(); cardStyle = c.raw }, Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .background(Brand.color.copy(alpha = if (sel) 0.12f else 0f))
                            .border(1.5.dp, if (sel) Brand.color else Color.Transparent, RoundedCornerShape(12.dp)).padding(8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            CardSample(c)
                            Text(c.title, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.label, maxLines = 1)
                        }
                    }
                }
            }
            slider(radius.toFloat(), { radius = it.toDouble() }, 0.3f..1.4f, leading = "square", trailing = "circle")
        }

        FormSection("Текст") {
            segmented(AppFont.entries.map { it.raw to it.title }, font, { font = it })
            toggle("Цветные заголовки", gradTitle, { gradTitle = it })
        }

        FormSection("Интерфейс", footer = "«Объём» — карточки наклоняются у краёв экрана, «Мягко» — только плавно тают, «Без» — самое экономное. Компактная главная — меньше отступов, больше помещается на экран.") {
            segmented(ScrollFXStyle.entries.map { it.raw to it.title }, scrollFX, { scrollFX = it })
            toggle("Компактная главная", compact, { compact = it })
            picker("Размер текста", TextSizePref.entries.map { it.raw to it.title }, textSize, { textSize = it })
        }

        FormSection("Тема") {
            segmented(SchemePref.entries.map { it.raw to it.title }, scheme, { scheme = it })
            toggle("Анимации", animations, { animations = it })
            toggle("Вибрация", haptics, { haptics = it })
        }

        FormSection {
            link("Иконка приложения", "app.badge.fill") { nav?.push { AppIconPickerScreen() } }
            button("Сбросить оформление", destructive = true) {
                ThemePack.NONE.apply()
                LookPreset.all.firstOrNull { it.id == "classic" }?.let { apply(it) }
            }
        }
    }
}

// MARK: превью

@Composable
private fun Preview() {
    Box(Modifier.fillMaxWidth().height(250.dp).clip(RoundedCornerShape(24.dp))) {
        AmbientBackground()
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ScreenHeader("пятница, 25 сентября", "Привет!")
            Row(Modifier.fillMaxWidth().glass(20.dp).padding(12.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(34.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                    SfIcon("clock.fill", size = 15.dp, tint = Color.White)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text("Сейчас · 2 пара", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
                    Text("Информатика", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                }
                Text("32 мин", style = ft(Ts.caption, FontWeight.Bold), color = Brand.color,
                    modifier = Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 3.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (i in listOf("calendar", "checklist", "folder.fill")) {
                    Box(Modifier.weight(1f).height(46.dp).glass(16.dp), contentAlignment = Alignment.Center) { SfGradientIcon(i, size = 19.dp) }
                }
            }
        }
    }
}

// MARK: мелочи

@Composable
private fun PresetChip(p: LookPreset, onClick: () -> Unit) {
    val dark = LocalDark.current
    Pressable(onClick) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(64.dp, 52.dp).clip(RoundedCornerShape(14.dp))
                .background(Brush.linearGradient(listOf(p.theme.colorDyn.of(dark), p.theme.secondaryDyn.of(dark)))), contentAlignment = Alignment.Center) {
                SfIcon(p.icon, size = 22.dp, tint = Color.White)
            }
            Text(p.title, style = ft(11f, FontWeight.SemiBold, when (p.font) {
                AppFont.ROUNDED -> Design.ROUNDED
                AppFont.MONO -> Design.MONO
                AppFont.SERIF -> Design.SERIF
                AppFont.STANDARD -> Design.DEFAULT
            }), color = Ios.label)
        }
    }
}

@Composable
private fun ColorGrid(list: List<AccentTheme>, selected: String, onPick: (AccentTheme) -> Unit) {
    val dark = LocalDark.current
    BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        // как LazyVGrid(.adaptive(minimum: 52), spacing: 12)
        val cols = maxOf(1, ((maxWidth.value + 12) / 64).toInt())
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            for (row in list.chunked(cols)) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    for (th in row) {
                        val on = selected == th.raw
                        Pressable({ onPick(th) }, Modifier.weight(1f)) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                Box(Modifier.size(46.dp), contentAlignment = Alignment.Center) {
                                    Box(Modifier.size(36.dp).clip(CircleShape)
                                        .background(Brush.linearGradient(listOf(th.colorDyn.of(dark), th.secondaryDyn.of(dark)))))
                                    if (on) Box(Modifier.size(46.dp).border(2.dp, Ios.label.copy(alpha = 0.8f), CircleShape))
                                }
                                Text(th.title, style = ft(10f, FontWeight.SemiBold), color = if (on) Ios.label else Ios.secondaryLabel, maxLines = 1,
                                    overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

/** Сетка плиток (как LazyVGrid(.adaptive(minimum: 92), spacing: 10)) */
@Composable
private fun <T> TileGrid(list: List<T>, cell: @Composable (T) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        val cols = maxOf(1, ((maxWidth.value + 10) / 102).toInt())
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (row in list.chunked(cols)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    for (x in row) Box(Modifier.weight(1f)) { cell(x) }
                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun OptionTile(icon: String, title: String, selected: Boolean, action: () -> Unit) {
    Pressable({ Haptics.tap(); action() }, Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.color.copy(alpha = if (selected) 0.12f else 0f))
            .border(if (selected) 1.5.dp else 1.dp, if (selected) Brand.color else Ios.label.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
            .padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.height(24.dp), contentAlignment = Alignment.Center) {
                if (selected) SfGradientIcon(icon, size = 20.dp) else SfIcon(icon, size = 20.dp, tint = Ios.secondaryLabel)
            }
            Text(title, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Мини-образец стиля карточки для выбора (без чтения настроек) */
@Composable
private fun CardSample(style: CardStyle) {
    val shape = RoundedCornerShape(8.dp)
    val dark = LocalDark.current
    var ink = Ios.label
    val base = Modifier.fillMaxWidth().height(30.dp)
    val m = when (style) {
        CardStyle.GLASS -> base.clip(shape).background((if (dark) Color.White else Color.Black).copy(alpha = 0.06f))
            .border(0.6.dp, Ios.label.copy(alpha = 0.1f), shape)
        CardStyle.SOLID -> base.clip(shape).background(Ios.secondaryBackground)
        CardStyle.TINTED -> base.clip(shape).background(Brand.color.copy(alpha = 0.18f))
        CardStyle.NEON -> base.shadow(5.dp, shape, ambientColor = Brand.color.copy(alpha = 0.3f), spotColor = Brand.color.copy(alpha = 0.3f))
            .clip(shape).background(Ios.background).border(1.2.dp, Brand.gradient, shape)
        CardStyle.MINIMAL -> base.border(0.8.dp, Ios.label.copy(alpha = 0.2f), shape)
        CardStyle.RAISED -> base.shadow(4.dp, shape).clip(shape).background(Ios.secondaryGrouped)
        CardStyle.CLEAN -> base.shadow(3.dp, shape).clip(shape).background(Ios.secondaryGrouped).border(0.5.dp, Ios.label.copy(alpha = 0.1f), shape)
        CardStyle.SKEUO -> {
            ink = Color.Black
            base.clip(shape).background(Brush.verticalGradient(listOf(Color.White, Color(0.94f, 0.94f, 0.94f))))
                .border(1.dp, rgb(0.67, 0.70, 0.74), shape)
        }
        CardStyle.RUSTY -> {
            ink = rgb(0.16, 0.15, 0.10)
            base.clip(shape).background(Brush.linearGradient(listOf(rgb(0.80, 0.79, 0.68), rgb(0.63, 0.62, 0.50))))
                .border(1.4.dp, rgb(0.29, 0.20, 0.12), shape)
        }
    }
    Box(m, contentAlignment = Alignment.Center) { Text("Aa", style = ft(Ts.caption, FontWeight.Bold), color = ink) }
}

// MARK: - Выбор темы в «Оформлении»

@Composable
private fun ThemePacksSection() {
    val ctx = LocalContext.current
    var packRaw by prefString("look.pack", ThemePack.NONE.raw)
    var iconDone by remember { mutableStateOf(false) }
    val pack = ThemePack.of(packRaw)

    FormSection("Темы", footer = "Тема меняет всё сразу: цвет, фон, карточки, шрифт, панели. Потом можно докрутить любую мелочь ниже — тема останется.") {
        raw {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (p in ThemePack.entries) {
                    val sel = pack == p
                    Pressable({
                        Haptics.success()
                        p.apply()
                        packRaw = p.raw
                        iconDone = false
                    }, Modifier.width(84.dp)) {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(80.dp), contentAlignment = Alignment.Center) {
                                Image(painterResource(packPreview(p)), p.title,
                                    Modifier.size(70.dp).shadow(5.dp, RoundedCornerShape(16.dp)).clip(RoundedCornerShape(16.dp)),
                                    contentScale = ContentScale.Crop)
                                if (sel) Box(Modifier.size(80.dp).border(3.dp, Brand.color, RoundedCornerShape(19.dp)))
                            }
                            Text(p.title, style = ft(Ts.caption2, if (sel) FontWeight.Bold else FontWeight.SemiBold),
                                color = if (sel) Brand.color else Ios.label, maxLines = 1)
                        }
                    }
                }
            }
        }
        row { Text(pack.subtitle, style = ft(Ts.caption), color = Ios.secondaryLabel) }
        val icon = when (pack) { ThemePack.IOS6 -> "ios6"; ThemePack.MACHINARIUM -> "machinarium"; else -> null }
        if (icon != null) {
            button(if (iconDone) "Иконка темы стоит" else "Поставить иконку темы", if (iconDone) "checkmark.circle.fill" else "app.badge.fill") {
                if (AppIcons.set(ctx, icon)) { iconDone = true; Haptics.success() }
            }
        }
    }
}

private fun packPreview(p: ThemePack): Int = when (p) {
    ThemePack.NONE -> R.drawable.icon_preview_classic
    ThemePack.CLEAR -> R.drawable.icon_preview_mono
    ThemePack.IOS6 -> R.drawable.icon_preview_ios6
    ThemePack.MACHINARIUM -> R.drawable.icon_preview_machinarium
}
