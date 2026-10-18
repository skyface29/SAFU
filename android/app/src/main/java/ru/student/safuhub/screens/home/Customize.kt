package ru.student.safuhub.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.ResourceStore
import ru.student.safuhub.ui.AppTab
import ru.student.safuhub.ui.HomeSection
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.EditableSection
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.moved
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// MARK: - Нижняя панель (вкладки)

@Composable
fun TabsEditor() {
    var raw by prefString("tabs.order", AppTab.defaultRaw)
    val tabs = AppTab.parse(raw)
    val hidden = AppTab.entries.filter { it !in tabs }
    fun save(list: List<AppTab>) {
        val l = if (list.contains(AppTab.PROFILE)) list else list + AppTab.PROFILE
        raw = AppTab.join(l)
    }
    Screen("Нижняя панель") {
        EditableSection(tabs, { it.raw }, onMove = { f, t -> save(tabs.moved(f, t)) },
            onDelete = { i -> save(tabs.filterIndexed { j, _ -> j != i }) },
            header = "В панели",
            footer = "Перетаскивай за ≡, чтобы поменять порядок, нажми «−», чтобы убрать. Если вкладок больше пяти, лишние уйдут в «Ещё». Профиль убрать нельзя: там настройки.",
            canDelete = { it != AppTab.PROFILE }) { t ->
            IconLabel(t.title, t.icon, iconColor = Brand.color, spacing = 12.dp)
        }
        if (hidden.isNotEmpty()) {
            FormSection("Можно добавить") {
                for (t in hidden) {
                    row(onClick = {
                        val list = tabs.toMutableList()
                        val i = list.indexOf(AppTab.PROFILE)
                        if (i >= 0) list.add(i, t) else list.add(t)
                        save(list)
                        Haptics.tap()
                    }) {
                        IconLabel(t.title, t.icon, iconColor = Brand.color, spacing = 12.dp, modifier = Modifier.weight(1f))
                        SfIcon("plus.circle.fill", size = 22.dp, tint = Ios.green)
                    }
                }
            }
        }
        FormSection {
            button("Вернуть как было") { raw = AppTab.defaultRaw }
        }
    }
}

// MARK: - Главный экран (блоки)

@Composable
fun HomeEditor() {
    var raw by prefString("home.order", HomeSection.defaultRaw)
    var columnsCount by prefInt("home.columns", 2)
    var quickRaw by prefString("quick.ids", "")
    val sections = HomeSection.parse(raw)
    val hidden = HomeSection.entries.filter { it.available && it !in sections }
    val quickIDs = quickRaw.split(",").filter { it.isNotEmpty() }
    val tiles = TileStore.tiles
    val tileDraft = remember { mutableStateOf<Pair<HomeTile, Boolean>?>(null) }
    SheetItem(tileDraft) { (t, isNew) -> TileEditorSheet(t, isNew) }
    ResourceStore.load()
    val items = ResourceStore.items
    val quick = ResourceStore.quick

    fun toggleQuick(id: String) {
        val ids = (if (quickIDs.isEmpty()) quick.map { it.id } else quickIDs).toMutableList()
        val i = ids.indexOfFirst { it.equals(id, true) }
        if (i >= 0) ids.removeAt(i) else if (ids.size < 5) ids.add(id)
        quickRaw = ids.joinToString(",")
        Haptics.tap()
    }

    Screen("Главный экран") {
        EditableSection(sections, { it.raw }, onMove = { f, t -> raw = HomeSection.join(sections.moved(f, t)) },
            onDelete = { i -> raw = HomeSection.join(sections.filterIndexed { j, _ -> j != i }) },
            header = "На главной", footer = "Перетаскивай за ≡ для порядка, нажми «−», чтобы убрать блок.") { s ->
            IconLabel(s.title, s.icon, iconColor = Brand.color, spacing = 12.dp)
        }
        if (hidden.isNotEmpty()) {
            FormSection("Можно добавить") {
                for (s in hidden) {
                    row(onClick = { raw = HomeSection.join(sections + s); Haptics.tap() }) {
                        IconLabel(s.title, s.icon, iconColor = Brand.color, spacing = 12.dp, modifier = Modifier.weight(1f))
                        SfIcon("plus.circle.fill", size = 22.dp, tint = Ios.green)
                    }
                }
            }
        }
        EditableSection(tiles, { it.id }, onMove = { f, t -> TileStore.set(tiles.moved(f, t)) },
            onDelete = { i -> TileStore.set(tiles.filterIndexed { j, _ -> j != i }) },
            header = "Мои плитки",
            footer = "Сайт, инструмент, предмет, вкладка, камера на доску, фото с пар или стикер. Цвет, значок и размер — любые. На главной удерживай плитку, чтобы изменить.",
            onClick = { tileDraft.value = it to false },
            trailing = { t ->
                val dark = LocalDark.current
                Box(Modifier.size(12.dp).clip(CircleShape).background(t.theme.colorDyn.of(dark)))
            },
            extra = {
                androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth().clickable { tileDraft.value = TileStore.newTile() to true }
                    .padding(horizontal = 16.dp, vertical = 12.dp)) {
                    IconLabel("Добавить плитку", "plus.circle.fill", color = Brand.color, spacing = 12.dp)
                }
            }) { t ->
            IconLabel(t.title, t.icon, iconColor = Brand.color, spacing = 12.dp)
        }
        FormSection("Быстрые кнопки (до 5)", footer = "Отметь сайты, которые должны быть круглыми кнопками сверху.") {
            for (r in items) {
                row(onClick = { toggleQuick(r.id) }) {
                    IconLabel(r.title, r.icon, iconColor = Brand.color, spacing = 12.dp, modifier = Modifier.weight(1f))
                    val on = quickIDs.any { it.equals(r.id, true) } || (quickIDs.isEmpty() && quick.any { it.id == r.id })
                    if (on) SfIcon("checkmark.circle.fill", size = 22.dp, tint = Brand.color)
                }
            }
        }
        FormSection("Плитки сайтов") {
            row {
                Text("В ряд", style = ft(Ts.body), color = Ios.label)
                Spacer(Modifier.width(16.dp))
                ru.student.safuhub.ui.kit.Segmented(listOf(2 to "2", 3 to "3"), columnsCount, { columnsCount = it }, Modifier.weight(1f))
            }
        }
        FormSection {
            button("Вернуть как было") { raw = HomeSection.defaultRaw; quickRaw = "" }
        }
    }
}
