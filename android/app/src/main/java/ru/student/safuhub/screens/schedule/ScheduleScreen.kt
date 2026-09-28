package ru.student.safuhub.screens.schedule

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.core.newId
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.Academic
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.Bells
import ru.student.safuhub.data.Building
import ru.student.safuhub.data.Lesson
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.RuzClient
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.StudyTask
import ru.student.safuhub.data.TaskStore
import ru.student.safuhub.data.WeekKey
import ru.student.safuhub.feature.board.BoardBatch
import ru.student.safuhub.feature.board.BoardBatchScreen
import ru.student.safuhub.feature.board.BoardPhoto
import ru.student.safuhub.feature.board.LessonPhotos
import ru.student.safuhub.feature.calendar.CalendarExporter
import ru.student.safuhub.feature.features.Maps
import ru.student.safuhub.feature.pins.SubjectPinsStrip
import ru.student.safuhub.screens.attendance.AttendanceScreen
import ru.student.safuhub.screens.tasks.TaskEditorSheet
import ru.student.safuhub.screens.tools.Tool
import ru.student.safuhub.screens.tools.ToolSheet
import ru.student.safuhub.system.LiveFormat
import ru.student.safuhub.system.rememberCamera
import ru.student.safuhub.ui.design.CircleIconButton
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindBadge
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.design.ProgressBar
import ru.student.safuhub.ui.design.ProgressRing
import ru.student.safuhub.ui.design.PulsingDot
import ru.student.safuhub.ui.design.ScreenHeader
import ru.student.safuhub.ui.design.SectionTitle
import ru.student.safuhub.ui.design.SpinningIcon
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.design.rememberNow
import ru.student.safuhub.ui.design.scrollFX
import ru.student.safuhub.ui.design.staggerIn
import ru.student.safuhub.ui.design.strokeBorder
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.BarIcon
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.ScrollPage
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant
import kotlin.math.abs
import kotlin.math.ceil

private fun hm(d: Instant) = LiveFormat.hmText(d)

/** Сегодняшний день 1…6 (в воскресенье показываем понедельник следующей недели) */
private val todayIndex: Int
    get() {
        val wd = ScheduleEngine.weekday(Instant.now())
        return if (wd == 7) 1 else wd
    }

private val baseMonday: Instant
    get() {
        val monday = WeekKey.monday(Instant.now())
        return if (ScheduleEngine.weekday(Instant.now()) == 7) Cal.addDays(monday, 7) else monday
    }

private fun dateFor(d: Int, offset: Int): Instant = Cal.addDays(baseMonday, offset * 7 + d - 1)

// MARK: - Экран расписания

