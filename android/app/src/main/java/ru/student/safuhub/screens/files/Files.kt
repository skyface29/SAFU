package ru.student.safuhub.screens.files

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.data.FileItem
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.SubjectFolders
import ru.student.safuhub.feature.files.FilePreviewSheet
import ru.student.safuhub.feature.files.rememberThumb
import ru.student.safuhub.feature.lock.LockGate
import ru.student.safuhub.screens.subjects.SubjectRow
import ru.student.safuhub.system.rememberDocScanner
import ru.student.safuhub.system.rememberFilePicker
import ru.student.safuhub.system.rememberMediaPicker
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.gradientTint
import ru.student.safuhub.ui.design.iosShadow
import ru.student.safuhub.ui.design.staggerIn
import ru.student.safuhub.ui.design.strokeBorder
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.ProgressLabel
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SearchField
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.kit.barTint
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb
import java.io.File

@Composable
fun FilesTab() {
    LockGate { FolderScreen(FileService.root, "Файлы") }
}

@Composable
fun FolderScreen(dir: File, title: String) {
    val ctx = LocalContext.current
    val nav = LocalNav.current
    var grid by prefBool("files.grid.v2", false)
    var sortMode by prefInt("files.sort", 0)
    var items by remember { mutableStateOf(FileService.list(dir)) }
    var recent by remember { mutableStateOf<List<FileItem>>(emptyList()) }
    var summary by remember { mutableStateOf(FileService.Summary()) }
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(FileService.Kind.ALL) }
    val preview = remember { mutableStateOf<File?>(null) }
    var selecting by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf(setOf<String>()) }
    var isImporting by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    val moving = remember { mutableStateOf<FileItem?>(null) }
    val showNote = remember { mutableStateOf(false) }
    val isRoot = FileService.isRoot(dir)
    val isSubjectsBase = FileService.path(dir) == FileService.path(SubjectFolders.base)

    fun reload() { tick++ }
    LaunchedEffect(tick) {
        items = withContext(Dispatchers.IO) { FileService.list(dir) }
        if (isRoot) {
            val (r, s) = withContext(Dispatchers.IO) { FileService.recentFiles() to FileService.summary() }
            recent = r; summary = s
        }
    }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) reload() }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    fun toast(text: String) { Haptics.success(); Dialogs.showToast(text, "checkmark.circle.fill") }
    fun perform(action: () -> Unit) {
        try { action() } catch (e: Throwable) { Dialogs.alert("Ошибка", e.message ?: "Не получилось") }
        reload()
    }

    SheetItem(preview) { f -> FilePreviewSheet(f) }
    SheetItem(moving) { item -> MoveSheet(item) { dest -> perform { FileService.move(item, dest) }; toast("Перемещено") } }
    SheetBinding(showNote) { NoteEditor { name, text -> perform { FileService.createTextFile(name, text, dir) }; toast("Заметка сохранена") } }

    val filePicker = rememberFilePicker { uris ->
        if (uris.isEmpty()) return@rememberFilePicker
        var failed = 0
        for (u in uris) if (FileService.importFile(ctx, u, dir) == null) failed++
        if (failed > 0) Dialogs.alert("Ошибка", "Не удалось добавить файлов: $failed") else toast("Добавлено: ${uris.size}")
        reload()
    }
    val mediaPicker = rememberMediaPicker { uris ->
        if (uris.isEmpty()) return@rememberMediaPicker
        isImporting = true
        var failed = 0
        for (u in uris) {
            val name = FileService.displayName(ctx, u)
            val ext = name.substringAfterLast('.', "jpg")
            if (FileService.importFile(ctx, u, dir, "Фото ${Fmt.format(java.time.Instant.now(), "yyyy-MM-dd HH-mm-ss")}.$ext") == null) failed++
        }
        isImporting = false
        if (failed > 0) Dialogs.alert("Ошибка", "Не удалось добавить: $failed") else toast("Добавлено: ${uris.size}")
        reload()
    }
    val scanner = rememberDocScanner { pdf ->
        if (pdf == null) return@rememberDocScanner
        perform { FileService.savePDF(pdf.readBytes(), dir); pdf.delete() }
        toast("Скан сохранён в PDF")
    }
    fun newFolder() {
        Dialogs.prompt("Новая папка", null, "Название", "", "Создать") { name -> perform { FileService.createFolder(name, dir) } }
    }

    val visible = run {
        val q = query.trim()
        val base = items.filter { FileService.matches(it, filter) }
        FileService.sorted(if (q.isEmpty()) base else base.filter { it.name.contains(q, true) }, sortMode)
    }

    fun menuFor(item: FileItem): ru.student.safuhub.ui.kit.MenuScope.() -> Unit = {
        if (!item.isDirectory) {
            item("Открыть", "eye") { preview.value = item.file }
            item("Поделиться", "square.and.arrow.up") { Share.files(ctx, listOf(item.file)) }
        }
        item("Переименовать", "pencil") {
            Dialogs.prompt("Переименовать", null, "Новое имя", if (item.isDirectory) item.name else item.file.nameWithoutExtension, "Готово") { name ->
                perform { FileService.rename(item, name) }
            }
        }
        item("Переместить", "folder") { moving.value = item }
        item("Выбрать несколько", "checkmark.circle") { selecting = true; selected = setOf(item.id) }
        divider()
        item("Удалить", "trash", destructive = true) {
            Dialogs.actionSheet(if (item.isDirectory) "Удалить папку «${item.name}» со всем содержимым?" else "Удалить «${item.name}»?", null,
                AlertAction("Удалить", AlertAction.Role.DESTRUCTIVE) { perform { FileService.delete(item) }; toast("Удалено") },
                AlertAction("Отменить", AlertAction.Role.CANCEL))
        }
    }

    fun open(item: FileItem) {
        if (item.isDirectory) nav?.push { FolderScreen(item.file, item.name) } else preview.value = item.file
    }

    Box(Modifier.fillMaxSize()) {
        Screen(title, large = isRoot, background = { ru.student.safuhub.ui.design.AmbientBackground() },
            trailing = {
                if (!selecting) {
                    IosMenu(items = {
                        header("Вид")
                        item("Плитка", "square.grid.2x2", checked = grid) { grid = true }
                        item("Список", "list.bullet", checked = !grid) { grid = false }
                        divider()
                        header("Показать")
                        for (k in FileService.Kind.entries) item(k.title, k.icon, checked = filter == k) { filter = k }
                        divider()
                        header("Сортировка")
                        item("По имени", "textformat", checked = sortMode == 0) { sortMode = 0 }
                        item("Сначала новые", "clock", checked = sortMode == 1) { sortMode = 1 }
                        item("По размеру", "arrow.up.arrow.down", checked = sortMode == 2) { sortMode = 2 }
                        item("По типу", "doc.on.doc", checked = sortMode == 3) { sortMode = 3 }
                    }) { Box(Modifier.padding(8.dp)) { SfIcon(if (grid) "square.grid.2x2" else "list.bullet", size = 22.dp, tint = barTint()) } }
                    IosMenu(items = {
                        item("Сканировать документ", "doc.viewfinder") { scanner.open() }
                        item("Из файлов телефона", "doc.badge.plus") { filePicker.open() }
                        item("Фото и видео", "photo.on.rectangle") { mediaPicker.any() }
                        divider()
                        item("Текстовая заметка", "square.and.pencil") { showNote.value = true }
                        item("Новая папка", "folder.badge.plus") { newFolder() }
                    }) { Box(Modifier.padding(8.dp)) { SfIcon("plus.circle.fill", size = 24.dp, tint = barTint()) } }
                }
                BarButton(if (selecting) "Готово" else "Выбрать", bold = selecting, enabled = items.isNotEmpty() || selecting) {
                    Haptics.tap()
                    selecting = !selecting
                    selected = emptySet()
                }
            }) {
            Column(Modifier.padding(horizontal = 20.dp).padding(top = 8.dp).animateContentSize(), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                SearchField(query, { query = it }, "Поиск в «$title»")
                if (isRoot) {
                    Text("${FileService.byteCount(summary.bytes)} · файлов: ${summary.files}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionChip("Скан", "doc.viewfinder", Modifier.weight(1f)) { scanner.open() }
                    ActionChip("Файл", "doc.badge.plus", Modifier.weight(1f)) { filePicker.open() }
                    ActionChip("Фото", "photo", Modifier.weight(1f)) { mediaPicker.any() }
                    ActionChip("Папка", "folder.badge.plus", Modifier.weight(1f)) { newFolder() }
                }
                if (filter != FileService.Kind.ALL) {
                    TextButton({ filter = FileService.Kind.ALL }) {
                        IconLabel("Показаны: ${filter.title} — сбросить", "line.3.horizontal.decrease.circle.fill",
                            style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color)
                    }
                }
                when {
                    items.isEmpty() -> Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        EmptyState("tray", "Пока пусто", "Отсканируй документ, добавь файлы или фото. Можно создавать папки по предметам.")
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            QuickButton("Скан", "doc.viewfinder", Modifier.weight(1f)) { scanner.open() }
                            QuickButton("Файлы", "doc.badge.plus", Modifier.weight(1f)) { filePicker.open() }
                            QuickButton("Фото", "photo", Modifier.weight(1f)) { mediaPicker.any() }
                        }
                    }
                    visible.isEmpty() -> Text("Ничего не найдено", style = ft(Ts.subheadline), color = Ios.secondaryLabel, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 30.dp))
                    isSubjectsBase && filter == FileService.Kind.ALL -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        visible.forEachIndexed { i, item ->
                            Cell(item, selecting, item.id in selected, menuFor(item), Modifier.staggerIn(minOf(i, 12)),
                                onToggle = { selected = if (item.id in selected) selected - item.id else selected + item.id }, onOpen = { open(item) }) {
                                if (item.isDirectory) {
                                    Glass(18.dp, Modifier.fillMaxWidth(), lite = true) {
                                        Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Box(Modifier.weight(1f)) { SubjectRow(item.name, ScheduleStore.data) }
                                            if (!selecting) SfIcon("chevron.right", size = 13.dp, tint = Ios.secondaryLabel)
                                        }
                                    }
                                } else FileRow(item)
                            }
                        }
                    }
                    grid -> BoxWithConstraints {
                        val cols = maxOf(1, ((maxWidth + 12.dp) / (104.dp + 12.dp)).toInt())
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            visible.chunked(cols).forEachIndexed { r, row ->
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    row.forEachIndexed { c, item ->
                                        Cell(item, selecting, item.id in selected, menuFor(item), Modifier.weight(1f).staggerIn(minOf(r * cols + c, 12)),
                                            onToggle = { selected = if (item.id in selected) selected - item.id else selected + item.id }, onOpen = { open(item) }) {
                                            FileTile(item)
                                        }
                                    }
                                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                                }
                            }
                        }
                    }
                    else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        visible.forEachIndexed { i, item ->
                            Cell(item, selecting, item.id in selected, menuFor(item), Modifier.staggerIn(minOf(i, 12)),
                                onToggle = { selected = if (item.id in selected) selected - item.id else selected + item.id }, onOpen = { open(item) }) {
                                FileRow(item)
                            }
                        }
                    }
                }
                if (selecting) Spacer(Modifier.height(70.dp))
            }
        }
        if (isImporting) {
            Box(Modifier.align(Alignment.Center)) { Glass(20.dp) { Box(Modifier.padding(20.dp)) { ProgressLabel("Добавляю…") } } }
        }
        AnimatedVisibility(selecting, Modifier.align(Alignment.BottomCenter), enter = slideInVertically { it }, exit = slideOutVertically { it }) {
            SelectionBar(visible, selected, onToggleAll = { all ->
                Haptics.tap()
                selected = if (all) emptySet() else visible.map { it.id }.toSet()
            }, onDelete = {
                val chosen = items.filter { it.id in selected }
                val folders = chosen.count { it.isDirectory }
                val files = chosen.size - folders
                val parts = mutableListOf<String>()
                if (files > 0) parts.add("файлов: $files")
                if (folders > 0) parts.add("папок: $folders (со всем содержимым)")
                Dialogs.actionSheet("Удалить " + parts.joinToString(", ") + "?", null,
                    AlertAction("Удалить", AlertAction.Role.DESTRUCTIVE) {
                        var failed = 0
                        for (item in chosen) try { FileService.delete(item) } catch (_: Throwable) { failed++ }
                        val count = selected.size - failed
                        selected = emptySet()
                        items = FileService.list(dir)
                        if (items.isEmpty()) selecting = false
                        reload()
                        if (failed > 0) Dialogs.alert("Ошибка", "Не удалось удалить: $failed") else toast("Удалено: $count")
                    },
                    AlertAction("Отменить", AlertAction.Role.CANCEL))
            })
        }
    }
}

