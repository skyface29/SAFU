package ru.student.safuhub.feature.board

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.system.rememberMediaPicker
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// Фото доски: предмет → дата → фото (как BoardDatesView на iPhone 18.3)

/** Плитки предметов с фото: обложка — последний снимок */
@Composable
fun BoardSubjectsGrid(reloadKey: Int) {
    val nav = LocalNav.current
    var list by remember { mutableStateOf<List<LessonPhotos.SubjectSummary>?>(null) }
    LaunchedEffect(reloadKey, BoardIndex.entries.size) {
        val d = ScheduleStore.data
        list = withContext(Dispatchers.IO) { LessonPhotos.subjectSummaries(d) }
    }
    val l = list ?: return
    if (l.isEmpty()) {
        ru.student.safuhub.ui.design.EmptyState("camera.viewfinder", "Сфоткай доску",
            "На главной в карточке пары — «Фото доски в папку предмета». Снимал обычной камерой — нажми «Из галереи» вверху: фото сами разложатся по предметам и датам.")
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        for (row in l.chunked(2)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (s in row) {
                    Pressable({ Haptics.tap(); nav?.push { BoardDatesScreen(s.subject) } }, Modifier.weight(1f)) { SubjectCard(s) }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        Text("Нажми на предмет — увидишь даты, когда фотографировал доску. По тексту на досках можно искать — строка поиска вверху.",
            style = ft(Ts.caption), color = Ios.secondaryLabel, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun SubjectCard(s: LessonPhotos.SubjectSummary) {
    val color = SubjectColor.color(s.subject)
    Glass(20.dp, Modifier.fillMaxWidth()) {
        Column {
            Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)).background(color.copy(alpha = 0.18f))) {
                s.latest?.let { BoardThumb(it.file, 0.dp, Modifier.fillMaxWidth().aspectRatio(4f / 3f)) }
            }
            Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(s.subject, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${s.photos} фото · ${s.days} ${datesWord(s.days)} · ${s.lastText}", style = ft(Ts.caption2), color = Ios.secondaryLabel, maxLines = 1)
            }
        }
    }
}

private fun datesWord(n: Int): String {
    val a = n % 100; val b = a % 10
    return when { a in 11..19 -> "дат"; b == 1 -> "дата"; b in 2..4 -> "даты"; else -> "дат" }
}

/** Даты одного предмета по месяцам; нажал — все фото того дня */
@Composable
fun BoardDatesScreen(subject: String) {
    val nav = LocalNav.current
    var days by remember { mutableStateOf<List<BoardBatch>?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    val importer = rememberBoardImport(subject) { reload++ }
    LaunchedEffect(reload) {
        val d = ScheduleStore.data
        days = withContext(Dispatchers.IO) { LessonPhotos.dayBatches(subject, d) }
    }
    Screen(subject, trailing = { BarButton("Из галереи") { importer() } }) {
        val list = days ?: return@Screen
        if (list.isEmpty()) {
            Text("Фото пока нет", style = ft(Ts.subheadline), color = Ios.secondaryLabel, modifier = Modifier.padding(20.dp))
            return@Screen
        }
        for ((month, group) in list.groupBy { Fmt.format(it.day, "LLLL yyyy").capitalizedFirstLetter() }) {
            FormSection(month) {
                for (b in group) row(onClick = { nav?.push { BoardBatchScreen(b) } }) {
                    Box(Modifier.weight(1f)) { BoardBatchRow(b) }
                    SfIcon("chevron.right", size = 16.dp, tint = Ios.tertiaryLabel)
                }
            }
        }
    }
}

/**
 * «Из галереи»: снимки сами раскладываются по предметам и парам по времени съёмки.
 * subject — разложить всё в этот предмет. Возвращает функцию, открывающую выбор фото
 */
@Composable
fun rememberBoardImport(subject: String?, onDone: () -> Unit): () -> Unit {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val pending = remember { mutableStateOf<List<BoardImport.Pending>?>(null) }
    SheetItem(pending) { list -> PendingSubjectSheet(list) { onDone() } }
    val picker = rememberMediaPicker(multiple = true) { uris ->
        if (uris.isEmpty()) return@rememberMediaPicker
        scope.launch {
            Dialogs.showToast("Раскладываю фото…", "photo.on.rectangle")
            val r = withContext(Dispatchers.IO) { BoardImport.importAll(ctx, uris, ScheduleStore.data, subject) }
            if (r.placed > 0) { Haptics.success(); Dialogs.showToast("Разложено по парам: ${r.placed}", "checkmark.circle.fill") }
            if (r.pending.isNotEmpty()) pending.value = r.pending
            onDone()
        }
    }
    return { picker.images() }
}

/** Снимки, сделанные не во время пар: выбрать, к какому предмету их положить */
@Composable
private fun PendingSubjectSheet(list: List<BoardImport.Pending>, onDone: () -> Unit) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        val subjects = ScheduleQuery.subjects(ScheduleStore.data)
        val scope = rememberCoroutineScope()
        FormScreen("Куда положить?", leading = { BarButton("Не сохранять") { BoardImport.drop(list); dismiss() } }) {
            FormSection(footer = "${list.size} фото сняты не во время пар — выбери предмет, они лягут в его папку по датам съёмки.") {
                for (s in subjects) link(s, "books.vertical") {
                    scope.launch {
                        withContext(Dispatchers.IO) { list.forEach { BoardImport.place(it, s) } }
                        Haptics.success()
                        onDone()
                        dismiss()
                    }
                }
            }
        }
    }
}