@Composable
fun ScheduleScreen() {
    val ctx = LocalContext.current
    val data = ScheduleStore.data
    var day by remember { mutableIntStateOf(todayIndex) }
    var weekOffset by remember { mutableIntStateOf(0) }
    var forward by remember { mutableStateOf(true) }
    val editing = remember { mutableStateOf<Lesson?>(null) }
    val detail = remember { mutableStateOf<LessonSlot?>(null) }
    val showBuildings = remember { mutableStateOf(false) }
    val showExport = remember { mutableStateOf(false) }
    val showSettings = remember { mutableStateOf(false) }
    val showChanges = remember { mutableStateOf(false) }
    val tool = remember { mutableStateOf<Tool?>(null) }

    SheetItem(editing) { l ->
        LessonEditorSheet(l, isNew = !ScheduleStore.contains(l), buildings = ScheduleStore.data.buildings,
            onSave = { ScheduleStore.upsert(it) }, onDelete = { ScheduleStore.delete(l) })
    }
    SheetItem(detail) { s -> LessonDetailSheet(s, isManual = !ScheduleStore.data.usesRuz, onEdit = { editing.value = s.lesson }) }
    SheetBinding(showBuildings) { BuildingsSheet() }
    SheetBinding(showExport) { ExportSheet() }
    SheetBinding(showSettings) { ScheduleSettingsSheet() }
    SheetBinding(showChanges) { ChangesSheet() }
    SheetItem(tool) { t -> ToolSheet(t) }

    val selectedDate = dateFor(day, weekOffset)
    val isToday = weekOffset == 0 && day == todayIndex

    LaunchedEffect(Unit) { ScheduleStore.sync() }
    LaunchedEffect(weekOffset) {
        if (weekOffset < 0 && ScheduleStore.data.usesRuz) ScheduleStore.loadArchiveWeek(dateFor(1, weekOffset))
    }

    fun shiftDays(delta: Int) {
        var d = day + delta
        var w = weekOffset
        if (d < 1) { d = 6; w -= 1 }
        if (d > 6) { d = 1; w += 1 }
        forward = delta > 0
        Haptics.tap()
        day = d; weekOffset = w
    }

    fun shiftWeeks(delta: Int) {
        forward = delta > 0
        Haptics.tap()
        val n = weekOffset + delta
        weekOffset = n
        // другая неделя всегда открывается с понедельника, своя — с сегодняшнего дня
        day = if (n == 0) todayIndex else 1
    }

    fun goToday() {
        forward = weekOffset < 0 || (weekOffset == 0 && day < todayIndex)
        Haptics.tap()
        weekOffset = 0
        day = todayIndex
    }

    val weekCaption = if (data.usesRuz) {
        if (data.ruzGroupNumber.isEmpty()) "РУЗ" else "Группа ${data.ruzGroupNumber} · РУЗ"
    } else {
        Academic.week(data.semesterStart, selectedDate)?.let { w -> "Неделя $w · ${if (w % 2 == 0) "чётная" else "нечётная"}" } ?: "Вне семестра"
    }

    fun dayShareText(): String {
        val slots = ScheduleEngine.slots(selectedDate, data)
        val lines = mutableListOf("📅 " + Fmt.format(selectedDate, "EEEE, d MMMM").capitalizedFirstLetter())
        if (slots.isEmpty()) lines.add("Пар нет")
        for (s in slots) {
            val place = listOf(if (s.lesson.room.isEmpty()) "" else "ауд. ${s.lesson.room}", AddressFormat.full(s.address)).filter { it.isNotEmpty() }.joinToString(", ")
            lines.add("${s.lesson.pair}. ${hm(s.start)}–${hm(s.end)} ${s.lesson.subject} (${KindStyle.of(s.lesson.kind).label.lowercase(RU)})" + if (place.isEmpty()) "" else " — $place")
        }
        return lines.joinToString("\n")
    }

    ScrollPage(spacing = 18.dp, onRefresh = { ScheduleStore.sync(force = true) }) {
        ScreenHeader(weekCaption, "Пары") {
            IosMenu(items = {
                if (data.usesRuz) {
                    item("Обновить из РУЗ", "arrow.clockwise") { AppScope.launch { ScheduleStore.sync(force = true) } }
                    if (data.ruzGroupID.isNotEmpty()) item("Открыть группу в РУЗ", "safari") { Share.url(ctx, RuzClient.timetableURL(data.ruzGroupID)) }
                    item("Коды корпусов и адреса", "building.2") { showBuildings.value = true }
                } else {
                    item("Добавить пару", "plus") { editing.value = Lesson(subject = "", weekday = day, pair = 1) }
                    item("Корпуса и адреса", "building.2") { showBuildings.value = true }
                }
                item("В календарь телефона", "calendar.badge.plus") { showExport.value = true }
                divider()
                item("Сессия", "graduationcap") { tool.value = Tool.SESSION }
                item("Предметы", "books.vertical") { tool.value = Tool.SUBJECTS }
                item("Преподаватели", "person.2") { tool.value = Tool.TEACHERS }
                item("Карта корпусов", "map") { tool.value = Tool.MAP }
                item("Журнал изменений", "clock.arrow.circlepath") { showChanges.value = true }
                item("Отправить расписание дня", "square.and.arrow.up") { Share.text(ctx, dayShareText()) }
                divider()
                item("Настройки расписания", "slider.horizontal.3") { showSettings.value = true }
            }) { CircleIconButton("ellipsis") }
        }

        if (data.usesRuz) SyncChip()

        AnimatedVisibility(ScheduleStore.changes.isNotEmpty()) {
            Pressable({ ScheduleStore.markChangesSeen(); showChanges.value = true }, Modifier.fillMaxWidth()) {
                Glass(18.dp, Modifier.fillMaxWidth(), interactive = true) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SfIcon("exclamationmark.arrow.triangle.2.circlepath", size = 20.dp,
                            tint = if (ScheduleStore.unseenChanges > 0) Ios.orange else Ios.secondaryLabel)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text(if (ScheduleStore.unseenChanges > 0) "Расписание изменилось: ${ScheduleStore.unseenChanges}" else "Журнал изменений",
                                style = ft(Ts.subheadline, FontWeight.Bold), color = Ios.label)
                            Text(ScheduleStore.changes.firstOrNull()?.text ?: "", style = ft(Ts.caption), color = Ios.secondaryLabel,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        SfIcon("chevron.right", size = 13.dp, tint = Ios.secondaryLabel)
                    }
                }
            }
        }

        if (ScheduleStore.isConfigured) {
            WeekNavigator(weekOffset, isToday, onPrev = { shiftWeeks(-1) }, onNext = { shiftWeeks(1) }, onToday = { goToday() })
            DaySelector(day, weekOffset, data) { d ->
                Haptics.tap()
                forward = d > day
                day = d
            }
            var dragX by remember { mutableFloatStateOf(0f) }
            AnimatedContent(
                targetState = Triple(weekOffset, day, data.ruzEvents.size),
                transitionSpec = {
                    (slideInHorizontally(spring(dampingRatio = 0.85f, stiffness = 300f)) { if (forward) it else -it } + fadeIn()) togetherWith fadeOut()
                },
                modifier = Modifier.fillMaxWidth().pointerInput(Unit) {
                    detectHorizontalDragGestures(
                        onDragStart = { dragX = 0f },
                        onHorizontalDrag = { _, dx -> dragX += dx },
                        onDragEnd = { if (abs(dragX) > 60 * density) shiftDays(if (dragX < 0) 1 else -1) },
                    )
                },
                label = "day",
            ) { (w, d, _) ->
                DayContent(dateFor(d, w), onDetail = { detail.value = it }, onEdit = { editing.value = it })
            }
            BellsCard()
        } else {
            SetupCard(onManual = { editing.value = Lesson(subject = "", weekday = day, pair = 1) })
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SyncChip() {
    Pressable({ AppScope.launch { ScheduleStore.sync(force = true) } }, Modifier.fillMaxWidth()) {
        Glass(16.dp, Modifier.fillMaxWidth(), interactive = true) {
            Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SpinningIcon(ScheduleStore.syncing, size = 14.dp)
                Text(if (ScheduleStore.syncing) "Обновляю из РУЗ…" else ScheduleStore.lastSyncText.capitalizedFirstLetter(),
                    style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label)
                val info = ScheduleStore.data.syncInfo
                if (info.isNotEmpty() && !ScheduleStore.syncing) {
                    Text("· $info", style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false))
                }
            }
        }
    }
}

@Composable
private fun WeekNavigator(weekOffset: Int, isToday: Boolean, onPrev: () -> Unit, onNext: () -> Unit, onToday: () -> Unit) {
    val title = when (weekOffset) {
        0 -> "Эта неделя"
        -1 -> "Прошлая неделя"
        1 -> "Следующая неделя"
        else -> if (weekOffset < 0) "${-weekOffset} нед. назад" else "Через $weekOffset нед."
    }
    val range = "${Fmt.format(dateFor(1, weekOffset), "d MMM")} – ${Fmt.format(dateFor(6, weekOffset), "d MMM")}"
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        ArrowButton("chevron.left", onPrev)
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = ft(Ts.subheadline, FontWeight.Bold), color = Ios.label)
            Text(range, style = ft(Ts.caption), color = Ios.secondaryLabel)
        }
        AnimatedVisibility(!isToday, enter = scaleIn() + fadeIn(), exit = scaleOut() + fadeOut()) {
            Pressable(onToday) {
                Box(Modifier.height(32.dp).clip(CircleShape).background(Brand.gradient).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Сегодня", style = ft(Ts.caption, FontWeight.Bold), color = Color.White)
                }
            }
        }
        ArrowButton("chevron.right", onNext)
    }
}

