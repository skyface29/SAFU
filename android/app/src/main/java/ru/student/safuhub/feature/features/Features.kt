package ru.student.safuhub.feature.features

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decodeOrNull
import ru.student.safuhub.core.hmString
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.StudyTask
import ru.student.safuhub.feature.commute.BusRoutes
import ru.student.safuhub.feature.commute.CommutePlanner
import ru.student.safuhub.feature.commute.CommuteSettings
import ru.student.safuhub.feature.fx.CelebrationSettingsScreen
import ru.student.safuhub.screens.attendance.AttendanceScreen
import ru.student.safuhub.screens.tools.Tool
import ru.student.safuhub.system.BusLive
import ru.student.safuhub.system.Notify
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.ui.HomeSection
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.kit.DateMode
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.ProgressLabel
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// MARK: - Настройки функций (всё можно включать и выключать)

object FeatureFlags {
    private fun bool(k: String, def: Boolean) = Defaults.boolOrNull(k) ?: def
    private fun int(k: String, def: Int) = Defaults.intOrNull(k) ?: def

    // утренняя сводка
    val briefOn get() = bool("brief.on", true)
    val briefMode get() = int("brief.mode", 1)          // 0 — фиксированное время, 1 — перед выходом из дома
    val briefMinutes get() = int("brief.time", 6 * 60 + 30)
    val briefLead get() = int("brief.lead", 15)
    val briefPairs get() = bool("brief.pairs", true)
    val briefBus get() = bool("brief.bus", true)
    val briefTasks get() = bool("brief.tasks", true)

    // автобус на экране блокировки
    val busLiveOn get() = bool("busLive.on", true)
    val busLiveAuto get() = bool("busLive.auto", true)
    val busLiveWindow get() = int("busLive.window", 60)

    // маршруты
    val mapsProvider get() = int("maps.provider", 0)   // 0 — Яндекс, 1 — Google
    val mapsRoute get() = bool("maps.route", true)
    val mapsMode get() = int("maps.mode", 0)           // 0 — общественный транспорт, 1 — пешком

    // инструменты
    fun toolOn(t: Tool) = bool("tool.${t.raw}", true)
}

// MARK: - Карты

object Maps {
    private fun query(address: String): String? {
        if (AddressFormat.isRemote(address)) return null
        var q = address
        if (!q.lowercase(RU).contains("архангельск")) q = "Архангельск, $q"
        return Uri.encode(q)
    }

    fun url(address: String): String? = query(address)?.let { "https://yandex.ru/maps/?text=$it" }

    fun googleURL(address: String): String? = query(address)?.let { "https://www.google.com/maps/search/?api=1&query=$it" }

    /** Открыть адрес с учётом настроек: Яндекс или Google, точка или маршрут от тебя */
    fun smartURL(address: String): String? {
        val e = query(address) ?: return null
        val transit = FeatureFlags.mapsMode == 0
        if (FeatureFlags.mapsProvider == 1) {
            return if (FeatureFlags.mapsRoute) "https://www.google.com/maps/dir/?api=1&destination=$e&travelmode=${if (transit) "transit" else "walking"}"
            else "https://www.google.com/maps/search/?api=1&query=$e"
        }
        return if (FeatureFlags.mapsRoute) "https://yandex.ru/maps/?rtext=~$e&rtt=${if (transit) "mt" else "pd"}"
        else "https://yandex.ru/maps/?text=$e"
    }
}

// MARK: - Утренняя сводка

object MorningBrief {
    fun schedule(data: ScheduleData) {
        Notify.removePrefix("brief-")
        if (!FeatureFlags.briefOn) return
        val now = Instant.now()
        for (offset in 0 until 7) {
            val day = Cal.addDays(Cal.startOfDay(now), offset)
            val slots = ScheduleEngine.slots(day, data)
            val first = slots.firstOrNull() ?: continue
            val fire = fireDate(day, data) ?: continue
            if (fire <= now || fire >= first.start) continue
            val (title, body) = content(day, slots, data)
            Notify.add("brief-$offset", title, body, fire)
        }
    }

    fun fireDate(day: Instant, data: ScheduleData): Instant? {
        if (FeatureFlags.briefMode == 1) {
            val f = CommutePlanner.firstPair(day, data)
            val trip = f?.let { CommutePlanner.morning(it) }
            if (trip != null) {
                val leave = trip.departure.minusSeconds(CommuteSettings.homeMinutes * 60L)
                return leave.minusSeconds(FeatureFlags.briefLead * 60L)
            }
        }
        val m = FeatureFlags.briefMinutes
        return Cal.setting(day, m / 60, m % 60)
    }

