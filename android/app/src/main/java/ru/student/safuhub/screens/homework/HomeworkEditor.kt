package ru.student.safuhub.screens.homework

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.core.hm
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.HWAsk
import ru.student.safuhub.data.HWEditorRoute
import ru.student.safuhub.data.HWFiles
import ru.student.safuhub.data.HWFormat
import ru.student.safuhub.data.HWKind
import ru.student.safuhub.data.HWPlanner
import ru.student.safuhub.data.HWPretty
import ru.student.safuhub.data.HWPrefs
import ru.student.safuhub.data.HWReminders
import ru.student.safuhub.data.HWShare
import ru.student.safuhub.data.HWStep
import ru.student.safuhub.data.HWTarget
import ru.student.safuhub.data.Homework
import ru.student.safuhub.data.HomeworkRouter
import ru.student.safuhub.data.HomeworkStore
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.ScheduleJump
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.system.rememberCamera
import ru.student.safuhub.system.rememberMediaPicker
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.DateChips
import ru.student.safuhub.ui.kit.DateMode
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.time.Instant

/** Редактор ДЗ откуда угодно (главная, пара, уведомление) — подключается один раз в корне приложения */
@Composable
fun HomeworkRoot() {
    val state = remember { mutableStateOf<HWEditorRoute?>(null) }
    LaunchedEffect(HomeworkRouter.editor) { if (HomeworkRouter.editor != null) state.value = HomeworkRouter.editor }
    LaunchedEffect(state.value) { if (state.value == null) HomeworkRouter.editor = null }
    SheetItem(state) { r -> HomeworkSheet(r) }
}

@Composable
fun HomeworkSheet(route: HWEditorRoute) {
    var editing by remember { mutableStateOf(!route.preview || route.homework == null) }
    NavigationStack {
        val h = route.homework?.let { HomeworkStore.item(it.id) ?: it }
        if (editing || h == null) HomeworkEditor(route) else HWDetail(h, onEdit = { editing = true })
    }
}

// MARK: - ДЗ по нажатию: красиво оформленная карточка и «Отправить ребятам»

@Composable
fun HWDetail(h: Homework, onEdit: () -> Unit) {
    val dismiss = LocalDismiss.current
    val ctx = LocalContext.current
    val color = SubjectColor.color(h.subject)
    Screen(h.subject.ifEmpty { "ДЗ" }, leading = { BarButton("Готово", bold = true) { dismiss() } },
        trailing = { BarButton("Изменить") { onEdit() } }) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Glass(24.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.size(10.dp).clip(CircleShape).background(color))
                        Text(h.subject.ifEmpty { "Без предмета" }, style = ft(Ts.headline, FontWeight.Bold), color = color)
                        if (h.important) SfIcon("star.fill", size = 14.dp, tint = Ios.orange)
                        Spacer(Modifier.weight(1f))
                        Row(Modifier.clip(CircleShape).background(h.hwKind.color.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            SfIcon(h.hwKind.icon, size = 12.dp, tint = h.hwKind.color)
                            Text(h.hwKind.title, style = ft(Ts.caption, FontWeight.SemiBold), color = h.hwKind.color)
                        }
                    }
                    for (b in HWPretty.blocks(h.text)) BlockRow(b)
                    if (h.steps.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (st in h.steps) Row(Modifier.clickable { HomeworkStore.toggleStep(h.id, st.id) }, verticalAlignment = Alignment.Top,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                SfIcon(if (st.done) "checkmark.circle.fill" else "circle", size = 20.dp, tint = if (st.done) color else Ios.secondaryLabel)
                                Text(HWPretty.clean(st.text), style = ft(Ts.body), color = if (st.done) Ios.secondaryLabel else Ios.label)
                            }
                        }
                    }
                    if (h.note.isNotBlank()) Text("💬 ${h.note.trim()}", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                    if (h.photos.isNotEmpty()) PhotoStrip(h.id, h.photos, onRemove = null)
                }
            }
            // срок: нажал — расписание на этот день
            Glass(20.dp, Modifier.fillMaxWidth().clickable { ScheduleJump.show(h.due); dismiss() }) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    SfIcon("calendar", size = 22.dp, tint = HWFormat.urgency(h.due, h.done, Brand.color, Ios.secondaryLabel))
                    Column(Modifier.weight(1f)) {
                        Text("Сдать: " + HWShare.dueLine(h), style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                        Text((if (h.dueEstimated) "≈ " else "") + HWFormat.chip(h.due, h.done) + if (h.byPair) " · к паре, срок следит за расписанием" else "",
                            style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                    SfIcon("chevron.right", size = 14.dp, tint = Ios.tertiaryLabel)
                }
            }
            if (h.shiftNote.isNotEmpty() && !h.done) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    SfIcon("arrow.triangle.2.circlepath", size = 14.dp, tint = Ios.orange)
                    Text(h.shiftNote, style = ft(Ts.footnote, FontWeight.SemiBold), color = Ios.orange, modifier = Modifier.weight(1f))
                    TextButton({ HomeworkStore.dismissShift(h.id) }) { Text("Понятно", style = ft(Ts.footnote, FontWeight.SemiBold), color = Brand.color) }
                }
            }
            // снизу: сделано и отправить
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Pressable({ HomeworkStore.toggle(h.id); if (!h.done) dismiss() }, Modifier.weight(1f)) {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (h.done) androidx.compose.ui.graphics.SolidColor(Ios.tertiaryFill) else Brand.gradient)
                        .padding(vertical = 13.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        SfIcon(if (h.done) "arrow.uturn.backward" else "checkmark", size = 16.dp, tint = if (h.done) Ios.label else Color.White)
                        Spacer(Modifier.width(6.dp))
                        Text(if (h.done) "Вернуть в работу" else "Сделано", style = ft(Ts.subheadline, FontWeight.Bold), color = if (h.done) Ios.label else Color.White)
                    }
                }
                Pressable({ shareHomework(ctx, h) }, Modifier.weight(1f)) {
                    Glass(16.dp, Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().padding(vertical = 13.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                            SfIcon("paperplane.fill", size = 15.dp, tint = Brand.color)
                            Spacer(Modifier.width(6.dp))
                            Text("Отправить ребятам", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                        }
                    }
                }
            }
        }
    }
}

