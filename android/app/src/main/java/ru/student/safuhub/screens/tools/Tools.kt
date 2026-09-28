package ru.student.safuhub.screens.tools

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.TeacherMode
import ru.student.safuhub.feature.features.BroadcastScreen
import ru.student.safuhub.feature.features.FeatureFlags
import ru.student.safuhub.feature.features.StatsScreen
import ru.student.safuhub.screens.attendance.AttendanceScreen
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.SectionTitle
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// MARK: - Список инструментов

enum class Tool(val raw: String, val title: String, val subtitle: String, val icon: String) {
    ATTENDANCE("attendance", "Посещаемость", "Отметки группы", "person.crop.circle.badge.checkmark"),
    BROADCAST("broadcast", "Рассылка", "Сообщение группе", "megaphone.fill"),
    POLLS("polls", "Опросы", "Кто что ответил", "chart.bar.doc.horizontal.fill"),
    SUBJECTS("subjects", "Предметы", "Заметки и файлы", "books.vertical.fill"),
    SESSION("session", "Сессия", "Билеты и отсчёт", "graduationcap.fill"),
    GRADES("grades", "БРС", "Баллы и прогноз", "star.leadinghalf.filled"),
    SHARE("share", "Картинкой", "Пары в чат группы", "photo.on.rectangle.angled"),
    STATS("stats", "Статистика", "Итоги семестра", "chart.bar.fill"),
    TEACHERS("teachers", "Преподаватели", "Кто, где, когда", "person.2.fill"),
    MAP("map", "Карта корпусов", "Где твои пары", "map.fill"),
    ROOMS("rooms", "Свободные", "Пустые аудитории", "door.left.hand.open"),
    BOARDS("boards", "Доски", "Фото по парам, поиск", "text.viewfinder"),
    WAKE("wake", "Подъём", "Будильник к паре", "alarm.fill"),
    LECTURES("lectures", "Лекции", "Запись и конспект", "waveform.and.mic"),
    FOCUS("focus", "Фокус", "Помодоро-таймер", "timer"),
    REPORT("report", "Титульник", "По СТО САФУ, .docx", "doc.richtext.fill"),
    MATRIX("matrix", "Матрицы", "По фото, Wolfram", "square.grid.3x3.fill");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw }
    }
}

@Composable
fun ToolsGrid(onOpen: (Tool) -> Unit) {
    val role = Defaults.int("user.role")
    Defaults.string("tools.rev")
    val visible = Tool.entries.filter { t ->
        if (role == 0 && (t == Tool.ATTENDANCE || t == Tool.BROADCAST)) return@filter false
        // преподавателю не нужны студенческие вещи
        if (TeacherMode.isOn && t in listOf(Tool.SESSION, Tool.GRADES, Tool.REPORT, Tool.LECTURES, Tool.WAKE)) return@filter false
        FeatureFlags.toolOn(t)
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("Инструменты")
        for (row in visible.chunked(3)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (t in row) {
                    Pressable({ Haptics.tap(); onOpen(t) }, Modifier.weight(1f)) {
                        Glass(20.dp, Modifier.fillMaxWidth(), interactive = true) {
                            Column(Modifier.fillMaxWidth().defaultMinSize(minHeight = 78.dp).padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                SfGradientIcon(t.icon, size = 22.dp)
                                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                    Text(t.title, style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = Ios.label,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(t.subtitle, style = ft(Ts.caption2), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** Инструмент в листе со своей навигацией и кнопкой «Готово» */
@Composable
fun ToolSheet(tool: Tool) {
    DoneSheet { ToolContent(tool) }
}

@Composable
fun ToolContent(tool: Tool) {
    when (tool) {
        Tool.ATTENDANCE -> AttendanceScreen()
        Tool.BROADCAST -> BroadcastScreen()
        Tool.POLLS -> ru.student.safuhub.screens.polls.PollsScreen()
        Tool.SHARE -> ru.student.safuhub.screens.share.ScheduleShareScreen()
        Tool.GRADES -> ru.student.safuhub.screens.grades.BRSScreen()
        Tool.STATS -> StatsScreen()
        Tool.SUBJECTS -> ru.student.safuhub.screens.subjects.SubjectsScreen()
        Tool.SESSION -> ru.student.safuhub.feature.session.SessionScreen()
        Tool.TEACHERS -> ru.student.safuhub.screens.teachers.TeachersScreen()
        Tool.MAP -> CampusMapScreen()
        Tool.ROOMS -> ru.student.safuhub.feature.place.FreeRoomsScreen()
        Tool.BOARDS -> ru.student.safuhub.feature.board.BoardSearchScreen()
        Tool.WAKE -> ru.student.safuhub.feature.wake.WakeScreen()
        Tool.LECTURES -> ru.student.safuhub.feature.lectures.LecturesScreen()
        Tool.FOCUS -> FocusScreen()
        Tool.REPORT -> ReportScreen()
        Tool.MATRIX -> ru.student.safuhub.feature.matrix.MatrixScreen()
    }
}
