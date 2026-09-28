package ru.student.safuhub.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.SharedSchedule
import ru.student.safuhub.screens.tools.Tool
import ru.student.safuhub.ui.AppTab
import ru.student.safuhub.ui.HomeSection
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.SectionTitle
import ru.student.safuhub.ui.design.strokeBorder
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.theme.AccentTheme
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// MARK: - Свои плитки на главной
// Любая плитка: сайт, инструмент, предмет, вкладка, камера на доску, фото с пар или просто заметка-стикер.

@Serializable
data class HomeTile(
    val id: String = newId(),
    val title: String = "",
    val icon: String = "star.fill",
    val color: String = AccentTheme.BLUE.raw,
    val kind: String = Kind.LINK.raw,
    val value: String = "",
    val wide: Boolean = false,
) {
    enum class Kind(val raw: String, val title: String, val icon: String) {
        LINK("link", "Сайт", "link"),
        TOOL("tool", "Инструмент", "wrench.and.screwdriver.fill"),
        SUBJECT("subject", "Предмет", "book.closed.fill"),
        TAB("tab", "Вкладка", "square.grid.2x2.fill"),
        CAMERA("camera", "Фото доски", "camera.fill"),
        BOARDS("boards", "Фото с пар", "photo.stack.fill"),
        NOTE("note", "Стикер", "note.text");

        companion object {
            fun of(raw: String) = entries.firstOrNull { it.raw == raw } ?: LINK
        }
    }

    val type: Kind get() = Kind.of(kind)
    val theme: AccentTheme get() = AccentTheme.of(color) ?: AccentTheme.BLUE
}

object TileStore {
    private const val key = "home.tiles"

    val tiles: List<HomeTile> get() = Defaults.decode<List<HomeTile>>(key) ?: emptyList()

    fun set(list: List<HomeTile>) = Defaults.encode(key, list)

    fun upsert(t: HomeTile) {
        val list = tiles
        set(if (list.any { it.id == t.id }) list.map { if (it.id == t.id) t else it } else list + t)
        // первая плитка — сам показываем блок на главной
        val order = HomeSection.parse(Defaults.string("home.order") ?: HomeSection.defaultRaw).toMutableList()
        if (!order.contains(HomeSection.TILES)) {
            order.add(minOf(1, order.size), HomeSection.TILES)
            Defaults.set("home.order", HomeSection.join(order))
        }
    }

    fun delete(t: HomeTile) = set(tiles.filter { it.id != t.id })

    fun move(t: HomeTile, by: Int) {
        val list = tiles.toMutableList()
        val i = list.indexOfFirst { it.id == t.id }
        if (i < 0) return
        val j = (i + by).coerceIn(0, list.size - 1)
        if (i == j) return
        val x = list[i]; list[i] = list[j]; list[j] = x
        set(list)
    }

    fun newTile() = HomeTile(title = "", icon = "star.fill", color = AccentTheme.current.raw, kind = HomeTile.Kind.LINK.raw, value = "https://")
}

