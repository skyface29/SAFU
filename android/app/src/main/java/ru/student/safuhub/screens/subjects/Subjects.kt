package ru.student.safuhub.screens.subjects

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.FileItem
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.StudyTask
import ru.student.safuhub.data.SubjectFolders
import ru.student.safuhub.data.SubjectIcon
import ru.student.safuhub.data.SubjectNotes
import ru.student.safuhub.data.SubjectTeachers
import ru.student.safuhub.data.TaskStore
import ru.student.safuhub.feature.board.BoardBatch
import ru.student.safuhub.feature.board.BoardBatchRow
import ru.student.safuhub.feature.board.BoardBatchScreen
import ru.student.safuhub.feature.board.BoardBatchesListScreen
import ru.student.safuhub.feature.board.BoardPhoto
import ru.student.safuhub.feature.board.LessonPhotos
import ru.student.safuhub.feature.files.FilePreviewSheet
import ru.student.safuhub.feature.pins.SubjectPinsStrip
import ru.student.safuhub.screens.files.FileThumb
import ru.student.safuhub.screens.files.FolderScreen
import ru.student.safuhub.screens.tasks.TaskEditorSheet
import ru.student.safuhub.system.rememberCamera
import ru.student.safuhub.system.rememberDocScanner
import ru.student.safuhub.system.rememberFilePicker
import ru.student.safuhub.system.rememberMediaPicker
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindBadge
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.design.SectionTitle
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SearchField
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.time.Instant

private fun dayTime(d: Instant) = Fmt.format(d, "EE, d MMM · H:mm")

/** Красивая строка предмета: значок, название, преподаватель, файлы, ближайшая пара */
@Composable
fun SubjectRow(subject: String, data: ScheduleData) {
    val color = SubjectColor.color(subject)
    val teacher = SubjectTeachers.text(subject, data)
    val files = SubjectFolders.fileCount(subject)
    val next = remember(data, subject) { ScheduleQuery.slots(data, days = 14).firstOrNull { it.lesson.subject == subject && it.end > Instant.now() } }
    Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Brush.verticalGradient(listOf(color, color.copy(alpha = 0.78f)))),
            contentAlignment = Alignment.Center) {
            SfIcon(SubjectIcon.name(subject), size = 20.dp, tint = Color.White)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(subject, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (teacher.isNotEmpty()) IconLabel(teacher, "person.fill", style = ft(Ts.caption, FontWeight.Medium), color = Ios.secondaryLabel,
                spacing = 4.dp, maxLines = 1)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (next != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.size(6.dp).clip(CircleShape).background(KindStyle.of(next.lesson.kind).color))
                        Text(dayTime(next.start), style = ft(Ts.caption2), color = Ios.secondaryLabel)
                    }
                }
                IconLabel("$files", "doc.fill", style = ft(Ts.caption2), color = if (files > 0) Brand.color else Ios.secondaryLabel, spacing = 3.dp)
            }
        }
    }
}

// MARK: - Предметы

@Composable
fun SubjectsScreen() {
    val nav = LocalNav.current
    var query by remember { mutableStateOf("") }
    val all = ScheduleQuery.subjects(ScheduleStore.data)
    val list = if (query.isBlank()) all else all.filter { it.contains(query.trim(), true) }
    Screen("Предметы", large = true) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 10.dp)) { SearchField(query, { query = it }, "Поиск предмета") }
        FormSection {
            if (list.isEmpty()) text("Предметы появятся, когда подключишь расписание во вкладке «Пары».", color = null)
            for (s in list) {
                row(onClick = { Haptics.tap(); nav?.push { SubjectDetailScreen(s) } }) {
                    Box(Modifier.weight(1f)) { SubjectRow(s, ScheduleStore.data) }
                    SfIcon("chevron.right", size = 16.dp, tint = Ios.tertiaryLabel)
                }
            }
        }
    }
}

