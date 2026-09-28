package ru.student.safuhub.screens.commute

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.core.hmString
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.commute.BusDayType
import ru.student.safuhub.feature.commute.BusDirection
import ru.student.safuhub.feature.commute.BusDirectionMemory
import ru.student.safuhub.feature.commute.BusPalette
import ru.student.safuhub.feature.commute.BusRoute
import ru.student.safuhub.feature.commute.BusRouteStore
import ru.student.safuhub.feature.commute.BusTrip
import ru.student.safuhub.feature.commute.CityLocator
import ru.student.safuhub.feature.commute.CommutePlanner
import ru.student.safuhub.feature.commute.CommuteSettings
import ru.student.safuhub.feature.commute.HomeCity
import ru.student.safuhub.feature.commute.colorFromHex
import ru.student.safuhub.feature.commute.minutesText
import ru.student.safuhub.feature.eggs.Egg
import ru.student.safuhub.feature.eggs.Eggs
import ru.student.safuhub.feature.features.FeatureFlags
import ru.student.safuhub.feature.game.BusGameScreen
import ru.student.safuhub.feature.map.TransportMapScreen
import ru.student.safuhub.feature.map.YandexMap
import ru.student.safuhub.feature.weather.CommuteWeatherLine
import ru.student.safuhub.feature.weather.WeatherStore
import ru.student.safuhub.feature.web.CustomTabs
import ru.student.safuhub.system.BusLive
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.Prefs
import ru.student.safuhub.ui.design.rememberNow
import ru.student.safuhub.ui.design.strokeBorder
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.Segmented
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// MARK: - Карточка «Дорога» на главной

enum class CommuteStyle(val raw: String, val title: String, val icon: String) {
    FULL("full", "Подробно", "rectangle.grid.1x2"),
    COMPACT("compact", "Компактно", "rectangle"),
    LINE("line", "Одной строкой", "minus.rectangle"),
    BOARD("board", "Табло", "tablecells");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw } ?: FULL
    }
}

/** Что показывать сейчас: утренняя поездка или дорога домой */
private data class CommuteInfo(
    var title: String,
    val busTime: Instant?,
    val subtitle: String,
    val hint: String,
    val badge: String,
    val badgeUrgent: Boolean,
    val others: List<Instant>,
    val toCity: Boolean,
    val empty: String?,
)

private fun emptyInfo(text: String, toCity: Boolean = true) = CommuteInfo("", null, "", "", "", false, emptyList(), toCity, text)

private fun makeInfo(data: ScheduleData, route: BusRoute, now: Instant): CommuteInfo {
    val today = Cal.startOfDay(now)
    val first = CommutePlanner.firstPair(today, data)
    val last = CommutePlanner.lastPair(today, data)
    if (route.isEmpty) return emptyInfo("У автобуса ${route.number} нет расписания — Профиль → Дорога → Мои автобусы")

    fun morningInfo(trip: BusTrip, pair: LessonSlot, title: String): CommuteInfo {
        val leave = trip.departure.minusSeconds(CommuteSettings.homeMinutes * 60L)
        val mins = ((leave.epochSecond - now.epochSecond) / 60).toInt()
        val badge = if (mins in 0 until 180) (if (mins == 0) "выходи сейчас" else "выйти через ${minutesText(mins)}") else ""
        return CommuteInfo(title, trip.departure, (if (route.homeStop.isEmpty()) "" else "с ${route.homeStop} · ") + "пара в ${hmString(pair.start)}",
            "выйти из дома в ${hmString(leave)}", badge, mins <= 10, emptyList(), true, null)
    }
    fun homeInfo(after: Instant, lastEnd: Instant): CommuteInfo {
        val buses = CommutePlanner.afterClasses(after)
        val b = buses.firstOrNull() ?: return CommuteInfo("Домой", null, "", "", "", false, emptyList(), false, "Сегодня автобусов домой больше нет")
        val m = ((b.departure.epochSecond - now.epochSecond) / 60).toInt()
        return CommuteInfo(if (now < lastEnd) "После пар" else "Домой", b.departure,
            (if (route.campusStop.isEmpty()) "домой" else "от ${route.campusStop}") + (if (now < lastEnd) " · конец пар ${hmString(lastEnd)}" else ""),
            "дома ~${hmString(b.arrival)}", if (m <= 0) "уходит" else "через ${minutesText(m)}", m <= 15, buses.drop(1).map { it.departure }, false, null)
    }
    fun nextStudyDay(): Instant? = (1 until 8).map { Cal.addDays(today, it) }.firstOrNull { CommutePlanner.firstPair(it, data) != null }
    fun dayName(d: Instant) = Fmt.format(d, "EEEE").capitalizedFirstLetter()

    // знаем город — решаем по нему, а не только по времени
    val city = CityLocator.city
    if (CityLocator.enabled && route.useGeo && city != null) {
        val here = "📍 в ${city.title}"
        when (city) {
            HomeCity.ARKHANGELSK -> {
                val info = homeInfo(maxOf(now, last?.end ?: now), last?.end ?: now)
                info.title = if (last != null && now < last.end) "После пар · $here" else "Домой · $here"
                return info
            }
            HomeCity.SEVERODVINSK -> {
                val upcoming = ScheduleEngine.slots(today, data).firstOrNull { !it.isRemote && it.start > now }
                val trip = upcoming?.let { CommutePlanner.morning(it) }
                if (upcoming != null && trip != null && trip.departure > now) return morningInfo(trip, upcoming, "В пары · $here")
                val next = nextStudyDay()
                val f = next?.let { CommutePlanner.firstPair(it, data) }
                val t2 = f?.let { CommutePlanner.morning(it) }
                if (next != null && f != null && t2 != null) {
                    val info = morningInfo(t2, f, if (Cal.isTomorrow(next)) "Завтра" else dayName(next))
                    info.title += " · $here"
                    return info
                }
            }
        }
    }
    if (first != null && now < first.start) CommutePlanner.morning(first)?.let { return morningInfo(it, first, "Сегодня в пары") }
    if (last != null && now < last.end.plusSeconds(4 * 3600)) return homeInfo(maxOf(now, last.end), last.end)
    val next = nextStudyDay()
    val f = next?.let { CommutePlanner.firstPair(it, data) }
    val trip = f?.let { CommutePlanner.morning(it) }
    if (next != null && f != null && trip != null) return morningInfo(trip, f, if (Cal.isTomorrow(next)) "Завтра" else dayName(next))
    return emptyInfo("На неделю поездок нет")
}

