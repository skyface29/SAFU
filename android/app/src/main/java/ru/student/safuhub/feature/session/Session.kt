package ru.student.safuhub.feature.session

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.fx.Celebrations
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.design.ProgressBar
import ru.student.safuhub.ui.design.ProgressRing
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.design.staggerIn
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.BarIcon
import ru.student.safuhub.ui.kit.DateMode
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.Segmented
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.StepperControl
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// MARK: - Режим сессии
// Экзамены и зачёты из РУЗ + добавленные вручную, обратный отсчёт, билеты «знаю / повторить», итоги.

@Serializable
data class SessionExam(
    val id: String,
    val subject: String,
    val kind: String,
    val start: AppleDate,
    val room: String = "",
    val address: String = "",
    val manual: Boolean = false,
) {
    val isConsult: Boolean get() = kind.lowercase(RU).contains("консульт")
    val daysLeft: Int get() = Cal.daysBetween(Cal.startOfDay(Instant.now()), Cal.startOfDay(start))
}

/** Словарь с числовыми ключами как в Swift JSONEncoder: [ключ, значение, ключ, значение…] */
object IntIntMapSerializer : KSerializer<Map<Int, Int>> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("IntIntMap")
    override fun serialize(encoder: Encoder, value: Map<Int, Int>) {
        val arr = JsonArray(value.flatMap { (k, v) -> listOf(JsonPrimitive(k), JsonPrimitive(v)) })
        (encoder as JsonEncoder).encodeJsonElement(arr)
    }
    override fun deserialize(decoder: Decoder): Map<Int, Int> {
        val el = (decoder as JsonDecoder).decodeJsonElement()
        val out = HashMap<Int, Int>()
        when (el) {
            is JsonArray -> {
                var i = 0
                while (i + 1 < el.size) {
                    val k = (el[i] as? JsonPrimitive)?.intOrNull
                    val v = (el[i + 1] as? JsonPrimitive)?.intOrNull
                    if (k != null && v != null) out[k] = v
                    i += 2
                }
            }
            is JsonObject -> for ((k, v) in el) { val kk = k.toIntOrNull(); val vv = (v as? JsonPrimitive)?.intOrNull; if (kk != null && vv != null) out[kk] = vv }
            else -> {}
        }
        return out
    }
}

@Serializable
data class TicketSet(
    val total: Int = 30,
    /** номер билета → 1 «повторить», 2 «знаю» */
    @Serializable(with = IntIntMapSerializer::class) val states: Map<Int, Int> = emptyMap(),
) {
    val learned: Int get() = states.values.count { it == 2 }
    val shaky: Int get() = states.values.count { it == 1 }
    val ratio: Double get() = if (total > 0) learned.toDouble() / total else 0.0
}

object SessionStore {
    private const val key = "session.v1"

    @Serializable
    private data class Blob(val manual: List<SessionExam> = emptyList(), val tickets: Map<String, TicketSet> = emptyMap(),
                            val results: Map<String, String> = emptyMap())

    private val blob: Blob get() = Defaults.decode<Blob>(key) ?: Blob()
    private fun save(b: Blob) = Defaults.encode(key, b)

    val manual: List<SessionExam> get() = blob.manual
    val tickets: Map<String, TicketSet> get() = blob.tickets
    val results: Map<String, String> get() = blob.results

    fun setManual(list: List<SessionExam>) = save(blob.copy(manual = list))
    fun setTicket(subject: String, t: TicketSet) = save(blob.copy(tickets = blob.tickets + (subject to t)))
    fun setResult(id: String, r: String?) = save(blob.copy(results = if (r == null) blob.results - id else blob.results + (id to r)))

    fun ticketSet(subject: String): TicketSet = tickets[subject] ?: TicketSet()

    fun cycle(n: Int, subject: String) {
        val t = ticketSet(subject)
        val v = ((t.states[n] ?: 0) + 1) % 3
        setTicket(subject, t.copy(states = if (v == 0) t.states - n else t.states + (n to v)))
    }
}

