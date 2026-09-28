@file:Suppress("unused", "UNUSED_PARAMETER")
package ru.student.safuhub.screens.registration
import androidx.compose.runtime.Composable
@Composable fun RegistrationScreen(canClose: Boolean, onDone: () -> Unit) { ru.student.safuhub.ui.kit.FormScreen("Регистрация") { ru.student.safuhub.ui.kit.FormSection { button("Готово") { onDone() } } } }
