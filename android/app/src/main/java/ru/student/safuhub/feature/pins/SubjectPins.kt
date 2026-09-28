package ru.student.safuhub.feature.pins

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.NaturalOrder
import ru.student.safuhub.data.SubjectFolders
import ru.student.safuhub.data.hostOf
import ru.student.safuhub.feature.board.LessonPhotos
import ru.student.safuhub.feature.files.FilePreviewSheet
import ru.student.safuhub.feature.web.CustomTabs
import ru.student.safuhub.system.rememberFilePicker
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.BarIcon
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File

// MARK: - «Под рукой»: главные ссылки и файлы каждого предмета

@Serializable
data class SubjectPin(val id: String = newId(), val title: String = "", val value: String = "", val isFile: Boolean = false)

object SubjectPinStore {
    private const val key = "subject.pins.v1"

    val all: Map<String, List<SubjectPin>> get() = Defaults.decode<Map<String, List<SubjectPin>>>(key) ?: emptyMap()

    private fun k(subject: String) = subject.lowercase(RU)

    fun pins(subject: String): List<SubjectPin> = all[k(subject)] ?: emptyList()

    private fun save(m: Map<String, List<SubjectPin>>) = Defaults.encode(key, m)

    fun add(pin: SubjectPin, subject: String) {
        val m = all.toMutableMap()
        m[k(subject)] = (m[k(subject)] ?: emptyList()) + pin
        save(m)
    }

    fun remove(pin: SubjectPin, subject: String) {
        val m = all.toMutableMap()
        m[k(subject)] = (m[k(subject)] ?: emptyList()).filter { it.id != pin.id }
        save(m)
    }

    fun move(pin: SubjectPin, subject: String, by: Int) {
        val list = (all[k(subject)] ?: return).toMutableList()
        val i = list.indexOfFirst { it.id == pin.id }
        if (i < 0) return
        val j = (i + by).coerceIn(0, list.size - 1)
        if (i == j) return
        val x = list[i]; list[i] = list[j]; list[j] = x
        save(all.toMutableMap().also { it[k(subject)] = list })
    }

    /** Файл закрепа (null — файл удалили) */
    fun file(pin: SubjectPin, subject: String): File? = File(SubjectFolders.url(subject), pin.value).takeIf { it.exists() }
}

private sealed class PinSheet {
    data class FilePreview(val file: File) : PinSheet()
    data object PickFromFolder : PinSheet()
    data object BrowseFolder : PinSheet()
}

fun pinIcon(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
    "pdf" -> "doc.richtext.fill"
    "doc", "docx", "rtf", "txt", "odt" -> "doc.text.fill"
    "xls", "xlsx", "csv", "ods" -> "tablecells.fill"
    "ppt", "pptx", "key", "odp" -> "rectangle.on.rectangle.angled"
    "jpg", "jpeg", "png", "heic" -> "photo.fill"
    else -> "doc.fill"
}

/** Файлы в папке предмета (без вложенных папок и без фото доски) */
fun subjectFolderFiles(subject: String): List<File> =
    (SubjectFolders.url(subject).listFiles() ?: emptyArray()).filter { it.isFile && !it.name.startsWith(".") && !LessonPhotos.isBoardPhoto(it) }
        .sortedWith { a, b -> NaturalOrder.compare(a.name, b.name) }

