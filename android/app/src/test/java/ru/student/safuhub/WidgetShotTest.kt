package ru.student.safuhub

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.compose
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.Lesson
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.SharedSchedule
import ru.student.safuhub.widget.PairWidgetLight
import ru.student.safuhub.widget.PairWidgetNight
import ru.student.safuhub.widget.PairWidgetSunset
import java.time.Instant

/** Снимки виджета во всех размерах (build/shots/widget_*.png) */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w393dp-h852dp-xxhdpi")
class WidgetShotTest {
    private val ctx: Context get() = ApplicationProvider.getApplicationContext()

    private fun sample() {
        Defaults.init(ctx)
        val wd = ScheduleEngine.weekday(Instant.now()).let { if (it == 7) 1 else it }
        val next = (wd % 6) + 1
        val lessons = listOf(
            Lesson(subject = "Математический анализ", kind = "Лекция", weekday = wd, pair = 1, room = "1220", building = "наб. Северной Двины, 17", teacher = "Иванов И. И."),
            Lesson(subject = "Программирование на Kotlin", kind = "Лабораторная", weekday = wd, pair = 2, room = "3104", teacher = "Петрова А. С."),
            Lesson(subject = "Физика", kind = "Практика", weekday = wd, pair = 3, room = "2210"),
            Lesson(subject = "История России", kind = "Семинар", weekday = wd, pair = 5, room = "405"),
            Lesson(subject = "Английский язык", kind = "Практика", weekday = next, pair = 2, room = "512", building = "наб. Северной Двины, 2"),
            Lesson(subject = "Алгоритмы и структуры данных", kind = "Лекция", weekday = next, pair = 3, room = "1101"),
        )
        SharedSchedule.save(ScheduleData(lessons = lessons, ruzGroupNumber = "151621"))
    }

    private fun shot(widget: GlanceAppWidget, name: String, w: Int, h: Int) = runBlocking {
        val rv = widget.compose(ctx, size = DpSize(w.dp, h.dp))
        val parent = FrameLayout(ctx)
        val view = rv.apply(ctx, parent)
        val d = ctx.resources.displayMetrics.density
        val frame = FrameLayout(ctx).apply { setBackgroundColor(0xFF6A7FA8.toInt()) }
        frame.addView(view, FrameLayout.LayoutParams((w * d).toInt(), (h * d).toInt()))
        frame.measure(View.MeasureSpec.makeMeasureSpec((w * d).toInt(), View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec((h * d).toInt(), View.MeasureSpec.EXACTLY))
        frame.layout(0, 0, frame.measuredWidth, frame.measuredHeight)
        val bmp = android.graphics.Bitmap.createBitmap(frame.width, frame.height, android.graphics.Bitmap.Config.ARGB_8888)
        frame.draw(android.graphics.Canvas(bmp))
        java.io.File("build/shots").mkdirs()
        java.io.File("build/shots/widget_$name.png").outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun small() { sample(); shot(PairWidgetNight(), "small", 170, 170) }
    @Test fun medium() { sample(); shot(PairWidgetNight(), "medium", 360, 170) }
    @Test fun large() { sample(); shot(PairWidgetNight(), "large", 360, 380) }
    @Test fun lightMedium() { sample(); shot(PairWidgetLight(), "light_medium", 360, 170) }
    @Test fun sunsetLarge() { sample(); shot(PairWidgetSunset(), "sunset_large", 360, 380) }
    @Test fun empty() { Defaults.init(ctx); SharedSchedule.save(ScheduleData()); shot(PairWidgetNight(), "empty", 170, 170) }
}