@Composable
private fun ArrowButton(icon: String, onClick: () -> Unit) {
    Pressable(onClick) {
        Glass(20.dp, Modifier.size(40.dp), interactive = true, contentAlignment = Alignment.Center) {
            SfIcon(icon, size = 17.dp, tint = Ios.label)
        }
    }
}

@Composable
private fun DaySelector(day: Int, weekOffset: Int, data: ScheduleData, onSelect: (Int) -> Unit) {
    Glass(22.dp, Modifier.fillMaxWidth()) {
        BoxWithConstraints(Modifier.fillMaxWidth().padding(6.dp)) {
            val gap = 4.dp
            val cell = (maxWidth - gap * 5) / 6
            val x by animateDpAsState((cell + gap) * (day - 1), spring(dampingRatio = 0.8f, stiffness = 400f), label = "day")
            Box(Modifier.offset(x = x).width(cell).height(66.dp).clip(RoundedCornerShape(16.dp)).background(Brand.gradient))
            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                for (d in 1..6) {
                    val date = dateFor(d, weekOffset)
                    val sel = day == d
                    val has = ScheduleEngine.slots(date, data).isNotEmpty()
                    val fg = if (sel) Color.White else Ios.label
                    Column(Modifier.width(cell).height(66.dp).clickable(remember { MutableInteractionSource() }, null) { onSelect(d) },
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically)) {
                        Text(Lesson.dayNames[d - 1], style = ft(Ts.caption, FontWeight.SemiBold), color = fg)
                        Text("${Cal.day(date)}", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED).let {
                            if (weekOffset == 0 && d == todayIndex && !sel) it.copy(textDecoration = TextDecoration.Underline) else it
                        }, color = fg)
                        Box(Modifier.size(5.dp).clip(CircleShape).background(if (has) (if (sel) Color.White else Brand.color) else Color.Transparent))
                    }
                }
            }
        }
    }
}

@Composable
private fun DayContent(date: Instant, onDetail: (LessonSlot) -> Unit, onEdit: (Lesson) -> Unit) {
    val ctx = LocalContext.current
    val data = ScheduleStore.data
    val slots = ScheduleEngine.slots(date, data)
    val today = Cal.startOfDay(Instant.now())
    val isPastUnknown = data.usesRuz && date < today && !ScheduleStore.hasEvents(date)
    fun openMap(address: String) {
        if (address.isEmpty()) return
        val u = Maps.smartURL(address) ?: return
        Haptics.tap()
        Share.url(ctx, u)
    }
    if (slots.isEmpty()) {
        val busy = ScheduleStore.syncing || ScheduleStore.loadingWeek
        val text = when {
            isPastUnknown -> {
                val since = ScheduleStore.memorySince?.let { " Сейчас в памяти всё с ${Fmt.format(it, "d MMMM")}." } ?: ""
                "РУЗ показывает только текущую и будущие недели, а приложение запоминает расписание с момента подключения. Каждая следующая неделя сохранится автоматически.$since"
            }
            data.usesRuz -> {
                val last = data.ruzEvents.lastOrNull()?.start
                if (last != null && date > last && !Cal.isSameDay(date, last)) "РУЗ пока не выложил пары на эти даты." else "В этот день свободно."
            }
            else -> "В этот день свободно."
        }
        EmptyState(if (busy) "arrow.triangle.2.circlepath" else if (isPastUnknown) "clock.badge.questionmark" else "sun.max.fill",
            if (busy) "Ищу в РУЗ…" else if (isPastUnknown) "Эта неделя не сохранена" else "Пар нет", text)
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (!data.usesRuz && data.isArchived(date)) {
                IconLabel("Расписание из архива: так было на этой неделе", "clock.arrow.circlepath", style = ft(Ts.caption, FontWeight.SemiBold),
                    color = Ios.secondaryLabel)
            }
            if (data.usesRuz && date < today) {
                IconLabel("Из памяти приложения", "externaldrive.fill.badge.checkmark", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
            }
            slots.forEachIndexed { index, s ->
                ContextMenuBox(items = {
                    if (!data.usesRuz) item("Изменить", "pencil") { onEdit(s.lesson) }
                    if (s.address.isNotEmpty()) {
                        item("Яндекс Карты", "map") { openMap(s.address) }
                        item("Google Карты", "map.fill") { Maps.googleURL(s.address)?.let { Share.url(ctx, it) } }
                    }
                    if (!data.usesRuz) item("Удалить", "trash", destructive = true) { ScheduleStore.delete(s.lesson) }
                }, modifier = Modifier.staggerIn(index), onClick = { Haptics.tap(); onDetail(s) }) {
                    SlotRow(s, onMap = { openMap(s.address) })
                }
            }
        }
    }
}

@Composable
private fun BellsCard() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.scrollFX()) {
        SectionTitle("Звонки")
        Glass(22.dp, Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (p in 1..Bells.times.size) {
                    Row {
                        Text("$p пара", style = ft(Ts.subheadline), color = Ios.secondaryLabel, modifier = Modifier.weight(1f))
                        Text(Bells.label(p), style = ft(Ts.subheadline, FontWeight.SemiBold, mono = true), color = Ios.label)
                    }
                }
                Text("После 3-й пары обед 55 минут.", style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
        }
    }
}

// MARK: - Журнал изменений