    fun content(day: Instant, slots: List<LessonSlot>, data: ScheduleData): Pair<String, String> {
        val lines = mutableListOf<String>()
        if (FeatureFlags.briefPairs) {
            val first = slots.first()
            val place = if (first.lesson.room.isEmpty()) "" else ", ауд. ${first.lesson.room}"
            lines.add("Пар: ${slots.size}. Первая в ${hmString(first.start)} — ${first.lesson.subject}$place")
        }
        if (FeatureFlags.briefBus && CommuteSettings.enabled) {
            val f = CommutePlanner.firstPair(day, data)
            val trip = f?.let { CommutePlanner.morning(it) }
            if (trip != null) {
                val leave = trip.departure.minusSeconds(CommuteSettings.homeMinutes * 60L)
                lines.add("🚌 Автобус ${BusRoutes.active.number} в ${hmString(trip.departure)}, выйти в ${hmString(leave)}")
            }
        }
        if (FeatureFlags.briefTasks) {
            val tasks = decodeOrNull<List<StudyTask>>(Defaults.data("tasks.v1"))
            if (tasks != null) {
                val soon = tasks.filter { !it.done && it.due >= day && it.due < day.plusSeconds(2 * 86_400) }
                soon.firstOrNull()?.let { t ->
                    lines.add("⏰ Дедлайн: ${t.title}" + if (soon.size > 1) " и ещё ${soon.size - 1}" else "")
                }
            }
        }
        return "Доброе утро ☀️" to (if (lines.isEmpty()) "Сегодня есть пары" else lines.joinToString("\n"))
    }

    /** Пример прямо сейчас (через 5 секунд) */
    fun test(data: ScheduleData) {
        var day = Cal.startOfDay(Instant.now())
        for (i in 0 until 8) {
            val d = Cal.addDays(Cal.startOfDay(Instant.now()), i)
            if (ScheduleEngine.slots(d, data).isNotEmpty()) { day = d; break }
        }
        val slots = ScheduleEngine.slots(day, data)
        val (t, b) = if (slots.isEmpty()) "Доброе утро ☀️" to "На неделе пар не найдено" else content(day, slots, data)
        Notify.after("brief-test", t, b, 5.0)
    }
}

// MARK: - Рассылка группе (староста / зам)

@Composable
fun BroadcastScreen() {
    val ctx = LocalContext.current
    var kind by remember { mutableStateOf(0) }
    var slotKey by remember { mutableStateOf("") }
    var newRoom by remember { mutableStateOf("") }
    var newTime by remember { mutableStateOf(Instant.now()) }
    var extra by remember { mutableStateOf("") }
    val kinds = listOf("Перенос", "Отмена", "Другая аудитория", "Напоминание", "Своё")
    val slots = remember(ScheduleStore.data) { ScheduleQuery.slots(ScheduleStore.data, days = 14).filter { it.end > Instant.now() } }
    val slot = slots.firstOrNull { it.key == slotKey } ?: slots.firstOrNull()
    LaunchedEffect(Unit) { if (slotKey.isEmpty()) slotKey = slots.firstOrNull()?.key ?: "" }
    val text = run {
        val s = slot ?: return@run extra
        val f = "EEEE, d MMMM"
        val whenText = "${Fmt.format(s.start, f)} в ${hmString(s.start)}"
        val what = "«${s.lesson.subject}» (${KindStyle.of(s.lesson.kind).label.lowercase(RU)})"
        var t = when (kind) {
            0 -> "📢 Перенос: пара $what, $whenText, переносится на ${Fmt.format(newTime, f)} в ${hmString(newTime)}."
            1 -> "❌ Отмена: пары $what, $whenText, не будет."
            2 -> "🚪 Аудитория: пара $what, $whenText, пройдёт в ауд. ${newRoom.ifEmpty { "…" }}."
            3 -> "⏰ Напоминание: $whenText — $what" + (if (s.lesson.room.isEmpty()) "" else ", ауд. ${s.lesson.room}") + "."
            else -> ""
        }
        if (extra.isNotEmpty()) t += (if (t.isEmpty()) "" else "\n") + extra
        t
    }
    FormScreen("Рассылка группе") {
        FormSection("Что случилось") {
            picker("Тип", kinds.indices.map { it to kinds[it] }, kind, { kind = it })
            if (kind != 4) {
                picker("Пара", slots.map { s -> s.key to "${hmString(s.start)} ${Fmt.format(s.start, "d MMM")} · ${s.lesson.subject}" },
                    slot?.key ?: "", { slotKey = it })
            }
            if (kind == 0) date("Новое время", newTime, { newTime = it })
            if (kind == 2) field("Новая аудитория", newRoom, { newRoom = it })
            field("Добавить от себя", extra, { extra = it }, multiline = true)
        }
        FormSection("Сообщение") {
            text(text.ifEmpty { "Заполни поля выше" })
            button("Отправить в чат группы", "paperplane.fill", enabled = text.isNotEmpty()) { Share.text(ctx, text) }
            button("Скопировать", "doc.on.doc", enabled = text.isNotEmpty()) { Share.copy(text); Haptics.success() }
        }
    }
}