@Composable
private fun SelectionBar(all: List<FileItem>, selected: Set<String>, onToggleAll: (Boolean) -> Unit, onDelete: () -> Unit) {
    val allOn = all.isNotEmpty() && all.all { it.id in selected }
    Glass(26.dp, Modifier.navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 6.dp).fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton({ onToggleAll(allOn) }) {
                Text(if (allOn) "Снять всё" else "Выбрать всё", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
            }
            Spacer(Modifier.weight(1f))
            Text(if (selected.isEmpty()) "Ничего не выбрано" else "Выбрано: ${selected.size}", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
            Spacer(Modifier.weight(1f))
            Pressable(onDelete, enabled = selected.isNotEmpty()) {
                Row(Modifier.clip(CircleShape).background(if (selected.isEmpty()) Ios.gray.copy(alpha = 0.5f) else Ios.red)
                    .padding(horizontal = 14.dp, vertical = 9.dp)) {
                    IconLabel("Удалить", "trash.fill", style = ft(Ts.subheadline, FontWeight.Bold), color = Color.White, spacing = 5.dp)
                }
            }
        }
    }
}

@Composable
private fun Cell(item: FileItem, selecting: Boolean, on: Boolean, menu: ru.student.safuhub.ui.kit.MenuScope.() -> Unit, modifier: Modifier,
                 onToggle: () -> Unit, onOpen: () -> Unit, label: @Composable () -> Unit) {
    if (selecting) {
        Pressable({ Haptics.tap(); onToggle() }, modifier.graphicsLayer { val s = if (on) 0.97f else 1f; scaleX = s; scaleY = s }) {
            Box(Modifier.strokeBorder(if (on) Brand.color else Color.Transparent, 2.5.dp, RoundedCornerShape(18.dp))) {
                label()
                Box(Modifier.align(Alignment.TopEnd).padding(6.dp).size(24.dp).clip(CircleShape)
                    .background(if (on) Brand.color else Ios.background.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
                    if (on) SfIcon("checkmark", size = 14.dp, tint = Color.White)
                    else Box(Modifier.size(22.dp).strokeBorder(Ios.secondaryLabel, 1.5.dp, CircleShape))
                }
            }
        }
    } else {
        ContextMenuBox(items = menu, modifier = modifier, onClick = { Haptics.tap(); onOpen() }) { label() }
    }
}

@Composable
private fun ActionChip(title: String, icon: String, modifier: Modifier, onClick: () -> Unit) {
    Pressable({ Haptics.tap(); onClick() }, modifier) {
        Row(Modifier.fillMaxWidth().clip(CircleShape).background(Ios.label.copy(alpha = 0.06f)).padding(vertical = 9.dp),
            horizontalArrangement = Arrangement.Center) {
            IconLabel(title, icon, style = ft(Ts.caption, FontWeight.SemiBold), spacing = 5.dp)
        }
    }
}

@Composable
private fun QuickButton(title: String, icon: String, modifier: Modifier, onClick: () -> Unit) {
    Pressable(onClick, modifier) {
        Glass(18.dp, Modifier.fillMaxWidth(), interactive = true) {
            Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SfGradientIcon(icon, size = 22.dp)
                Text(title, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label)
            }
        }
    }
}