@Composable
fun CommuteCard(data: ScheduleData, onHide: (() -> Unit)? = null) {
    var styleRaw by prefString("commute.style", CommuteStyle.FULL.raw)
    val style = CommuteStyle.of(styleRaw)
    BusRouteStore.load()
    val route = BusRouteStore.active
    val showTimetable = remember { mutableStateOf(false) }
    var busRunning by remember { mutableStateOf(BusLive.isRunning) }
    SheetBinding(showTimetable) { BusTimetableSheet(data) }
    LaunchedEffect(showTimetable.value) { busRunning = BusLive.isRunning }
    LaunchedEffect(Unit) { CityLocator.refresh() }
    LaunchedEffect(CityLocator.city) { WeatherStore.refresh(CityLocator.city) }
    val now = rememberNow(30)
    val info = makeInfo(data, route, now)

    val menu: ru.student.safuhub.ui.kit.MenuScope.() -> Unit = {
        item("Всё расписание ${route.number}", "list.bullet.rectangle") { showTimetable.value = true }
        if (busRunning) item("Убрать из шторки", "xmark.circle", destructive = true) { Haptics.tap(); BusLive.stopByUser(); busRunning = false }
        if (BusRouteStore.routes.size > 1) {
            divider()
            header("Мой автобус")
            for (r in BusRouteStore.routes) item(r.title, "bus.fill", checked = r.id == BusRouteStore.activeID) { BusRouteStore.activate(r); busRunning = false }
        }
        divider()
        header("Вид")
        for (s in CommuteStyle.entries) item(s.title, s.icon, checked = s == style) { styleRaw = s.raw }
        if (onHide != null) {
            divider()
            item("Убрать с главной", "eye.slash", destructive = true) { onHide() }
        }
    }
    val menuButton = @Composable {
        IosMenu(items = menu) { SfIcon("ellipsis.circle.fill", size = 24.dp, tint = Brand.color) }
    }
    val header = @Composable {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SfIcon("bus.fill", size = 14.dp, tint = Brand.color)
            Text("АВТОБУС ${route.number}", style = ft(Ts.caption, FontWeight.ExtraBold), color = Brand.color)
            if (busRunning) LiveBadge(route.color)
            Spacer(Modifier.weight(1f))
            Text("расписание ›", style = ft(Ts.caption2, FontWeight.Bold), color = Ios.secondaryLabel)
            menuButton()
        }
    }
    ContextMenuBox(items = menu, modifier = Modifier.fillMaxWidth().animateContentSize(), onClick = { Haptics.tap(); showTimetable.value = true }) {
        when (style) {
            CommuteStyle.FULL -> Glass(24.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    header()
                    if (info.empty != null) Text(info.empty, style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                    else Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(info.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.secondaryLabel, modifier = Modifier.weight(1f))
                            Badge(info)
                        }
                        info.busTime?.let { Text("Автобус в ${hmString(it)}", style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label) }
                        Text(info.subtitle, style = ft(Ts.caption), color = Ios.secondaryLabel)
                        if (info.hint.isNotEmpty()) Text(info.hint, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label)
                        if (info.others.isNotEmpty()) Text("Следующие: " + info.others.joinToString(", ") { hmString(it) }, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label)
                        info.busTime?.let { t -> WeatherStore.hour(t)?.let { CommuteWeatherLine(it) } }
                    }
                }
            }
            CommuteStyle.COMPACT -> Glass(22.dp, Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    BusIcon(42.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (info.empty != null) Text(info.empty, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                        else {
                            Text(info.busTime?.let { "${info.title} · ${hmString(it)}" } ?: info.title, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                            Text(info.hint.ifEmpty { info.subtitle }, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    if (info.empty == null) Badge(info)
                    menuButton()
                }
            }
            CommuteStyle.LINE -> Glass(18.dp, Modifier.fillMaxWidth()) {
                Row(Modifier.padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SfIcon("bus.fill", size = 16.dp, tint = Brand.color)
                    if (info.empty != null) Text(info.empty, style = ft(Ts.subheadline), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    else {
                        info.busTime?.let {
                            Text("${route.number} · ${hmString(it)}", style = ft(Ts.subheadline, FontWeight.Bold), color = Ios.label, maxLines = 1)
                            Text(if (info.toCity) "в город" else "домой", style = ft(Ts.subheadline), color = Ios.secondaryLabel, maxLines = 1)
                        }
                        Spacer(Modifier.weight(1f))
                        Badge(info)
                    }
                    menuButton()
                }
            }
            CommuteStyle.BOARD -> Glass(24.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    header()
                    if (info.empty != null) Text(info.empty, style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                    else {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text((if (info.toCity) "${route.homeStop} → ${route.campusStop}" else "${route.campusStop} → ${route.homeStop}").uppercase(RU),
                                    style = ft(Ts.caption2, FontWeight.ExtraBold), color = Ios.secondaryLabel)
                                info.busTime?.let { Text(hmString(it), style = ft(44f, FontWeight.ExtraBold, Design.ROUNDED, mono = true).copy(brush = Brand.gradient)) }
                            }
                            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Badge(info)
                                for (t in info.others.take(2)) {
                                    Text(hmString(t), style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED, mono = true), color = Ios.label,
                                        modifier = Modifier.clip(CircleShape).background(Ios.label.copy(alpha = 0.07f)).padding(horizontal = 10.dp, vertical = 4.dp))
                                }
                            }
                        }
                        Text(if (info.hint.isEmpty()) info.subtitle else "${info.subtitle} · ${info.hint}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                }
            }
        }
    }
}

@Composable
private fun BusIcon(size: androidx.compose.ui.unit.Dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(size * 0.3f)).background(Brand.gradient), contentAlignment = Alignment.Center) {
        SfIcon("bus.fill", size = size * 0.48f, tint = Color.White)
    }
}

