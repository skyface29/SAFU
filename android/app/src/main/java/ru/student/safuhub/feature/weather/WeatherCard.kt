package ru.student.safuhub.feature.weather

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.feature.commute.CityLocator
import ru.student.safuhub.feature.commute.HomeCity
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant
import kotlin.math.roundToInt

// MARK: - Погода на главной: сейчас, по часам и что надеть

object Outfit {
    data class Item(val icon: String, val text: String)

    private fun isRain(c: Int) = c in 51..67 || c in 80..82 || c in 95..99
    private fun isSnow(c: Int) = c in 71..77 || c == 85 || c == 86

    /** Что надеть: по «ощущается», ветру и осадкам в ближайшие часы */
    fun items(h: WeatherHour, soon: List<WeatherHour>): List<Item> {
        val out = mutableListOf<Item>()
        val f = h.feels
        when {
            f < -25 -> {
                out.add(Item("thermometer.snowflake", "Пуховик, термобельё и тёплые штаны"))
                out.add(Item("hand.raised.fill", "Варежки, а не перчатки"))
                out.add(Item("face.dashed", "Шапка и шарф — закрой лицо от мороза"))
            }
            f < -15 -> {
                out.add(Item("snowflake", "Зимняя куртка, шапка, шарф и тёплые перчатки"))
                out.add(Item("shoeprints.fill", "Зимняя обувь с толстой подошвой"))
            }
            f < -5 -> out.add(Item("snowflake", "Тёплая куртка, шапка и перчатки"))
            f < 3 -> out.add(Item("wind.snow", "Демисезонная куртка и шапка"))
            f < 10 -> out.add(Item("cloud.sun.fill", "Лёгкая куртка или ветровка"))
            f < 17 -> out.add(Item("tshirt.fill", "Худи или кофта"))
            else -> out.add(Item("sun.max.fill", "Можно в футболке — тепло"))
        }
        val window = listOf(h) + soon
        val windMax = window.maxOf { it.wind }
        if (windMax >= 14) out.add(Item("tornado", "Очень сильный ветер ${windMax.roundToInt()} м/с — капюшон и ветрозащита, осторожно у щитов и деревьев"))
        else if (windMax >= 8) out.add(Item("wind", "Ветер до ${windMax.roundToInt()} м/с — с реки дует, пригодится капюшон"))
        val rain = window.any { isRain(it.code) }
        val snow = window.any { isSnow(it.code) }
        if (rain) out.add(Item("umbrella.fill", "Будет дождь — зонт или дождевик"))
        if (snow) out.add(Item("cloud.snow.fill", "Снег — непромокаемая обувь"))
        // около нуля с осадками — гололёд
        if ((rain || snow) && window.any { it.temp > -3 && it.temp < 2 }) out.add(Item("exclamationmark.triangle.fill", "Около нуля — скользко, осторожно на ступеньках"))
        return out
    }

    fun windWord(w: Double) = when {
        w < 3 -> "тихо"
        w < 8 -> "ветерок"
        w < 14 -> "сильный ветер"
        else -> "очень сильный ветер"
    }

    fun sky(code: Int) = when (code) {
        0 -> "Ясно"
        1, 2 -> "Переменная облачность"
        3 -> "Пасмурно"
        45, 48 -> "Туман"
        in 51..57 -> "Морось"
        in 61..67, in 80..82 -> "Дождь"
        in 71..77, 85, 86 -> "Снег"
        in 95..99 -> "Гроза"
        else -> "—"
    }

