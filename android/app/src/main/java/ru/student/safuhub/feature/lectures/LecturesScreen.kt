package ru.student.safuhub.feature.lectures

import android.content.Context
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.notes.Note
import ru.student.safuhub.feature.notes.NotesStore
import ru.student.safuhub.feature.web.CustomTabs
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.system.rememberFilePicker
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.rememberNow
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosSlider
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SearchField
import ru.student.safuhub.ui.kit.Segmented
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.barTint
import ru.student.safuhub.ui.kit.rememberBool
import ru.student.safuhub.ui.kit.rememberNull
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

private fun stamp(t: Double): String {
    val s = t.toInt()
    return "%d:%02d".format(s / 60, s % 60)
}

private val recRed = Color(0xFFFF3B30)
private val recGradient = Brush.verticalGradient(listOf(Color(0xFFFF6A5E), recRed))

/** Загрузить готовую запись (диктофон, мессенджер) и сразу распознать */
private suspend fun importAudio(ctx: Context, uri: Uri, subject: String) {
    val l = withContext(Dispatchers.IO) {
        try {
            val name = FileService.displayName(ctx, uri)
            val dst = FileService.uniqueFile(LectureStore.folder, name)
            ctx.contentResolver.openInputStream(uri)?.use { input -> dst.outputStream().use { input.copyTo(it) } } ?: return@withContext null
            Lecture(title = dst.nameWithoutExtension, subject = subject, date = Instant.now(),
                duration = audioDuration(dst), audioName = dst.name)
        } catch (_: Throwable) { null }
    }
    if (l == null) {
        Dialogs.alert("Не удалось загрузить запись", "Выбери звуковой файл: m4a, mp3, wav, ogg или aac.")
        return
    }
    LectureStore.add(l)
    LectureProcessor.process(l.id)
}

// MARK: - Экран «Лекции»

@Composable
fun LecturesScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val open = rememberNull<Lecture>()
    val settings = rememberBool()
    val now = rememberNow(30)
    val currentSubject = ScheduleEngine.nowAndNext(now, ScheduleStore.data).first?.lesson?.subject ?: ""
    val picker = rememberFilePicker(multiple = false) { uris ->
        uris.firstOrNull()?.let { u -> scope.launch { importAudio(ctx, u, currentSubject) } }
    }
    LaunchedEffect(Unit) { LectureRecorder.recover() }

    Screen("Лекции", background = { AmbientBackground() }, trailing = {
        IosMenu({
            item("Загрузить запись", "square.and.arrow.down") { picker.open(arrayOf("audio/*")) }
            item("Настройки", "gearshape") { settings.value = true }
        }) { Box(Modifier.padding(8.dp)) { SfIcon("ellipsis.circle", size = 22.dp, tint = barTint()) } }
    }) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            RecordCard(currentSubject)
            if (LectureAI.resolved() == LectureAI.LOCAL) {
                Pressable({ settings.value = true }, Modifier.fillMaxWidth()) {
                    Glass(16.dp, Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            SfGradientIcon("sparkles", size = 18.dp)
                            Text("Подключи бесплатный GigaChat — конспекты станут умными", style = ft(Ts.caption, FontWeight.SemiBold),
                                color = Ios.label, modifier = Modifier.weight(1f))
                            SfIcon("chevron.right", size = 12.dp, tint = Ios.tertiaryLabel)
                        }
                    }
                }
            }
            val list = LectureStore.lectures
            if (list.isEmpty()) {
                EmptyState("waveform.and.mic", "Пока нет лекций",
                    "Нажми «Записать» на паре. Можно заблокировать экран — запись продолжится.", Modifier.padding(top = 20.dp))
            }
            for (l in list) key(l.id) {
                ContextMenuBox({
                    item("Удалить", "trash", destructive = true) { LectureStore.delete(l.id) }
                }, onClick = { Haptics.tap(); open.value = l }) {
                    LectureRow(l, LectureProcessor.status[l.id])
                }
            }
        }
    }
    SheetItem(open) { l -> DoneSheet { LectureDetailScreen(l.id) } }
    SheetBinding(settings) { DoneSheet { LectureSettingsScreen() } }
}