@Composable
fun SubjectDetailScreen(subject: String) {
    val ctx = LocalContext.current
    val nav = LocalNav.current
    val data = ScheduleStore.data
    val color = SubjectColor.color(subject)
    val folder = SubjectFolders.url(subject)
    var note by remember { mutableStateOf(SubjectNotes.get(subject)) }
    var tick by remember { mutableIntStateOf(0) }
    var files by remember { mutableStateOf<List<FileItem>>(emptyList()) }
    var boardBatches by remember { mutableStateOf<List<BoardBatch>>(emptyList()) }
    val preview = remember { mutableStateOf<File?>(null) }
    val taskDraft = remember { mutableStateOf<StudyTask?>(null) }
    SheetItem(preview) { FilePreviewSheet(it) }
    SheetItem(taskDraft) { t -> TaskEditorSheet(t, isNew = true, onSave = { TaskStore.upsert(it) }, onDelete = {}) }

    LaunchedEffect(tick) {
        folder.mkdirs()
        files = FileService.sorted(FileService.list(folder), 1)
        boardBatches = LessonPhotos.batches(subject, ScheduleStore.data)
    }
    val upcoming = remember(data.lastSync, data) {
        ScheduleQuery.slots(data, days = 30).filter { it.lesson.subject == subject && it.end > Instant.now() }
    }
    val teachers = remember(data.lastSync, data) {
        ScheduleQuery.slots(data, from = -30, days = 60).filter { it.lesson.subject == subject }.map { it.lesson.teacher }
            .filter { it.isNotEmpty() }.toSet().sorted()
    }
    val allTeachers = data.ruzEvents.filter { it.subject.lowercase(RU) == subject.lowercase(RU) }.map { it.teacher }.filter { it.isNotEmpty() }.toSet().sorted()
    fun surname(full: String) = full.split(" ").firstOrNull() ?: full
    val currentPref = data.teacherPrefs[subject] ?: data.teacherPref(subject) ?: ""
    fun setPref(v: String) {
        val d = ScheduleStore.data
        val prefs = d.teacherPrefs.filterKeys { k -> !(k.lowercase(RU) == subject.lowercase(RU) || subject.lowercase(RU).startsWith(k.lowercase(RU))) } + (subject to v)
        ScheduleStore.data = d.copy(teacherPrefs = prefs)
        Haptics.tap()
    }
    val otherFiles = files.filter { it.isDirectory || !LessonPhotos.isBoardPhoto(it.file) }
    val subjectTasks = TaskStore.tasks.filter { it.subject.equals(subject, true) }.sortedBy { it.due }
    fun flash(text: String) { Haptics.success(); Dialogs.showToast(text, "checkmark.circle.fill") }

    val filePicker = rememberFilePicker { uris ->
        if (uris.isEmpty()) return@rememberFilePicker
        val ok = uris.count { FileService.importFile(ctx, it, folder) != null }
        tick++
        flash("Добавлено: $ok")
    }
    val mediaPicker = rememberMediaPicker { uris ->
        if (uris.isEmpty()) return@rememberMediaPicker
        val ok = uris.count { u ->
            val ext = FileService.displayName(ctx, u).substringAfterLast('.', "jpg")
            FileService.importFile(ctx, u, folder, "Фото ${Fmt.format(Instant.now(), "yyyy-MM-dd HH-mm-ss")}.$ext") != null
        }
        tick++
        flash("Добавлено: $ok")
    }
    val camera = rememberCamera { f ->
        if (f != null && BoardPhoto.save(f, subject) != null) { tick++; flash("Фото доски сохранено") }
        f?.delete()
    }
    val scanner = rememberDocScanner { pdf ->
        if (pdf != null) { FileService.savePDF(pdf.readBytes(), folder); pdf.delete(); tick++; flash("Скан сохранён") }
    }

    Screen("Предмет") {
        Column(Modifier.padding(top = 4.dp)) {
            FormSection {
                raw {
                    Column(Modifier.fillMaxWidth().background(color.copy(alpha = 0.15f)).padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(subject, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                        if (teachers.isNotEmpty()) IconLabel(teachers.joinToString(", "), "person.fill", style = ft(Ts.subheadline), color = Ios.secondaryLabel, spacing = 5.dp)
                        upcoming.firstOrNull()?.let { n ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                KindBadge(n.lesson.kind, 9f)
                                Text(dayTime(n.start) + if (n.lesson.room.isEmpty()) "" else " · ауд. ${n.lesson.room}", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label)
                            }
                        }
                    }
                }
            }
            // ПОД РУКОЙ — главные ссылки и файлы предмета в одно касание
            FormSection("Под рукой", footer = "Курс в Sakai, методичка, таблица, чат группы — закрепи, и они будут здесь и в карточке «Сейчас» на главной. Удержи закреп, чтобы убрать или переставить.") {
                raw { Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) { SubjectPinsStrip(subject, editable = true, showFolder = true) } }
            }
            FormSection("Подгруппа", footer = "Если у предмета несколько подгрупп с разными преподавателями, в расписании останутся только пары твоего.") {
                val options = mutableListOf("" to "Все (без фильтра)")
                for (t in allTeachers) options.add(surname(t) to t)
                if (currentPref.isNotEmpty() && allTeachers.none { surname(it) == currentPref }) options.add(currentPref to currentPref)
                picker("Мой преподаватель", options.distinctBy { it.first }, currentPref, { setPref(it) })
            }
            // ФОТО ДОСКИ — по парам, по порядку, с отправкой одним PDF
            FormSection("Фото доски", footer = if (boardBatches.isEmpty())
                "Снимай доску на паре — фото разложатся по парам в порядке съёмки, а после пары их можно одним PDF отправить группе."
            else "Внутри пары фото идут по времени съёмки. Открой пару, чтобы отправить PDF или фото по порядку.") {
                raw {
                    Pressable({ Haptics.tap(); camera.open() }, Modifier.padding(horizontal = 12.dp, vertical = 8.dp).fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.gradient).padding(vertical = 11.dp),
                            horizontalArrangement = Arrangement.Center) {
                            IconLabel("Сфоткать доску", "camera.fill", style = ft(Ts.subheadline, FontWeight.Bold), color = Color.White)
                        }
                    }
                }
                for (b in boardBatches.take(3)) {
                    row(onClick = { nav?.push { BoardBatchScreen(b) } }) {
                        Box(Modifier.weight(1f)) { BoardBatchRow(b) }
                        SfIcon("chevron.right", size = 16.dp, tint = Ios.tertiaryLabel)
                    }
                }
                if (boardBatches.size > 3) {
                    link("Все пары с фото (${boardBatches.size})", "photo.stack") { nav?.push { BoardBatchesListScreen(subject) } }
                }
            }
            // ФАЙЛЫ — главное на этом экране
            FormSection("Файлы предмета", footer = "Лежат в «Файлы › Предметы › $subject». Внутри можно создавать свои папки.") {
                raw {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Chip("Файл", "doc.badge.plus", Modifier.weight(1f)) { filePicker.open() }
                        Chip("Фото", "photo", Modifier.weight(1f)) { mediaPicker.any() }
                        Chip("Скан", "doc.viewfinder", Modifier.weight(1f)) { scanner.open() }
                    }
                }
                if (otherFiles.isEmpty()) {
                    text("Пока пусто. Добавь методички, лабы, сканы.", color = null, size = Ts.subheadline)
                } else {
                    raw {
                        BoxWithConstraints(Modifier.padding(12.dp)) {
                            val cols = maxOf(1, ((maxWidth + 10.dp) / (88.dp + 10.dp)).toInt())
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                for (row in otherFiles.take(9).chunked(cols)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        for (f in row) {
                                            Pressable({ if (f.isDirectory) nav?.push { FolderScreen(f.file, f.name) } else preview.value = f.file }, Modifier.weight(1f)) {
                                                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                    FileThumb(f, null, Modifier.fillMaxWidth().aspectRatio(1f))
                                                    Text(f.name, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                }
                                            }
                                        }
                                        repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                                    }
                                }
                            }
                        }
                    }
                }
                link("Открыть папку предмета (${SubjectFolders.fileCount(subject)})", "folder.fill") { nav?.push { FolderScreen(folder, subject) } }
            }
            FormSection("Ближайшие пары") {
                if (upcoming.isEmpty()) text("Нет в ближайший месяц", color = null)
                for (s in upcoming.take(5)) {
                    row {
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                KindBadge(s.lesson.kind, 9f)
                                Text(dayTime(s.start), style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                            }
                            Text(listOf(if (s.lesson.room.isEmpty()) "" else "ауд. ${s.lesson.room}", AddressFormat.full(s.address)).filter { it.isNotEmpty() }
                                .joinToString(" · "), style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                    }
                }
            }
            FormSection("Задачи") {
                for (t in subjectTasks) {
                    row(onClick = { TaskStore.toggle(t) }) {
                        SfIcon(if (t.done) "checkmark.circle.fill" else "circle", size = 22.dp, tint = if (t.done) Ios.green else Ios.secondaryLabel)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(t.title, style = ft(Ts.body).let { if (t.done) it.copy(textDecoration = TextDecoration.LineThrough) else it }, color = Ios.label)
                            Text(Fmt.due(t.due), style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                    }
                }
                button("Добавить задачу", "plus") { taskDraft.value = StudyTask.blank().copy(subject = subject) }
            }
            FormSection("Заметки") {
                row(minHeight = 140.dp) {
                    IosTextField(note, { note = it; SubjectNotes.set(it, subject) }, "", Modifier.weight(1f), singleLine = false, minLines = 6)
                }
            }
        }
    }
}