@Composable
private fun Badge(i: CommuteInfo) {
    if (i.badge.isEmpty()) return
    val c = if (i.badgeUrgent) Ios.orange else Brand.color
    Text(i.badge, style = ft(Ts.caption, FontWeight.Bold), color = c, maxLines = 1,
        modifier = Modifier.clip(CircleShape).background(c.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 3.dp))
}

/** Маленький мигающий значок LIVE */
@Composable
fun LiveBadge(color: Color = Color.Red) {
    val a = if (Prefs.animations) {
        val tr = rememberInfiniteTransition(label = "live")
        tr.animateFloat(1f, 0.3f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "a").value
    } else 1f
    Row(Modifier.clip(CircleShape).background(color.copy(alpha = 0.14f)).padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Box(Modifier.size(5.dp).graphicsLayer { alpha = a }.clip(CircleShape).background(color))
        Text("LIVE", style = ft(9f, FontWeight.Black, Design.ROUNDED), color = color)
    }
}

// MARK: - Настройки дороги

@Composable
fun CommuteSettingsScreen() {
    val nav = LocalNav.current
    var enabled by prefBool("commute.enabled", true)
    var walk by prefInt("commute.walk", 15)
    var home by prefInt("commute.home", 10)
    var notify by prefBool("commute.notify", true)
    var style by prefString("commute.style", CommuteStyle.FULL.raw)
    var geo by prefBool("commute.geo", true)
    var busLiveOn by prefBool("busLive.on", true)
    var busLiveAuto by prefBool("busLive.auto", true)
    var busRunning by remember { mutableStateOf(BusLive.isRunning) }
    BusRouteStore.load()
    val route = BusRouteStore.active
    androidx.compose.runtime.DisposableEffect(Unit) { onDispose { ScheduleStore.refreshSideEffects() } }
    FormScreen("Дорога") {
        FormSection(footer = "Добавь свой автобус или вставь код от одногруппника. Выбранный считает всё остальное на этом экране.") {
            row(onClick = { nav?.push { BusRoutesScreen() } }) {
                RouteNumber(route, 44.dp, 36.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Мои автобусы", style = ft(Ts.body, FontWeight.SemiBold), color = Ios.label)
                    Text(route.routeText + if (BusRouteStore.routes.size > 1) " · ещё ${BusRouteStore.routes.size - 1}" else "",
                        style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                SfIcon("chevron.right", size = 16.dp, tint = Ios.tertiaryLabel)
            }
        }
        FormSection {
            toggle("Показывать дорогу", enabled, { enabled = it })
            toggle("Напоминать, когда выходить", notify, { notify = it })
            if (route.useGeo) toggle("Определять город по геолокации", geo, { geo = it; if (it) CityLocator.refresh(force = true) })
            picker("Вид на главной", CommuteStyle.entries.map { it.raw to it.title }, style, { style = it })
        }
        FormSection("Время · автобус ${route.number}",
            footer = if (route.builtIn) "Для 150: пара в 8:20 → автобус 7:00, пара в 10:10 → 8:30. Для остальных пар берётся последний рейс, который уходит не позже чем за «выезд за» до начала."
            else "Берётся последний рейс, который уходит не позже чем за «выезд за» до начала первой пары.") {
            stepper("До остановки из дома: $home мин", home, { home = it }, 0..60, 5)
            stepper("В пути: ${route.travelMinutes} мин", route.travelMinutes, { v -> BusRouteStore.updateActive { it.copy(travelMinutes = v) } }, 5..240, 5)
            stepper("Выезд за ${route.leadMinutes} мин до пары", route.leadMinutes, { v -> BusRouteStore.updateActive { it.copy(leadMinutes = v) } }, 10..240, 5)
            stepper("После пар до остановки: $walk мин", walk, { walk = it }, 0..60, 5)
        }
        FormSection("Шторка и экран блокировки",
            footer = "Выключает только автобус — уведомление о паре остаётся. Убрать можно и прямо из шторки: крестик на плашке. Убранный рейс в тот же день сам не вернётся.") {
            toggle("Автобус в шторке", busLiveOn, { on -> busLiveOn = on; if (!on) { BusLive.stop(); busRunning = false } }, icon = "platter.filled.bottom.iphone")
            if (busLiveOn) toggle("Запускать сама перед рейсом", busLiveAuto, { busLiveAuto = it })
            if (busRunning) button("Убрать автобус из шторки", "xmark.circle.fill", destructive = true) { BusLive.stopByUser(); busRunning = false; Haptics.tap() }
        }
        FormSection("Расписание сегодня") {
            text("В универ: " + route.times(BusDirection.TO_CAMPUS, Instant.now()).joinToString(" "), size = Ts.caption)
            text("Домой: " + route.times(BusDirection.TO_HOME, Instant.now()).joinToString(" "), size = Ts.caption)
        }
    }
}

@Composable
private fun RouteNumber(r: BusRoute, w: androidx.compose.ui.unit.Dp, h: androidx.compose.ui.unit.Dp, textSize: Float = 15f) {
    val c = r.color
    Box(Modifier.width(w).height(h).clip(RoundedCornerShape(10.dp)).background(Brush.verticalGradient(listOf(c, c.copy(alpha = 0.8f)))),
        contentAlignment = Alignment.Center) {
        Text(r.number.ifEmpty { "?" }, style = ft(if (r.number.length > 3) textSize - 3 else textSize, FontWeight.ExtraBold, Design.ROUNDED), color = Color.White, maxLines = 1)
    }
}

// MARK: - Полное расписание автобуса

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BusTimetableSheet(data: ScheduleData) {
    DoneSheet { BusTimetable(data) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BusTimetable(data: ScheduleData) {
    val ctx = LocalContext.current
    val nav = LocalNav.current
    var direction by remember { mutableStateOf(BusDirectionMemory.suggested()) }
    var dayType by remember { mutableStateOf(BusDayType.of(Instant.now())) }
    var userPicked by remember { mutableStateOf(false) }
    var busRunning by remember { mutableStateOf(BusLive.isRunning) }
    val addingRoute = remember { mutableStateOf<BusRoute?>(null) }
    val playing = remember { mutableStateOf(false) }
    SheetItem(addingRoute) { r -> BusRouteEditorSheet(r) { saved -> BusRouteStore.upsert(saved); BusRouteStore.activate(saved); busRunning = false } }
    SheetBinding(playing, full = true) { BusGameScreen() }
    val route = BusRouteStore.active
    val isToday = dayType == BusDayType.of(Instant.now())
    LaunchedEffect(Unit) { CityLocator.refresh(force = true) }
    LaunchedEffect(CityLocator.city) {
        val c = CityLocator.city
        if (c != null && !userPicked && route.useGeo) direction = c.busDirection
    }
    val now = rememberNow(30)
    val trips = route.times(direction, dayType).mapNotNull { t ->
        val p = t.split(":").mapNotNull { it.toIntOrNull() }
        if (p.size == 2) Cal.setting(Instant.now(), p[0], p[1]) else null
    }
    val next = if (isToday) trips.firstOrNull { it >= now } else null
    val myTrip = if (direction == BusDirection.TO_CAMPUS && isToday) CommutePlanner.firstPair(Instant.now(), data)?.let { CommutePlanner.morning(it)?.departure } else null

    Screen(route.title, background = { ru.student.safuhub.ui.design.AmbientBackground() }) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            // переключатель автобусов: свой + добавленные
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (r in BusRouteStore.routes) {
                    val on = r.id == BusRouteStore.activeID
                    Pressable({ Haptics.tap(); BusRouteStore.activate(r); busRunning = false }) {
                        Row(Modifier.clip(CircleShape).background(if (on) Brush.verticalGradient(listOf(r.color, r.color.copy(alpha = 0.8f))) else androidx.compose.ui.graphics.SolidColor(r.color.copy(alpha = 0.14f)))
                            .padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            SfIcon("bus.fill", size = 12.dp, tint = if (on) Color.White else r.color)
                            Text(r.number, style = ft(Ts.subheadline, FontWeight.ExtraBold, Design.ROUNDED), color = if (on) Color.White else r.color)
                        }
                    }
                }
                Pressable({ Haptics.tap(); addingRoute.value = BusRoute(colorHex = BusPalette.hexes.random()) }) {
                    Row(Modifier.clip(CircleShape).background(Ios.label.copy(alpha = 0.07f)).padding(horizontal = 12.dp, vertical = 7.dp)) {
                        IconLabel("Другой", "plus", style = ft(Ts.subheadline, FontWeight.SemiBold), spacing = 5.dp)
                    }
                }
            }
            // подсказка, откуда взялось направление
            val c = CityLocator.city
            if (CityLocator.enabled && route.useGeo && c != null) {
                Row(Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.12f)).padding(horizontal = 12.dp, vertical = 7.dp)) {
                    IconLabel("Ты в ${c.title} — показываю рейсы ${if (c == HomeCity.ARKHANGELSK) "домой" else "в универ"}", "location.fill",
                        style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color, spacing = 5.dp)
                }
            } else if (CityLocator.enabled && route.useGeo && CityLocator.denied) {
                IconLabel("Геолокация выключена — запоминаю последний выбор", "location.slash", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
            }
            // откуда → куда, с кнопкой смены направления
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        StopRow(route.fromCity(direction), route.fromStop(direction), "circle.fill")
                        StopRow(route.toCity(direction), route.toStop(direction), "mappin.circle.fill")
                    }
                    Pressable({
                        Haptics.tap()
                        direction = direction.flipped
                        userPicked = true
                        BusDirectionMemory.remember(direction)
                    }) {
                        Box(Modifier.size(46.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                            SfIcon("arrow.up.arrow.down", size = 20.dp, tint = Color.White)
                        }
                    }
                }
            }
            Segmented(BusDayType.entries.map { it to it.title }, dayType, { dayType = it })
            // ближайший рейс
            if (next != null) {
                val mins = maxOf(0L, (next.epochSecond - now.epochSecond) / 60).toInt()
                val arrive = next.plusSeconds(route.travelMinutes * 60L)
                Glass(24.dp, Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("БЛИЖАЙШИЙ", style = ft(Ts.caption2, FontWeight.ExtraBold), color = Ios.secondaryLabel)
                            Text(hmString(next), style = ft(44f, FontWeight.ExtraBold, Design.ROUNDED, mono = true).copy(brush = Brand.gradient))
                            Text("прибытие ~${hmString(arrive)}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(if (mins == 0) "сейчас" else "через", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
                            if (mins > 0) Text(if (mins < 60) "$mins мин" else "${mins / 60} ч ${mins % 60} мин",
                                style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = if (mins <= 15) Ios.orange else Ios.label)
                        }
                    }
                }
                if (FeatureFlags.busLiveOn) {
                    Pressable({
                        Haptics.success()
                        if (busRunning) { BusLive.stopByUser(); busRunning = false } else { BusLive.start(next, direction); busRunning = true }
                    }, Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                            .background(if (busRunning) androidx.compose.ui.graphics.SolidColor(Ios.red.copy(alpha = 0.12f)) else Brand.gradient).padding(vertical = 12.dp),
                            horizontalArrangement = Arrangement.Center) {
                            IconLabel(if (busRunning) "Убрать из шторки" else "Еду на нём — показать в шторке и на экране блокировки",
                                if (busRunning) "xmark.circle.fill" else "platter.filled.bottom.iphone", style = ft(Ts.subheadline, FontWeight.SemiBold),
                                color = if (busRunning) Ios.red else Color.White, maxLines = 2)
                        }
                    }
                }
            } else if (isToday) {
                Glass(20.dp, Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp)) {
                        IconLabel("Сегодня рейсов в эту сторону больше нет", "moon.zzz.fill", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.secondaryLabel)
                    }
                }
            }
            // где автобус сейчас — Яндекс Карты
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.weight(1f).clickable { Haptics.tap(); CustomTabs.open(ctx, route.mapURL) }, verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(42.dp).clip(CircleShape).background(Ios.red.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                            SfIcon("dot.radiowaves.left.and.right", size = 19.dp, tint = Ios.red)
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("Где автобус сейчас", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                            Text("Яндекс Карты, маршрут ${route.number}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                    }
                    SfIcon("arrow.up.forward.app.fill", size = 24.dp, tint = Brand.color, modifier = Modifier.clickable { Haptics.tap(); Share.url(ctx, route.mapURL) })
                }
            }
            if (YandexMap.isAvailable) {
                Pressable({ Haptics.tap(); nav?.push { TransportMapScreen() } }, Modifier.fillMaxWidth()) {
                    Glass(22.dp, Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.size(42.dp).clip(CircleShape).background(Ios.orange.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                                SfIcon("car.rear.road.lane", size = 18.dp, tint = Ios.orange)
                            }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("Пробки на трассе", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                                Text("Карта: ты, города и загруженность дороги", style = ft(Ts.caption), color = Ios.secondaryLabel)
                            }
                            SfIcon("chevron.right", size = 13.dp, tint = Ios.secondaryLabel)
                        }
                    }
                }
            }
            // табло по часам
            val groups = trips.groupBy { Cal.hour(it) }
            val hours = groups.keys.sorted()
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.padding(vertical = 6.dp)) {
                    for (h in hours) {
                        val list = groups[h] ?: emptyList()
                        val hourPast = isToday && (list.lastOrNull()?.let { it < now } ?: false)
                        Row(Modifier.padding(vertical = 9.dp, horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(String.format("%02d", h), style = ft(Ts.title3, FontWeight.ExtraBold, Design.ROUNDED, mono = true),
                                color = if (hourPast) Ios.secondaryLabel.copy(alpha = 0.5f) else Ios.label, modifier = Modifier.width(38.dp))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                for (t in list) {
                                    val past = isToday && t < now
                                    val isNext = next == t
                                    val isMine = myTrip == t
                                    Text(hmString(t), style = ft(Ts.subheadline, if (isNext || isMine) FontWeight.ExtraBold else FontWeight.SemiBold, Design.ROUNDED, mono = true)
                                        .let { if (past) it.copy(textDecoration = TextDecoration.LineThrough) else it },
                                        color = if (isNext) Color.White else if (past) Ios.secondaryLabel.copy(alpha = 0.45f) else Ios.label,
                                        modifier = Modifier.clip(CircleShape)
                                            .background(when {
                                                isNext -> Brand.gradient
                                                isMine -> androidx.compose.ui.graphics.SolidColor(Ios.green.copy(alpha = 0.18f))
                                                else -> androidx.compose.ui.graphics.SolidColor(Ios.label.copy(alpha = if (past) 0.03f else 0.07f))
                                            })
                                            .let { m -> if (isMine) m.strokeBorder(Ios.green, 1.5.dp, CircleShape) else m }
                                            .padding(horizontal = 10.dp, vertical = 5.dp))
                                }
                            }
                        }
                        if (h != hours.last()) Box(Modifier.fillMaxWidth().padding(start = 64.dp).height(0.5.dp).background(Ios.separator))
                    }
                }
            }
            // легенда; пасхалка: долго держать мелкий шрифт внизу → мини-игра «Трасса 150»
            Column(Modifier.fillMaxWidth().pointerInput(Unit) {
                detectTapGestures(onLongPress = {
                    Eggs.mark(Egg.GAME)
                    Haptics.success()
                    playing.value = true
                })
            }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    LegendItem(Brand.color, true, "ближайший")
                    if (direction == BusDirection.TO_CAMPUS) LegendItem(Ios.green, false, "твой к первой паре")
                }
                Text("Будни, суббота и воскресенье. В дороге ~${route.travelMinutes} мин (меняется в настройках «Дорога»).", style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
        }
    }
}