// MARK: - Статистика семестра

data class SemesterStats(
    var done: Int = 0,
    var left: Int = 0,
    var hours: Double = 0.0,
    /** предмет → (прошло, всего в расписании семестра) */
    var bySubject: List<Triple<String, Int, Int>> = emptyList(),
    var byKind: List<Pair<String, Int>> = emptyList(),
    var busiestDay: String = "",
)

@Composable
fun StatsScreen() {
    var stats by remember { mutableStateOf<SemesterStats?>(null) }
    LaunchedEffect(Unit) {
        val data = ScheduleStore.data
        stats = withContext(Dispatchers.Default) { computeStats(data) }
    }
    Screen("Статистика", background = { AmbientBackground() }) {
        val s = stats
        if (s != null) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTile("${s.done}", "пар прошло", Modifier.weight(1f))
                    StatTile("${s.left}", "осталось", Modifier.weight(1f))
                    StatTile("${s.hours.toInt()}", "часов в универе", Modifier.weight(1f))
                }
                if (s.busiestDay.isNotEmpty()) {
                    IconLabel("Самый загруженный день — ${s.busiestDay}", "flame.fill", style = ft(Ts.subheadline, FontWeight.SemiBold),
                        color = Ios.orange)
                }
                SubjectBars(s.bySubject)
                Bars("По типам занятий", s.byKind)
            }
        } else {
            Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { ProgressLabel("Считаю…") }
        }
    }
}

@Composable
private fun StatTile(v: String, t: String, modifier: Modifier) {
    Glass(18.dp, modifier) {
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(v, style = ft(26f, FontWeight.ExtraBold, Design.ROUNDED).copy(brush = Brand.gradient))
            Text(t, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun BarTrack(fraction: Float, brush: Brush) {
    BoxWithConstraints(Modifier.fillMaxWidth().height(7.dp).clip(CircleShape).background(Ios.label.copy(alpha = 0.08f))) {
        val w = maxOf(6.dp, maxWidth * fraction.coerceIn(0f, 1f))
        Box(Modifier.width(w).fillMaxHeight().clip(CircleShape).background(brush))
    }
}

/** По предметам: сколько пар уже прошло из всех, что есть в расписании семестра */
@Composable
private fun SubjectBars(list: List<Triple<String, Int, Int>>) {
    Glass(22.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("По предметам", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                Text("Сколько пар уже прошло из всех в расписании семестра", style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
            for ((name, done, total) in list) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(name, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label, maxLines = 1, modifier = Modifier.weight(1f))
                        val sec = Ios.secondaryLabel
                        Text(buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append("$done") }
                            withStyle(SpanStyle(color = sec, fontSize = 11.sp)) { append(" из $total") }
                        }, style = ft(Ts.caption, mono = true), color = Ios.label)
                    }
                    val c = SubjectColor.color(name)
                    BarTrack(done.toFloat() / maxOf(total, 1), Brush.verticalGradient(listOf(c, c.copy(alpha = 0.8f))))
                }
            }
        }
    }
}

@Composable
private fun Bars(title: String, list: List<Pair<String, Int>>) {
    val top = list.firstOrNull()?.second ?: 1
    val brush = Brand.gradient
    Glass(22.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
            for ((name, v) in list.take(10)) {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row {
                        Text(name, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label, maxLines = 1, modifier = Modifier.weight(1f))
                        Text("$v", style = ft(Ts.caption, FontWeight.Bold, mono = true), color = Ios.label)
                    }
                    BarTrack(v.toFloat() / maxOf(top, 1), brush)
                }
            }
        }
    }
}