@Composable
private fun Chip(title: String, icon: String, modifier: Modifier, onClick: () -> Unit) {
    Pressable({ Haptics.tap(); onClick() }, modifier) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Ios.label.copy(alpha = 0.06f)).padding(vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SfGradientIcon(icon, size = 19.dp)
            Text(title, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.label)
        }
    }
}

// MARK: - Лента предметов на главной

private fun stripSubjects(data: ScheduleData): List<String> {
    // сначала те, у кого пара ближе
    val upcoming = ScheduleQuery.slots(data, days = 14).filter { it.end > Instant.now() }
    val order = mutableListOf<String>()
    for (s in upcoming) if (s.lesson.subject !in order) order.add(s.lesson.subject)
    for (s in ScheduleQuery.subjects(data)) if (s !in order) order.add(s)
    return order
}

@Composable
fun SubjectsStripVisible(): Boolean = ScheduleQuery.subjects(ScheduleStore.data).isNotEmpty()

@Composable
fun SubjectsStrip(onOpen: (String) -> Unit) {
    val data = ScheduleStore.data
    val subjects = remember(data) { stripSubjects(data) }
    if (subjects.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("Предметы")
            Spacer(Modifier.weight(1f))
            Text("${subjects.size}", style = ft(Ts.caption, FontWeight.Bold), color = Ios.secondaryLabel)
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            for (name in subjects) {
                Pressable({ Haptics.tap(); onOpen(name) }) {
                    val teacher = SubjectTeachers.text(name, data)
                    val files = SubjectFolders.fileCount(name)
                    val c = SubjectColor.color(name)
                    Glass(16.dp, interactive = true) {
                        Row(Modifier.width(244.dp).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Brush.verticalGradient(listOf(c, c.copy(alpha = 0.78f)))),
                                contentAlignment = Alignment.Center) { SfIcon(SubjectIcon.name(name), size = 17.dp, tint = Color.White) }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(name, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(teacher.ifEmpty { "файлов: $files" }, style = ft(Ts.caption2), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            if (files > 0) Text("$files", style = ft(Ts.caption2, FontWeight.Bold), color = Brand.color)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SubjectSheet(name: String) {
    DoneSheet { SubjectDetailScreen(name) }
}