@Composable
fun ChangesSheet() {
    val ctx = LocalContext.current
    NavigationStack {
        val dismiss = LocalDismiss.current
        val changes = ScheduleStore.changes
        fun shareText(): String {
            val list = changes.filter { it.date > Instant.now().minusSeconds(86_400) }.take(10)
            val body = list.joinToString("\n") { "• " + it.text }
            return "📢 Изменения в расписании (РУЗ):\n" + body.ifEmpty { "—" }
        }
        FormScreen("Изменения",
            leading = { BarButton("Очистить", enabled = changes.isNotEmpty()) { ScheduleStore.clearChanges() } },
            trailing = {
                BarIcon("square.and.arrow.up", enabled = changes.isNotEmpty()) { Share.text(ctx, shareText()) }
                BarButton("Готово", bold = true) { dismiss() }
            }) {
            FormSection {
                if (changes.isEmpty()) {
                    text("Изменений пока не было. Когда РУЗ отменит, добавит пару или сменит аудиторию, это появится здесь и придёт уведомление.",
                        color = null, size = Ts.body)
                }
                for (c in changes) {
                    val icon = when {
                        c.text.startsWith("Отменена") -> "xmark.circle"
                        c.text.startsWith("Добавлена") -> "plus.circle"
                        else -> "arrow.left.arrow.right.circle"
                    }
                    row { IconLabel(c.text, icon, style = ft(Ts.subheadline), iconColor = Brand.color, spacing = 12.dp) }
                }
            }
        }
    }
}

// MARK: - Первая настройка