@Composable
private fun RecordCard(subject: String) {
    Pressable({ Haptics.success(); LectureRecorder.open(subject) }, Modifier.fillMaxWidth()) {
        Glass(24.dp, Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(58.dp).shadow(10.dp, CircleShape, ambientColor = recRed.copy(alpha = 0.4f), spotColor = recRed.copy(alpha = 0.4f))
                    .clip(CircleShape).background(recGradient), contentAlignment = Alignment.Center) {
                    SfIcon("mic.fill", size = 24.dp, tint = Color.White)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("Записать лекцию", style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                    Text(if (subject.isEmpty()) "Потом будет текст и конспект" else "Сейчас: $subject",
                        style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun LectureRow(lecture: Lecture, status: LectureProcessor.Status?) {
    Glass(18.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(lecture.title, style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = Ios.label, maxLines = 2,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(Fmt.relative(lecture.date), style = ft(Ts.caption2), color = Ios.tertiaryLabel)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (lecture.subject.isNotEmpty() && lecture.subject != lecture.title) {
                    Text(lecture.subject, style = ft(Ts.caption2, FontWeight.SemiBold), color = Brand.color, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                }
                Text("${(lecture.duration / 60).toInt()} мин", style = ft(Ts.caption2), color = Ios.secondaryLabel)
                if (lecture.marks.isNotEmpty()) Text("⭐ ${lecture.marks.size}", style = ft(Ts.caption2), color = Ios.secondaryLabel)
                Spacer(Modifier.weight(1f))
                Badge(lecture, status)
            }
            val s = lecture.summary
            if (s != null && status == null) {
                Text(s.summary, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun Busy(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Spinner(12.dp, Brand.color)
        Text(text, style = ft(Ts.caption2, FontWeight.SemiBold), color = Brand.color)
    }
}

@Composable
private fun Badge(lecture: Lecture, status: LectureProcessor.Status?) {
    when (status) {
        is LectureProcessor.Status.Downloading -> Busy("Качаю модель · ${(status.progress * 100).toInt()}%")
        is LectureProcessor.Status.Transcribing -> Busy("Распознаю · ${(status.progress * 100).toInt()}%")
        LectureProcessor.Status.Summarizing -> Busy("Пишу конспект")
        is LectureProcessor.Status.Failed ->
            IconLabel("Ошибка", "exclamationmark.triangle.fill", style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.orange, spacing = 4.dp)
        null -> when {
            lecture.hasNotes -> IconLabel(if (lecture.summaryByAI) "Конспект ✨" else "Конспект", "doc.text.fill",
                style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.green, spacing = 4.dp)
            lecture.segments.isEmpty() -> Text("Не распознана", style = ft(Ts.caption2), color = Ios.secondaryLabel)
        }
    }
}

// MARK: - Запись: экран (поверх всего приложения)

@Composable
fun RecorderScreen() {
    val rec = LectureRecorder
    fun close() { rec.screen.value = false }
    fun confirmCancel() {
        if (!rec.recording) { close(); return }
        Dialogs.actionSheet("Удалить запись?", null,
            AlertAction("Удалить запись", AlertAction.Role.DESTRUCTIVE) { rec.cancel(); close() },
            AlertAction("Продолжить запись", AlertAction.Role.CANCEL))
    }
    LaunchedEffect(Unit) { rec.start() }
    BackHandler { confirmCancel() }

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(top = 20.dp, bottom = 30.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                BarButton("Отмена") { confirmCancel() }
            }
            IosTextField(rec.subject, { rec.subject = it }, "Предмет", Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), textAlign = TextAlign.Center)
            Spacer(Modifier.weight(1f))
            val t = rec.elapsed.toInt()
            Text(if (t >= 3600) "%d:%02d:%02d".format(t / 3600, t / 60 % 60, t % 60) else "%02d:%02d".format(t / 60, t % 60),
                style = ft(64f, FontWeight.ExtraBold, Design.ROUNDED, mono = true),
                color = if (rec.paused) Ios.secondaryLabel else Ios.label)
            // живая волна
            Row(Modifier.height(100.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                val bar = if (rec.paused) Brush.verticalGradient(listOf(Ios.secondaryLabel.copy(alpha = 0.4f), Ios.secondaryLabel.copy(alpha = 0.4f)))
                else recGradient
                for (v in rec.levels) {
                    val h by animateDpAsState((6 + v * 90).dp, tween(80, easing = LinearEasing), label = "lvl")
                    Box(Modifier.width(4.dp).height(h).clip(CircleShape).background(bar))
                }
            }
            Text(when {
                rec.paused -> "Пауза"
                rec.recording -> "Идёт запись · можно заблокировать экран"
                else -> "Готовлю микрофон…"
            }, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
            if (rec.denied) {
                Text("Нет доступа к микрофону: Настройки → Приложения → САФУ → Разрешения",
                    style = ft(Ts.caption), color = Ios.orange, textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 20.dp).clickable { Permissions.openAppSettings() })
            }
            rec.failed?.let {
                Text(it, style = ft(Ts.caption), color = Ios.orange, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 20.dp))
            }
            Spacer(Modifier.weight(1f))
            Pressable({ rec.markImportant() }, enabled = rec.recording) {
                Text(if (rec.marks.isEmpty()) "⭐ Важно" else "⭐ Важно · ${rec.marks.size}", style = ft(Ts.headline, FontWeight.SemiBold),
                    color = Ios.label,
                    modifier = Modifier.alpha(if (rec.recording) 1f else 0.5f).clip(CircleShape)
                        .background(Ios.yellow.copy(alpha = 0.25f)).padding(horizontal = 22.dp, vertical = 12.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(40.dp), verticalAlignment = Alignment.CenterVertically) {
                Pressable({ rec.togglePause() }, Modifier.alpha(if (rec.recording) 1f else 0.5f), enabled = rec.recording) {
                    Box(Modifier.size(70.dp).clip(CircleShape).background(Ios.label.copy(alpha = 0.08f)), contentAlignment = Alignment.Center) {
                        SfIcon(if (rec.paused) "play.fill" else "pause.fill", size = 28.dp, tint = Brand.color)
                    }
                }
                Pressable({
                    rec.stop(rec.subject.trim())?.let { l ->
                        LectureStore.add(l)
                        LectureProcessor.process(l.id)
                    }
                    Haptics.success()
                    close()
                }, Modifier.alpha(if (rec.recording) 1f else 0.5f), enabled = rec.recording) {
                    Box(Modifier.size(88.dp).border(5.dp, recRed.copy(alpha = 0.4f), CircleShape), contentAlignment = Alignment.Center) {
                        Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(recRed))
                    }
                }
            }
        }
    }
}

// MARK: - Лекция: конспект, текст, аудио

@Composable
private fun LectureDetailScreen(id: String) {
    val player = remember { LecturePlayer() }
    var tab by remember { mutableStateOf(0) }
    val editing = rememberBool()
    var draft by remember { mutableStateOf("") }
    val lecture = LectureStore.lecture(id)

    DisposableEffect(id) {
        LectureStore.lecture(id)?.let { player.load(it.audioFile) }
        onDispose { player.release() }
    }
    LaunchedEffect(player.playing) {
        while (player.playing) {
            player.update()
            delay(250)
        }
    }

    Screen("Лекция", background = { AmbientBackground() }) {
        if (lecture == null) {
            Text("Лекция удалена", style = ft(Ts.body), color = Ios.secondaryLabel, modifier = Modifier.padding(20.dp))
            return@Screen
        }
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Header(lecture)
            Segmented(listOf(0 to "Конспект", 1 to "Текст", 2 to "Аудио"), tab, { tab = it })
            when (tab) {
                0 -> Notes(lecture) { text -> draft = text; editing.value = true }
                1 -> Transcript(lecture) { seg ->
                    tab = 2
                    player.seek(seg.start)
                    if (!player.playing) player.toggle()
                }
                else -> Audio(lecture, player)
            }
        }
    }
    SheetBinding(editing) {
        NavigationStack { EditNotes(draft) { text -> LectureStore.update(id) { it.copy(editedNotes = text) }; Haptics.success(); Dialogs.showToast("Конспект сохранён") } }
    }
}

@Composable
private fun Header(l: Lecture) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(l.title, style = ft(Ts.title2, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val st = ft(Ts.caption, FontWeight.SemiBold)
            if (l.subject.isNotEmpty()) Text(l.subject, style = st, color = Brand.color, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false))
            Text(Fmt.format(l.date, "d MMMM, H:mm"), style = st, color = Ios.secondaryLabel)
            Text("· ${(l.duration / 60).toInt()} мин", style = st, color = Ios.secondaryLabel)
        }
        StatusLine(l)
    }
}

@Composable
private fun StatusLine(l: Lecture) {
    val cap = ft(Ts.caption)
    when (val st = LectureProcessor.status[l.id]) {
        is LectureProcessor.Status.Downloading ->
            IconLabel("Скачиваю модель распознавания · ${(st.progress * 100).toInt()}%. Это один раз, потом всё работает без интернета.",
                "arrow.down.circle", style = cap, color = Brand.color)
        is LectureProcessor.Status.Transcribing ->
            IconLabel("Распознаю речь на телефоне · ${(st.progress * 100).toInt()}%. Можно заблокировать экран — распознавание продолжится.",
                "waveform", style = cap, color = Brand.color)
        LectureProcessor.Status.Summarizing -> {
            val ai = LectureAI.resolved()
            IconLabel(if (ai == LectureAI.LOCAL) "Собираю конспект…" else "${ai.badge} пишет конспект…", "sparkles", style = cap, color = Brand.color)
        }
        is LectureProcessor.Status.Failed -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(st.message, style = cap, color = Ios.orange)
            Text("Попробовать ещё раз", style = ft(Ts.caption, FontWeight.Bold), color = Brand.color, modifier = Modifier.clickable {
                LectureProcessor.clearError(l.id)
                if (l.segments.isEmpty()) LectureProcessor.process(l.id) else LectureProcessor.summarize(l.id, LectureStyle.NORMAL)
            })
        }
        null -> if (l.segments.isEmpty()) {
            IconLabel("Распознать запись", "waveform.badge.magnifyingglass", style = ft(Ts.caption, FontWeight.Bold), color = Brand.color,
                modifier = Modifier.clickable { LectureProcessor.process(l.id) })
        }
    }
}

// MARK: конспект

@Composable
private fun Notes(l: Lecture, onEdit: (String) -> Unit) {
    val ctx = LocalContext.current
    val edited = l.editedNotes
    val summary = l.summary
    if (!edited.isNullOrEmpty()) {
        Glass(20.dp, Modifier.fillMaxWidth()) { Box(Modifier.fillMaxWidth().padding(16.dp)) { MarkdownLite(edited) } }
        Text("Твоя версия конспекта", style = ft(Ts.caption), color = Ios.secondaryLabel)
    } else if (summary != null) {
        SummaryView(summary, l.summaryByAI, l.engineBadge)
    } else if (l.segments.isEmpty()) {
        Text("Конспект появится, когда запись распознается.", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
    }
    if (!l.hasNotes) return
    val text = if (!edited.isNullOrEmpty()) edited else summary?.markdown ?: ""
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Action("pencil", "Переписать", Modifier.weight(1f)) { onEdit(text) }
            Action("note.text.badge.plus", "В заметки", Modifier.weight(1f)) {
                NotesStore.upsert(Note(title = l.title, text = text, subject = l.subject))
                Haptics.success()
                Dialogs.showToast("Добавлено в заметки", "checkmark.circle.fill")
            }
            Action("square.and.arrow.up", "Поделиться", Modifier.weight(1f)) { Share.text(ctx, text, l.title) }
        }
        val ai = LectureAI.resolved()
        IosMenu({
            for (st in LectureStyle.entries) item(st.title) {
                LectureStore.update(l.id) { it.copy(editedNotes = null) }
                LectureProcessor.summarize(l.id, st)
            }
        }, Modifier.fillMaxWidth().alpha(if (l.segments.isEmpty()) 0.5f else 1f)) {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.color.copy(alpha = 0.12f)).padding(vertical = 12.dp),
                contentAlignment = Alignment.Center) {
                IconLabel(if (ai == LectureAI.LOCAL) "Собрать конспект заново" else "${ai.badge}, перепиши конспект…",
                    "arrow.triangle.2.circlepath", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color, spacing = 6.dp)
            }
        }
    }
}