/** Абзац или пункт: номера заданий, страницы и параграфы — жирным в цвет темы */
@Composable
private fun BlockRow(b: HWPretty.Block) {
    val brand = Brand.color
    val styled = buildAnnotatedString {
        var last = 0
        for (m in HWPretty.ref.findAll(b.text)) {
            append(b.text.substring(last, m.range.first))
            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = brand)) { append(m.value) }
            last = m.range.last + 1
        }
        append(b.text.substring(last))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (b.marker.isNotEmpty()) Text(b.marker, style = ft(Ts.body, FontWeight.Bold), color = Ios.secondaryLabel)
        Text(styled, style = ft(Ts.body), color = Ios.label)
    }
}

@Composable
private fun PhotoStrip(id: String, photos: List<String>, onRemove: ((String) -> Unit)?) {
    val ctx = LocalContext.current
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (p in photos) {
            Box {
                Thumb(HWFiles.file(id, p), Modifier.size(72.dp).clip(RoundedCornerShape(14.dp))
                    .clickable { ru.student.safuhub.ui.kit.Share.open(ctx, HWFiles.file(id, p)) })
                if (onRemove != null) {
                    Box(Modifier.align(Alignment.TopEnd).padding(3.dp).size(20.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.55f))
                        .clickable { onRemove(p) }, contentAlignment = Alignment.Center) { SfIcon("xmark", size = 10.dp, tint = Color.White) }
                }
            }
        }
    }
}

@Composable
private fun Thumb(file: File, modifier: Modifier) {
    val bmp by produceState<android.graphics.Bitmap?>(null, file.path) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val o = BitmapFactory.Options().apply { inSampleSize = 8 }
                BitmapFactory.decodeFile(file.path, o)
            }.getOrNull()
        }
    }
    Box(modifier.background(Ios.label.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else SfIcon("photo", size = 18.dp, tint = Ios.tertiaryLabel)
    }
}

// MARK: - Редактор
// Порядок как в жизни: с какой пары → что задали → когда сдавать. Угадывается всё, что можно угадать

private sealed class DueChoice {
    data class Pair(val skip: Int, val kind: String) : DueChoice()
    data object Tomorrow : DueChoice()
    data object Week : DueChoice()
    data object Custom : DueChoice()
}