@Composable
fun SetupCard(onManual: () -> Unit) {
    var group by prefString("group", "")
    var institution by remember { mutableIntStateOf(3) }
    Glass(28.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(Brand.gradient), contentAlignment = Alignment.Center) {
                    SfIcon("calendar.badge.clock", size = 26.dp, tint = Color.White)
                }
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("Расписание из РУЗ", style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                    Text("Подтягивается с ruz.narfu.ru, обновляется само и хранится офлайн", style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Ios.label.copy(alpha = 0.05f)).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Группа", style = ft(Ts.body), color = Ios.secondaryLabel)
                    Spacer(Modifier.width(12.dp))
                    IosTextField(group, { group = it }, "151621", Modifier.weight(1f), style = ft(Ts.headline, FontWeight.SemiBold, mono = true),
                        keyboard = KeyboardType.Number, textAlign = TextAlign.End)
                }
                ru.student.safuhub.ui.kit.Divider()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Высшая школа", style = ft(Ts.body), color = Ios.secondaryLabel, modifier = Modifier.weight(1f))
                    IosMenu(items = {
                        for ((id, name) in RuzClient.institutions) item(name, checked = id == institution) { institution = id }
                    }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(RuzClient.institutions.firstOrNull { it.first == institution }?.second ?: "", style = ft(Ts.body), color = Brand.color)
                            SfIcon("chevron.up.chevron.down", size = 14.dp, tint = Brand.color)
                        }
                    }
                }
            }
            Pressable({
                Haptics.success()
                ScheduleStore.connectRuz(group, institution)
                AppScope.launch { ScheduleStore.sync(force = true) }
            }, Modifier.fillMaxWidth(), enabled = group.isNotBlank()) {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brand.gradient).padding(vertical = 14.dp)
                    .graphicsLayer { alpha = if (group.isNotBlank()) 1f else 0.5f },
                    horizontalArrangement = Arrangement.Center) {
                    IconLabel("Подключить", "link", style = ft(Ts.headline, FontWeight.SemiBold), color = Color.White)
                }
            }
            TextButton(onManual, Modifier.fillMaxWidth()) {
                Text("Внести пары вручную", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color,
                    textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

// MARK: - Строка пары

@Composable
fun SlotRow(slot: LessonSlot, onMap: () -> Unit) {
    val showTeacher by prefBool("schedule.teacher", true)
    val compact by prefBool("schedule.compact", false)
    val now = rememberNow(30)
    val active = slot.start <= now && now < slot.end
    val past = now >= slot.end
    val total = (slot.end.epochSecond - slot.start.epochSecond).toDouble()
    val progress = if (total > 0) ((now.epochSecond - slot.start.epochSecond) / total).coerceIn(0.0, 1.0) else 0.0
    val minutesLeft = ceil((slot.end.epochSecond - now.epochSecond) / 60.0).toInt()
    val color = SubjectColor.color(slot.lesson.subject)
    val shape = RoundedCornerShape(20.dp)
    Glass(20.dp, Modifier.fillMaxWidth().graphicsLayer { alpha = if (past) 0.55f else 1f }
        .strokeBorder(color.copy(alpha = if (active) 0.6f else 0f), 1.5.dp, shape), lite = true) {
        // цветная полоса типа пары слева
        Box(Modifier.matchParentSize()) {
            Box(Modifier.fillMaxHeight().width(5.dp).background(KindStyle.of(slot.lesson.kind).color))
        }
        Row(Modifier.fillMaxWidth().padding(if (compact) 11.dp else 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.width(50.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(hm(slot.start), style = ft(Ts.subheadline, FontWeight.Bold, mono = true), color = Ios.label)
                Text(hm(slot.end), style = ft(Ts.caption, mono = true), color = Ios.secondaryLabel)
                if (!compact) Text("${slot.lesson.pair} пара", style = ft(Ts.caption2), color = Ios.secondaryLabel)
            }
            Box(Modifier.width(4.dp).height(if (compact) 56.dp else 70.dp).clip(CircleShape)
                .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(color, color.copy(alpha = 0.75f))))
                .graphicsLayer { alpha = if (active) 1f else 0.7f })
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(if (compact) 3.dp else 5.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    KindBadge(slot.lesson.kind, 10f)
                    if (slot.lesson.parity != 0) Text(if (slot.lesson.parity == 1) "нечёт" else "чёт", style = ft(Ts.caption2), color = Ios.secondaryLabel)
                    if (active) {
                        PulsingDot(color)
                        Text("СЕЙЧАС", style = ft(Ts.caption2, FontWeight.ExtraBold), color = color)
                    }
                }
                Text(slot.lesson.subject, style = if (compact) ft(Ts.subheadline, FontWeight.SemiBold) else ft(Ts.headline, FontWeight.SemiBold),
                    color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (slot.lesson.room.isNotEmpty() || slot.address.isNotEmpty()) {
                    Column(Modifier.clickable(remember { MutableInteractionSource() }, null) { onMap() }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (slot.lesson.room.isNotEmpty()) IconLabel("ауд. ${slot.lesson.room}", "door.left.hand.open", style = ft(Ts.caption, FontWeight.Bold), spacing = 5.dp)
                        if (slot.address.isNotEmpty()) IconLabel(AddressFormat.full(slot.address), "mappin.and.ellipse", style = ft(Ts.caption),
                            color = Ios.secondaryLabel, spacing = 5.dp)
                    }
                }
                if (showTeacher && slot.lesson.teacher.isNotEmpty()) {
                    IconLabel(slot.lesson.teacher, "person.fill", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label.copy(alpha = 0.8f),
                        spacing = 5.dp, maxLines = 1)
                }
                if (active) {
                    ProgressBar(progress.toFloat(), color)
                    Text("до конца $minutesLeft мин", style = ft(Ts.caption, FontWeight.SemiBold), color = color)
                }
            }
        }
    }
}

// MARK: - Подробности пары

@Composable
fun LessonDetailSheet(slot: LessonSlot, isManual: Boolean, onEdit: () -> Unit) {
    DoneSheet { LessonDetail(slot, isManual, onEdit) }
}

@Composable
private fun LessonDetail(slot: LessonSlot, isManual: Boolean, onEdit: () -> Unit) {
    val ctx = LocalContext.current
    val nav = LocalNav.current
    val dismiss = LocalDismiss.current
    val role by prefInt("user.role", 0)
    val color = SubjectColor.color(slot.lesson.subject)
    val taskDraft = remember { mutableStateOf<StudyTask?>(null) }
    val showAttendance = remember { mutableStateOf(false) }
    var boardBatch by remember { mutableStateOf<BoardBatch?>(null) }
    LaunchedEffect(Unit) { boardBatch = LessonPhotos.batch(slot, ScheduleStore.data) }
    SheetItem(taskDraft) { t -> TaskEditorSheet(t, isNew = true, onSave = { TaskStore.upsert(it) }, onDelete = {}) }
    SheetBinding(showAttendance) { DoneSheet { AttendanceScreen(slot) } }
    val camera = rememberCamera { file ->
        if (file != null && BoardPhoto.save(file, slot.lesson.subject) != null) {
            Haptics.success()
            Dialogs.alert("Фото сохранено", "Лежит в «Файлы › Предметы › ${slot.lesson.subject}».")
            boardBatch = LessonPhotos.batch(slot, ScheduleStore.data)
        }
        file?.delete()
    }
    Screen("Пара") {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(color.copy(alpha = 0.14f)).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                KindBadge(slot.lesson.kind, 12f)
                Text(slot.lesson.subject, style = ft(Ts.title2, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                Text("${Fmt.format(slot.start, "EEEE, d MMMM")} · ${hm(slot.start)}–${hm(slot.end)} · ${slot.lesson.pair} пара",
                    style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            }
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Column {
                    if (slot.lesson.teacher.isNotEmpty()) InfoRow("person.fill", "Преподаватель", slot.lesson.teacher, color)
                    if (slot.lesson.room.isNotEmpty()) InfoRow("door.left.hand.open", "Аудитория", slot.lesson.room, color)
                    if (slot.address.isNotEmpty()) InfoRow("mappin.and.ellipse", "Адрес", AddressFormat.full(slot.address), color)
                    if (slot.note.isNotEmpty()) InfoRow("text.alignleft", "Подробности", slot.note, color)
                }
            }
            if (slot.address.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ActionButton("Яндекс Карты", "map", Modifier.weight(1f)) { Maps.smartURL(slot.address)?.let { Share.url(ctx, it) } }
                    ActionButton("Google Карты", "map.fill", Modifier.weight(1f)) { Maps.googleURL(slot.address)?.let { Share.url(ctx, it) } }
                }
            }
            if (role > 0) ActionButton("Отметить посещаемость", "person.crop.circle.badge.checkmark") { showAttendance.value = true }
            ActionButton("Фото доски в папку предмета", "camera.fill") { camera.open() }
            val b = boardBatch
            if (b != null && b.shots.isNotEmpty()) {
                Pressable({ nav?.push { BoardBatchScreen(b) } }, Modifier.fillMaxWidth()) {
                    Glass(18.dp, Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            SfGradientIcon("photo.stack.fill", size = 20.dp)
                            Text("Фото этой пары (${b.shots.size}) — отправить PDF", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label,
                                modifier = Modifier.weight(1f))
                            SfIcon("chevron.right", size = 13.dp, tint = Ios.tertiaryLabel)
                        }
                    }
                }
            }
            ActionButton("Задача по этому предмету", "checklist") { taskDraft.value = StudyTask.blank().copy(subject = slot.lesson.subject) }
            if (isManual) ActionButton("Изменить пару", "pencil") {
                dismiss()
                AppScope.launch { kotlinx.coroutines.delay(350); onEdit() }
            }
        }
    }
}

@Composable
private fun InfoRow(icon: String, title: String, value: String, color: Color) {
    Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.width(22.dp)) { SfIcon(icon, size = 18.dp, tint = color) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = ft(Ts.caption), color = Ios.secondaryLabel)
            Text(value, style = ft(Ts.subheadline), color = Ios.label)
        }
    }
}

@Composable
private fun ActionButton(title: String, icon: String, modifier: Modifier = Modifier.fillMaxWidth(), onClick: () -> Unit) {
    Pressable(onClick, modifier) {
        Glass(18.dp, Modifier.fillMaxWidth(), interactive = true) {
            Row(Modifier.fillMaxWidth().padding(vertical = 13.dp), horizontalArrangement = Arrangement.Center) {
                IconLabel(title, icon, style = ft(Ts.subheadline, FontWeight.SemiBold), iconColor = Brand.color)
            }
        }
    }
}

