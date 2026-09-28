package ru.student.safuhub.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.LocalSheets
import ru.student.safuhub.ui.kit.SheetHost
import ru.student.safuhub.ui.kit.SheetsLayer

@Composable
fun RootView() {
    val sheets = remember { SheetHost() }
    CompositionLocalProvider(LocalSheets provides sheets) {
        Box(Modifier.fillMaxSize()) {
            AmbientBackground()
            FormScreen("САФУ") {
                FormSection("Проверка") { text("Каркас приложения") }
            }
            SheetsLayer(sheets)
            Dialogs.Layer()
        }
    }
}
