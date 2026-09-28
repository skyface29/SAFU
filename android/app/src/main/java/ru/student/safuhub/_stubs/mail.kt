@file:Suppress("unused", "UNUSED_PARAMETER")
package ru.student.safuhub.feature.mail
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
object MailRouter { const val key = "safu.mail"; var pending by mutableStateOf(false) }
object MailWatch { suspend fun checkIfEnabled() {} }