private fun computeStats(data: ScheduleData): SemesterStats {
    val now = Instant.now()
    val today = Cal.startOfDay(now)
    // семестр: примерно сентябрь–январь или февраль–июнь
    val month = Cal.month(now)
    val year = Cal.year(now)
    val startMonth = if (month >= 8 || month == 1) 9 else 2
    val startYear = if (month == 1) year - 1 else year
    val start = Cal.date(startYear, startMonth, 1) ?: today
    val end = Cal.addMonths(start, 5)
    val s = SemesterStats()
    val subj = HashMap<String, Int>(); val subjTotal = LinkedHashMap<String, Int>(); val kinds = HashMap<String, Int>(); val wd = HashMap<Int, Int>()
    var d = start
    while (d < end) {
        for (slot in ScheduleEngine.slots(d, data)) {
            subjTotal[slot.lesson.subject] = (subjTotal[slot.lesson.subject] ?: 0) + 1
            if (slot.end <= now) {
                s.done += 1
                s.hours += (slot.end.epochSecond - slot.start.epochSecond) / 3600.0
                subj[slot.lesson.subject] = (subj[slot.lesson.subject] ?: 0) + 1
                val k = KindStyle.of(slot.lesson.kind).label
                kinds[k] = (kinds[k] ?: 0) + 1
                val w = ScheduleEngine.weekday(slot.start)
                wd[w] = (wd[w] ?: 0) + 1
            } else s.left += 1
        }
        d = Cal.addDays(d, 1)
    }
    s.bySubject = subjTotal.keys.map { Triple(it, subj[it] ?: 0, subjTotal[it] ?: 0) }
        .sortedWith { a, b -> if (a.second != b.second) b.second - a.second else b.third - a.third }
    s.byKind = kinds.entries.sortedByDescending { it.value }.map { it.key to it.value }
    val names = listOf("", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")
    wd.maxByOrNull { it.value }?.let { if (it.key < names.size) s.busiestDay = names[it.key] }
    return s
}

// MARK: - Экран «Функции»

@Composable
fun FeaturesScreen() {
    val nav = LocalNav.current
    var briefOn by prefBool("brief.on", true)
    var briefMode by prefInt("brief.mode", 1)
    var briefTime by prefInt("brief.time", 6 * 60 + 30)
    var briefLead by prefInt("brief.lead", 15)
    var briefPairs by prefBool("brief.pairs", true)
    var briefBus by prefBool("brief.bus", true)
    var briefTasks by prefBool("brief.tasks", true)
    var busLiveOn by prefBool("busLive.on", true)
    var busLiveAuto by prefBool("busLive.auto", true)
    var busLiveWindow by prefInt("busLive.window", 60)
    var mapsProvider by prefInt("maps.provider", 0)
    var mapsRoute by prefBool("maps.route", true)
    var mapsMode by prefInt("maps.mode", 0)
    var role by prefInt("user.role", 0)
    var homeOrder by prefString("home.order", HomeSection.defaultRaw)
    var busRunning by remember { mutableStateOf(BusLive.isRunning) }
    var sessionMode by prefInt("session.mode", 0)
    var sessionWindow by prefInt("session.window", 21)
    val refresh = { ScheduleStore.refreshSideEffects() }

    fun homeToggle(s: HomeSection, on: Boolean) {
        val list = HomeSection.parse(homeOrder).toMutableList()
        if (on && !list.contains(s)) {
            val i = list.indexOf(HomeSection.NOW) + 1
            list.add(minOf(i, list.size), s)
        } else if (!on) list.remove(s)
        homeOrder = HomeSection.join(list)
    }

    FormScreen("Функции") {
        FormSection("Утро", footer = "Одно уведомление только в учебные дни. «Перед выходом» считается от автобуса к первой паре.") {
            toggle("Утренняя сводка", briefOn, { briefOn = it; refresh() }, icon = "sun.max.fill")
            if (briefOn) {
                picker("Когда", listOf(1 to "Перед выходом", 0 to "В своё время"), briefMode, { briefMode = it; refresh() })
                if (briefMode == 1) {
                    stepper("За $briefLead мин до выхода", briefLead, { briefLead = it; refresh() }, 5..60, 5)
                } else {
                    date("Время", Cal.setting(Instant.now(), briefTime / 60, briefTime % 60), { d ->
                        briefTime = Cal.hour(d) * 60 + Cal.minute(d); refresh()
                    }, DateMode.TIME)
                }
                toggle("Пары на день", briefPairs, { briefPairs = it })
                toggle("Автобус и когда выходить", briefBus, { briefBus = it })
                toggle("Горящие дедлайны", briefTasks, { briefTasks = it })
                button("Прислать пример через 5 сек") {
                    Permissions.requestNotifications()
                    MorningBrief.test(ScheduleStore.data)
                    Haptics.success()
                }
            }
        }
        FormSection("Автобус на экране блокировки",
            footer = "Отсчёт до отправления и полоска поездки в шторке и на экране блокировки. «Сама» — при открытии приложения незадолго до рейса. Убрать — крестик на самой плашке: пара при этом останется. Тема — как у пары.") {
            toggle("Автобус в шторке", busLiveOn, { on -> busLiveOn = on; if (!on) { BusLive.stop(); busRunning = false } }, icon = "bus.fill")
            if (busLiveOn) {
                toggle("Запускать сама", busLiveAuto, { busLiveAuto = it })
                if (busLiveAuto) stepper("За $busLiveWindow мин до рейса", busLiveWindow, { busLiveWindow = it }, 15..120, 15)
                if (busRunning) button("Остановить сейчас", destructive = true) { BusLive.stopByUser(); busRunning = false }
            }
        }
        FormSection("Группа", footer = "Старосте и заму открываются посещаемость и готовые сообщения для чата группы: перенос, отмена, другая аудитория.") {
            val roles = mutableListOf(0 to "Студент", 1 to "Староста", 2 to "Зам. старосты")
            if (role == 3) roles.add(3 to "Преподаватель")
            picker("Роль", roles, role, { role = it })
            if (role > 0) {
                link("Посещаемость", "person.crop.circle.badge.checkmark") { nav?.push { AttendanceScreen() } }
                link("Рассылка группе", "megaphone.fill") { nav?.push { BroadcastScreen() } }
            }
        }
        FormSection("Маршрут до корпуса", footer = "Срабатывает при нажатии на адрес пары.") {
            segmented(listOf(0 to "Яндекс", 1 to "Google"), mapsProvider, { mapsProvider = it })
            toggle("Строить маршрут от меня", mapsRoute, { mapsRoute = it })
            if (mapsRoute) segmented(listOf(0 to "Транспорт", 1 to "Пешком"), mapsMode, { mapsMode = it })
        }
        FormSection("Сессия и праздники", footer = "В режиме сессии блок с экзаменами и билетами поднимается наверх главной.") {
            picker("Режим сессии", listOf(0 to "Сам", 1 to "Всегда", 2 to "Выключен"), sessionMode, { sessionMode = it }, icon = "graduationcap.fill")
            if (sessionMode == 0) stepper("За $sessionWindow дн. до экзамена", sessionWindow, { sessionWindow = it }, 3..60)
            link("Праздники и анимации", "party.popper.fill") { nav?.push { CelebrationSettingsScreen() } }
        }
        FormSection("На главной") {
            toggle("Отсчёт до сессии", HomeSection.parse(homeOrder).contains(HomeSection.SESSION), { homeToggle(HomeSection.SESSION, it) }, icon = "graduationcap.fill")
            toggle("Дорога (мой автобус)", HomeSection.parse(homeOrder).contains(HomeSection.COMMUTE), { homeToggle(HomeSection.COMMUTE, it) }, icon = "bus.fill")
        }
        FormSection("Инструменты", footer = "Выключенные пропадут из сетки на главной.") {
            for (t in Tool.entries) {
                val key = "tool.${t.raw}"
                toggle(t.title, Defaults.boolOrNull(key) ?: true, { on ->
                    Defaults.set(key, on)
                    Defaults.set("tools.rev", java.util.UUID.randomUUID().toString())
                }, icon = t.icon)
            }
        }
        FormSection("Ярлыки и Ассистент", footer = "Удержи иконку приложения на рабочем столе — там быстрые действия: пары, фото доски, задачи, файлы. Их можно вытащить на рабочий стол отдельными ярлыками.") {
            label("«Следующая пара» — виджет и шторка", "calendar")
            label("«Мой автобус» — плашка в шторке", "bus.fill")
        }
    }
}
