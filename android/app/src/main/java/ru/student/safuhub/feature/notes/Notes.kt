package ru.student.safuhub.feature.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.strokeBorder
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.BarIcon
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SearchField
import ru.student.safuhub.ui.kit.SectionScope
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb
import java.time.Instant

// MARK: - Заметки
// Много заметок вместо одного поля: заголовок, текст, чек-лист, цвет, предмет, закрепление, поиск.

@Serializable
data class NoteItem(val id: String = newId(), val text: String = "", val done: Boolean = false)

@Serializable
data class Note(
    val id: String = newId(),
    val title: String = "",
    val text: String = "",
    val items: List<NoteItem> = emptyList(),
    val subject: String = "",
    val color: Int = 0,
    val pinned: Boolean = false,
    val created: AppleDate = Instant.now(),
    val updated: AppleDate = Instant.now(),
) {
    val displayTitle: String
        get() {
            val t = title.trim()
            if (t.isNotEmpty()) return t
            val first = text.split("\n").firstOrNull()?.trim() ?: ""
            if (first.isNotEmpty()) return first
            return items.firstOrNull()?.text ?: "Без названия"
        }

    val preview: String
        get() {
            val body = if (title.isEmpty()) text.split("\n").drop(1).joinToString(" ") else text
            val clean = body.replace("\n", " ").trim()
            if (clean.isNotEmpty()) return clean
            if (items.isNotEmpty()) return "${items.count { it.done }} из ${items.size} готово"
            return ""
        }

    val isEmpty: Boolean get() = title.isBlank() && text.isBlank() && items.all { it.text.isBlank() }

    companion object {
        val palette = listOf(Color.Transparent, rgb(0.98, 0.80, 0.25), rgb(0.40, 0.78, 0.45), rgb(0.35, 0.62, 0.98),
            rgb(0.93, 0.42, 0.55), rgb(0.65, 0.45, 0.95))
    }
}

object NotesStore {
    private const val key = "notes.v2"

    val notes: List<Note>
        get() {
            Defaults.decode<List<Note>>(key)?.let { return it }
            val old = Defaults.string("notes")
            return if (!old.isNullOrBlank()) listOf(Note(text = old)) else emptyList()
        }

    private fun set(list: List<Note>) = Defaults.encode(key, list)

    /** Закреплённые сверху, дальше — свежие */
    val sorted: List<Note> get() = notes.sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.updated })

    fun upsert(n: Note) {
        val x = n.copy(updated = Instant.now())
        val list = notes
        set(if (list.any { it.id == x.id }) list.map { if (it.id == x.id) x else it } else listOf(x) + list)
    }

    fun delete(id: String) = set(notes.filter { it.id != id })

    fun togglePin(id: String) = set(notes.map { if (it.id == id) it.copy(pinned = !it.pinned) else it })

    fun shareText(n: Note): String {
        val parts = mutableListOf<String>()
        if (n.title.isNotEmpty()) parts.add(n.title)
        if (n.text.isNotEmpty()) parts.add(n.text)
        if (n.items.isNotEmpty()) parts.add(n.items.joinToString("\n") { (if (it.done) "☑ " else "☐ ") + it.text })
        return parts.joinToString("\n\n")
    }
}

// MARK: - Список

@Composable
fun NotesScreen() {
    val ctx = LocalContext.current
    var query by remember { mutableStateOf("") }
    val editing = remember { mutableStateOf<Note?>(null) }
    SheetItem(editing) { n -> NoteSheet(n) }
    val q = query.trim().lowercase()
    val filtered = NotesStore.sorted.filter { n ->
        q.isEmpty() || n.title.lowercase().contains(q) || n.text.lowercase().contains(q) || n.subject.lowercase().contains(q) ||
            n.items.any { it.text.lowercase().contains(q) }
    }
    Screen("Заметки", background = { ru.student.safuhub.ui.design.AmbientBackground() },
        trailing = { BarIcon("square.and.pencil") { Haptics.tap(); editing.value = Note() } }) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SearchField(query, { query = it }, "Поиск по заметкам")
            if (NotesStore.notes.isEmpty()) {
                EmptyState("note.text", "Пока пусто", "Нажми «✎», чтобы записать мысль, список покупок к общаге или что спросить у преподавателя.",
                    Modifier.padding(top = 40.dp))
            }
            for (n in filtered) {
                ContextMenuBox(items = {
                    item(if (n.pinned) "Открепить" else "Закрепить", if (n.pinned) "pin.slash" else "pin") { NotesStore.togglePin(n.id) }
                    item("Поделиться", "square.and.arrow.up") { Share.text(ctx, NotesStore.shareText(n)) }
                    item("Удалить", "trash", destructive = true) { NotesStore.delete(n.id) }
                }, onClick = { Haptics.tap(); editing.value = n }) { NoteCard(n) }
            }
        }
    }
}