/** Полоса закрепов предмета. editable — с кнопкой «+» и меню у каждого закрепа */
@Composable
fun SubjectPinsStrip(subject: String, editable: Boolean = false, showFolder: Boolean = false) {
    val ctx = LocalContext.current
    val pins = SubjectPinStore.pins(subject)
    var folderCount by remember { mutableIntStateOf(0) }
    var tick by remember { mutableIntStateOf(0) }
    val sheet = remember { mutableStateOf<PinSheet?>(null) }
    LaunchedEffect(subject, tick) { if (showFolder) folderCount = subjectFolderFiles(subject).size }

    fun importAndPin(files: List<android.net.Uri>) {
        val dir = SubjectFolders.url(subject).apply { mkdirs() }
        for (u in files) {
            val dest = FileService.importFile(ctx, u, dir) ?: continue
            SubjectPinStore.add(SubjectPin(title = dest.nameWithoutExtension, value = dest.name, isFile = true), subject)
            Haptics.success()
        }
        tick++
    }
    val picker = rememberFilePicker { importAndPin(it) }

    SheetItem(sheet) { s ->
        when (s) {
            is PinSheet.FilePreview -> FilePreviewSheet(s.file)
            PinSheet.PickFromFolder -> FolderPicker(subject) { sheet.value = null }
            PinSheet.BrowseFolder -> FolderBrowser(subject, onOpen = { f -> sheet.value = PinSheet.FilePreview(f) },
                onImport = { picker.open() }, onChanged = { tick++ })
        }
    }

    fun open(p: SubjectPin) {
        if (p.isFile) {
            val f = SubjectPinStore.file(p, subject)
            if (f != null) sheet.value = PinSheet.FilePreview(f)
            else Dialogs.alert("Файл не найден", "Похоже, файл удалили из папки предмета. Убери закреп и закрепи заново.")
        } else if (p.value.startsWith("http")) {
            CustomTabs.open(ctx, p.value)
        }
    }

    fun addLink() {
        Dialogs.prompt("Ссылка под рукой", "Название (курс в Sakai, методичка…)", "Название", "", "Далее") { title ->
            Dialogs.prompt("Ссылка под рукой", "Адрес", "https://…", "https://", "Добавить", keyboard = KeyboardType.Uri) { url ->
                var raw = url.trim()
                if (!raw.lowercase().startsWith("http")) raw = "https://$raw"
                val host = hostOf(raw) ?: return@prompt
                SubjectPinStore.add(SubjectPin(title = title.trim().ifEmpty { host }, value = raw, isFile = false), subject)
                Haptics.success()
            }
        }
    }

    if (pins.isEmpty() && !editable && !showFolder) return
    val color = SubjectColor.color(subject)
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (showFolder && folderCount > 0) {
            Pressable({ Haptics.tap(); sheet.value = PinSheet.BrowseFolder }) {
                Row(Modifier.clip(CircleShape).background(color.copy(alpha = 0.85f)).padding(horizontal = 12.dp, vertical = 8.dp)) {
                    IconLabel("Файлы · $folderCount", "folder.fill", style = ft(Ts.caption, FontWeight.Bold), color = Color.White, spacing = 5.dp)
                }
            }
        }
        for (p in pins) {
            ContextMenuBox(items = {
                item("Левее", "arrow.left") { SubjectPinStore.move(p, subject, -1) }
                item("Правее", "arrow.right") { SubjectPinStore.move(p, subject, 1) }
                item("Убрать", "pin.slash", destructive = true) { SubjectPinStore.remove(p, subject) }
            }, onClick = { Haptics.tap(); open(p) }) {
                Row(Modifier.clip(CircleShape).background(color.copy(alpha = 0.16f)).padding(horizontal = 12.dp, vertical = 8.dp)) {
                    IconLabel(p.title, if (p.isFile) pinIcon(p.value) else "link", style = ft(Ts.caption, FontWeight.SemiBold), spacing = 5.dp, maxLines = 1)
                }
            }
        }
        if (editable) {
            IosMenu(items = {
                item("Ссылка", "link") { addLink() }
                item("Файл из папки предмета", "folder") { sheet.value = PinSheet.PickFromFolder }
                item("Файл с телефона", "doc.badge.plus") { picker.open() }
            }) {
                Row(Modifier.clip(CircleShape).background(Ios.label.copy(alpha = 0.07f)).padding(horizontal = 12.dp, vertical = 8.dp)) {
                    IconLabel(if (pins.isEmpty()) "Закрепить учебник, ссылку…" else "Добавить", "plus", style = ft(Ts.caption, FontWeight.SemiBold), spacing = 5.dp)
                }
            }
        }
    }
}

@Composable
private fun FolderPicker(subject: String, close: () -> Unit) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        val files = remember { subjectFolderFiles(subject) }
        FormScreen("Закрепить файл", leading = { BarButton("Отмена") { dismiss() } }) {
            FormSection {
                if (files.isEmpty()) text("В папке предмета пока нет файлов. Добавь файл с телефона.", color = null)
                for (f in files) {
                    row(onClick = {
                        SubjectPinStore.add(SubjectPin(title = f.nameWithoutExtension, value = f.name, isFile = true), subject)
                        Haptics.success()
                        close()
                    }) { IconLabel(f.name, pinIcon(f.name), spacing = 12.dp) }
                }
            }
        }
    }
}

/** Все файлы предмета: нажал — открылся; закрепить — в меню по удержанию */
@Composable
private fun FolderBrowser(subject: String, onOpen: (File) -> Unit, onImport: () -> Unit, onChanged: () -> Unit) {
    val ctx = LocalContext.current
    DoneSheet {
        var tick by remember { mutableIntStateOf(0) }
        val files = remember(tick) { subjectFolderFiles(subject) }
        val pins = SubjectPinStore.pins(subject)
        FormScreen(subject, trailing = { BarIcon("plus") { onImport() } }) {
            FormSection {
                if (files.isEmpty()) text("Файлов нет. Добавь кнопкой «+».", color = null)
                for (f in files) {
                    raw {
                        ContextMenuBox(items = {
                            item("Закрепить", "pin.fill") {
                                SubjectPinStore.add(SubjectPin(title = f.nameWithoutExtension, value = f.name, isFile = true), subject)
                                Haptics.success()
                            }
                            item("Поделиться", "square.and.arrow.up") { Share.files(ctx, listOf(f)) }
                            item("Удалить", "trash", destructive = true) {
                                if (f.delete()) {
                                    for (p in pins) if (p.isFile && p.value == f.name) SubjectPinStore.remove(p, subject)
                                    tick++
                                    onChanged()
                                    Haptics.tap()
                                }
                            }
                        }, onClick = { onOpen(f) }) {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                                IconLabel(f.name, pinIcon(f.name), spacing = 12.dp)
                            }
                        }
                    }
                }
            }
        }
    }
}