@Composable
private fun Action(icon: String, title: String, modifier: Modifier, onClick: () -> Unit) {
    Pressable(onClick, modifier) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.color.copy(alpha = 0.12f)).padding(vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SfIcon(icon, size = 19.dp, tint = Brand.color)
            Text(title, style = ft(Ts.caption2, FontWeight.SemiBold), color = Brand.color)
        }
    }
}

@Composable
private fun EditNotes(initial: String, onSave: (String) -> Unit) {
    val dismiss = LocalDismiss.current
    var text by remember { mutableStateOf(initial) }
    Screen("Переписать конспект", leading = { BarButton("Отмена") { dismiss() } },
        trailing = { BarButton("Сохранить", bold = true) { onSave(text); dismiss() } },
        background = { Box(Modifier.fillMaxSize().background(Ios.background)) }) {
        IosTextField(text, { text = it }, "Конспект", Modifier.fillMaxWidth().heightIn(min = 400.dp).padding(horizontal = 16.dp, vertical = 8.dp),
            style = ft(Ts.body), singleLine = false, minLines = 12)
    }
}

// MARK: текст

@Composable
private fun Transcript(l: Lecture, onSeek: (SpeechSegment) -> Unit) {
    val ctx = LocalContext.current
    if (l.segments.isEmpty()) {
        Text("Текста пока нет.", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
        return
    }
    var query by remember { mutableStateOf("") }
    SearchField(query, { query = it }, "Найти в тексте")
    val q = query.trim().lowercase()
    val segs = if (q.isEmpty()) l.segments else l.segments.filter { it.text.lowercase().contains(q) }
    Glass(20.dp, Modifier.fillMaxWidth()) {
        SelectionContainer {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                for (seg in segs) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(stamp(seg.start), style = ft(Ts.caption, FontWeight.Bold, mono = true), color = Brand.color,
                            modifier = Modifier.padding(top = 2.dp).clickable { onSeek(seg) })
                        Text((if (l.isImportant(seg)) "⭐ " else "") + seg.text, style = ft(Ts.subheadline), color = Ios.label)
                    }
                }
            }
        }
    }
    IconLabel("Поделиться всем текстом", "square.and.arrow.up", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color,
        modifier = Modifier.clickable { Share.text(ctx, l.transcript, l.title) })
}