// MARK: - Плитка и строка

@Composable
fun FileTile(item: FileItem) {
    Glass(18.dp, Modifier.fillMaxWidth(), lite = true) {
        Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FileThumb(item, null, Modifier.fillMaxWidth().aspectRatio(1f))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(item.name + "\n", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label, maxLines = 2, minLines = 2,
                    overflow = TextOverflow.Ellipsis)
                Text(if (item.isDirectory) "${item.childCount} шт." else FileService.byteCount(item.size), style = ft(Ts.caption2),
                    color = Ios.secondaryLabel, maxLines = 1)
            }
        }
    }
}

@Composable
fun FileRow(item: FileItem) {
    val date = Fmt.format(item.modified, "d MMM yyyy 'г.'")
    Glass(18.dp, Modifier.fillMaxWidth(), lite = true) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FileThumb(item, 46.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(item.name, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(if (item.isDirectory) "${item.childCount} шт. · $date" else "${FileService.byteCount(item.size)} · $date",
                    style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
            if (item.isDirectory) SfIcon("chevron.right", size = 13.dp, tint = Ios.secondaryLabel)
        }
    }
}

@Composable
fun FileThumb(item: FileItem, size: Dp?, modifier: Modifier = Modifier) {
    val m = (if (size != null) modifier.size(size) else modifier).clip(RoundedCornerShape(12.dp))
    val side = ((size ?: 120.dp).value * 3).toInt()
    val img = if (item.isDirectory) null else rememberThumb(item.file, side)
    Box(m, contentAlignment = Alignment.Center) {
        when {
            img != null -> Image(img, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            item.isDirectory -> FolderIcon(item.name, Modifier.fillMaxSize().padding(((size ?: 90.dp).value * 0.04f).dp))
            else -> {
                val tint = FileTint.color(item)
                Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(tint.copy(alpha = 0.22f), tint.copy(alpha = 0.10f)))))
                BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    val s = if (size != null) size * 0.4f else maxWidth * 0.4f
                    SfIcon(FileService.icon(item), size = s, tint = Color.White,
                        modifier = Modifier.iosShadow(tint.copy(alpha = 0.35f), 4.dp, y = 2.dp).gradientTint(Brush.verticalGradient(listOf(tint, tint.copy(alpha = 0.75f)))))
                }
            }
        }
    }
}