object SessionMode {
    /** 0 — сам, 1 — всегда, 2 — выключен */
    val mode: Int get() = Defaults.intOrNull("session.mode") ?: 0
    val window: Int get() = Defaults.intOrNull("session.window") ?: 21

    fun isExamKind(k: String): Boolean {
        val l = k.lowercase(RU)
        return l.contains("экзам") || l.contains("зач") || l.contains("консульт") || l.contains("курсов")
    }

    /** Все экзамены: из РУЗ (на 150 дней вперёд) + свои */
    fun exams(data: ScheduleData, includePast: Boolean = false): List<SessionExam> {
        var list = ScheduleQuery.slots(data, from = if (includePast) -30 else 0, days = if (includePast) 180 else 150)
            .filter { isExamKind(it.lesson.kind) }
            .map { s -> SessionExam("ruz-${s.start.epochSecond}-${s.lesson.subject}", s.lesson.subject, KindStyle.of(s.lesson.kind).label, s.start, s.lesson.room, s.address) }
        list = list + SessionStore.manual
        if (!includePast) list = list.filter { it.start.plusSeconds(4 * 3600) > Instant.now() }
        return list.sortedBy { it.start }
    }

    fun isActive(data: ScheduleData): Boolean = when (mode) {
        1 -> true
        2 -> false
        else -> exams(data).firstOrNull { !it.isConsult }?.let { it.daysLeft <= window } ?: false
    }
}

private fun daysWord(n: Int): String {
    val m10 = n % 10
    val m100 = n % 100
    if (m10 == 1 && m100 != 11) return "день"
    if (m10 in 2..4 && m100 !in 12..14) return "дня"
    return "дней"
}

// MARK: - Экран сессии

@Composable
fun SessionScreen() {
    val data = ScheduleStore.data
    var mode by prefInt("session.mode", 0)
    var window by prefInt("session.window", 21)
    val open = remember { mutableStateOf<SessionExam?>(null) }
    val adding = remember { mutableStateOf(false) }
    SheetItem(open) { e -> NavigationStack { ExamDetail(e) } }
    SheetBinding(adding) { NavigationStack { AddExamScreen() } }
    SessionStore.manual
    val exams = SessionMode.exams(data)
    val mainExams = exams.filter { !it.isConsult }
    Screen("Сессия", background = { ru.student.safuhub.ui.design.AmbientBackground() },
        leading = { BarIcon("plus") { adding.value = true } }) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val next = mainExams.firstOrNull()
            if (next != null) Hero(next)
            else EmptyState("graduationcap", "Экзаменов пока нет", "Как только их выложат в РУЗ, они появятся здесь. Можно добавить свой экзамен кнопкой «+».")
            if (mainExams.isNotEmpty()) Overall(data)
            exams.forEachIndexed { i, e ->
                Pressable({ Haptics.tap(); open.value = e }, Modifier.staggerIn(i)) { ExamRow(e) }
            }
            Glass(20.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Segmented(listOf(0 to "Сам", 1 to "Включён", 2 to "Выключен"), mode, { mode = it })
                    if (mode == 0) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Включать за $window дн. до экзамена", style = ft(Ts.subheadline), color = Ios.label, modifier = Modifier.weight(1f))
                            StepperControl({ window = (window - 1).coerceAtLeast(3) }, { window = (window + 1).coerceAtMost(60) }, window > 3, window < 60)
                        }
                    }
                    Text("В режиме сессии блок «Сессия» поднимается наверх главной и показывает билеты.", style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
            }
        }
    }
}