@Composable
private fun StopRow(city: String, stop: String, icon: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.width(18.dp), contentAlignment = Alignment.Center) { SfIcon(icon, size = 14.dp, tint = Brand.color) }
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(city, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
            Text(stop, style = ft(Ts.caption), color = Ios.secondaryLabel)
        }
    }
}

@Composable
private fun LegendItem(color: Color, filled: Boolean, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.width(22.dp).height(12.dp).clip(CircleShape).background(if (filled) color else color.copy(alpha = 0.18f))
            .let { if (!filled) it.strokeBorder(color, 1.5.dp, CircleShape) else it })
        Text(text, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.secondaryLabel)
    }
}

// MARK: - Экран «Мои автобусы»

@Composable
fun BusRoutesScreen() {
    val ctx = LocalContext.current
    BusRouteStore.load()
    val editing = remember { mutableStateOf<BusRoute?>(null) }
    SheetItem(editing) { r ->
        BusRouteEditorSheet(r) { saved ->
            BusRouteStore.upsert(saved)
            if (BusRouteStore.routes.size == 1) BusRouteStore.activeID = saved.id
        }
    }
    androidx.compose.runtime.DisposableEffect(Unit) { onDispose { ScheduleStore.refreshSideEffects() } }
    FormScreen("Мои автобусы") {
        FormSection("Нажми, чтобы выбрать свой", footer = "По выбранному автобусу считаются «Дорога» на главной, напоминания «пора выходить», утренняя сводка и автобус в шторке. Удержи автобус, чтобы изменить или поделиться.") {
            for (r in BusRouteStore.routes) {
                raw {
                    val on = r.id == BusRouteStore.activeID
                    ContextMenuBox(items = {
                        item("Изменить", "pencil") { editing.value = r }
                        item("Поделиться кодом", "square.and.arrow.up") { Share.text(ctx, r.shareCode) }
                        if (BusRouteStore.routes.size > 1) item("Удалить", "trash", destructive = true) { BusRouteStore.delete(r) }
                    }, onClick = { Haptics.tap(); BusRouteStore.activate(r) }) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            RouteNumber(r, 48.dp, 40.dp, 16f)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(r.routeText, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("в пути ${r.travelMinutes} мин" + if (r.isEmpty) " · нет расписания" else "", style = ft(Ts.caption),
                                    color = if (r.isEmpty) Ios.orange else Ios.secondaryLabel)
                            }
                            SfIcon(if (on) "checkmark.circle.fill" else "circle", size = 24.dp, tint = if (on) Brand.color else Ios.secondaryLabel.copy(alpha = 0.4f))
                        }
                    }
                }
            }
        }
        FormSection(footer = "Настроил свой автобус — удержи его и нажми «Поделиться кодом», скинь код в чат группы. Остальным останется скопировать и вставить.") {
            button("Добавить автобус", "plus.circle.fill") { editing.value = BusRoute(colorHex = BusPalette.hexes.random()) }
            button("Вставить код от одногруппника", "doc.on.clipboard") {
                val r = Share.pasteText()?.let { BusRoute.fromShareCode(it) }
                if (r != null) {
                    BusRouteStore.upsert(r)
                    Haptics.success()
                    Dialogs.alert("Добавлен", "${r.title} теперь в списке. Нажми на него, чтобы сделать своим.")
                } else {
                    Dialogs.alert("В буфере нет кода автобуса", "Код начинается с «SAFU-BUS:». Попроси одногруппника нажать «Поделиться» в его автобусе.")
                }
            }
            if (BusRouteStore.routes.none { it.id == BusRoute.default150.id }) button("Вернуть автобус 150", "arrow.uturn.backward") { BusRouteStore.restore150() }
        }
    }
}