// MARK: - Заметка

@Composable
fun NoteEditor(onSave: (String, String) -> Unit) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        var name by remember { mutableStateOf("") }
        var text by remember { mutableStateOf("") }
        FormScreen("Заметка", leading = { BarButton("Отмена") { dismiss() } },
            trailing = { BarButton("Сохранить", bold = true, enabled = text.isNotBlank()) { onSave(name, text); dismiss() } }) {
            FormSection {
                row { IosTextField(name, { name = it }, "Название", Modifier.weight(1f), style = ft(Ts.headline, FontWeight.SemiBold)) }
                row(minHeight = 260.dp) { IosTextField(text, { text = it }, "", Modifier.weight(1f), singleLine = false, minLines = 10) }
            }
        }
    }
}

@Composable
fun MoveSheet(item: FileItem, onPick: (File) -> Unit) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        val folders = remember { FileService.allFolders(if (item.isDirectory) item.file else null) }
        FormScreen("Куда переместить «${item.name}»", leading = { BarButton("Отмена") { dismiss() } }) {
            FormSection {
                for (folder in folders) {
                    val isCurrent = FileService.path(folder.file) == FileService.path(item.file.parentFile ?: folder.file)
                    row(onClick = if (isCurrent) null else ({ onPick(folder.file); dismiss() })) {
                        Spacer(Modifier.width((folder.depth * 18).dp))
                        SfIcon(if (folder.depth == 0) "house.fill" else "folder.fill", size = 18.dp, tint = Brand.color)
                        Spacer(Modifier.width(10.dp))
                        Text(if (folder.depth == 0) "Мои файлы" else folder.file.name, style = ft(Ts.body),
                            color = if (isCurrent) Ios.secondaryLabel else Ios.label, modifier = Modifier.weight(1f))
                        if (isCurrent) Text("сейчас здесь", style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                }
            }
        }
    }
}

