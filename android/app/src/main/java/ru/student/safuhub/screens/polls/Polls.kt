package ru.student.safuhub.screens.polls

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import ru.student.safuhub.screens.attendance.AttendanceStore
import ru.student.safuhub.screens.attendance.Student
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.ProgressBar
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.FormColumn
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.LocalPushed
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.rememberBool
import ru.student.safuhub.ui.kit.swipeRow
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// MARK: - Опросы группы
// Создаёшь опрос → отправляешь в чат группы → отмечаешь, кто что ответил → итоги и список «не ответили».
// Сервера нет: всё хранится на телефоне, а ребята отвечают в привычном чате.

@Serializable
data class GroupPoll(
    val id: String = newId(),
    val question: String = "",
    val options: List<String> = emptyList(),
    val created: AppleDate = Instant.now(),
    /** id студента → номер варианта */
    val answers: Map<String, Int> = emptyMap(),
    val closed: Boolean = false,
)

object PollStore {
    private const val key = "polls.v1"
    private val state = mutableStateOf<List<GroupPoll>?>(null)

    var polls: List<GroupPoll>
        get() = state.value ?: (Defaults.decode<List<GroupPoll>>(key) ?: emptyList()).also { state.value = it }
        set(v) {
            state.value = v
            Defaults.encode(key, v)
        }

    fun update(id: String, f: (GroupPoll) -> GroupPoll) {
        polls = polls.map { if (it.id == id) f(it) else it }
    }
}

object PollText {
    val marks = listOf("1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣")
    fun mark(i: Int) = marks[minOf(i, marks.size - 1)]

    fun invite(p: GroupPoll): String {
        var t = "📊 Опрос: ${p.question}\n\n"
        p.options.forEachIndexed { i, o -> t += "${mark(i)} $o\n" }
        t += "\nОтветьте цифрой 🙏"
        return t
    }

    fun results(p: GroupPoll, students: List<Student>): String {
        var t = "📊 Итоги: ${p.question}\n\n"
        p.options.forEachIndexed { i, o ->
            val names = students.filter { p.answers[it.id] == i }.map { it.name }
            t += "${mark(i)} $o — ${names.size}"
            if (names.isNotEmpty()) t += ": " + names.joinToString(", ")
            t += "\n"
        }
        val silent = students.filter { p.answers[it.id] == null }
        if (silent.isNotEmpty()) t += "\nНе ответили: " + silent.joinToString(", ") { it.name }
        return t
    }

    fun nudge(p: GroupPoll, students: List<Student>): String {
        val silent = students.filter { p.answers[it.id] == null }.map { it.name }
        return "⏰ Напоминаю про опрос «${p.question}».\nЕщё не ответили: ${silent.joinToString(", ")}"
    }
}

// MARK: - Список опросов