// MARK: - Настройки расписания

@Composable
fun ScheduleSettingsSheet() {
    val ctx = LocalContext.current
    DoneSheet {
        var showTeacher by prefBool("schedule.teacher", true)
        var compact by prefBool("schedule.compact", false)
        var colors by prefBool("schedule.colors", true)
        val data = ScheduleStore.data
        var group by remember { mutableStateOf(data.ruzGroupNumber.ifEmpty { Defaults.string("group") ?: "" }) }
        var institution by remember { mutableIntStateOf(data.ruzInstitution) }
        FormScreen("Расписание") {
            FormSection("Откуда брать пары") {
                segmented(listOf(1 to "РУЗ", 0 to "Вручную"), data.source, { v ->
                    if (v == 1) {
                        ScheduleStore.connectRuz(group, institution, ScheduleStore.data.ruzGroupID)
                        AppScope.launch { ScheduleStore.sync(force = true) }
                    } else ScheduleStore.useManual()
                })
            }
            if (data.usesRuz) {
                FormSection("РУЗ",
                    footer = "${ScheduleStore.lastSyncText.capitalizedFirstLetter()}. ${data.syncInfo} В памяти: ${data.ruzEvents.size} пар, ${ScheduleStore.rememberedWeeks} нед. Если группа не находится, открой РУЗ на главной, найди свою группу и нажми «Сделать моим расписанием».") {
                    field("151621", group, { group = it }, keyboard = KeyboardType.Number, title = "Группа")
                    picker("Высшая школа", RuzClient.institutions, institution, { institution = it })
                    button("Сохранить и обновить", "arrow.clockwise") {
                        ScheduleStore.connectRuz(group, institution)
                        AppScope.launch { ScheduleStore.sync(force = true) }
                    }
                }
                FormSection {
                    if (data.ruzGroupID.isNotEmpty()) button("Открыть мою группу в РУЗ", "safari") { Share.url(ctx, RuzClient.timetableURL(data.ruzGroupID)) }
                    button("Очистить кеш РУЗ", "trash", destructive = true) {
                        Dialogs.actionSheet("Удалить все сохранённые пары из РУЗ?", null,
                            AlertAction("Очистить", AlertAction.Role.DESTRUCTIVE) { ScheduleStore.clearRuzCache() },
                            AlertAction("Отменить", AlertAction.Role.CANCEL))
                    }
                }
            }
            FormSection("Вид") {
                toggle("Цвета предметов", colors, { colors = it })
                toggle("Показывать преподавателя", showTeacher, { showTeacher = it })
                toggle("Компактные карточки", compact, { compact = it })
            }
        }
    }
}

// MARK: - Карточка «Сейчас» на главной

@Composable
fun NowCard(data: ScheduleData, onOpen: () -> Unit, onMap: (String) -> Unit, onPhoto: ((LessonSlot) -> Unit)? = null,
            onPlace: ((LessonSlot) -> Unit)? = null) {
    val now = rememberNow(30)
    // листание: null — текущая/следующая пара, иначе начало выбранной пары
    var picked by remember { mutableStateOf<Instant?>(null) }
    fun around(n: Instant): Pair<List<LessonSlot>, Int> {
        val all = ScheduleQuery.slots(data, from = -7, days = 15).sortedBy { it.start }
        val base = all.indexOfFirst { it.end > n }.let { if (it < 0) all.size else it }
        return all to base
    }
    fun step(d: Int) {
        val (all, base) = around(Instant.now())
        val cur = picked?.let { p -> all.indexOfFirst { it.start == p }.takeIf { it >= 0 } } ?: base
        val target = cur + d
        if (target !in all.indices) return
        Haptics.tap()
        picked = if (target == base) null else all[target].start
    }
    var dragX by remember { mutableFloatStateOf(0f) }
    Glass(28.dp, Modifier.fillMaxWidth()
        .clickable(remember { MutableInteractionSource() }, null) { onOpen() }
        .pointerInput(Unit) {
            detectHorizontalDragGestures(onDragStart = { dragX = 0f }, onHorizontalDrag = { _, dx -> dragX += dx },
                onDragEnd = { if (abs(dragX) > 50 * density) step(if (dragX < 0) 1 else -1) })
        }) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            AnimatedContent(picked, label = "now", transitionSpec = { fadeIn() togetherWith fadeOut() }) { p ->
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (p == null) LiveNow(data, now, onMap, onPhoto, onPlace)
                    else Browsed(p, around(now).first, now, onMap, onPhoto, onPlace)
                }
            }
            // стрелки ‹ › под карточкой — листать можно и нажатием
            Row(verticalAlignment = Alignment.CenterVertically) {
                PagerButton("Раньше", "chevron.left", leadingIcon = true) { step(-1) }
                Spacer(Modifier.weight(1f))
                if (picked != null) {
                    PagerButton("К текущей", "arrow.uturn.backward", leadingIcon = true) { Haptics.tap(); picked = null }
                    Spacer(Modifier.weight(1f))
                }
                PagerButton("Дальше", "chevron.right", leadingIcon = false) { step(1) }
            }
        }
    }
}