// MARK: - Редактор автобуса

@Composable
fun BusRouteEditorSheet(initial: BusRoute, onSave: (BusRoute) -> Unit) {
    val ctx = LocalContext.current
    NavigationStack {
        val dismiss = LocalDismiss.current
        var route by remember { mutableStateOf(initial) }
        var direction by remember { mutableStateOf(BusDirection.TO_CAMPUS) }
        var texts by remember {
            mutableStateOf(buildMap {
                for (d in BusDirection.entries) for (t in BusDayType.entries) put(d.raw + "." + t.raw, initial.timesRaw(d, t))
            })
        }
        fun key(d: BusDirection, t: BusDayType) = d.raw + "." + t.raw
        fun collect(): BusRoute {
            var r = route.copy(number = route.number.trim())
            for (d in BusDirection.entries) for (t in BusDayType.entries) r = r.withTimes(d, t, texts[key(d, t)] ?: "")
            return r
        }
        val canSave = route.number.isNotBlank()
        FormScreen(if (route.number.isEmpty()) "Новый автобус" else "Автобус ${route.number}",
            leading = { BarButton("Отмена") { dismiss() } },
            trailing = { BarButton("Готово", bold = true, enabled = canSave) { onSave(collect()); Haptics.success(); dismiss() } }) {
            FormSection {
                row {
                    RouteNumber(route.copy(number = route.number.ifEmpty { "№" }), 64.dp, 54.dp, 22f)
                    Spacer(Modifier.width(14.dp))
                    IosTextField(route.number, { route = route.copy(number = it) }, "Номер, например 104", Modifier.weight(1f),
                        style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED))
                }
                raw {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        for (h in BusPalette.hexes) {
                            Box(Modifier.size(38.dp).clip(CircleShape).strokeBorder(Ios.label.copy(alpha = if (route.colorHex == h) 0.8f else 0f), 2.dp, CircleShape)
                                .padding(4.dp).clip(CircleShape).background(colorFromHex(h) ?: Ios.gray).clickable { Haptics.tap(); route = route.copy(colorHex = h) })
                        }
                    }
                }
            }
            FormSection("Откуда ты едешь (дом)") {
                field("Город, например Новодвинск", route.homeCity, { route = route.copy(homeCity = it) })
                field("Остановка", route.homeStop, { route = route.copy(homeStop = it) })
            }
            FormSection("Куда (к универу)") {
                field("Город", route.campusCity, { route = route.copy(campusCity = it) })
                field("Остановка", route.campusStop, { route = route.copy(campusStop = it) })
            }
            FormSection("Время", footer = "«Выезд за» — берётся последний рейс, который уходит не позже чем за столько минут до первой пары. Геолокацию включай только для межгорода: в Архангельске покажу рейсы домой, за городом — в универ.") {
                stepper("В пути: ${route.travelMinutes} мин", route.travelMinutes, { route = route.copy(travelMinutes = it) }, 5..240, 5)
                stepper("Выезд за ${route.leadMinutes} мин до пары", route.leadMinutes, { route = route.copy(leadMinutes = it) }, 10..240, 5)
                toggle("Направление по геолокации", route.useGeo, { route = route.copy(useGeo = it) })
            }
            FormSection("Расписание", footer = "Вставь времена как угодно: через пробел, запятую, «6.20» или «06:20» — приложение само разберёт и отсортирует.") {
                segmented(listOf(BusDirection.TO_CAMPUS to "В универ", BusDirection.TO_HOME to "Домой"), direction, { direction = it })
                for (t in BusDayType.entries) {
                    row {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(t.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, modifier = Modifier.weight(1f))
                                if (t != BusDayType.WEEKDAY) {
                                    TextButton({ texts = texts + (key(direction, t) to (texts[key(direction, BusDayType.WEEKDAY)] ?: "")); Haptics.tap() }) {
                                        Text("как в будни", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color)
                                    }
                                }
                            }
                            IosTextField(texts[key(direction, t)] ?: "", { v -> texts = texts + (key(direction, t) to v) }, "06:20 07:00 07:40 …",
                                Modifier.fillMaxWidth(), style = ft(Ts.body).copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
                                keyboard = KeyboardType.Text, singleLine = false, minLines = 2, capitalize = false)
                            val n = BusRoute.normalize(texts[key(direction, t)] ?: "").split(" ").count { it.isNotEmpty() }
                            Text(if (n == 0) "рейсов нет" else "рейсов: $n", style = ft(Ts.caption2), color = Ios.secondaryLabel)
                        }
                    }
                }
            }
            FormSection("Где автобус сейчас", footer = "Необязательно. Без ссылки откроется поиск маршрута по номеру.") {
                field("Ссылка на маршрут в Яндекс Картах", route.mapLink, { route = route.copy(mapLink = it) }, keyboard = KeyboardType.Uri, capitalize = false)
            }
            if (canSave) {
                FormSection(footer = "Отправится код — одногруппник вставит его в «Мои автобусы».") {
                    button("Поделиться с группой", "square.and.arrow.up") { Share.text(ctx, collect().shareCode) }
                }
            }
        }
    }
}
