package ru.student.safuhub.screens.tasks

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.data.StudyTask
import ru.student.safuhub.data.TaskStore
import ru.student.safuhub.feature.sakai.SakaiSync
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.ui.design.CircleIconButton
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.ScreenHeader
import ru.student.safuhub.ui.design.SectionTitle
import ru.student.safuhub.ui.design.scrollFX
import ru.student.safuhub.ui.design.strokeBorder
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.DateMode
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.ScrollPage
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

@Composable
fun TasksScreen() {
    TaskStore.load()
    val editing = remember { mutableStateOf<StudyTask?>(null) }
    var sakaiLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    SheetItem(editing) { t ->
        TaskEditorSheet(t, isNew = !TaskStore.contains(t), onSave = { TaskStore.upsert(it) }, onDelete = { TaskStore.delete(t) })
    }
    ScrollPage(spacing = 26.dp) {
        ScreenHeader("Дедлайны и дела", "Задачи") {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Pressable({
                    sakaiLoading = true
                    scope.launch {
                        val msg = SakaiSync.importInto()
                        sakaiLoading = false
                        Dialogs.alert("Sakai", msg)
                    }
                }, enabled = !sakaiLoading) {
                    Box(contentAlignment = Alignment.Center) {
                        CircleIconButton("graduationcap")
                        if (sakaiLoading) Spinner()
                    }
                }
                Pressable({ editing.value = StudyTask.blank() }) { CircleIconButton("plus") }
            }
        }
        if (TaskStore.tasks.isEmpty()) {
            EmptyState("checklist", "Задач пока нет",
                "Добавь лабу, отчёт или зачёт. Или нажми 🎓 — задания со сроками подтянутся из Sakai. Напомню за день и за час.")
        }
        for (group in TaskStore.groups()) {
            key(group.title) {
                Column(Modifier.animateContentSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SectionTitle(group.title)
                        Spacer(Modifier.weight(1f))
                        if (group.title == "Выполнено") {
                            TextButton({ TaskStore.clearDone() }) {
                                Text("Очистить", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
                            }
                        }
                    }
                    for (t in group.items) {
                        key(t.id) {
                            ContextMenuBox(items = {
                                item("Изменить", "pencil") { editing.value = t }
                                item("Удалить", "trash", destructive = true) { TaskStore.delete(t) }
                            }, modifier = Modifier.scrollFX(list = true), onClick = { editing.value = t }) {
                                TaskRow(t, onToggle = { TaskStore.toggle(t) })
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun TaskRow(task: StudyTask, onToggle: () -> Unit) {
    val overdue = !task.done && task.due < Instant.now()
    Glass(20.dp, Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            val k by animateFloatAsState(if (task.done) 1f else 0f, label = "done")
            Box(Modifier.size(32.dp).clickable(remember { MutableInteractionSource() }, null) { onToggle() }, contentAlignment = Alignment.Center) {
                Box(Modifier.size(26.dp).clip(CircleShape).strokeBorder(if (task.done) Brand.color else Ios.secondaryLabel.copy(alpha = 0.5f), 2.dp, CircleShape))
                Box(Modifier.size(26.dp).graphicsLayer { scaleX = k; scaleY = k; alpha = k }.clip(CircleShape).background(Brand.gradient),
                    contentAlignment = Alignment.Center) {
                    SfIcon("checkmark", size = 14.dp, tint = Color.White)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(task.title, style = ft(Ts.body, FontWeight.SemiBold).let { if (task.done) it.copy(textDecoration = TextDecoration.LineThrough) else it },
                    color = if (task.done) Ios.secondaryLabel else Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text((if (task.subject.isNotEmpty()) "${task.subject} · " else "") + Fmt.due(task.due), style = ft(Ts.caption),
                    color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (!task.done) {
                val c = if (overdue) Ios.red else Brand.color
                Text(Fmt.relative(task.due), style = ft(Ts.caption, FontWeight.SemiBold), color = c,
                    modifier = Modifier.clip(CircleShape).background(c.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 4.dp))
            }
        }
    }
}

@Composable
fun TaskEditorSheet(task: StudyTask, isNew: Boolean, onSave: (StudyTask) -> Unit, onDelete: () -> Unit) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        var t by remember { mutableStateOf(task) }
        val canSave = t.title.isNotBlank()
        FormScreen(if (isNew) "Новая задача" else "Задача",
            leading = { BarButton("Отмена") { dismiss() } },
            trailing = {
                BarButton("Готово", bold = true, enabled = canSave) {
                    if (t.remind) Permissions.requestNotifications()
                    onSave(t)
                    Haptics.success()
                    dismiss()
                }
            }) {
            FormSection {
                row { IosTextField(t.title, { t = t.copy(title = it) }, "Что сделать", Modifier.weight(1f), style = ft(Ts.headline, FontWeight.SemiBold)) }
                field("Предмет", t.subject, { t = t.copy(subject = it) })
            }
            FormSection {
                date("Срок", t.due, { t = t.copy(due = it) }, DateMode.DATE_TIME)
                toggle("Напомнить за день и за час", t.remind, { t = t.copy(remind = it) })
            }
            FormSection("Заметка") {
                row { IosTextField(t.note, { t = t.copy(note = it) }, "Аудитория, ссылка, детали…", Modifier.weight(1f), singleLine = false, minLines = 3) }
            }
            if (!isNew) {
                FormSection {
                    button("Удалить задачу", "trash", destructive = true) { onDelete(); dismiss() }
                }
            }
        }
    }
}