@Composable
private fun Hero(e: SessionExam) {
    val d = e.daysLeft
    Glass(26.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("БЛИЖАЙШИЙ ${e.kind.uppercase(RU)}", style = ft(Ts.caption, FontWeight.ExtraBold), color = Ios.secondaryLabel)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (d <= 0) "Сегодня" else "$d", style = ft(if (d <= 0) 40f else 64f, FontWeight.ExtraBold, Design.ROUNDED).copy(brush = Brand.gradient))
                if (d > 0) Text(daysWord(d), style = ft(Ts.title3, FontWeight.Bold), color = Ios.secondaryLabel, modifier = Modifier.padding(bottom = 10.dp))
            }
            Text(e.subject, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
            Text(Fmt.format(e.start, "EEEE, d MMMM, HH:mm") + if (e.room.isEmpty()) "" else " · ауд. ${e.room}", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            val t = SessionStore.ticketSet(e.subject)
            if (t.states.isNotEmpty()) {
                ProgressBar(t.ratio.toFloat(), Ios.green)
                Text("Билеты: знаю ${t.learned} из ${t.total}" + if (t.shaky > 0) " · повторить ${t.shaky}" else "",
                    style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
            }
        }
    }
}

@Composable
private fun Overall(data: ScheduleData) {
    val all = SessionMode.exams(data, includePast = true).filter { !it.isConsult }
    val results = SessionStore.results
    val done = all.count { results[it.id] != null && results[it.id] != "пересдача" }
    val last = all.lastOrNull()
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Stat("$done/${all.size}", "сдано", Modifier.weight(1f))
        Stat(last?.let { "${maxOf(0, it.daysLeft)}" } ?: "—", "дн. до конца", Modifier.weight(1f))
        Stat("${all.count { SessionStore.ticketSet(it.subject).ratio >= 0.8 }}", "готов на 80%+", Modifier.weight(1f))
    }
}

@Composable
private fun Stat(v: String, t: String, modifier: Modifier) {
    Glass(18.dp, modifier) {
        Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(v, style = ft(22f, FontWeight.ExtraBold, Design.ROUNDED).copy(brush = Brand.gradient))
            Text(t, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.secondaryLabel)
        }
    }
}

@Composable
private fun ExamRow(e: SessionExam) {
    val d = e.daysLeft
    val t = SessionStore.ticketSet(e.subject)
    val res = SessionStore.results[e.id]
    Glass(20.dp, Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)).background(SubjectColor.color(e.subject).copy(alpha = 0.18f)),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(if (d <= 0) "!" else "$d", style = ft(Ts.title2, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
                Text(if (d <= 0) "сегодня" else "дн.", style = ft(Ts.caption2), color = Ios.secondaryLabel)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(e.kind.uppercase(RU), style = ft(Ts.caption2, FontWeight.ExtraBold), color = if (e.isConsult) Ios.secondaryLabel else Brand.color)
                    if (e.manual) SfIcon("pencil", size = 11.dp, tint = Ios.secondaryLabel)
                    if (res != null) Text(res, style = ft(Ts.caption2, FontWeight.ExtraBold), color = Color.White,
                        modifier = Modifier.clip(CircleShape).background(if (res == "пересдача") Ios.orange else Ios.green).padding(horizontal = 6.dp, vertical = 1.dp))
                }
                Text(e.subject, style = ft(Ts.subheadline, FontWeight.Bold), color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(Fmt.format(e.start, "d MMM, HH:mm") + if (e.room.isEmpty()) "" else " · ауд. ${e.room}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                if (!e.isConsult && t.states.isNotEmpty()) ProgressBar(t.ratio.toFloat(), Ios.green)
            }
        }
    }
}

// MARK: - Экзамен: билеты и итог

