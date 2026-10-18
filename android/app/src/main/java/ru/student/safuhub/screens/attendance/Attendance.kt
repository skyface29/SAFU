package ru.student.safuhub.screens.attendance

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.NaturalOrder
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormColumn
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalPushed
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.kit.barTint
import ru.student.safuhub.ui.kit.rememberBool
import ru.student.safuhub.ui.kit.swipeRow
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb
import java.io.File
import java.time.Instant
import kotlin.math.roundToInt

// MARK: - Модель посещаемости

@Serializable
enum class Mark {
    @SerialName("present") PRESENT,
    @SerialName("absent") ABSENT,
    @SerialName("excused") EXCUSED;

    val symbol: String get() = when (this) { PRESENT -> "+"; ABSENT -> "−"; EXCUSED -> "У" }
    val title: String get() = when (this) { PRESENT -> "Был"; ABSENT -> "Н/б"; EXCUSED -> "Уваж." }
    val color: Color get() = when (this) {
        PRESENT -> rgb(0.16, 0.75, 0.42)
        ABSENT -> rgb(0.95, 0.28, 0.30)
        EXCUSED -> rgb(1.0, 0.62, 0.10)
    }
}

@Serializable
data class Student(val id: String = newId(), val name: String)

@Serializable
data class AttendanceLesson(val key: String, val subject: String, val kind: String, val start: AppleDate)

@Serializable
private data class AttendanceData(
    val students: List<Student> = emptyList(),
    /** занятие → студент → отметка */
    val marks: Map<String, Map<String, Mark>> = emptyMap(),
    val lessons: Map<String, AttendanceLesson> = emptyMap(),
)

data class MarkStats(val present: Int, val absent: Int, val excused: Int)

object AttendanceStore {
    private const val key = "attendance.v1"

    private val state = mutableStateOf<AttendanceData?>(null)
    private val d: AttendanceData
        get() = state.value ?: (Defaults.decode<AttendanceData>(key) ?: AttendanceData()).also { state.value = it }

    private fun update(f: (AttendanceData) -> AttendanceData) {
        val v = f(d)
        state.value = v
        Defaults.encode(key, v)
    }

    val students: List<Student> get() = d.students
    val marks: Map<String, Map<String, Mark>> get() = d.marks
    val lessons: Map<String, AttendanceLesson> get() = d.lessons

    fun key(slot: LessonSlot): String = "${slot.start.epochSecond}|${slot.lesson.subject}"

    val sortedStudents: List<Student> get() = students.sortedWith { a, b -> NaturalOrder.compare(a.name, b.name) }

    fun mark(student: Student, lessonKey: String): Mark? = marks[lessonKey]?.get(student.id)

    private fun lessonOf(slot: LessonSlot) = AttendanceLesson(key(slot), slot.lesson.subject, slot.lesson.kind, slot.start)

    fun set(mark: Mark?, student: Student, slot: LessonSlot) = update { a ->
        val k = key(slot)
        val m = (a.marks[k] ?: emptyMap()).toMutableMap()
        if (mark == null) m.remove(student.id) else m[student.id] = mark
        a.copy(lessons = a.lessons + (k to lessonOf(slot)), marks = a.marks + (k to m))
    }

    fun markAll(mark: Mark?, slot: LessonSlot) = update { a ->
        val k = key(slot)
        val m = if (mark == null) emptyMap() else a.students.associate { it.id to mark }
        a.copy(lessons = a.lessons + (k to lessonOf(slot)), marks = a.marks + (k to m))
    }

    fun add(names: List<String>) = update { a ->
        val existing = a.students.map { it.name.lowercase(RU) }.toMutableSet()
        val fresh = names.map { it.trim() }.filter { it.isNotEmpty() && existing.add(it.lowercase(RU)) }
        a.copy(students = a.students + fresh.map { Student(name = it) })
    }

    fun remove(s: Student) = update { a -> a.copy(students = a.students.filter { it.id != s.id }) }