private fun defaultChoice(slot: LessonSlot?): DueChoice = when (HWPrefs.defaultDue) {
    "practice" -> DueChoice.Pair(0, "Практика")
    "nextSame" -> DueChoice.Pair(0, slot?.let { KindStyle.of(it.lesson.kind).label } ?: "")
    "skip1" -> DueChoice.Pair(1, "")
    "tomorrow" -> DueChoice.Tomorrow
    "week" -> DueChoice.Week
    else -> DueChoice.Pair(0, "")
}

@Composable
fun HomeworkEditor(route: HWEditorRoute) {
    val dismiss = LocalDismiss.current
    val ctx = LocalContext.current
    val data: ScheduleData = ScheduleStore.data
    val original = route.homework
    val isNew = original == null
    val tomorrowMorning = remember { Cal.setting(Cal.addDays(Instant.now(), 1), 8, 0) }

    val initSlot = remember {
        if (original != null) (if (original.fromPair) HWPlanner.slot(original.subject, original.givenAt, data) else null)
        else route.slot ?: (if (route.subject == null) HWPlanner.suggestedSlot(data) else null)
    }
    var hw by remember {
        mutableStateOf(original ?: Homework.new(initSlot?.lesson?.subject ?: route.subject ?: "", "", tomorrowMorning))
    }
    var slot by remember { mutableStateOf(initSlot) }
    var subject by remember { mutableStateOf(hw.subject) }
    var day by remember { mutableStateOf(Cal.startOfDay(if (original?.fromPair == true) original.givenAt else initSlot?.start ?: Instant.now())) }
    var due by remember { mutableStateOf(if (original != null) (if (original.byPair) DueChoice.Pair(original.skip, original.matchKind) else DueChoice.Custom) else defaultChoice(initSlot)) }
    var customDue by remember { mutableStateOf(original?.due ?: tomorrowMorning) }
    var follow by remember { mutableStateOf(original?.follow ?: HWPrefs.follow) }
    var skipRemote by remember { mutableStateOf(original?.skipRemote ?: if (HWPrefs.defaultDue == "practice") true else HWPrefs.skipRemote) }
    var dueAuto by remember { mutableStateOf(isNew && HWPrefs.defaultDue == "practice") }
    var kindTouched by remember { mutableStateOf(!isNew) }
    var keepAnchor by remember { mutableStateOf(if (original?.byPair == true) original.anchor else null) }
    var newStep by remember { mutableStateOf("") }
    val added = remember { mutableListOf<String>() }
    var showAll by remember { mutableStateOf(false) }
    var customReminder by remember { mutableStateOf(original?.reminders?.custom != null) }

    val trimmedSubject = subject.trim()
    val canSave = hw.text.isNotBlank() || hw.steps.any { it.text.isNotBlank() }
    val anchor: Instant = keepAnchor ?: slot?.let { if (it.start > Instant.now()) it.start.minusSeconds(60) else it.end } ?: Instant.now()

    // пары, к которым можно сдавать
    if (dueAuto && due is DueChoice.Pair) {
        val k = HWPlanner.autoKind(trimmedSubject, anchor, slot?.lesson?.kind, data, skipRemote)
        if ((due as DueChoice.Pair).kind != k || (due as DueChoice.Pair).skip != 0) due = DueChoice.Pair(0, k)
    }
    val anyTargets = remember(trimmedSubject, anchor, skipRemote, data) {
        HWPlanner.targets(trimmedSubject, anchor, null, data, 10, skipRemote)
    }
    val choiceKind = (due as? DueChoice.Pair)?.kind ?: ""
    val choiceSkip = (due as? DueChoice.Pair)?.skip ?: 0
    val kindTargets = remember(trimmedSubject, anchor, skipRemote, choiceKind, data) {
        if (choiceKind.isEmpty()) emptyList() else HWPlanner.targets(trimmedSubject, anchor, choiceKind, data, 8, skipRemote)
    }
    val current = if (choiceKind.isEmpty()) anyTargets else kindTargets
    val resolved: HWTarget? = if (due is DueChoice.Pair) current.getOrNull(choiceSkip) else null
    val weekLater = slot?.let { Cal.addDays(it.start, 7) } ?: Cal.setting(Cal.addDays(Instant.now(), 7), 23, 59)
    val resolvedDue: Instant = when (due) {
        is DueChoice.Pair -> resolved?.start ?: weekLater
        DueChoice.Tomorrow -> {
            val t = Cal.addDays(Instant.now(), 1)
            ScheduleEngine.slots(t, data).firstOrNull()?.start ?: Cal.setting(t, 8, 0)
        }
        DueChoice.Week -> weekLater
        DueChoice.Custom -> customDue
    }

    val camera = rememberCamera { f ->
        if (f != null) {
            HWFiles.save(f, hw.id)?.let { n -> hw = hw.copy(photos = hw.photos + n); added += n; Haptics.success() }
            f.delete()
        }
    }
    val gallery = rememberMediaPicker(multiple = true) { uris ->
        for (u in uris) {
            val tmp = File(ctx.cacheDir, "hw-pick-${System.nanoTime()}.jpg")
            runCatching { ctx.contentResolver.openInputStream(u)?.use { i -> tmp.outputStream().use { i.copyTo(it) } } }
            HWFiles.save(tmp, hw.id)?.let { n -> hw = hw.copy(photos = hw.photos + n); added += n }
            tmp.delete()
        }
    }

    fun build(): Homework {
        var n = hw.copy(subject = trimmedSubject, fromPair = slot != null, follow = follow, skipRemote = skipRemote)
        slot?.let { n = n.copy(givenAt = it.start, givenKind = it.lesson.kind) }
        n = when (due) {
            is DueChoice.Pair -> {
                val t = resolved
                if (t != null) n.copy(rule = "pair", anchor = anchor, skip = choiceSkip, matchKind = choiceKind, due = t.start,
                    dueKind = t.kind, dueRoom = t.room, dueEstimated = t.estimated)
                else n.copy(rule = "date", due = weekLater, dueKind = "", dueRoom = "", dueEstimated = false)
            }
            else -> n.copy(rule = "date", due = resolvedDue, dueKind = "", dueRoom = "", dueEstimated = false)
        }
        if (!customReminder) n = n.copy(reminders = n.reminders.copy(custom = null))
        return n.copy(steps = n.steps.filter { it.text.isNotBlank() }, shiftNote = if (original != null && original.due != n.due) "" else n.shiftNote)
    }

    fun save(close: Boolean = true): Homework? {
        if (!canSave) return null
        val n = build()
        Permissions.requestNotifications()
        HomeworkStore.upsert(n)
        Haptics.success()
        if (close) dismiss()
        return n
    }

    fun cancel() {
        // новые фото несохранённого ДЗ не копим
        if (isNew) added.forEach { HWFiles.remove(hw.id, it) }
        dismiss()
    }

    FormScreen(if (isNew) "Новое ДЗ" else "ДЗ",
        leading = { BarButton("Отмена") { cancel() } },
        trailing = { BarButton("Сохранить", bold = true, enabled = canSave) { save() } }) {

        // 1. С какой пары
        FormSection("С какой пары", footer = if (slot == null && trimmedSubject.isEmpty()) "Выбери пару — срок посчитается по расписанию." else null) {
            raw {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    // полоска дней: неделя назад и неделя вперёд
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (off in -7..7) {
                            val d = Cal.startOfDay(Cal.addDays(Instant.now(), off))
                            val sel = Cal.isSameDay(d, day)
                            val has = ScheduleEngine.slots(d, data).isNotEmpty()
                            Column(Modifier.clip(RoundedCornerShape(12.dp)).background(if (sel) Brand.color else Ios.label.copy(alpha = 0.06f))
                                .clickable { Haptics.tap(); day = d }.padding(horizontal = 10.dp, vertical = 6.dp),
                                horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(Fmt.format(d, "EE").lowercase(RU), style = ft(Ts.caption2, FontWeight.SemiBold), color = if (sel) Color.White else Ios.secondaryLabel)
                                Text("${Cal.day(d)}", style = ft(Ts.subheadline, FontWeight.Bold), color = if (sel) Color.White else if (has) Ios.label else Ios.tertiaryLabel)
                            }
                        }
                    }
                    val daySlots = ScheduleEngine.slots(day, data)
                    if (daySlots.isEmpty()) Text("В этот день пар нет", style = ft(Ts.footnote), color = Ios.secondaryLabel)
                    for (s in daySlots) {
                        val sel = slot?.start == s.start && slot?.lesson?.subject == s.lesson.subject
                        val c = SubjectColor.color(s.lesson.subject)
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (sel) c.copy(alpha = 0.16f) else Color.Transparent)
                            .clickable {
                                Haptics.tap()
                                slot = s; subject = s.lesson.subject; keepAnchor = null
                            }.padding(horizontal = 8.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.size(4.dp, 30.dp).clip(RoundedCornerShape(2.dp)).background(c))
                            Column(Modifier.weight(1f)) {
                                Text(s.lesson.subject, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1)
                                Text("${hm(s.start)} · ${KindStyle.of(s.lesson.kind).label.lowercase(RU)}" + if (s.lesson.room.isNotEmpty()) " · ауд. ${s.lesson.room}" else "",
                                    style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1)
                            }
                            if (sel) SfIcon("checkmark.circle.fill", size = 20.dp, tint = c)
                        }
                    }
                }
            }
            field("Предмет (если пары нет в расписании)", subject, { subject = it; if (slot?.lesson?.subject != it) slot = null })
            if (slot == null && trimmedSubject.isEmpty()) {
                val subjects = ScheduleQuery.subjects(data)
                if (subjects.isNotEmpty()) raw {
                    FlowRow(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (s in subjects.take(16)) Chip(s, selected = false, color = SubjectColor.color(s)) { subject = s }
                    }
                }
            }
        }

        // 2. Что задали
        FormSection("Что задали") {
            row {
                IosTextField(hw.text, { t ->
                    hw = hw.copy(text = t)
                    if (!kindTouched && HWPrefs.guessKind) HWKind.guess(t)?.let { hw = hw.copy(kind = it.raw) }
                }, "Например: № 5, 6 стр. 45 или «1) … 2) …»", Modifier.weight(1f), singleLine = false, minLines = 3)
            }
            raw {
                FlowRow(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (k in HWKind.entries) Chip(k.title, icon = k.icon, selected = hw.kind == k.raw, color = k.color) { kindTouched = true; hw = hw.copy(kind = k.raw) }
                }
            }
            for (st in hw.steps) row {
                SfIcon(if (st.done) "checkmark.circle.fill" else "circle", size = 20.dp, tint = if (st.done) Brand.color else Ios.secondaryLabel,
                    modifier = Modifier.clickable { hw = hw.copy(steps = hw.steps.map { if (it.id == st.id) it.copy(done = !it.done) else it }) })
                Spacer(Modifier.width(10.dp))
                IosTextField(st.text, { t -> hw = hw.copy(steps = hw.steps.map { if (it.id == st.id) it.copy(text = t) else it }) }, "Пункт", Modifier.weight(1f))
                SfIcon("minus.circle.fill", size = 20.dp, tint = Ios.red, modifier = Modifier.clickable { hw = hw.copy(steps = hw.steps.filter { it.id != st.id }) })
            }
            row {
                SfIcon("plus.circle.fill", size = 20.dp, tint = Brand.color)
                Spacer(Modifier.width(10.dp))
                IosTextField(newStep, { newStep = it }, "Добавить пункт", Modifier.weight(1f), onDone = {
                    if (newStep.isNotBlank()) { hw = hw.copy(steps = hw.steps + HWStep(text = newStep.trim())); newStep = "" }
                })
                if (newStep.isNotBlank()) TextButton({ hw = hw.copy(steps = hw.steps + HWStep(text = newStep.trim())); newStep = "" }) {
                    Text("Добавить", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
                }
            }
        }

        // 3. Когда сдавать
        FormSection("Когда сдавать", footer = when {
            due is DueChoice.Pair && resolved == null -> "Пары по этому предмету впереди не нашлось — срок встанет через неделю. Можно выбрать дату вручную."
            resolved?.estimated == true -> "≈ РУЗ ещё не выложил эту неделю: срок посчитан по прошлым неделям и уточнится сам."
            due is DueChoice.Pair && follow -> "Если пару перенесут или отменят, срок переедет вместе с ней."
            else -> null
        }) {
            raw {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    // итог крупно
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SfIcon("calendar", size = 22.dp, tint = HWFormat.urgency(resolvedDue, false, Brand.color, Ios.secondaryLabel))
                        Column(Modifier.weight(1f)) {
                            Text((if (resolved?.estimated == true) "≈ " else "") + HWFormat.dayTime(resolvedDue).capitalizedFirstLetter(),
                                style = ft(Ts.headline, FontWeight.Bold), color = Ios.label)
                            val t = resolved
                            if (t != null) Text(KindStyle.of(t.kind).label + if (t.room.isNotEmpty()) " · ауд. ${t.room}" else "",
                                style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        val autoK = HWPlanner.autoKind(trimmedSubject, anchor, slot?.lesson?.kind, data, skipRemote)
                        Chip(HWPlanner.autoTitle(autoK), icon = "sparkles", selected = dueAuto) { dueAuto = true; due = DueChoice.Pair(0, autoK) }
                        Chip("К следующей паре", selected = !dueAuto && due == DueChoice.Pair(0, "")) { dueAuto = false; due = DueChoice.Pair(0, "") }
                        Chip("Через одну", selected = !dueAuto && due == DueChoice.Pair(1, "")) { dueAuto = false; due = DueChoice.Pair(1, "") }
                        val kinds = anyTargets.map { KindStyle.of(it.kind).label }.distinct()
                        if (kinds.size > 1) for (k in kinds) {
                            val title = when (k) {
                                "Лекция" -> "К лекции"; "Практика" -> "К практике"; "Лабораторная" -> "К лабораторной"; "Семинар" -> "К семинару"
                                else -> "К «$k»"
                            }
                            Chip(title, selected = !dueAuto && due == DueChoice.Pair(0, k)) { dueAuto = false; due = DueChoice.Pair(0, k) }
                        }
                        Chip("Завтра", selected = due == DueChoice.Tomorrow) { dueAuto = false; due = DueChoice.Tomorrow }
                        Chip("Через неделю", selected = due == DueChoice.Week) { dueAuto = false; due = DueChoice.Week }
                        Chip("Своя дата", icon = "calendar", selected = due == DueChoice.Custom) { dueAuto = false; customDue = resolvedDue; due = DueChoice.Custom }
                    }
                    // какая именно пара: можно выбрать любую из ближайших
                    if (due is DueChoice.Pair && current.size > 1) {
                        val shown = if (showAll) current else current.take(4)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            shown.forEachIndexed { i, t ->
                                val sel = i == choiceSkip
                                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if (sel) Brand.color.copy(alpha = 0.14f) else Color.Transparent)
                                    .clickable { dueAuto = false; due = DueChoice.Pair(i, choiceKind) }.padding(8.dp),
                                    verticalAlignment = Alignment.CenterVertically) {
                                    Text((if (t.estimated) "≈ " else "") + HWFormat.dayTime(t.start).capitalizedFirstLetter() + " · " +
                                        KindStyle.of(t.kind).label.lowercase(RU), style = ft(Ts.footnote), color = Ios.label, modifier = Modifier.weight(1f))
                                    if (sel) SfIcon("checkmark", size = 14.dp, tint = Brand.color)
                                }
                            }
                            if (current.size > 4) TextButton({ showAll = !showAll }) {
                                Text(if (showAll) "Свернуть" else "Ещё пары", style = ft(Ts.footnote, FontWeight.SemiBold), color = Brand.color)
                            }
                        }
                    }
                }
            }
            if (due == DueChoice.Custom) date("Срок", customDue, { customDue = it }, DateMode.DATE_TIME)
            if (due is DueChoice.Pair) {
                toggle("Следить за расписанием", follow, { follow = it }, subtitle = "Пару перенесли — срок переезжает с ней")
                val subjKey = HWPlanner.key(trimmedSubject)
                if (subjKey.isNotEmpty() && ScheduleQuery.slots(data, days = 21).any { HWPlanner.key(it.lesson.subject) == subjKey && it.isRemote }) {
                    toggle("Не сдавать на дистанте", skipRemote, { skipRemote = it }, subtitle = "Срок встанет на ближайшую очную пару")
                }
            }
        }

        // 4. Напоминания
        FormSection("Напоминания") {
            toggle("Вечером накануне, ${String.format("%d:%02d", HWPrefs.eveningHour, HWPrefs.eveningMinute)}", hw.reminders.evening,
                { hw = hw.copy(reminders = hw.reminders.copy(evening = it)) })
            toggle("Утром в день сдачи, ${String.format("%d:%02d", HWPrefs.morningHour, HWPrefs.morningMinute)}", hw.reminders.morning,
                { hw = hw.copy(reminders = hw.reminders.copy(morning = it)) })
            toggle("За час до срока", hw.reminders.hourBefore, { hw = hw.copy(reminders = hw.reminders.copy(hourBefore = it)) })
            toggle("Своё время", customReminder, {
                customReminder = it
                hw = hw.copy(reminders = hw.reminders.copy(custom = if (it) (hw.reminders.custom ?: resolvedDue.minusSeconds(3 * 3600)) else null))
            })
            if (customReminder) date("Напомнить", hw.reminders.custom ?: resolvedDue.minusSeconds(3 * 3600),
                { hw = hw.copy(reminders = hw.reminders.copy(custom = it)) }, DateMode.DATE_TIME)
        }

        // 5. Ещё
        FormSection("Ещё") {
            toggle("Важное", hw.important, { hw = hw.copy(important = it) }, icon = "star.fill")
            row { IosTextField(hw.note, { hw = hw.copy(note = it) }, "Заметка: где взять методичку, кому сдавать…", Modifier.weight(1f), singleLine = false, minLines = 2) }
            if (hw.photos.isNotEmpty()) raw {
                Box(Modifier.padding(12.dp)) {
                    PhotoStrip(hw.id, hw.photos) { p -> hw = hw.copy(photos = hw.photos - p); if (p in added) HWFiles.remove(hw.id, p) }
                }
            }
            button("Сфотографировать задание", "camera.fill") { camera.open() }
            button("Фото из галереи", "photo.on.rectangle") { gallery.images() }
        }

        // 6. Управление (для записанного ДЗ)
        if (!isNew && original != null) {
            FormSection {
                button(if (original.done) "Вернуть в работу" else "Отметить сделанным", if (original.done) "arrow.uturn.backward" else "checkmark.circle") {
                    HomeworkStore.toggle(original.id); dismiss()
                }
                button("Дублировать", "plus.square.on.square") { HomeworkStore.duplicate(original.id); dismiss() }
                button("Удалить ДЗ", "trash", destructive = true) {
                    Dialogs.confirm("Удалить это ДЗ?", button = "Удалить") { HomeworkStore.delete(original.id); dismiss() }
                }
            }
        }

        // записал — и сразу в чат группы
        FormSection {
            button(if (isNew) "Сохранить и отправить ребятам" else "Отправить ребятам", "paperplane.fill", enabled = canSave) {
                save(close = true)?.let { shareHomework(ctx, it) }
            }
            if (isNew) button("Сохранить и записать ещё", "plus.square.on.square", enabled = canSave) {
                if (save(close = false) != null) {
                    Dialogs.showToast("ДЗ сохранено", "checkmark.circle.fill")
                    hw = Homework.new(trimmedSubject, "", tomorrowMorning)
                    added.clear()
                    kindTouched = false
                }
            }
        }
    }
}