// MARK: - Цвета файлов по типу

object FileTint {
    fun color(item: FileItem): Color {
        val e = item.file.extension.lowercase()
        return when {
            e == "pdf" -> rgb(0.93, 0.26, 0.24)
            FileService.isImage(item.file) -> rgb(0.20, 0.72, 0.40)
            FileService.isMovie(item.file) -> rgb(0.98, 0.55, 0.12)
            FileService.isAudio(item.file) -> rgb(0.93, 0.30, 0.62)
            e in listOf("ppt", "pptx", "key", "odp", "pps", "ppsx") -> rgb(0.95, 0.45, 0.20)
            e in listOf("xls", "xlsx", "numbers", "ods", "csv", "tsv") -> rgb(0.13, 0.62, 0.35)
            e in listOf("zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz") -> rgb(0.55, 0.45, 0.35)
            e in listOf("swift", "kt", "java", "c", "cpp", "h", "py", "js", "ts", "html", "css", "json", "xml", "sh", "go", "rs", "php", "rb", "sql") -> rgb(0.45, 0.40, 0.95)
            e in listOf("txt", "md", "log", "tex") -> rgb(0.25, 0.52, 1.0)
            e in listOf("doc", "docx", "odt", "rtf", "pages") -> rgb(0.20, 0.45, 0.95)
            else -> rgb(0.45, 0.50, 0.60)
        }
    }
}