    /** Коротко, в одну строку: «Зимняя куртка, шапка · капюшон — ветер · зонт» */
    fun short(h: WeatherHour, soon: List<WeatherHour>): String {
        val parts = mutableListOf<String>()
        parts.add(when {
            h.feels < -25 -> "Пуховик, варежки, закрой лицо"
            h.feels < -15 -> "Зимняя куртка, шапка, шарф"
            h.feels < -5 -> "Тёплая куртка и шапка"
            h.feels < 3 -> "Куртка и шапка"
            h.feels < 10 -> "Лёгкая куртка"
            h.feels < 17 -> "Кофта или худи"
            else -> "Футболка"
        })
        val window = listOf(h) + soon
        val wind = window.maxOf { it.wind }
        if (wind >= 8) parts.add("капюшон — ветер ${wind.roundToInt()} м/с")
        if (window.any { isRain(it.code) }) parts.add("зонт")
        if (window.any { isSnow(it.code) }) parts.add("непромокаемая обувь")
        return parts.joinToString(" · ")
    }
}

@Composable
fun WeatherCardVisible(data: ScheduleData): Boolean = true

/** Погода одной строкой: «🌨 −3° · 8 м/с — куртка, шапка, капюшон». Нажал — прогноз по часам */
@Composable
fun WeatherHomeCard(data: ScheduleData) {
    var more by remember { mutableStateOf(false) }
    val city = CityLocator.city ?: HomeCity.ARKHANGELSK
    LaunchedEffect(Unit) { CityLocator.refresh() }
    LaunchedEffect(CityLocator.city) { WeatherStore.refresh(CityLocator.city) }
    val now = WeatherStore.hour(Instant.now())
    val next = WeatherStore.hours.filter { it.time > Instant.now() }.take(24)
    Glass(18.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 9.dp).animateContentSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (now != null) {
                Row(Modifier.fillMaxWidth().clickable(remember { MutableInteractionSource() }, null) { Haptics.tap(); more = !more },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(WeatherCache.emoji(now.code), style = ft(20f))
                    Text(WeatherCache.deg(now.temp), style = ft(Ts.headline, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
                    Text("· ${now.wind.roundToInt()} м/с", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
                    Text(Outfit.short(now, next.take(6)), style = ft(Ts.caption, FontWeight.Medium), color = Ios.secondaryLabel, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    val rot by animateFloatAsState(if (more) 180f else 0f, label = "rot")
                    SfIcon("chevron.down", size = 12.dp, tint = Ios.tertiaryLabel, modifier = Modifier.graphicsLayer { rotationZ = rot })
                }
                if (more) {
                    // сутки вперёд — листается пальцем влево-вправо
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 1.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (x in next) {
                            Column(Modifier.width(48.dp).clip(RoundedCornerShape(10.dp)).background(Ios.label.copy(alpha = 0.05f)).padding(vertical = 6.dp),
                                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(Fmt.format(x.time, "HH:mm"), style = ft(10f, FontWeight.SemiBold), color = Ios.secondaryLabel)
                                Text(WeatherCache.emoji(x.code), style = ft(17f))
                                Text(WeatherCache.deg(x.temp), style = ft(13f, FontWeight.Bold, mono = true), color = Ios.label)
                                Text("${x.wind.roundToInt()} м/с", style = ft(9f, FontWeight.Medium), color = Ios.secondaryLabel)
                            }
                        }
                    }
                    Text("${if (city == HomeCity.ARKHANGELSK) "Архангельск" else "Северодвинск"} · ощущается ${WeatherCache.deg(now.feels)} · ${Outfit.sky(now.code).lowercase()}",
                        style = ft(Ts.caption2), color = Ios.secondaryLabel)
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Spinner(12.dp)
                    Text("Погода…", style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
            }
        }
    }
}

/** Строка погоды на время автобуса — для карточки «Дорога» */
@Composable
fun CommuteWeatherLine(hour: WeatherHour) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Ios.label.copy(alpha = 0.05f)).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(WeatherCache.line(hour), style = ft(Ts.caption, FontWeight.Bold), color = Ios.label)
        WeatherCache.advice(hour)?.let { Text(it, style = ft(Ts.caption), color = if (hour.feels <= -25) Ios.orange else Ios.secondaryLabel) }
    }
}
