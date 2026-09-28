package ru.student.safuhub

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import ru.student.safuhub.core.Defaults

/** Снимки экранов для проверки вёрстки (build/shots) */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w393dp-h852dp-xxhdpi")
class ShotTest {
    @get:Rule val rule = createEmptyComposeRule()

    private fun shot(name: String, setup: () -> Unit = {}) {
        Defaults.init(ApplicationProvider.getApplicationContext())
        Defaults.set("onboarded", true)
        Defaults.set("lock.app", false)
        ru.student.safuhub.data.SharedSchedule.save(ru.student.safuhub.data.ScheduleData())
        ru.student.safuhub.data.ScheduleStore.forceReload()
        setup()
        ActivityScenario.launch(MainActivity::class.java).use {
            rule.mainClock.autoAdvance = false
            rule.mainClock.advanceTimeBy(2500)
            rule.onRoot().captureRoboImage("build/shots/$name.png")
        }
    }

    private fun sample() {
        val wd = ru.student.safuhub.data.ScheduleEngine.weekday(java.time.Instant.now()).let { if (it == 7) 1 else it }
        val lessons = listOf(
            ru.student.safuhub.data.Lesson(subject = "Математический анализ", kind = "Лекция", weekday = wd, pair = 1, room = "1220", building = "Главный корпус", teacher = "Иванов И. И."),
            ru.student.safuhub.data.Lesson(subject = "Программирование на Kotlin", kind = "Лабораторная", weekday = wd, pair = 2, room = "3104", teacher = "Петрова А. С."),
            ru.student.safuhub.data.Lesson(subject = "Физика", kind = "Практика", weekday = wd, pair = 3, room = "2210", teacher = "Сидоров П. П."),
            ru.student.safuhub.data.Lesson(subject = "История России", kind = "Семинар", weekday = wd, pair = 5, room = "405"),
            ru.student.safuhub.data.Lesson(subject = "Английский язык", kind = "Практика", weekday = (wd % 6) + 1, pair = 2, room = "512"),
        )
        ru.student.safuhub.data.SharedSchedule.save(ru.student.safuhub.data.ScheduleData(lessons = lessons))
        ru.student.safuhub.data.ScheduleStore.forceReload()
    }

    @Test fun schedule() = shot("schedule") {
        sample()
        Defaults.set("memory.tabID", "schedule")
    }

    @Test fun homeWithSchedule() = shot("home_sched") {
        sample()
        Defaults.set("memory.tabID", "home")
    }

    @Test fun home() = shot("home") {
        Defaults.set("memory.tabID", "home")
    }

    @Test fun homeLight() = shot("home_light") {
        Defaults.set("memory.tabID", "home")
        Defaults.set("ui.scheme", 1)
    }
}