@Composable
private fun PagerButton(title: String, icon: String, leadingIcon: Boolean, onClick: () -> Unit) {
    Row(Modifier.clickable(remember { MutableInteractionSource() }, null) { onClick() }, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (leadingIcon) SfIcon(icon, size = 13.dp, tint = Ios.secondaryLabel)
        Text(title, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
        if (!leadingIcon) SfIcon(icon, size = 13.dp, tint = Ios.secondaryLabel)
    }
}

@Composable
private fun Browsed(picked: Instant, all: List<LessonSlot>, now: Instant, onMap: (String) -> Unit,
                    onPhoto: ((LessonSlot) -> Unit)?, onPlace: ((LessonSlot) -> Unit)?) {
    val s = all.firstOrNull { it.start == picked }
    if (s != null) {
        val past = s.end <= now
        val color = SubjectColor.color(s.lesson.subject)
        Row(verticalAlignment = Alignment.Top) {
            CardHeader(if (past) "ПРОШЛА" else if (s.start <= now) "СЕЙЧАС" else "ВПЕРЕДИ", false, color)
            Spacer(Modifier.weight(1f))
            Text(dayLabel(s, now), style = ft(Ts.caption, FontWeight.Bold), color = color,
                modifier = Modifier.clip(CircleShape).background(color.copy(alpha = 0.14f)).padding(horizontal = 10.dp, vertical = 5.dp))
        }
        LessonTitle(s)
        PlaceButton(s, onMap, onPlace)
        SubjectPinsStrip(s.lesson.subject, editable = true, showFolder = true)
        if (past && onPhoto != null) PhotoChip { onPhoto(s) }
    } else {
        CardHeader("ПАРЫ", false, Brand.color)
        Text("Эта пара пропала из расписания", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
    }
}

private fun dayLabel(s: LessonSlot, now: Instant): String {
    val t = hm(s.start)
    return when {
        Cal.isSameDay(s.start, now) -> "сегодня · $t"
        Cal.isYesterday(s.start) -> "вчера · $t"
        Cal.isTomorrow(s.start) -> "завтра · $t"
        else -> "${Lesson.dayFullNames[ScheduleEngine.weekday(s.start) - 1]} · $t"
    }
}

@Composable
private fun PhotoChip(onClick: () -> Unit) {
    Pressable(onClick) {
        Row(Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.12f)).padding(horizontal = 12.dp, vertical = 8.dp)) {
            IconLabel("Фото доски в папку предмета", "camera.fill", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color, spacing = 6.dp)
        }
    }
}

@Composable
private fun LiveNow(data: ScheduleData, now: Instant, onMap: (String) -> Unit, onPhoto: ((LessonSlot) -> Unit)?, onPlace: ((LessonSlot) -> Unit)?) {
    val (c, n) = ScheduleEngine.nowAndNext(now, data)
    if (c != null) {
        val color = SubjectColor.color(c.lesson.subject)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                CardHeader("СЕЙЧАС", true, color)
                LessonTitle(c)
            }
            val total = (c.end.epochSecond - c.start.epochSecond).toDouble()
            val progress = if (total > 0) ((now.epochSecond - c.start.epochSecond) / total).coerceIn(0.0, 1.0) else 0.0
            Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                ProgressRing(progress.toFloat(), color, Modifier.size(64.dp),
                    brush = androidx.compose.ui.graphics.Brush.verticalGradient(listOf(color, color.copy(alpha = 0.75f))))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${ceil((c.end.epochSecond - now.epochSecond) / 60.0).toInt()}", style = ft(Ts.headline, FontWeight.Bold, Design.ROUNDED, mono = true), color = Ios.label)
                    Text("мин", style = ft(Ts.caption2), color = Ios.secondaryLabel)
                }
            }
        }
        PlaceButton(c, onMap, onPlace)
        // закреплённые ссылки и файлы этого предмета — прямо во время пары
        SubjectPinsStrip(c.lesson.subject, editable = true, showFolder = true)
        if (onPhoto != null) PhotoChip { onPhoto(c) }
        if (n != null) {
            ru.student.safuhub.ui.kit.Divider(alpha = 0.4f)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Потом", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                Text(n.lesson.subject, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(whenText(n, now), style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            }
        }
    } else if (n != null) {
        Row(verticalAlignment = Alignment.Top) {
            CardHeader("СЛЕДУЮЩАЯ ПАРА", false, SubjectColor.color(n.lesson.subject))
            Spacer(Modifier.weight(1f))
            Text(whenText(n, now), style = ft(Ts.caption, FontWeight.Bold), color = Brand.color,
                modifier = Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.14f)).padding(horizontal = 10.dp, vertical = 5.dp))
        }
        LessonTitle(n)
        PlaceButton(n, onMap, onPlace)
        SubjectPinsStrip(n.lesson.subject, editable = true, showFolder = true)
    } else {
        CardHeader("ПАРЫ", false, Brand.color)
        Text("На ближайшую неделю пар нет", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
    }
}

@Composable
private fun CardHeader(title: String, live: Boolean, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (live) PulsingDot(color) else SfIcon("snowflake", size = 13.dp, tint = color)
        Text(title, style = ft(Ts.caption, FontWeight.ExtraBold), color = color)
    }
}

@Composable
private fun LessonTitle(s: LessonSlot) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        KindBadge(s.lesson.kind, 11f)
        Text(s.lesson.subject, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("${hm(s.start)}–${hm(s.end)}${if (s.lesson.teacher.isEmpty()) "" else " · ${s.lesson.teacher}"}", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
    }
}

