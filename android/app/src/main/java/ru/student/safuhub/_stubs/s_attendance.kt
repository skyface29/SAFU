@file:Suppress("unused")
package ru.student.safuhub.screens.attendance
import androidx.compose.runtime.Composable
@Composable fun AttendanceScreen(slot: ru.student.safuhub.data.LessonSlot? = null) { ru.student.safuhub.ui.kit.FormScreen("AttendanceScreen", large = true) { ru.student.safuhub.ui.kit.FormSection { text("Скоро") } } }