@Composable
private fun ExamDetail(exam: SessionExam) {
    val dismiss = LocalDismiss.current
    val set = SessionStore.ticketSet(exam.subject)
    Screen(exam.subject, background = { ru.student.safuhub.ui.design.AmbientBackground() },
        trailing = { BarButton("Готово", bold = true) { dismiss() } }) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(exam.kind.uppercase(RU), style = ft(Ts.caption, FontWeight.ExtraBold), color = Brand.color)
                Text(exam.subject, style = ft(Ts.title2, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                Text(Fmt.format(exam.start, "EEEE, d MMMM, HH:mm"), style = ft(Ts.body), color = Ios.secondaryLabel)
                if (exam.room.isNotEmpty() || exam.address.isNotEmpty()) {
                    Text(listOf(if (exam.room.isEmpty()) "" else "ауд. ${exam.room}", AddressFormat.full(exam.address)).filter { it.isNotEmpty() }.joinToString(" · "),
                        style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                }
            }
            if (!exam.isConsult) {
                Glass(22.dp, Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row {
                            Text("Билеты", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label, modifier = Modifier.weight(1f))
                            Text("знаю ${set.learned} · повторить ${set.shaky}", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
                        }
                        ProgressBar(set.ratio.toFloat(), Ios.green)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Всего: ${set.total}", style = ft(Ts.subheadline), color = Ios.label, modifier = Modifier.weight(1f))
                            StepperControl({
                                val v = (set.total - 1).coerceAtLeast(1)
                                SessionStore.setTicket(exam.subject, set.copy(total = v, states = set.states.filterKeys { it <= v }))
                            }, { SessionStore.setTicket(exam.subject, set.copy(total = (set.total + 1).coerceAtMost(150))) }, set.total > 1, set.total < 150)
                        }
                        BoxWithConstraints {
                            val cols = maxOf(1, ((maxWidth + 8.dp) / (44.dp + 8.dp)).toInt())
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                for (row in (1..maxOf(1, set.total)).chunked(cols)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        for (n in row) {
                                            val st = set.states[n] ?: 0
                                            Box(Modifier.weight(1f).defaultMinSize(minHeight = 40.dp).clip(RoundedCornerShape(10.dp))
                                                .background(when (st) { 2 -> Ios.green; 1 -> Ios.orange; else -> Ios.label.copy(alpha = 0.07f) })
                                                .clickable { Haptics.tap(); SessionStore.cycle(n, exam.subject) }, contentAlignment = Alignment.Center) {
                                                Text("$n", style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = if (st == 0) Ios.label else Color.White)
                                            }
                                        }
                                        repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                                    }
                                }
                            }
                        }
                        Text("Тап: серый → оранжевый «повторить» → зелёный «знаю» → снова серый.", style = ft(Ts.caption2), color = Ios.secondaryLabel)
                        Pressable({
                            val all = (1..maxOf(1, set.total)).toList()
                            val pool = all.filter { (set.states[it] ?: 0) != 2 }
                            val n = (pool.ifEmpty { all }).random()
                            Haptics.success()
                            Dialogs.alert("Твой билет", "№ $n — удачи!")
                        }, Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.gradient).padding(vertical = 12.dp),
                                horizontalArrangement = Arrangement.Center) {
                                IconLabel("Вытянуть билет (из невыученных)", "dice.fill", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Color.White)
                            }
                        }
                    }
                }
                Glass(22.dp, Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Итог", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (r in listOf("5", "4", "3", "зачёт", "пересдача")) {
                                val on = SessionStore.results[exam.id] == r
                                Box(Modifier.weight(1f).height(34.dp).clip(CircleShape)
                                    .background(if (on) Brand.gradient else androidx.compose.ui.graphics.SolidColor(Ios.label.copy(alpha = 0.07f)))
                                    .clickable {
                                        Haptics.tap()
                                        if (on) SessionStore.setResult(exam.id, null)
                                        else {
                                            SessionStore.setResult(exam.id, r)
                                            if (r != "пересдача") Celebrations.examPassed(exam.subject, r)
                                        }
                                    }, contentAlignment = Alignment.Center) {
                                    Text(r, style = ft(if (r.length > 6) 10f else Ts.caption, FontWeight.Bold), color = if (on) Color.White else Ios.label, maxLines = 1)
                                }
                            }
                        }
                    }
                }
            }
            if (exam.manual) {
                TextButton({ SessionStore.setManual(SessionStore.manual.filter { it.id != exam.id }); dismiss() }) {
                    Text("Удалить экзамен", style = ft(Ts.body), color = Ios.red)
                }
            }
        }
    }
}