@Composable
private fun PlaceButton(s: LessonSlot, onMap: (String) -> Unit, onPlace: ((LessonSlot) -> Unit)?) {
    if (s.lesson.room.isEmpty() && s.address.isEmpty()) return
    Pressable({ if (onPlace != null) onPlace(s) else onMap(s.address) }, Modifier.fillMaxWidth(), enabled = !(s.address.isEmpty() && onPlace == null)) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.color.copy(alpha = 0.10f)).padding(10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SfGradientIcon("mappin.circle.fill", size = 24.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                if (s.lesson.room.isNotEmpty()) Text("ауд. ${s.lesson.room}", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                if (s.address.isNotEmpty()) Text(AddressFormat.full(s.address), style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
            if (s.address.isNotEmpty()) SfIcon("arrow.up.right", size = 13.dp, tint = Ios.secondaryLabel)
        }
    }
}

private fun whenText(s: LessonSlot, now: Instant): String {
    val minutes = ceil((s.start.epochSecond - now.epochSecond) / 60.0).toInt()
    return when {
        Cal.isSameDay(s.start, now) -> if (minutes <= 90) "через $minutes мин" else "в ${hm(s.start)}"
        Cal.isTomorrow(s.start) -> "завтра в ${hm(s.start)}"
        else -> "${Lesson.dayFullNames[ScheduleEngine.weekday(s.start) - 1]} в ${hm(s.start)}"
    }
}

// MARK: - Редактор пары

@Composable
fun LessonEditorSheet(initial: Lesson, isNew: Boolean, buildings: List<Building>, onSave: (Lesson) -> Unit, onDelete: () -> Unit) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        var lesson by remember { mutableStateOf(initial) }
        var savedCount by remember { mutableIntStateOf(0) }
        val canSave = lesson.subject.isNotBlank()
        FormScreen(if (isNew) "Новая пара" else "Пара",
            leading = { BarButton(if (savedCount > 0) "Закрыть" else "Отмена") { dismiss() } },
            trailing = { BarButton("Готово", bold = true, enabled = canSave) { onSave(lesson); Haptics.success(); dismiss() } }) {
            FormSection {
                row { IosTextField(lesson.subject, { lesson = lesson.copy(subject = it) }, "Предмет", Modifier.weight(1f), style = ft(Ts.headline, FontWeight.SemiBold)) }
                picker("Тип", Lesson.kinds.map { it to it }, lesson.kind, { lesson = lesson.copy(kind = it) })
            }
            FormSection("Когда") {
                segmented((1..6).map { it to Lesson.dayNames[it - 1] }, lesson.weekday, { lesson = lesson.copy(weekday = it) })
                picker("Пара", (1..Bells.times.size).map { it to "$it пара · ${Bells.label(it)}" }, lesson.pair, { lesson = lesson.copy(pair = it) })
                segmented(listOf(0 to "Каждую", 1 to "Нечётная", 2 to "Чётная"), lesson.parity, { lesson = lesson.copy(parity = it) })
            }
            FormSection("Где", footer = "Корпуса и их адреса настраиваются в меню «…» на экране «Пары».") {
                field("Аудитория, например 3104", lesson.room, { lesson = lesson.copy(room = it) })
                picker("Корпус", listOf("" to "Не указан") + buildings.map { it.name to it.name }, lesson.building, { lesson = lesson.copy(building = it) })
            }
            FormSection {
                field("Преподаватель", lesson.teacher, { lesson = lesson.copy(teacher = it) })
            }
            if (isNew) {
                FormSection(footer = if (savedCount > 0) "Добавлено пар: $savedCount" else null) {
                    button("Сохранить и добавить следующую", "plus.circle", enabled = canSave) {
                        onSave(lesson)
                        Haptics.success()
                        savedCount += 1
                        lesson = lesson.copy(id = newId(), subject = "", teacher = "", room = "", pair = minOf(lesson.pair + 1, Bells.times.size))
                    }
                }
            } else {
                FormSection {
                    button("Удалить пару", "trash", destructive = true) { onDelete(); dismiss() }
                }
            }
        }
    }
}

// MARK: - Корпуса

@Composable
fun BuildingsSheet() {
    DoneSheet {
        val buildings = ScheduleStore.data.buildings
        fun set(list: List<Building>) { ScheduleStore.data = ScheduleStore.data.copy(buildings = list) }
        FormScreen("Корпуса") {
            FormSection(footer = "Для расписания из РУЗ: в названии укажи код корпуса, как он пишется в РУЗ (например, А-НСД17), а в адресе — как его показывать. Аудитория из кода подставится сама.") {
                for (b in buildings) {
                    row {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            IosTextField(b.name, { v -> set(ScheduleStore.data.buildings.map { if (it.id == b.id) it.copy(name = v) else it }) }, "Название",
                                Modifier.fillMaxWidth(), style = ft(Ts.headline, FontWeight.SemiBold))
                            IosTextField(b.address, { v -> set(ScheduleStore.data.buildings.map { if (it.id == b.id) it.copy(address = v) else it }) }, "Адрес",
                                Modifier.fillMaxWidth(), style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                        }
                        SfIcon("minus.circle.fill", size = 22.dp, tint = Ios.red, modifier = Modifier.clickable {
                            set(ScheduleStore.data.buildings.filter { it.id != b.id })
                        })
                    }
                }
                button("Добавить корпус", "plus") {
                    set(buildings + Building(name = "Корпус ${buildings.size + 1}", address = "Архангельск, "))
                }
            }
        }
    }
}

// MARK: - Экспорт в календарь

@Composable
fun ExportSheet() {
    DoneSheet {
        var weeks by remember { mutableIntStateOf(8) }
        var alert by remember { mutableStateOf(true) }
        var status by remember { mutableStateOf<String?>(null) }
        var working by remember { mutableStateOf(false) }
        val scope = androidx.compose.runtime.rememberCoroutineScope()
        FormScreen("Календарь") {
            FormSection(footer = "Создам отдельный календарь «${CalendarExporter.calendarTitle}». Виджет календаря будет показывать следующую пару с аудиторией и адресом. Повторный экспорт заменяет старые пары.") {
                stepper("Недель вперёд: $weeks", weeks, { weeks = it }, 1..20)
                toggle("Напоминание за 15 минут", alert, { alert = it })
            }
            FormSection(footer = status ?: if (!ScheduleStore.hasLessons) "Сначала добавь пары." else null) {
                button("Добавить в календарь", "calendar.badge.plus", enabled = !working && ScheduleStore.hasLessons,
                    trailing = if (working) ({ Spinner() }) else null) {
                    working = true
                    status = null
                    val data = ScheduleStore.data
                    scope.launch {
                        try {
                            val count = CalendarExporter.export(data, weeks, alert)
                            status = "Готово: добавлено пар — $count."
                            Haptics.success()
                        } catch (e: Throwable) {
                            status = e.message ?: "Не получилось"
                        } finally {
                            working = false
                        }
                    }
                }
            }
        }
    }
}
