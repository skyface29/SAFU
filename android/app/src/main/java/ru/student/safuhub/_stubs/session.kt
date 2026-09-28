@file:Suppress("unused", "UNUSED_PARAMETER")
package ru.student.safuhub.feature.session
import androidx.compose.runtime.Composable
@Composable fun SessionCard(data: ru.student.safuhub.data.ScheduleData) {}
object SessionMode { fun isActive(d: ru.student.safuhub.data.ScheduleData) = false }
@Composable fun SessionScreen() { ru.student.safuhub.ui.kit.FormScreen("Сессия") {} }
@Composable fun SessionCardVisible(d: ru.student.safuhub.data.ScheduleData) = false