    fun stats(s: Student, subject: String? = null): MarkStats {
        var p = 0; var a = 0; var e = 0
        for ((k, m) in marks) {
            if (subject != null && lessons[k]?.subject != subject) continue
            when (m[s.id]) {
                Mark.PRESENT -> p++
                Mark.ABSENT -> a++
                Mark.EXCUSED -> e++
                null -> {}
            }
        }
        return MarkStats(p, a, e)
    }

    val recordedLessons: List<AttendanceLesson>
        get() = lessons.values.filter { !(marks[it.key] ?: emptyMap()).isEmpty() }.sortedByDescending { it.start }

    /** Текст отчёта по занятию — чтобы отправить старосте/преподавателю */
    fun report(slot: LessonSlot): String {
        val k = key(slot)
        val list = sortedStudents
        val absent = list.filter { mark(it, k) == Mark.ABSENT }.map { it.name }
        val excused = list.filter { mark(it, k) == Mark.EXCUSED }.map { it.name }
        val present = list.count { mark(it, k) == Mark.PRESENT }
        val lines = mutableListOf(
            "${slot.lesson.subject} (${KindStyle.of(slot.lesson.kind).label.lowercase(RU)}), ${Fmt.format(slot.start, "d MMMM, H:mm")}",
            "Присутствуют: $present из ${list.size}",
        )
        lines.add(if (absent.isEmpty()) "Отсутствующих нет" else "Отсутствуют (${absent.size}): " + absent.joinToString(", "))
        if (excused.isNotEmpty()) lines.add("По уважительной (${excused.size}): " + excused.joinToString(", "))
        return lines.joinToString("\n")
    }

    /** Таблица для Excel: строки — студенты, столбцы — занятия */
    fun csv(): String {
        val ls = lessons.values.sortedBy { it.start }
        fun q(s: String) = "\"" + s.replace("\"", "\"\"") + "\""
        val header = mutableListOf("Студент")
        for (l in ls) header.add("${Fmt.format(l.start, "dd.MM HH:mm")} ${l.subject}")
        header.add("Пропуски")
        header.add("Уваж.")
        val rows = mutableListOf(header.joinToString(";") { q(it) })
        for (s in sortedStudents) {
            val cells = mutableListOf(q(s.name))
            for (l in ls) cells.add(q(mark(s, l.key)?.symbol ?: ""))
            val st = stats(s)
            cells.add(q("${st.absent}"))
            cells.add(q("${st.excused}"))
            rows.add(cells.joinToString(";"))
        }
        return rows.joinToString("\n")
    }
}

// MARK: - Экран отметок

@Composable
fun AttendanceScreen(slot: LessonSlot? = null) {
    val ctx = LocalContext.current
    val store = AttendanceStore
    val data = ScheduleStore.data
    var selected by remember { mutableStateOf<LessonSlot?>(null) }
    val showRoster = rememberBool()
    val showStats = rememberBool()

    /** Занятия за последние 7 дней и сегодняшние */
    val recent = remember(data) {
        val limit = Instant.now().plusSeconds(3 * 3600)
        ScheduleQuery.slots(data, from = -7, days = 8).filter { it.start <= limit }.sortedByDescending { it.start }
    }
    val current = selected ?: slot ?: recent.firstOrNull()
    val choices = if (slot != null && recent.none { it.key == slot.key }) listOf(slot) + recent else recent

    Screen("Посещаемость", large = !LocalPushed.current, leading = {
        IosMenu({
            item("Список группы", "person.3") { showRoster.value = true }
            item("Статистика и таблица", "chart.bar") { showStats.value = true }
        }) {
            SfIcon("person.3.fill", size = 24.dp, tint = barTint(), modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp))
        }
    }) {
        FormColumn {
            if (store.students.isEmpty()) {
                FormSection {
                    raw {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            IconLabel("Сначала добавь группу", "person.3.fill", style = ft(Ts.headline, FontWeight.SemiBold), iconColor = Brand.color)
                            Text("Один раз внеси список ребят — можно вставить сразу всех, по одному в строке.", style = ft(Ts.subheadline),
                                color = Ios.secondaryLabel)
                            TextButton({ showRoster.value = true }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                IconLabel("Добавить студентов", "plus", style = ft(Ts.subheadline, FontWeight.Bold), color = Brand.color)
                            }
                        }
                    }
                }
            }

            FormSection("Занятие") {
                if (recent.isEmpty() && slot == null) row { Text("Нет занятий за последнюю неделю", style = ft(Ts.body), color = Ios.secondaryLabel) }
                if (choices.isNotEmpty()) raw {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (s in choices) LessonChip(s, current?.key == s.key) { selected = s }
                    }
                }
            }

            if (current != null && store.students.isNotEmpty()) {
                val k = store.key(current)
                FormSection("${current.lesson.subject} · ${KindStyle.of(current.lesson.kind).label}") {
                    raw { Summary(k) }
                    row {
                        TextButton({ Haptics.success(); store.markAll(Mark.PRESENT, current) }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                            IconLabel("Все были", "checkmark.circle.fill", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
                        }
                        Spacer(Modifier.weight(1f))
                        TextButton({ store.markAll(null, current) }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                            IconLabel("Сбросить", "arrow.counterclockwise", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.red)
                        }
                    }
                }

                FormSection(footer = "Нажимай + (был), − (не было) или У (уважительная). Повторное нажатие снимает отметку.") {
                    for (st in store.sortedStudents) raw { StudentRow(st, current, k) }
                }

                FormSection {
                    button("Отправить отчёт по занятию", "square.and.arrow.up") { Share.text(ctx, store.report(current)) }
                }
            }
        }
    }

    SheetBinding(showRoster) { DoneSheet { RosterScreen() } }
    SheetBinding(showStats) { DoneSheet { AttendanceStatsScreen() } }
}