// MARK: - Объёмная папка

private val folderPalette = listOf(
    rgb(0.45, 0.72, 1.00) to rgb(0.18, 0.45, 0.96),
    rgb(0.42, 0.88, 0.72) to rgb(0.10, 0.62, 0.52),
    rgb(1.00, 0.74, 0.36) to rgb(0.96, 0.48, 0.14),
    rgb(0.72, 0.58, 1.00) to rgb(0.46, 0.30, 0.92),
    rgb(1.00, 0.56, 0.70) to rgb(0.90, 0.26, 0.46),
    rgb(0.40, 0.84, 0.95) to rgb(0.08, 0.58, 0.78),
)

/** Папка «как настоящая»: задняя стенка с ушком, выглядывающие листы, передняя крышка с бликом */
@Composable
fun FolderIcon(name: String, modifier: Modifier = Modifier) {
    val sum = name.codePoints().toArray().sum()
    val (light, dark) = folderPalette[kotlin.math.abs(sum) % folderPalette.size]
    Canvas(modifier.aspectRatio(1f)) {
        val s = minOf(size.width, size.height)
        // задняя стенка с ушком
        val bw = s * 0.86f; val bh = s * 0.64f
        val bx = s * 0.5f - bw / 2; val by = s * 0.48f - bh / 2
        val tabH = bh * 0.16f
        val rad = bw * 0.09f
        val back = Brush.verticalGradient(listOf(dark.copy(alpha = 0.95f), dark), by, by + bh)
        drawRoundRect(back, Offset(bx, by + tabH), Size(bw, bh - tabH), CornerRadius(rad))
        drawRoundRect(back, Offset(bx, by), Size(bw * 0.42f, tabH * 2.2f), CornerRadius(rad * 0.7f))
        // листы внутри
        rotate(-5f, Offset(s * 0.48f, s * 0.46f)) {
            drawRoundRect(Color(0xFFE6E6E6), Offset(s * 0.48f - s * 0.31f, s * 0.46f - s * 0.21f), Size(s * 0.62f, s * 0.42f), CornerRadius(s * 0.04f))
        }
        rotate(4f, Offset(s * 0.53f, s * 0.44f)) {
            val px = s * 0.53f - s * 0.32f; val py = s * 0.44f - s * 0.21f
            drawRoundRect(Color.Black.copy(alpha = 0.10f), Offset(px, py + s * 0.01f), Size(s * 0.64f, s * 0.42f), CornerRadius(s * 0.04f))
            drawRoundRect(Color.White, Offset(px, py), Size(s * 0.64f, s * 0.42f), CornerRadius(s * 0.04f))
            for (i in 0 until 3) {
                val w = s * (if (i == 2) 0.30f else 0.44f)
                drawRoundRect(Color.Black.copy(alpha = 0.10f), Offset(px + (s * 0.64f - w) / 2, py + s * 0.06f + i * (s * 0.022f + s * 0.035f)),
                    Size(w, s * 0.022f), CornerRadius(s * 0.011f))
            }
        }
        // передняя крышка
        val fw = s * 0.86f; val fh = s * 0.46f
        val fx = s * 0.5f - fw / 2; val fy = s * 0.59f - fh / 2
        drawRoundRect(dark.copy(alpha = 0.35f), Offset(fx, fy + s * 0.03f), Size(fw, fh), CornerRadius(s * 0.09f))
        drawRoundRect(Brush.verticalGradient(listOf(light, dark), fy, fy + fh), Offset(fx, fy), Size(fw, fh), CornerRadius(s * 0.09f))
        val lw = maxOf(1f, s * 0.012f)
        drawRoundRect(Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.55f), Color.White.copy(alpha = 0.05f)), fy, fy + fh),
            Offset(fx + lw / 2, fy + lw / 2), Size(fw - lw, fh - lw), CornerRadius(s * 0.09f), style = Stroke(lw))
        translate(fx + (fw - s * 0.5f) / 2, fy + s * 0.05f) {
            drawRoundRect(Color.White.copy(alpha = 0.35f), Offset.Zero, Size(s * 0.5f, s * 0.018f), CornerRadius(s * 0.009f))
        }
    }
}