@Composable
fun NoteCard(note: Note) {
    Glass(18.dp, Modifier.fillMaxWidth()) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            if (note.color > 0) Box(Modifier.width(5.dp).fillMaxHeight().background(Note.palette[note.color % Note.palette.size]))
            Column(Modifier.padding(14.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (note.pinned) SfIcon("pin.fill", size = 11.dp, tint = Brand.color)
                    Text(note.displayTitle, style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = Ios.label, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(Fmt.relative(note.updated), style = ft(Ts.caption2), color = Ios.tertiaryLabel)
                }
                if (note.preview.isNotEmpty()) Text(note.preview, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (note.items.isNotEmpty() || note.subject.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (note.items.isNotEmpty()) {
                            val done = note.items.count { it.done }
                            val all = done == note.items.size
                            IconLabel("$done/${note.items.size}", if (all) "checkmark.circle.fill" else "checklist", style = ft(Ts.caption2, FontWeight.SemiBold),
                                color = if (all) Ios.green else Ios.secondaryLabel, spacing = 4.dp)
                        }
                        if (note.subject.isNotEmpty()) {
                            Text(note.subject, style = ft(Ts.caption2, FontWeight.SemiBold), color = Brand.color, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 3.dp))
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Редактор

@Composable
fun NoteSheet(initial: Note) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        var note by remember { mutableStateOf(initial) }
        var newItem by remember { mutableStateOf("") }
        fun addItem() {
            val t = newItem.trim()
            if (t.isEmpty()) return
            note = note.copy(items = note.items + NoteItem(text = t))
            newItem = ""
        }
        fun saveAndClose() {
            addItem()
            val clean = note.copy(items = note.items.filter { it.text.isNotBlank() })
            if (clean.isEmpty) NotesStore.delete(clean.id) else { NotesStore.upsert(clean); Haptics.success() }
            dismiss()
        }
        val subjects = ScheduleQuery.subjects(ScheduleStore.data)
        FormScreen(if (note.isEmpty) "Новая заметка" else "Заметка",
            leading = { BarButton("Отмена") { dismiss() } },
            trailing = { BarButton("Готово", bold = true) { saveAndClose() } }) {
            FormSection {
                row { IosTextField(note.title, { note = note.copy(title = it) }, "Заголовок", Modifier.weight(1f), style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED)) }
                row(minHeight = 100.dp) { IosTextField(note.text, { note = note.copy(text = it) }, "Текст заметки", Modifier.weight(1f), singleLine = false, minLines = 4) }
            }
            FormSection("Чек-лист", footer = if (note.items.isNotEmpty()) "Нажми «−», чтобы удалить пункт." else null) {
                checklist(note, onChange = { note = it })
                row {
                    SfIcon("plus.circle.fill", size = 24.dp, tint = Brand.color)
                    Spacer(Modifier.width(10.dp))
                    IosTextField(newItem, { newItem = it }, "Добавить пункт", Modifier.weight(1f), onDone = { addItem() })
                }
            }
            FormSection("Оформление") {
                raw {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        for (i in Note.palette.indices) {
                            Box(Modifier.size(36.dp).clip(CircleShape).strokeBorder(Ios.label.copy(alpha = if (note.color == i) 0.8f else 0f), 2.dp, CircleShape)
                                .padding(4.dp).clip(CircleShape).background(if (i == 0) Ios.label.copy(alpha = 0.08f) else Note.palette[i])
                                .clickable { Haptics.tap(); note = note.copy(color = i) }, contentAlignment = Alignment.Center) {
                                if (i == 0) SfIcon("nosign", size = 13.dp, tint = Ios.secondaryLabel)
                            }
                        }
                    }
                }
                val opts = mutableListOf("" to "Без предмета")
                opts += subjects.map { it to it }
                if (note.subject.isNotEmpty() && note.subject !in subjects) opts += note.subject to note.subject
                picker("Предмет", opts, note.subject, { note = note.copy(subject = it) })
                toggle("Закрепить сверху", note.pinned, { note = note.copy(pinned = it) })
            }
            if (NotesStore.notes.any { it.id == note.id }) {
                FormSection {
                    button("Удалить заметку", destructive = true) { NotesStore.delete(note.id); dismiss() }
                }
            }
        }
    }
}

private fun SectionScope.checklist(note: Note, onChange: (Note) -> Unit) {
    for (it in note.items) {
        row {
            SfIcon(if (it.done) "checkmark.circle.fill" else "circle", size = 24.dp, tint = if (it.done) Ios.green else Ios.secondaryLabel,
                modifier = Modifier.clickable { Haptics.tap(); onChange(note.copy(items = note.items.map { x -> if (x.id == it.id) x.copy(done = !x.done) else x })) })
            Spacer(Modifier.width(10.dp))
            IosTextField(it.text, { v -> onChange(note.copy(items = note.items.map { x -> if (x.id == it.id) x.copy(text = v) else x })) }, "Пункт",
                Modifier.weight(1f), style = ft(Ts.body).let { s -> if (it.done) s.copy(textDecoration = TextDecoration.LineThrough) else s },
                color = if (it.done) Ios.secondaryLabel else Ios.label)
            SfIcon("minus.circle.fill", size = 20.dp, tint = Ios.red,
                modifier = Modifier.clickable { onChange(note.copy(items = note.items.filter { x -> x.id != it.id })) })
        }
    }
}

/** Блок «Заметки» в профиле: пара последних и переход ко всем */
fun SectionScope.notesPreview(onOpenAll: () -> Unit) {
    link("Все заметки", "note.text", value = "${NotesStore.notes.size}") { onOpenAll() }
    for (n in NotesStore.sorted.take(3)) {
        row {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    if (n.pinned) SfIcon("pin.fill", size = 11.dp, tint = Brand.color)
                    Text(n.displayTitle, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (n.preview.isNotEmpty()) Text(n.preview, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
