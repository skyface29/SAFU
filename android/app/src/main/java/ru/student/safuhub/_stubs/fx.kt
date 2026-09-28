@file:Suppress("unused", "UNUSED_PARAMETER")
package ru.student.safuhub.feature.fx
import androidx.compose.runtime.Composable
import ru.student.safuhub.data.ScheduleData
object Celebrations {
    fun checkOnOpen(d: ScheduleData) {}
    fun scheduleNotifications(d: ScheduleData) {}
    fun nextFinish(d: ScheduleData): java.time.Instant? = null
    fun taskDone(title: String, left: Int) {}
}
@Composable fun CelebrationOverlay() {}