@Composable
private fun Chip(title: String, icon: String? = null, selected: Boolean, color: Color = Brand.color, onClick: () -> Unit) {
    Row(Modifier.clip(CircleShape).background(if (selected) Brush.linearGradient(listOf(color, color.copy(alpha = 0.8f)))
        else Brush.linearGradient(listOf(Ios.label.copy(alpha = 0.07f), Ios.label.copy(alpha = 0.07f))))
        .clickable { Haptics.tap(); onClick() }.padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        if (icon != null) SfIcon(icon, size = 13.dp, tint = if (selected) Color.White else Ios.label)
        Text(title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = if (selected) Color.White else Ios.label, maxLines = 1)
    }
}

// MARK: - Настройки домашки

@Composable
fun HomeworkSettingsSheet(data: ScheduleData) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        var defaultDue by prefString("hw.defaultDue", "practice")
        var follow by prefBool("hw.follow", true)
        var skipRemote by prefBool("hw.skipRemote", true)
        var notifyShift by prefBool("hw.notifyShift", true)
        var remindEvening by prefBool("hw.remind.evening", true)
        var remindMorning by prefBool("hw.remind.morning", false)
        var remindHour by prefBool("hw.remind.hour", true)
        var ask by prefBool("hw.ask", false)
        var askDelay by prefInt("hw.ask.delay", 3)
        var askLecture by prefBool("hw.ask.lecture", false)
        var askPractice by prefBool("hw.ask.practice", true)
        var askLab by prefBool("hw.ask.lab", true)
        var askSeminar by prefBool("hw.ask.seminar", true)
        var guessKind by prefBool("hw.guessKind", true)
        var celebrate by prefBool("hw.celebrate", true)
        var badge by prefBool("hw.badge", true)
        var homeCount by prefInt("hw.home.count", 3)
        var keepDone by prefInt("hw.keepDone", 30)
        val askChanged = { HWAsk.schedule(data) }

        fun timeOf(hk: String, mk: String, dh: Int, dm: Int) = Cal.setting(Instant.now(), Defaults.intOrNull(hk) ?: dh, Defaults.intOrNull(mk) ?: dm)
        fun setTime(hk: String, mk: String, t: Instant) {
            Defaults.set(hk, Cal.hour(t)); Defaults.set(mk, Cal.minute(t)); HomeworkStore.rescheduleAll()
        }

        FormScreen("Настройки домашки", trailing = { BarButton("Готово", bold = true) { dismiss() } }) {
            FormSection("Сроки", footer = "«К следующей очной практике»: срок сам встаёт на ближайшую практику предмета не на дистанте; если ДЗ задали на лабораторной или семинаре — на следующую такую же пару, а если практик у предмета нет — на ближайшую очную пару. Если пару перенесут или отменят, срок переедет на новую пару. Если РУЗ ещё не выложил следующую неделю, срок считается по прошлым неделям (помечен «≈») и уточнится сам.") {
                picker("Срок по умолчанию", listOf(
                    "practice" to "К следующей очной практике", "next" to "К любой следующей паре", "nextSame" to "К такой же паре",
                    "skip1" to "Через одну пару", "tomorrow" to "Завтра", "week" to "Через неделю"
                ), defaultDue, { defaultDue = it })
                toggle("Пропускать дистанционные пары", skipRemote, { skipRemote = it })
                toggle("Следить за расписанием", follow, { follow = it; if (it) HomeworkStore.reconcile(data) })
                toggle("Сообщать, когда срок сдвинулся", notifyShift, { notifyShift = it }, enabled = follow)
            }
            FormSection("Напоминания для нового ДЗ", footer = "У каждого ДЗ напоминания можно поменять отдельно. Новое время «вечером» и «утром» сразу применяется ко всем открытым заданиям.") {
                toggle("Вечером накануне", remindEvening, { remindEvening = it })
                if (remindEvening) date("Во сколько вечером", timeOf("hw.eveningHour", "hw.eveningMinute", 20, 0),
                    { setTime("hw.eveningHour", "hw.eveningMinute", it) }, DateMode.TIME)
                toggle("Утром в день сдачи", remindMorning, { remindMorning = it })
                if (remindMorning) date("Во сколько утром", timeOf("hw.morningHour", "hw.morningMinute", 7, 30),
                    { setTime("hw.morningHour", "hw.morningMinute", it) }, DateMode.TIME)
                toggle("За час до срока", remindHour, { remindHour = it })
            }
            FormSection("Чтобы не забыть записать", footer = "После пары придёт уведомление. Нажмёшь — откроется запись ДЗ уже с этой парой и сроком.") {
                toggle("Спрашивать после пары «Что задали?»", ask, { ask = it; if (it) Permissions.requestNotifications(); askChanged() })
                if (ask) {
                    toggle("После лекций", askLecture, { askLecture = it; askChanged() })
                    toggle("После практик", askPractice, { askPractice = it; askChanged() })
                    toggle("После лабораторных", askLab, { askLab = it; askChanged() })
                    toggle("После семинаров", askSeminar, { askSeminar = it; askChanged() })
                    stepper("Через $askDelay мин после конца", askDelay, { askDelay = it; askChanged() }, 0..30)
                }
            }
            FormSection("Удобство") {
                toggle("Угадывать тип задания по тексту", guessKind, { guessKind = it })
                toggle("Счётчик на вкладке", badge, { badge = it })
                toggle("Салют, когда сделал", celebrate, { celebrate = it })
                stepper("На главной: $homeCount ${HWText.plural(homeCount, "задание", "задания", "заданий")}", homeCount, { homeCount = it }, 1..8)
                picker("Хранить сделанное", listOf(7 to "Неделю", 14 to "2 недели", 30 to "Месяц", 90 to "3 месяца", 0 to "Всегда"), keepDone, { keepDone = it })
            }
            FormSection("Данные", footer = "ДЗ хранится на телефоне, попадает в резервную копию и синхронизируется с Арктикой на компьютере.") {
                info("Открыто", "${HomeworkStore.active.size}")
                info("Сделано", "${HomeworkStore.finished.size}")
                button("Удалить всё сделанное", destructive = true, enabled = HomeworkStore.finished.isNotEmpty()) {
                    Dialogs.confirm("Удалить всё сделанное ДЗ?", button = "Удалить") { HomeworkStore.clearFinished() }
                }
            }
        }
    }
}
