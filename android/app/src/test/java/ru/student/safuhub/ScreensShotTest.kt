package ru.student.safuhub

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.Lesson
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.SharedSchedule
import ru.student.safuhub.feature.lectures.Lecture
import ru.student.safuhub.feature.lectures.LectureStore
import ru.student.safuhub.feature.lectures.LectureSummary
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.LocalSheets
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.SheetHost
import ru.student.safuhub.ui.kit.SheetsLayer
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.SafuTheme
import java.time.Instant

/** Снимки отдельных экранов (build/shots/screen_*.png) */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w393dp-h852dp-xxhdpi")
class ScreensShotTest {
    @get:Rule val rule = createComposeRule()

    private fun sample() {
        Defaults.init(ApplicationProvider.getApplicationContext())
        Defaults.set("onboarded", true)
        Defaults.set("lock.app", false)
        val wd = ScheduleEngine.weekday(Instant.now()).let { if (it == 7) 1 else it }
        val lessons = listOf(
            Lesson(subject = "Математический анализ", kind = "Лекция", weekday = wd, pair = 1, room = "1220", building = "наб. Северной Двины, 17", teacher = "Иванов И. И."),
            Lesson(subject = "Программирование на Kotlin", kind = "Лабораторная", weekday = wd, pair = 2, room = "3104", teacher = "Петрова А. С."),
            Lesson(subject = "Физика", kind = "Практика", weekday = wd, pair = 3, room = "2210", teacher = "Сидоров П. П."),
            Lesson(subject = "История России", kind = "Семинар", weekday = (wd % 6) + 1, pair = 2, room = "405"),
        )
        SharedSchedule.save(ScheduleData(lessons = lessons, ruzGroupNumber = "151621"))
        ScheduleStore.forceReload()
        if (LectureStore.lectures.isEmpty()) {
            LectureStore.add(Lecture(title = "Пределы и непрерывность", subject = "Математический анализ", duration = 5400.0,
                audioName = "demo.aac", marks = listOf(600.0, 2400.0),
                summary = LectureSummary(title = "Пределы и непрерывность",
                    summary = "Определение предела функции, замечательные пределы и непрерывность в точке.",
                    keyPoints = listOf("Предел по Коши и по Гейне эквивалентны"))))
        }
    }

    private fun shot(name: String, content: @Composable () -> Unit) {
        sample()
        // часы на паузе: у игры и регистрации анимация идёт без остановки
        rule.mainClock.autoAdvance = false
        rule.setContent {
            SafuTheme {
                val host = remember { SheetHost() }
                CompositionLocalProvider(LocalSheets provides host) {
                    Box(Modifier.fillMaxSize().background(Ios.background)) {
                        NavigationStack { content() }
                        SheetsLayer(host)
                        Dialogs.Layer()
                    }
                }
            }
        }
        rule.mainClock.advanceTimeBy(1500)
        rule.onRoot().captureRoboImage("build/shots/screen_$name.png")
    }

    @Test fun lectures() = shot("lectures") { ru.student.safuhub.feature.lectures.LecturesScreen() }
    @Test fun recorder() = shot("lecture_recorder") { ru.student.safuhub.feature.lectures.RecorderScreen() }
    @Test fun attendance() = shot("attendance") { ru.student.safuhub.screens.attendance.AttendanceScreen() }
    @Test fun brs() = shot("brs") { ru.student.safuhub.screens.grades.BRSScreen() }
    @Test fun polls() = shot("polls") { ru.student.safuhub.screens.polls.PollsScreen() }
    @Test fun teachers() = shot("teachers") { ru.student.safuhub.screens.teachers.TeachersScreen() }
    @Test fun subjects() = shot("subjects") { ru.student.safuhub.screens.subjects.SubjectsScreen() }
    @Test fun session() = shot("session") { ru.student.safuhub.feature.session.SessionScreen() }
    @Test fun notes() = shot("notes") { ru.student.safuhub.feature.notes.NotesScreen() }
    @Test fun matrix() = shot("matrix") { ru.student.safuhub.feature.matrix.MatrixScreen() }
    @Test fun focus() = shot("focus") { ru.student.safuhub.screens.tools.FocusScreen() }
    @Test fun report() = shot("report") { ru.student.safuhub.screens.tools.ReportScreen() }
    @Test fun campusMap() = shot("campus_map") { ru.student.safuhub.screens.tools.CampusMapScreen() }
    @Test fun wake() = shot("wake") { ru.student.safuhub.feature.wake.WakeScreen() }
    @Test fun share() = shot("schedule_share") { ru.student.safuhub.screens.share.ScheduleShareScreen() }
    @Test fun boards() = shot("boards") { ru.student.safuhub.feature.board.BoardSearchScreen() }
    @Test fun stats() = shot("stats") { ru.student.safuhub.feature.features.StatsScreen() }
    @Test fun features() = shot("features") { ru.student.safuhub.feature.features.FeaturesScreen() }
    @Test fun broadcast() = shot("broadcast") { ru.student.safuhub.feature.features.BroadcastScreen() }
    @Test fun commute() = shot("commute") { ru.student.safuhub.screens.commute.CommuteSettingsScreen() }
    @Test fun busRoutes() = shot("bus_routes") { ru.student.safuhub.screens.commute.BusRoutesScreen() }
    @Test fun appearance() = shot("appearance") { ru.student.safuhub.screens.appearance.AppearanceScreen() }
    @Test fun appIcons() = shot("app_icons") { ru.student.safuhub.screens.profile.AppIconPickerScreen() }
    @Test fun liveStyle() = shot("live_style") { ru.student.safuhub.screens.profile.LiveStyleScreen() }
    @Test fun passwords() = shot("passwords") { ru.student.safuhub.screens.profile.PasswordsScreen() }
    @Test fun backup() = shot("backup") { ru.student.safuhub.feature.backup.BackupScreen() }
    @Test fun celebrations() = shot("celebrations") { ru.student.safuhub.feature.fx.CelebrationSettingsScreen() }
    @Test fun mail() = shot("mail_notify") { ru.student.safuhub.feature.mail.MailNotifyScreen() }
    @Test fun widgetWallpaper() = shot("widget_wallpaper") { ru.student.safuhub.widget.WidgetWallpaperScreen() }
    @Test fun developer() = shot("developer") { ru.student.safuhub.screens.developer.DeveloperScreen() }
    @Test fun game() = shot("bus_game") { ru.student.safuhub.feature.game.BusGameScreen() }
    @Test fun registration() = shot("registration") { ru.student.safuhub.screens.registration.RegistrationScreen(canClose = true) {} }
}
