@file:Suppress("unused")
package ru.student.safuhub.screens.subjects
import androidx.compose.runtime.Composable
@Composable fun SubjectsScreen() { ru.student.safuhub.ui.kit.FormScreen("SubjectsScreen", large = true) { ru.student.safuhub.ui.kit.FormSection { text("Скоро") } } }
@Composable fun SubjectsStrip(onOpen: (String) -> Unit) {}
@Composable fun SubjectSheet(name: String) {}
@Composable fun SubjectsStripVisible() = false