@Composable
fun PollsScreen() {
    val nav = LocalNav.current
    val creating = rememberBool()
    val store = PollStore
    val n = AttendanceStore.students.size
    Screen("Опросы группы", large = !LocalPushed.current) {
        FormColumn {
            if (n == 0) {
                FormSection {
                    row {
                        IconLabel("Сначала добавь список группы в «Посещаемости» — тогда можно отмечать, кто что ответил.", "person.3.fill",
                            style = ft(Ts.subheadline), color = Ios.secondaryLabel, iconColor = Brand.color)
                    }
                }
            }
            FormSection {
                row(onClick = { creating.value = true }) {
                    IconLabel("Новый опрос", "plus.circle.fill", style = ft(Ts.body, FontWeight.SemiBold), color = Brand.color)
                }
            }
            val list = store.polls.sortedByDescending { it.created }
            if (list.isNotEmpty()) {
                FormSection {
                    for (p in list) swipeRow({ store.polls = store.polls.filter { it.id != p.id } }, onClick = { nav?.push { PollDetailScreen(p.id) } }) {
                        Column(Modifier.weight(1f).padding(vertical = 2.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(p.question, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, maxLines = 2,
                                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                if (p.closed) Text("закрыт", style = ft(Ts.caption2, FontWeight.Bold), color = Ios.secondaryLabel)
                            }
                            Text("Ответили ${p.answers.size}${if (n > 0) " из $n" else ""} · ${Fmt.format(p.created, "d MMM")}",
                                style = ft(Ts.caption), color = Ios.secondaryLabel)
                            if (n > 0) ProgressBar(p.answers.size.toFloat() / maxOf(n, 1), Brand.color)
                        }
                        SfIcon("chevron.right", size = 14.dp, tint = Ios.tertiaryLabel)
                    }
                }
            }
        }
    }
    SheetBinding(creating) { NavigationStack { PollEditor() } }
}

// MARK: - Новый опрос

private val templates = listOf(
    "Кто будет на паре?" to listOf("Буду", "Не буду", "Опоздаю"),
    "Удобно перенести пару?" to listOf("Да", "Нет", "Всё равно"),
    "Кто сдаёт лабу на этой неделе?" to listOf("Сдаю", "Не готов", "Уже сдал"),
    "Скидываемся?" to listOf("Да", "Нет"),
    "Во сколько встречаемся?" to listOf("Утром", "Днём", "Вечером"),
)

@Composable
private fun PollEditor() {
    val dismiss = LocalDismiss.current
    val question = remember { mutableStateOf("") }
    val options = remember { mutableStateOf(listOf("", "")) }
    val valid = question.value.isNotBlank() && options.value.count { it.isNotBlank() } >= 2

    Screen("Новый опрос", leading = { BarButton("Отмена") { dismiss() } }, trailing = {
        BarButton("Создать", bold = true, enabled = valid) {
            val opts = options.value.map { it.trim() }.filter { it.isNotEmpty() }
            PollStore.polls = PollStore.polls + GroupPoll(question = question.value.trim(), options = opts)
            Haptics.success()
            dismiss()
        }
    }) {
        FormColumn {
            FormSection("Вопрос") {
                row {
                    IosTextField(question.value, { question.value = it }, "О чём спрашиваем", Modifier.fillMaxWidth(), singleLine = false)
                }
            }
            FormSection("Варианты") {
                options.value.forEachIndexed { i, o ->
                    val content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {
                        Text(PollText.mark(i), style = ft(Ts.body))
                        Spacer(Modifier.width(8.dp))
                        IosTextField(o, { v -> options.value = options.value.toMutableList().also { if (i < it.size) it[i] = v } }, "Вариант ${i + 1}",
                            Modifier.weight(1f))
                    }
                    if (options.value.size > 2) swipeRow({ options.value = options.value.filterIndexed { j, _ -> j != i } }, content = content)
                    else row(content = content)
                }
                if (options.value.size < 8) button("Ещё вариант", "plus") { options.value = options.value + "" }
            }
            FormSection("Шаблоны") {
                for ((q, opts) in templates) button(q) {
                    question.value = q
                    options.value = opts
                    Haptics.tap()
                }
            }
        }
    }
}

// MARK: - Опрос: отметки и итоги

@Composable
private fun PollDetailScreen(id: String) {
    val ctx = LocalContext.current
    val p = PollStore.polls.firstOrNull { it.id == id }
    Screen("Опрос") {
        if (p == null) {
            Text("Опрос удалён", style = ft(Ts.body), color = Ios.secondaryLabel, modifier = Modifier.padding(20.dp))
            return@Screen
        }
        val students = AttendanceStore.sortedStudents
        val total = maxOf(p.answers.size, 1)
        FormColumn {
            FormSection {
                row { Text(p.question, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label) }
                button("Отправить в чат группы", "paperplane.fill") { Share.text(ctx, PollText.invite(p)) }
            }
            FormSection("Итоги") {
                p.options.forEachIndexed { o, title ->
                    val n = p.answers.values.count { it == o }
                    row {
                        Column(Modifier.weight(1f).padding(vertical = 2.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("${PollText.mark(o)} $title", style = ft(Ts.body), color = Ios.label, modifier = Modifier.weight(1f))
                                Text("$n · ${(n.toDouble() / total * 100).toInt()}%", style = ft(Ts.subheadline, FontWeight.Bold, mono = true), color = Ios.label)
                            }
                            ProgressBar(maxOf(n.toFloat() / total, 0.02f), Brand.color, height = 7.dp)
                        }
                    }
                }
                button("Отправить итоги", "chart.bar.doc.horizontal") { Share.text(ctx, PollText.results(p, students)) }
                if (students.any { p.answers[it.id] == null }) {
                    button("Напомнить тем, кто молчит", "bell.badge.fill") { Share.text(ctx, PollText.nudge(p, students)) }
                }
            }
            FormSection("Кто что ответил", footer = "Нажми на имя и выбери ответ из чата.") {
                if (students.isEmpty()) row {
                    Text("Список группы пуст — добавь его в «Посещаемости».", style = ft(Ts.body), color = Ios.secondaryLabel)
                }
                for (st in students) {
                    val a = p.answers[st.id]
                    raw {
                        IosMenu({
                            p.options.forEachIndexed { o, title ->
                                item(title, checked = a == o) {
                                    PollStore.update(id) { it.copy(answers = it.answers + (st.id to o)) }
                                    Haptics.tap()
                                }
                            }
                            if (a != null) {
                                divider()
                                item("Сбросить", destructive = true) { PollStore.update(id) { it.copy(answers = it.answers - st.id) } }
                            }
                        }, Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(st.name, style = ft(Ts.body), color = Ios.label, modifier = Modifier.weight(1f))
                                if (a != null && a in p.options.indices) Text(p.options[a], style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
                                else Text("—", style = ft(Ts.body), color = Ios.secondaryLabel)
                            }
                        }
                    }
                }
            }
            FormSection {
                toggle("Опрос закрыт", p.closed, { v -> PollStore.update(id) { it.copy(closed = v) } })
            }
        }
    }
}