@Composable
private fun LessonChip(s: LessonSlot, on: Boolean, onClick: () -> Unit) {
    val fg = if (on) Color.White else Ios.label
    Pressable(onClick) {
        Column(Modifier.width(150.dp).clip(RoundedCornerShape(12.dp))
            .let { if (on) it.background(Brand.gradient) else it.background(Ios.label.copy(alpha = 0.07f)) }
            .padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(KindStyle.of(s.lesson.kind).color))
                Text(shortDate(s.start), style = ft(Ts.caption2, FontWeight.Bold), color = fg, maxLines = 1)
            }
            Text(s.lesson.subject, style = ft(Ts.caption, FontWeight.SemiBold), color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

private fun shortDate(d: Instant): String = Fmt.format(d, if (Cal.isToday(d)) "'сегодня' H:mm" else "EE d MMM, H:mm")

@Composable
private fun Summary(k: String) {
    val list = AttendanceStore.students
    val p = list.count { AttendanceStore.mark(it, k) == Mark.PRESENT }
    val a = list.count { AttendanceStore.mark(it, k) == Mark.ABSENT }
    val e = list.count { AttendanceStore.mark(it, k) == Mark.EXCUSED }
    val none = list.size - p - a - e
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Pill("$p", "был", Mark.PRESENT.color, Modifier.weight(1f))
        Pill("$a", "н/б", Mark.ABSENT.color, Modifier.weight(1f))
        Pill("$e", "уваж.", Mark.EXCUSED.color, Modifier.weight(1f))
        Pill("$none", "не отм.", Ios.gray, Modifier.weight(1f))
    }
}

@Composable
private fun Pill(n: String, t: String, c: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = 0.12f)).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Text(n, style = ft(Ts.headline, FontWeight.Bold, Design.ROUNDED), color = c)
        Text(t, style = ft(Ts.caption2), color = Ios.secondaryLabel)
    }
}

@Composable
private fun StudentRow(st: Student, slot: LessonSlot, key: String) {
    val cur = AttendanceStore.mark(st, key)
    Row(Modifier.fillMaxWidth().background(cur?.color?.copy(alpha = 0.08f) ?: Color.Transparent).defaultMinSize(minHeight = 44.dp)
        .padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(st.name, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f))
        for (m in Mark.entries) {
            val on = cur == m
            val sc by animateFloatAsState(if (on) 1.05f else 1f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessMedium), label = "mark")
            Pressable({ Haptics.tap(); AttendanceStore.set(if (on) null else m, st, slot) }) {
                Box(Modifier.scale(sc).size(38.dp, 34.dp).clip(RoundedCornerShape(10.dp)).background(if (on) m.color else m.color.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center) {
                    Text(m.symbol, style = ft(Ts.headline, FontWeight.ExtraBold, Design.ROUNDED), color = if (on) Color.White else m.color)
                }
            }
        }
    }
}