// MARK: - Свой экзамен

@Composable
private fun AddExamScreen() {
    val dismiss = LocalDismiss.current
    var subject by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("Экзамен") }
    var date by remember { mutableStateOf(Cal.addDays(Instant.now(), 14)) }
    var room by remember { mutableStateOf("") }
    val subjects = ScheduleQuery.subjects(ScheduleStore.data)
    FormScreen("Свой экзамен", leading = { BarButton("Отмена") { dismiss() } },
        trailing = {
            BarButton("Добавить", bold = true, enabled = subject.isNotBlank()) {
                SessionStore.setManual(SessionStore.manual + SessionExam("man-${newId()}", subject.trim(), kind, date, room, manual = true))
                Haptics.success()
                dismiss()
            }
        }) {
        FormSection("Предмет") {
            field("Название", subject, { subject = it })
            if (subjects.isNotEmpty()) {
                row {
                    IosMenu(items = { for (s in subjects) item(s) { subject = s } }) {
                        Text("Выбрать из расписания", style = ft(Ts.body), color = Brand.color)
                    }
                }
            }
        }
        FormSection {
            picker("Тип", listOf("Экзамен", "Зачёт", "Консультация", "Курсовая").map { it to it }, kind, { kind = it })
            date("Когда", date, { date = it }, DateMode.DATE_TIME)
            field("Аудитория", room, { room = it })
        }
    }
}

// MARK: - Карточка на главной

@Composable
fun SessionCardVisible(data: ScheduleData): Boolean = SessionMode.exams(data).any { !it.isConsult }

@Composable
fun SessionCard(data: ScheduleData) {
    val exams = SessionMode.exams(data).filter { !it.isConsult }
    val e = exams.firstOrNull() ?: return
    val show = remember { mutableStateOf(false) }
    SheetBinding(show) { DoneSheet { SessionScreen() } }
    val d = e.daysLeft
    val t = SessionStore.ticketSet(e.subject)
    val active = SessionMode.isActive(data)
    Pressable({ Haptics.tap(); show.value = true }, Modifier.fillMaxWidth()) {
        Glass(24.dp, Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (active) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        SfIcon("graduationcap.fill", size = 14.dp, tint = Brand.color)
                        Text("РЕЖИМ СЕССИИ", style = ft(Ts.caption, FontWeight.ExtraBold), color = Brand.color)
                        Spacer(Modifier.weight(1f))
                        Text("${exams.size} впереди", style = ft(Ts.caption, FontWeight.ExtraBold), color = Ios.secondaryLabel)
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Column(Modifier.width(64.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (d <= 0) "!" else "$d", style = ft(30f, FontWeight.ExtraBold, Design.ROUNDED).copy(brush = Brand.gradient))
                        Text(if (d <= 0) "сегодня" else "дн.", style = ft(Ts.caption2, FontWeight.Bold), color = Ios.secondaryLabel)
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(e.kind.uppercase(RU), style = ft(Ts.caption2, FontWeight.ExtraBold), color = KindStyle.of(e.kind).color)
                        Text(e.subject, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(Fmt.format(e.start, "d MMMM, HH:mm") + if (e.room.isEmpty()) "" else " · ауд. ${e.room}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                    if (active && t.states.isNotEmpty()) {
                        Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                            ProgressRing(t.ratio.toFloat(), Ios.green, Modifier.size(40.dp), lineWidth = 4.dp)
                            Text("${(t.ratio * 100).toInt()}%", style = ft(10f, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
                        }
                    }
                }
            }
        }
    }
}