// MARK: аудио

@Composable
private fun Audio(l: Lecture, player: LecturePlayer) {
    Glass(20.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            IosSlider(player.time.toFloat(), { player.seek(it.toDouble()) }, 0f..maxOf(1f, player.duration.toFloat()))
            Row {
                Text(stamp(player.time), style = ft(Ts.caption, mono = true), color = Ios.secondaryLabel)
                Spacer(Modifier.weight(1f))
                Text(stamp(player.duration), style = ft(Ts.caption, mono = true), color = Ios.secondaryLabel)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(30.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically) {
                val tap = remember { MutableInteractionSource() }
                SfIcon("gobackward.15", size = 26.dp, tint = Brand.color,
                    modifier = Modifier.clickable(tap, null) { player.seek(player.time - 15) })
                SfIcon(if (player.playing) "pause.circle.fill" else "play.circle.fill", size = 56.dp, tint = Brand.color,
                    modifier = Modifier.clickable(remember { MutableInteractionSource() }, null) { player.toggle() })
                SfIcon("goforward.15", size = 26.dp, tint = Brand.color,
                    modifier = Modifier.clickable(remember { MutableInteractionSource() }, null) { player.seek(player.time + 15) })
                Text("%.1f×".format(player.rate), style = ft(Ts.subheadline, FontWeight.Bold, mono = true), color = Brand.color,
                    modifier = Modifier.clickable(remember { MutableInteractionSource() }, null) { player.cycleRate() })
            }
            if (l.marks.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Отмечено важным", style = ft(Ts.caption, FontWeight.Bold), color = Ios.secondaryLabel)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (m in l.marks) {
                            Text("⭐ ${stamp(m)}", style = ft(Ts.caption, FontWeight.Bold), color = Brand.color,
                                modifier = Modifier.clip(CircleShape).background(Ios.yellow.copy(alpha = 0.2f))
                                    .clickable {
                                        player.seek(maxOf(0.0, m - 10))
                                        if (!player.playing) player.toggle()
                                    }
                                    .padding(horizontal = 10.dp, vertical = 6.dp))
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Красивый автоматический конспект

@Composable
fun SummaryView(summary: LectureSummary, byAI: Boolean, engine: String = "Claude") {
    SelectionContainer {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Glass(20.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconLabel(if (byAI) "Конспект · $engine" else "Конспект без ИИ", if (byAI) "sparkles" else "doc.text",
                        style = ft(Ts.caption, FontWeight.Bold), color = Brand.color, spacing = 5.dp)
                    Text(summary.title, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                    Text(summary.summary, style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                }
            }
            Block("Главное", "star.fill", summary.keyPoints)
            for (sec in summary.sections) Block(sec.heading, "list.bullet", sec.points)
            if (summary.terms.isNotEmpty()) Card {
                IconLabel("Термины", "character.book.closed.fill", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, iconColor = Brand.color)
                for (t in summary.terms) Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(t.term, style = ft(Ts.subheadline, FontWeight.Bold), color = Brand.color)
                    Text(t.definition, style = ft(Ts.subheadline), color = Ios.label)
                }
            }
            if (summary.formulas.isNotEmpty()) Card {
                IconLabel("Формулы", "function", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, iconColor = Brand.color)
                for (f in summary.formulas) {
                    Text(f, style = ft(Ts.subheadline, mono = true), color = Ios.label,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Ios.label.copy(alpha = 0.05f)).padding(10.dp))
                }
            }
            Block("Могут спросить", "questionmark.bubble.fill", summary.questions)
            Block("Задания и сроки", "checklist", summary.tasks)
        }
    }
}

@Composable
private fun Card(content: @Composable ColumnScope.() -> Unit) {
    Glass(20.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
private fun Bullet(text: AnnotatedString) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.padding(top = 8.dp).size(5.dp).clip(CircleShape).background(Brand.color))
        Text(text, style = ft(Ts.subheadline), color = Ios.label)
    }
}

@Composable
private fun Block(title: String, icon: String, items: List<String>) {
    if (items.isEmpty()) return
    Card {
        IconLabel(title, icon, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, iconColor = Brand.color)
        for (i in items) Bullet(AnnotatedString(i))
    }
}

// MARK: - Свой конспект: # заголовки, - пункты, **жирный**, *курсив*, `код`

private val inlineRx = Regex("\\*\\*(.+?)\\*\\*|\\*(.+?)\\*|_(.+?)_|`(.+?)`")

private fun inline(s: String): AnnotatedString = buildAnnotatedString {
    var at = 0
    for (m in inlineRx.findAll(s)) {
        append(s.substring(at, m.range.first))
        val (b, i, u, c) = m.destructured
        when {
            b.isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(b) }
            i.isNotEmpty() -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(i) }
            u.isNotEmpty() -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(u) }
            else -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(c) }
        }
        at = m.range.last + 1
    }
    append(s.substring(at))
}