// MARK: - Список группы

@Composable
fun RosterScreen() {
    var newName by remember { mutableStateOf("") }
    var bulk by remember { mutableStateOf("") }
    var showBulk by remember { mutableStateOf(false) }
    val store = AttendanceStore

    fun addOne() {
        store.add(listOf(newName))
        newName = ""
        Haptics.tap()
    }

    Screen("Список группы") {
        FormColumn {
            FormSection(footer = "В режиме списка — по одному человеку в строке. Можно скопировать список из беседы группы.") {
                row {
                    IosTextField(newName, { newName = it }, "Фамилия Имя", Modifier.weight(1f), words = true, onDone = { if (newName.isNotBlank()) addOne() })
                    TextButton({ addOne() }, enabled = newName.isNotBlank()) {
                        Text("Добавить", style = ft(Ts.body), color = if (newName.isNotBlank()) Brand.color else Ios.tertiaryLabel)
                    }
                }
                button("Вставить список целиком", "list.bullet.clipboard") { showBulk = !showBulk }
                if (showBulk) {
                    raw {
                        IosTextField(bulk, { bulk = it }, "", Modifier.fillMaxWidth().heightIn(min = 140.dp).padding(horizontal = 16.dp, vertical = 10.dp),
                            singleLine = false, minLines = 6, words = true)
                    }
                    button("Добавить всех", "person.3.sequence.fill", enabled = bulk.isNotBlank()) {
                        store.add(bulk.lines())
                        bulk = ""
                        showBulk = false
                        Haptics.success()
                    }
                }
            }
            FormSection("Группа (${store.students.size})") {
                for (s in store.sortedStudents) swipeRow({ store.remove(s) }) {
                    Text(s.name, style = ft(Ts.body), color = Ios.label)
                }
            }
        }
    }
}

// MARK: - Статистика

@Composable
fun AttendanceStatsScreen() {
    val ctx = LocalContext.current
    val store = AttendanceStore
    var subject by remember { mutableStateOf("") }
    var csvFile by remember { mutableStateOf<File?>(null) }
    val subjects = store.lessons.values.map { it.subject }.toSet().sorted()

    Screen("Статистика") {
        FormColumn {
            FormSection {
                picker("Предмет", listOf("" to "Все предметы") + subjects.map { it to it }, subject, { subject = it })
                row {
                    Text("Отмечено занятий: ${store.recordedLessons.count { subject.isEmpty() || it.subject == subject }}",
                        style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
            }
            FormSection("Студенты") {
                for (s in store.sortedStudents) {
                    val st = store.stats(s, subject.ifEmpty { null })
                    val total = st.present + st.absent + st.excused
                    row {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(s.name, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                            Text("был ${st.present} · н/б ${st.absent} · уваж. ${st.excused}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                        if (total > 0) {
                            val pct = ((st.present + st.excused).toDouble() / total * 100).roundToInt()
                            Text("$pct%", style = ft(Ts.headline, FontWeight.Bold, Design.ROUNDED),
                                color = if (pct >= 80) Mark.PRESENT.color else if (pct >= 60) Mark.EXCUSED.color else Mark.ABSENT.color)
                        }
                    }
                }
            }
            FormSection(footer = "Таблица сохраняется в «Файлы › Отчёты» и открывается в Excel, Google Таблицах или Р7.") {
                button("Сделать таблицу (CSV для Excel)", "tablecells") {
                    val dir = File(FileService.root, "Отчёты").apply { mkdirs() }
                    val f = File(dir, "Посещаемость.csv")
                    // BOM, чтобы Excel правильно открыл кириллицу
                    try {
                        f.writeBytes(byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + store.csv().toByteArray(Charsets.UTF_8))
                        csvFile = f
                        Haptics.success()
                    } catch (_: Throwable) {}
                }
                csvFile?.let { f -> button("Отправить таблицу", "square.and.arrow.up") { Share.files(ctx, listOf(f), "text/csv") } }
            }
        }
    }
}