// MARK: - Блок плиток на главной

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeTilesGrid(columns: Int, onTap: (HomeTile) -> Unit) {
    val tiles = TileStore.tiles
    val editing = remember { mutableStateOf<Pair<HomeTile, Boolean>?>(null) }
    SheetItem(editing) { (t, isNew) -> TileEditorSheet(t, isNew) }
    // ряды: широкая плитка — отдельный ряд, обычные — по `columns` в ряд
    val rows = remember(tiles, columns) {
        val out = mutableListOf<List<HomeTile>>()
        var cur = mutableListOf<HomeTile>()
        for (t in tiles) {
            if (t.wide) {
                if (cur.isNotEmpty()) { out.add(cur); cur = mutableListOf() }
                out.add(listOf(t))
            } else {
                cur.add(t)
                if (cur.size == columns) { out.add(cur); cur = mutableListOf() }
            }
        }
        if (cur.isNotEmpty()) out.add(cur)
        out
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("Мои плитки")
            Spacer(Modifier.weight(1f))
            SfGradientIcon("plus.circle.fill", size = 24.dp, modifier = Modifier.clickable {
                Haptics.tap()
                editing.value = TileStore.newTile() to true
            })
        }
        if (tiles.isEmpty()) {
            Text("Добавь свои плитки: любимый сайт, предмет, камеру на доску или стикер с напоминанием.",
                style = ft(Ts.caption), color = Ios.secondaryLabel)
        }
        for (row in rows) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (t in row) {
                    ContextMenuBox(items = {
                        item("Изменить", "pencil") { editing.value = t to false }
                        item(if (t.wide) "Сделать маленькой" else "Во всю ширину", if (t.wide) "rectangle.split.2x1" else "rectangle") {
                            TileStore.upsert(t.copy(wide = !t.wide))
                        }
                        item("Раньше", "arrow.left") { TileStore.move(t, -1) }
                        item("Дальше", "arrow.right") { TileStore.move(t, 1) }
                        item("Удалить", "trash", destructive = true) { TileStore.delete(t) }
                    }, modifier = Modifier.weight(1f), onClick = {
                        Haptics.tap()
                        if (t.type == HomeTile.Kind.NOTE) editing.value = t to false else onTap(t)
                    }) {
                        HomeTileLabel(t)
                    }
                }
                if (!(row.firstOrNull()?.wide ?: false) && row.size < columns) {
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
fun HomeTileLabel(tile: HomeTile, modifier: Modifier = Modifier) {
    val th = tile.theme
    val dark = LocalDark.current
    val c1 = th.colorDyn.of(dark)
    val c2 = th.secondaryDyn.of(dark)
    val shape = RoundedCornerShape(20.dp)
    if (tile.type == HomeTile.Kind.NOTE) {
        Column(
            modifier.fillMaxWidth().defaultMinSize(minHeight = 86.dp).clip(shape).background(c1.copy(alpha = 0.16f))
                .strokeBorder(c1.copy(alpha = 0.35f), 1.dp, shape).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            IconLabel(tile.title.ifEmpty { "Стикер" }, tile.icon, style = ft(Ts.caption, FontWeight.Bold), color = c1, spacing = 5.dp)
            Text(tile.value.ifEmpty { "Нажми, чтобы написать" }, style = ft(Ts.subheadline), color = Ios.label,
                maxLines = if (tile.wide) 4 else 3, overflow = TextOverflow.Ellipsis)
        }
    } else {
        Row(
            modifier.fillMaxWidth().defaultMinSize(minHeight = if (tile.wide) 58.dp else 70.dp).clip(shape)
                .background(Brush.linearGradient(listOf(c1, c2), Offset.Zero, Offset.Infinite)).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.width(30.dp), contentAlignment = Alignment.Center) {
                SfIcon(tile.icon, size = if (tile.wide) 24.dp else 22.dp, tint = Color.White)
            }
            Text(tile.title, style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = Color.White, maxLines = 2,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        }
    }
}

// MARK: - Редактор плитки

val tileIcons = listOf("star.fill", "heart.fill", "bolt.fill", "flame.fill", "book.closed.fill", "graduationcap.fill",
    "pencil", "doc.text.fill", "folder.fill", "camera.fill", "photo.stack.fill", "link",
    "globe", "calendar", "clock.fill", "bell.fill", "checklist", "chart.bar.fill",
    "function", "atom", "cpu", "laptopcomputer", "bus.fill", "cup.and.saucer.fill",
    "music.note", "gamecontroller.fill", "person.2.fill", "bubble.left.fill", "paperplane.fill", "sparkles",
    "note.text", "lightbulb.fill", "brain.head.profile", "leaf.fill", "snowflake", "mappin.and.ellipse")

@Composable
fun TileEditorSheet(initial: HomeTile, isNew: Boolean) {
    NavigationStack { TileEditor(initial, isNew) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TileEditor(initial: HomeTile, isNew: Boolean) {
    val dismiss = LocalDismiss.current
    var tile by remember { mutableStateOf(initial) }
    val subjects = remember { ScheduleQuery.subjects(SharedSchedule.load()) }
    val defaultTitle = when (tile.type) {
        HomeTile.Kind.LINK -> ru.student.safuhub.data.hostOf(tile.value)?.replace("www.", "") ?: "Сайт"
        else -> tile.type.title
    }
    val canSave = when (tile.type) {
        HomeTile.Kind.LINK -> {
            val u = try { java.net.URI(tile.value.trim()) } catch (_: Throwable) { null }
            val sc = u?.scheme?.lowercase()
            (sc == "http" || sc == "https") && !u.host.isNullOrEmpty()
        }
        HomeTile.Kind.TOOL -> Tool.of(tile.value) != null
        HomeTile.Kind.SUBJECT -> tile.value.isNotEmpty()
        HomeTile.Kind.TAB -> AppTab.of(tile.value) != null
        else -> true
    }
    fun applyDefaults(k: HomeTile.Kind) {
        var t = tile.copy(kind = k.raw, icon = k.icon)
        t = when (k) {
            HomeTile.Kind.LINK -> t.copy(value = "https://")
            HomeTile.Kind.TOOL -> t.copy(value = Tool.LECTURES.raw, title = Tool.LECTURES.title, icon = Tool.LECTURES.icon)
            HomeTile.Kind.SUBJECT -> (subjects.firstOrNull() ?: "").let { t.copy(value = it, title = it) }
            HomeTile.Kind.TAB -> t.copy(value = AppTab.SCHEDULE.raw, title = AppTab.SCHEDULE.title, icon = AppTab.SCHEDULE.icon)
            HomeTile.Kind.CAMERA -> t.copy(value = "", title = "Сфоткать доску")
            HomeTile.Kind.BOARDS -> t.copy(value = "", title = "Фото с пар")
            HomeTile.Kind.NOTE -> t.copy(value = "", title = "Стикер")
        }
        tile = t
    }
    FormScreen(if (isNew) "Новая плитка" else "Плитка",
        leading = { BarButton("Отмена") { dismiss() } },
        trailing = {
            BarButton("Готово", bold = true, enabled = canSave) {
                var t = tile
                if (t.title.trim().isEmpty()) t = t.copy(title = defaultTitle)
                TileStore.upsert(t)
                Haptics.success()
                dismiss()
            }
        }) {
        FormSection(plain = true) {
            raw { HomeTileLabel(if (tile.title.isEmpty()) tile.copy(title = defaultTitle) else tile, Modifier.padding(vertical = 10.dp, horizontal = 0.dp)) }
        }
        FormSection("Что делает") {
            picker("Тип", HomeTile.Kind.entries.map { it to it.title }, tile.type, { applyDefaults(it) })
            when (tile.type) {
                HomeTile.Kind.LINK -> field("https://…", tile.value, { tile = tile.copy(value = it) },
                    keyboard = androidx.compose.ui.text.input.KeyboardType.Uri, capitalize = false)
                HomeTile.Kind.TOOL -> picker("Инструмент", Tool.entries.map { it.raw to it.title }, tile.value, { v ->
                    val t = Tool.of(v)
                    tile = if (t != null) tile.copy(value = v, title = t.title, icon = t.icon) else tile.copy(value = v)
                })
                HomeTile.Kind.SUBJECT -> picker("Предмет", listOf("" to "Выбери") + subjects.map { it to it }, tile.value, { v ->
                    tile = if (v.isNotEmpty()) tile.copy(value = v, title = v) else tile.copy(value = v)
                })
                HomeTile.Kind.TAB -> picker("Вкладка", AppTab.entries.map { it.raw to it.title }, tile.value, { v ->
                    val t = AppTab.of(v)
                    tile = if (t != null) tile.copy(value = v, title = t.title, icon = t.icon) else tile.copy(value = v)
                })
                HomeTile.Kind.NOTE -> field("Текст стикера", tile.value, { tile = tile.copy(value = it) }, multiline = true)
                HomeTile.Kind.CAMERA -> text("Открывает камеру для текущей пары — фото ляжет в папку предмета по порядку.", size = Ts.caption)
                HomeTile.Kind.BOARDS -> text("Все пары с фото доски — открыть и отправить PDF группе.", size = Ts.caption)
            }
        }
        FormSection("Вид") {
            field("Название", tile.title, { tile = tile.copy(title = it) })
            toggle("Во всю ширину", tile.wide, { tile = tile.copy(wide = it) })
            raw {
                FlowRow(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val tc = tile.theme.colorDyn.of(LocalDark.current)
                    for (ic in tileIcons) {
                        val sel = tile.icon == ic
                        Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(if (sel) tc else Ios.label.copy(alpha = 0.06f))
                            .clickable { Haptics.tap(); tile = tile.copy(icon = ic) }, contentAlignment = Alignment.Center) {
                            SfIcon(ic, size = 19.dp, tint = if (sel) Color.White else Ios.label)
                        }
                    }
                }
            }
            raw {
                FlowRow(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    val dark = LocalDark.current
                    for (th in AccentTheme.entries) {
                        val sel = tile.color == th.raw
                        Box(Modifier.size(38.dp).clip(CircleShape).strokeBorder(Ios.label.copy(alpha = if (sel) 0.8f else 0f), 2.dp, CircleShape)
                            .padding(4.dp).clip(CircleShape)
                            .background(Brush.linearGradient(listOf(th.colorDyn.of(dark), th.secondaryDyn.of(dark)), Offset.Zero, Offset.Infinite))
                            .clickable { Haptics.tap(); tile = tile.copy(color = th.raw) })
                    }
                }
            }
        }
        if (!isNew) {
            FormSection {
                button("Удалить плитку", destructive = true) { TileStore.delete(tile); dismiss() }
            }
        }
    }
}