@Composable
fun MarkdownLite(text: String) {
    SelectionContainer {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (raw in text.split("\n")) {
                val line = raw.trim()
                when {
                    line.isEmpty() -> Spacer(Modifier.height(4.dp))
                    line.startsWith("# ") -> Text(inline(line.drop(2)), style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                    line.startsWith("## ") -> Text(inline(line.drop(3)), style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label,
                        modifier = Modifier.padding(top = 6.dp))
                    line.startsWith("- ") || line.startsWith("• ") -> Bullet(inline(line.drop(2)))
                    else -> Text(inline(line), style = ft(Ts.subheadline), color = Ios.label)
                }
            }
        }
    }
}

// MARK: - Настройки

@Composable
private fun LectureSettingsScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var model by remember { mutableStateOf(LectureASR.selected) }
    var ai by remember { mutableStateOf(LectureAI.selected) }
    var gigaModel by remember { mutableStateOf(GigaChat.model) }
    var key by remember { mutableStateOf(ClaudeKey.value ?: "") }
    var gigaKey by remember { mutableStateOf(GigaKey.value ?: "") }
    var probes by remember { mutableStateOf<Map<LectureAI, AIProbe>>(emptyMap()) }
    var checking by remember { mutableStateOf(false) }
    var downloading by remember { mutableStateOf<Float?>(null) }
    var rev by remember { mutableStateOf(0) }

    fun saveKeys() {
        ClaudeKey.set(key)
        GigaKey.set(gigaKey)
    }
    DisposableEffect(Unit) { onDispose { saveKeys() } }

    val m = LectureASR.model(model)
    FormScreen("Лекции") {
        FormSection("Речь → текст",
            footer = "Vosk работает прямо на телефоне. Модель скачивается один раз при первой лекции — лучше по Wi-Fi. Запись никуда не отправляется.") {
            segmented(LectureASR.models.map { it.id to it.title }, model, { model = it; LectureASR.selected = it })
            row {
                val note = if (LectureASR.fits(m)) m.note
                else m.note + ". На этом телефоне ${"%.1f".format(LectureASR.ramGB).replace('.', ',')} ГБ памяти — будет работать быстрая модель."
                Text(note, style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
            if (rev >= 0 && LectureASR.ready(m)) {
                button("Удалить скачанную модель", "trash", destructive = true) {
                    Dialogs.confirm("Удалить модель «${m.title}»?", "Её можно будет скачать снова.", "Удалить") {
                        LectureASR.remove(m)
                        rev++
                    }
                }
            } else {
                val d = downloading
                button(if (d != null) "Скачиваю · ${(d * 100).toInt()}%" else "Скачать сейчас", "arrow.down.circle", enabled = d == null) {
                    downloading = 0f
                    scope.launch {
                        try {
                            LectureASR.download(m) { p -> scope.launch { downloading = p } }
                            Haptics.success()
                        } catch (e: Throwable) {
                            Dialogs.alert("Не удалось скачать модель", LectureAIProbe.describe(e, false))
                        }
                        downloading = null
                        rev++
                    }
                }
            }
        }
        FormSection("Конспект",
            footer = "«Авто» выбирает сам: GigaChat, если есть ключ, потом Claude, иначе — конспект без ИИ. Если ИИ не ответит, всё равно получится простой конспект.") {
            picker("Кто пишет", LectureAI.choices.map { it to it.title }, ai, { ai = it; LectureAI.selected = it })
            info("Сейчас", LectureAI.resolved().badge)
        }
        FormSection("GigaChat — бесплатно, без VPN",
            footer = "1. Войди на developers.sber.ru через Сбер ID.\n2. Создай проект «GigaChat API» (для физлиц бесплатно).\n" +
                "3. В проекте нажми «Сгенерировать ключ» и скопируй «Ключ авторизации» сюда.\n" +
                "Lite — бесплатный пакет больше всех, Pro и Max умнее, но токенов на них меньше. Расшифровка (только текст) отправляется в Сбер. " +
                "Сертификат Минцифры в систему НЕ ставится: приложение доверяет ему только для серверов GigaChat. Ключ хранится в защищённом хранилище Android.") {
            field("Ключ авторизации", gigaKey, { gigaKey = it }, secure = true, capitalize = false)
            segmented(GigaChat.models, gigaModel, { gigaModel = it; GigaChat.model = it })
            button("Получить ключ на developers.sber.ru", "arrow.up.right.square") { CustomTabs.open(ctx, "https://developers.sber.ru/studio") }
        }
        FormSection("Проверка подключения",
            footer = "Проверка бесплатная: токены GigaChat и деньги на ключе Claude не тратятся. Ключи сохраняются перед проверкой.") {
            for (a in listOf(LectureAI.GIGACHAT, LectureAI.CLAUDE)) row {
                val p = probes[a]
                Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
                    if (checking && p == null) Spinner(16.dp)
                    else when (p?.state) {
                        AIProbe.State.OK -> SfIcon("checkmark.circle.fill", size = 20.dp, tint = Ios.green)
                        AIProbe.State.WARN -> SfIcon("exclamationmark.circle.fill", size = 20.dp, tint = Ios.orange)
                        AIProbe.State.FAIL -> SfIcon("xmark.circle.fill", size = 20.dp, tint = Ios.red)
                        null -> SfIcon("circle.dashed", size = 20.dp, tint = Ios.tertiaryLabel)
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(a.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                    Text(p?.text ?: "Не проверено", style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
            }
            button(if (checking) "Проверяю…" else "Проверить подключение", "antenna.radiowaves.left.and.right", enabled = !checking) {
                saveKeys()
                checking = true
                probes = emptyMap()
                scope.launch {
                    val r = LectureAIProbe.all()
                    probes = r
                    checking = false
                    if (r.values.any { it.state == AIProbe.State.OK }) Haptics.success()
                }
            }
        }
        FormSection("Ключ Claude API",
            footer = "Необязательно. Claude (claude-opus-5) пишет самые подробные конспекты, но из России нужен VPN, а лекция на 1,5 часа стоит примерно 20–30 центов. Расшифровка (только текст) отправляется в Anthropic.") {
            field("sk-ant-…", key, { key = it }, secure = true, capitalize = false)
        }
    }
}
