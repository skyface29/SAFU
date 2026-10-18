package ru.student.safuhub.screens.homework

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.core.hm
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.HWFormat
import ru.student.safuhub.data.HWPlanner
import ru.student.safuhub.data.HWPrefs
import ru.student.safuhub.data.HWShare
import ru.student.safuhub.data.Homework
import ru.student.safuhub.data.HomeworkRouter
import ru.student.safuhub.data.HomeworkStore
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleJump
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.ui.design.CircleIconButton
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.design.ScreenHeader
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.design.strokeBorder
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.MenuPopup
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.ScrollPage
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// Вкладка «Домашка» (как HomeworkView на iPhone)

enum class HWMode(val raw: String, val title: String, val icon: String) {
    PAIRS("pairs", "К парам", "calendar"),
    SUBJECTS("subjects", "Предметы", "books.vertical"),
    DATES("dates", "По датам", "clock");

    companion object { fun of(raw: String) = entries.firstOrNull { it.raw == raw } ?: PAIRS }
}

enum class HWFocus { OVERDUE, SOON, WEEK }

object HWText {
    /** 1 задание · 2 задания · 5 заданий */
    fun plural(n: Int, one: String, few: String, many: String): String {
        val a = kotlin.math.abs(n) % 100
        val b = a % 10
        return when {
            a in 11..19 -> many
            b in 2..4 -> few
            b == 1 -> one
            else -> many
        }
    }

    fun tasks(n: Int) = "$n ${plural(n, "задание", "задания", "заданий")}"

    fun kindDative(kind: String) = when (KindStyle.of(kind).label) {
        "Лекция" -> "лекции"
        "Практика" -> "практике"
        "Лабораторная" -> "лабе"
        "Семинар" -> "семинару"
        "Консультация" -> "консультации"
        "Зачёт" -> "зачёту"
        "Экзамен" -> "экзамену"
        else -> "паре"
    }
}

private data class HWGroup(
    val id: String,
    val title: String,
    val subtitle: String,
    val color: Color,
    val kind: String = "",
    val date: Instant? = null,
    val showSubject: Boolean = false,
    val pairStrip: Boolean = false,
    val room: String = "",
    val estimated: Boolean = false,
    val items: List<Homework>,
)

@Composable
fun HomeworkScreen(embedded: Boolean = false, onClose: (() -> Unit)? = null) {
    HomeworkStore.load()
    val ctx = LocalContext.current
    val data = ScheduleStore.data
    var modeRaw by prefString("hw.mode", HWMode.PAIRS.raw)
    val mode = HWMode.of(modeRaw)
    var subjectFilter by remember { mutableStateOf<String?>(null) }
    var focus by remember { mutableStateOf<HWFocus?>(null) }
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    var showDone by remember { mutableStateOf(false) }
    val settings = remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }

    SheetBinding(settings) { HomeworkSettingsSheet(data) }

    LaunchedEffect(Unit) {
        HomeworkStore.reconcile(data)
        HomeworkStore.cleanupFinished()
    }

    val now = Instant.now()
    val endOfTomorrow = Cal.addDays(Cal.startOfDay(now), 2)
    val weekLimit = now.plusSeconds(7 * 86_400)
    val active = HomeworkStore.active
    val overdueCount = active.count { it.due < now }
    val soonCount = active.count { it.due >= now && it.due < endOfTomorrow }
    val weekCount = active.count { it.due >= now && it.due < weekLimit }
    val hasFilters = subjectFilter != null || focus != null

    val q = query.trim().lowercase(RU)
    val filtered = active.filter { h ->
        if (subjectFilter != null && !h.isSameSubject(subjectFilter!!)) return@filter false
        when (focus) {
            HWFocus.OVERDUE -> if (h.due >= now) return@filter false
            HWFocus.SOON -> if (h.due < now || h.due >= endOfTomorrow) return@filter false
            HWFocus.WEEK -> if (h.due < now || h.due >= weekLimit) return@filter false
            null -> {}
        }
        if (q.isNotEmpty()) {
            val hay = (listOf(h.text, h.subject, h.note) + h.steps.map { it.text }).joinToString(" ").lowercase(RU)
            if (!hay.contains(q)) return@filter false
        }
        true
    }

    fun shareBatch(scope: HWFocus?) {
        val (list, title) = when (scope) {
            HWFocus.SOON -> {
                val t = Cal.addDays(now, 1)
                active.filter { Cal.isSameDay(it.due, t) } to "ДЗ на завтра, " + Fmt.format(t, "EE d MMMM")
            }
            HWFocus.WEEK -> active.filter { it.due >= now && it.due < weekLimit } to "ДЗ на неделю"
            else -> active.filter { it.due >= now } to "Всё ДЗ"
        }
        if (list.isEmpty()) { Haptics.tap(); Dialogs.showToast("Нечего отправлять", "tray"); return }
        Share.text(ctx, HWShare.text(list, title))
    }

    val caption = if (active.isEmpty()) "Всё сделано" else HWText.tasks(active.size) + if (overdueCount > 0) " · $overdueCount просрочено" else ""

    ScrollPage(spacing = 0.dp) {
        ScreenHeader(caption, "Домашка") {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box {
                    Pressable({ menuOpen = true }) { CircleIconButton(if (hasFilters) "line.3.horizontal.decrease" else "ellipsis") }
                    MenuPopup(menuOpen, { menuOpen = false }, {
                        for (m in HWMode.entries) item(m.title, m.icon, checked = m == mode) { modeRaw = m.raw }
                        divider()
                        item("Все · ${active.size}", checked = focus == null) { focus = null }
                        item("Просроченные · $overdueCount", checked = focus == HWFocus.OVERDUE) { focus = HWFocus.OVERDUE }
                        item("До завтра · $soonCount", checked = focus == HWFocus.SOON) { focus = HWFocus.SOON }
                        item("На неделе · $weekCount", checked = focus == HWFocus.WEEK) { focus = HWFocus.WEEK }
                        val subjects = HomeworkStore.subjects
                        if (subjects.size > 1) {
                            divider()
                            item("Все предметы", "books.vertical", checked = subjectFilter == null) { subjectFilter = null }
                            for (s in subjects) item("$s · ${HomeworkStore.openCount(s)}", checked = subjectFilter == s) { subjectFilter = s }
                        }
                        divider()
                        item("Отправить ребятам: на завтра", "paperplane") { shareBatch(HWFocus.SOON) }
                        item("Отправить ребятам: на неделю", "paperplane") { shareBatch(HWFocus.WEEK) }
                        item("Отправить ребятам: всё открытое", "paperplane") { shareBatch(null) }
                        divider()
                        item("Поиск", "magnifyingglass") { searching = true }
                        item("Настройки домашки", "gearshape") { settings.value = true }
                    })
                }
                Pressable({ Haptics.tap(); HomeworkRouter.new(subject = subjectFilter) }) {
                    Box(Modifier.size(44.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                        SfIcon("plus", size = 20.dp, tint = Color.White)
                    }
                }
                if (embedded && onClose != null) Pressable({ onClose() }) { CircleIconButton("xmark") }
            }
        }
        Spacer(Modifier.height(14.dp))
        // связан с компьютером — видно, когда ДЗ последний раз сверялись
        if (ru.student.safuhub.feature.pcsync.PCSync.isPaired) {
            ru.student.safuhub.feature.pcsync.SyncBadge(Modifier.padding(bottom = 12.dp))
        }

        AnimatedVisibility(searching) {
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(12.dp)).background(Ios.label.copy(alpha = 0.07f))
                .padding(horizontal = 12.dp).height(40.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SfIcon("magnifyingglass", size = 16.dp, tint = Ios.secondaryLabel)
                IosTextField(query, { query = it }, "Поиск по заданиям", Modifier.weight(1f))
                TextButton({ searching = false; query = "" }) { Text("Готово", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color) }
            }
        }

        if (hasFilters) {
            Row(Modifier.padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                focus?.let { f ->
                    val (t, c) = when (f) {
                        HWFocus.OVERDUE -> "Просроченные" to Ios.red
                        HWFocus.SOON -> "До завтра" to Ios.orange
                        HWFocus.WEEK -> "На неделе" to Brand.color
                    }
                    FilterChip(t, c) { focus = null }
                }
                subjectFilter?.let { s -> FilterChip(s, SubjectColor.color(s)) { subjectFilter = null } }
            }
        }

        HWPlanner.suggestedSlot(data)?.let { s -> FromPairRow(s); Spacer(Modifier.height(8.dp)) }

        when {
            active.isEmpty() -> EmptyState("book.closed.fill", "Домашки нет",
                "Нажми ＋ вверху справа. Выбери пару — срок сам встанет к следующей очной практике по расписанию, а если её перенесут, срок переедет вместе с ней.")
            filtered.isEmpty() -> Glass(20.dp, Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Ничего не нашлось", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.secondaryLabel)
                    TextButton({ focus = null; subjectFilter = null; query = "" }) {
                        Text("Сбросить фильтры", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
                    }
                }
            }
            else -> for (g in groups(filtered, mode)) key(g.id) { GroupView(g, data) }
        }

        // сделанное — свёрнуто внизу, там же итог недели
        val done = HomeworkStore.finished
        if (done.isNotEmpty()) {
            val (wd, wt) = HomeworkStore.weekStats
            Column(Modifier.padding(top = 22.dp).animateContentSize()) {
                Row(Modifier.fillMaxWidth().clickable(remember { MutableInteractionSource() }, null) { Haptics.tap(); showDone = !showDone }
                    .padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Сделано", style = ft(Ts.title3, FontWeight.Bold), color = Ios.secondaryLabel)
                    Text("${done.size}", style = ft(Ts.footnote, FontWeight.SemiBold), color = Ios.tertiaryLabel)
                    Spacer(Modifier.weight(1f))
                    if (wt > 0) Text("за неделю $wd из $wt", style = ft(Ts.footnote), color = Ios.secondaryLabel)
                    SfIcon(if (showDone) "chevron.up" else "chevron.down", size = 14.dp, tint = Ios.tertiaryLabel)
                }
                if (showDone) {
                    Card(Modifier.padding(top = 8.dp)) {
                        done.take(40).forEachIndexed { i, h ->
                            key(h.id) {
                                if (i > 0) RowDivider()
                                ContextMenuBox(items = { hwMenu(h, data, ctx) }) {
                                    HWRow(h, showSubject = true, plain = true, onOpen = { HomeworkRouter.show(h) })
                                }
                            }
                        }
                    }
                    TextButton({ Dialogs.confirm("Удалить всё сделанное ДЗ?", button = "Удалить") { HomeworkStore.clearFinished() } },
                        Modifier.fillMaxWidth()) {
                        Text("Удалить всё сделанное", style = ft(Ts.footnote, FontWeight.SemiBold), color = Ios.red,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                    val keep = HWPrefs.keepDoneDays
                    if (keep > 0) Text("Сделанное старше $keep дн. убирается само — это меняется в настройках", style = ft(Ts.caption2),
                        color = Ios.tertiaryLabel, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
            }
        }
        Spacer(Modifier.height(110.dp))
    }
}

@Composable
private fun FilterChip(text: String, color: Color, onClear: () -> Unit) {
    Row(Modifier.clip(CircleShape).background(Ios.label.copy(alpha = 0.07f)).clickable { Haptics.tap(); onClear() }
        .padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Text(text, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label, maxLines = 1)
        SfIcon("xmark", size = 10.dp, tint = Ios.secondaryLabel)
    }
}

/** Записать с текущей пары — одна тихая строка */
@Composable
private fun FromPairRow(s: LessonSlot) {
    val color = SubjectColor.color(s.lesson.subject)
    val now = Instant.now()
    val live = s.start <= now && s.end > now
    val already = HomeworkStore.given(s).size
    Pressable({ Haptics.tap(); HomeworkRouter.new(slot = s) }) {
        Glass(20.dp, Modifier.fillMaxWidth(), lite = true) {
            Row(Modifier.padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SfIcon("plus.circle.fill", size = 24.dp, tint = color)
                Column(Modifier.weight(1f)) {
                    Text(s.lesson.subject, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(if (live) "идёт пара — что задали?" else "пара закончилась — что задали?", style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
                if (already > 0) Text("$already", style = ft(Ts.caption, FontWeight.Bold), color = Ios.secondaryLabel)
            }
        }
    }
}

private fun groups(list: List<Homework>, mode: HWMode): List<HWGroup> = when (mode) {
    HWMode.PAIRS -> {
        val map = LinkedHashMap<String, MutableList<Homework>>()
        for (h in list) map.getOrPut("${h.due.epochSecond / 60}|${HWPlanner.key(h.subject)}") { mutableListOf() } += h
        map.map { (k, items) ->
            val first = items.first()
            var sub = HWFormat.dayTime(first.due).capitalizedFirstLetter()
            if (first.dueRoom.isNotEmpty()) sub += if (AddressFormat.isRemote(first.dueRoom)) " · дистант" else " · ауд. ${first.dueRoom}"
            if (first.dueEstimated) sub += " · примерно"
            HWGroup(k, first.subject.ifEmpty { "Без предмета" }, sub, SubjectColor.color(first.subject), first.dueKind, first.due,
                pairStrip = true, room = first.dueRoom, estimated = first.dueEstimated, items = items.sortedBy { if (it.important) 0 else 1 })
        }
    }
    HWMode.SUBJECTS -> {
        val map = LinkedHashMap<String, MutableList<Homework>>()
        for (h in list) map.getOrPut(HWPlanner.key(h.subject)) { mutableListOf() } += h
        map.map { (k, items) ->
            val first = items.first()
            HWGroup("s|$k", first.subject.ifEmpty { "Без предмета" }, "${HWText.tasks(items.size)} · ближайшее ${HWFormat.chip(first.due)}",
                SubjectColor.color(first.subject), items = items)
        }
    }
    HWMode.DATES -> {
        val now = Instant.now()
        val today = Cal.startOfDay(now)
        val tomorrow = Cal.addDays(today, 1)
        val after = Cal.addDays(today, 2)
        val week = Cal.addDays(today, 7)
        listOf(
            Triple("overdue", "Просрочено", Color(0xFFFF3B30)) to { h: Homework -> h.due < now },
            Triple("today", "Сегодня", Color(0xFFFF9500)) to { h: Homework -> h.due >= now && h.due < tomorrow },
            Triple("tomorrow", "Завтра", Color(0xFF2873FA)) to { h: Homework -> h.due >= tomorrow && h.due < after },
            Triple("week", "На неделе", Color(0xFF2873FA)) to { h: Homework -> h.due >= after && h.due < week },
            Triple("later", "Позже", Color(0xFF8E8E93)) to { h: Homework -> h.due >= week },
        ).mapNotNull { (t, pred) ->
            val items = list.filter(pred)
            if (items.isEmpty()) null else HWGroup(t.first, t.second, HWText.tasks(items.size), t.third, showSubject = true, items = items)
        }
    }
}

@Composable
private fun GroupView(g: HWGroup, data: ScheduleData) {
    val ctx = LocalContext.current
    Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val d = g.date
        if (g.pairStrip && d != null) {
            // к паре: когда и где; нажал — расписание на этот день
            Box(Modifier.clickable(remember { MutableInteractionSource() }, null) { ScheduleJump.show(d) }) {
                HeaderLine(g, pairLine(g, d), pairLeft(d), HWFormat.urgency(d, false, Brand.color, Ios.secondaryLabel))
            }
        } else {
            HeaderLine(g, g.subtitle, g.date?.let { HWFormat.chip(it) }, g.date?.let { HWFormat.urgency(it, false, Brand.color, Ios.secondaryLabel) } ?: Ios.secondaryLabel)
        }
        Card {
            g.items.forEachIndexed { i, h ->
                key(h.id) {
                    if (i > 0) RowDivider()
                    ContextMenuBox(items = { hwMenu(h, data, ctx) }) {
                        HWRow(h, showSubject = g.showSubject, showDue = !g.pairStrip, plain = true, onOpen = { HomeworkRouter.show(h) })
                    }
                }
            }
        }
    }
}

@Composable
private fun HeaderLine(g: HWGroup, line: String, trailing: String?, trailingColor: Color) {
    Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(g.title, style = ft(Ts.title3, FontWeight.Bold), color = g.color, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false))
            Spacer(Modifier.weight(1f).width(6.dp))
            if (trailing != null) Text(trailing, style = ft(Ts.footnote, FontWeight.SemiBold), color = trailingColor, maxLines = 1)
        }
        if (line.isNotEmpty()) Text(line, style = ft(Ts.footnote), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** «Пн, 5 октября, 14:30 · ауд. 44 · практика» */
private fun pairLine(g: HWGroup, d: Instant): String {
    val day = Fmt.format(d, "EE, d MMMM").capitalizedFirstLetter()
    val parts = mutableListOf((if (g.estimated) "≈ " else "") + if (HWFormat.isEndOfDay(d)) day else "$day, ${hm(d)}")
    val r = g.room.trim()
    if (r.isNotEmpty()) parts += if (AddressFormat.isRemote(r)) "дистант" else "ауд. $r"
    if (g.kind.isNotEmpty()) parts += KindStyle.of(g.kind).label.lowercase(RU)
    return parts.joinToString(" · ")
}

private fun pairLeft(d: Instant): String {
    val now = Instant.now()
    if (d < now) return "прошла"
    if (Cal.isToday(d)) return "сегодня"
    if (Cal.isTomorrow(d)) return "завтра"
    val n = Cal.daysBetween(now, d)
    return "через $n ${HWText.plural(n, "день", "дня", "дней")}"
}

@Composable
private fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Glass(20.dp, modifier.fillMaxWidth(), lite = true) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp)) { content() }
    }
}

@Composable
private fun RowDivider() {
    Box(Modifier.fillMaxWidth().padding(start = 38.dp).height(0.5.dp).background(Ios.label.copy(alpha = 0.08f)))
}

/** Меню задания (долгое нажатие) */
fun ru.student.safuhub.ui.kit.MenuScope.hwMenu(h: Homework, data: ScheduleData, ctx: android.content.Context) {
    item(if (h.done) "Вернуть в работу" else "Сделано", if (h.done) "arrow.uturn.backward" else "checkmark.circle") { HomeworkStore.toggle(h.id) }
    item("Изменить", "pencil") { HomeworkRouter.edit(h) }
    if (!h.done) item(if (h.byPair) "Перенести на следующую пару" else "Перенести на день", "arrow.turn.down.right") { HomeworkStore.postpone(h.id, data) }
    item("Показать в расписании", "calendar") { ScheduleJump.show(h.due) }
    item("Дублировать", "plus.square.on.square") { HomeworkStore.duplicate(h.id) }
    item("Отправить ребятам", "paperplane") { shareHomework(ctx, h) }
    item("Удалить", "trash", destructive = true) { HomeworkStore.delete(h.id) }
}

/** Текст и фото задания — в окно «Поделиться» */
fun shareHomework(ctx: android.content.Context, h: Homework) {
    val photos = HWShare.photoFiles(h)
    if (photos.isEmpty()) Share.text(ctx, HWShare.text(h)) else Share.files(ctx, photos, "image/jpeg", HWShare.text(h))
}

// MARK: - Строка ДЗ

@Composable
fun HWRow(h: Homework, showSubject: Boolean = true, showDue: Boolean = true, compact: Boolean = false, plain: Boolean = false,
          onToggle: () -> Unit = { HomeworkStore.toggle(h.id) }, onOpen: () -> Unit) {
    val color = SubjectColor.color(h.subject)
    val line = @Composable {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Checkbox(h, color, plain, onToggle)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(if (plain) 3.dp else 5.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    if (h.important && !h.done) SfIcon("star.fill", size = 12.dp, tint = Ios.orange)
                    Text(h.title, style = ft(Ts.body, if (plain) FontWeight.Normal else FontWeight.SemiBold)
                        .let { if (h.done) it.copy(textDecoration = TextDecoration.LineThrough) else it },
                        color = if (h.done) Ios.secondaryLabel else Ios.label, maxLines = if (compact) 2 else 4, overflow = TextOverflow.Ellipsis)
                }
                Meta(h, showSubject)
                if (!compact && h.steps.isNotEmpty() && !h.done) StepsInline(h, color)
                if (h.shiftNote.isNotEmpty() && !h.done) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        SfIcon("arrow.triangle.2.circlepath", size = 11.dp, tint = Ios.orange)
                        Text(h.shiftNote, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.orange)
                    }
                }
            }
            if (showDue || h.done) DueChip(h, plain)
        }
    }
    if (plain) {
        Box(Modifier.fillMaxWidth().clickable(remember { MutableInteractionSource() }, null) { onOpen() }.padding(vertical = 11.dp)) { line() }
    } else {
        Glass(20.dp, Modifier.fillMaxWidth().clickable(remember { MutableInteractionSource() }, null) { onOpen() }, lite = true) {
            Box(Modifier.padding(if (compact) 12.dp else 14.dp)) { line() }
        }
    }
}

@Composable
private fun Checkbox(h: Homework, color: Color, plain: Boolean, onToggle: () -> Unit) {
    val d = if (plain) 22.dp else 26.dp
    Box(Modifier.size(if (plain) 26.dp else 32.dp, if (plain) 24.dp else 32.dp)
        .clickable(remember { MutableInteractionSource() }, null) { onToggle() }, contentAlignment = Alignment.Center) {
        if (h.done) {
            Box(Modifier.size(d).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
                SfIcon("checkmark", size = d * 0.5f, tint = Color.White)
            }
        } else {
            Box(Modifier.size(d).strokeBorder(color.copy(alpha = 0.6f), if (plain) 1.6.dp else 2.dp, CircleShape))
            if (h.steps.isNotEmpty() && h.stepsDone > 0) {
                val p = h.stepsProgress
                Canvas(Modifier.size(d - 7.dp)) {
                    drawArc(color, -90f, 360f * p, false, style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round),
                        topLeft = Offset.Zero, size = Size(size.width, size.height))
                }
            }
        }
    }
}

@Composable
private fun Meta(h: Homework, showSubject: Boolean) {
    val k = h.hwKind
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        SfIcon(k.icon, size = 12.dp, tint = k.color)
        Text(if (showSubject && h.subject.isNotEmpty()) h.subject else k.title, style = ft(Ts.caption), color = Ios.secondaryLabel,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        if (h.steps.isNotEmpty()) Text("· ${h.stepsDone}/${h.steps.size}", style = ft(Ts.caption), color = Ios.secondaryLabel)
        if (h.photos.isNotEmpty()) {
            SfIcon("photo", size = 12.dp, tint = Ios.secondaryLabel)
            Text("${h.photos.size}", style = ft(Ts.caption), color = Ios.secondaryLabel)
        }
        if (h.note.isNotEmpty()) SfIcon("note.text", size = 12.dp, tint = Ios.secondaryLabel)
    }
}

@Composable
private fun StepsInline(h: Homework, color: Color) {
    Column(Modifier.padding(top = 2.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        for (st in h.steps.take(5)) {
            Row(Modifier.clickable(remember { MutableInteractionSource() }, null) { HomeworkStore.toggleStep(h.id, st.id) },
                horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
                SfIcon(if (st.done) "checkmark.circle.fill" else "circle", size = 14.dp, tint = if (st.done) color else Ios.secondaryLabel)
                Text(st.text, style = ft(Ts.caption).let { if (st.done) it.copy(textDecoration = TextDecoration.LineThrough) else it },
                    color = if (st.done) Ios.secondaryLabel else Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (h.steps.size > 5) Text("ещё ${h.steps.size - 5}", style = ft(Ts.caption2), color = Ios.tertiaryLabel)
    }
}

@Composable
private fun DueChip(h: Homework, plain: Boolean) {
    val urg = HWFormat.urgency(h.due, h.done, Brand.color, Ios.secondaryLabel)
    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text((if (h.dueEstimated && !h.done) "≈ " else "") + HWFormat.chip(h.due, h.done), style = ft(Ts.caption, FontWeight.Bold), color = urg,
            maxLines = 1, modifier = if (plain) Modifier.padding(vertical = 2.dp)
            else Modifier.clip(CircleShape).background(urg.copy(alpha = 0.13f)).padding(horizontal = 8.dp, vertical = 4.dp))
        if (h.dueKind.isNotEmpty() && !h.done) Text("к ${HWText.kindDative(h.dueKind)}", style = ft(Ts.caption2), color = Ios.secondaryLabel)
    }
}

// MARK: - Блок на главной

@Composable
fun HWHomeCard(data: ScheduleData, onOpenAll: () -> Unit) {
    HomeworkStore.load()
    val ctx = LocalContext.current
    val count = Defaults.intOrNull("hw.home.count") ?: 3
    val list = HomeworkStore.active.take(maxOf(1, count))
    val overdue = HomeworkStore.overdue.size
    val suggested = HWPlanner.suggestedSlot(data)
    var menu by remember { mutableStateOf(false) }
    Glass(24.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SfIcon("book.closed.fill", size = 18.dp, tint = Brand.color)
                Text("Домашка", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                if (overdue > 0) Text("$overdue просрочено", style = ft(Ts.caption2, FontWeight.Bold), color = Ios.red,
                    modifier = Modifier.clip(CircleShape).background(Ios.red.copy(alpha = 0.12f)).padding(horizontal = 7.dp, vertical = 3.dp))
                Spacer(Modifier.weight(1f))
                Row(Modifier.clickable { Haptics.tap(); onOpenAll() }, verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(if (HomeworkStore.active.size > list.size) "Все ${HomeworkStore.active.size}" else "Открыть",
                        style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
                    SfIcon("chevron.right", size = 11.dp, tint = Ios.secondaryLabel)
                }
                Box {
                    Box(Modifier.size(30.dp, 26.dp).clickable { menu = true }, contentAlignment = Alignment.Center) {
                        SfIcon("ellipsis", size = 16.dp, tint = Ios.secondaryLabel)
                    }
                    MenuPopup(menu, { menu = false }, {
                        item("Вся домашка", "book.closed") { onOpenAll() }
                        nextDay()?.let { (title, l) ->
                            item("Отправить ребятам: ${title.lowercase(RU)}", "paperplane") { Share.text(ctx, HWShare.text(l, title)) }
                        }
                    })
                }
            }
            if (list.isEmpty()) {
                Text("Всё сделано. Задали что-то — запиши, срок встанет к следующей практике.", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (h in list) key(h.id) {
                        ContextMenuBox(items = {
                            item("Отправить ребятам", "paperplane") { shareHomework(ctx, h) }
                            item("Сделано", "checkmark.circle") { HomeworkStore.toggle(h.id) }
                            item("Изменить", "pencil") { HomeworkRouter.edit(h) }
                        }, onClick = { HomeworkRouter.show(h) }) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Box(Modifier.size(24.dp).clickable(remember { MutableInteractionSource() }, null) { HomeworkStore.toggle(h.id) },
                                    contentAlignment = Alignment.Center) {
                                    Box(Modifier.size(20.dp).strokeBorder(SubjectColor.color(h.subject), 1.8.dp, CircleShape))
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(h.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(h.subject, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Text((if (h.dueEstimated) "≈ " else "") + HWFormat.chip(h.due), style = ft(Ts.caption, FontWeight.Bold),
                                    color = HWFormat.urgency(h.due, false, Brand.color, Ios.secondaryLabel), maxLines = 1)
                            }
                        }
                    }
                }
            }
            Pressable({ Haptics.tap(); HomeworkRouter.new(slot = suggested) }) {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.gradient).padding(vertical = 11.dp),
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    SfIcon("plus", size = 15.dp, tint = Color.White)
                    Spacer(Modifier.width(6.dp))
                    Text(if (suggested != null) "Записать с пары «${suggested.lesson.subject}»" else "Записать ДЗ",
                        style = ft(Ts.subheadline, FontWeight.SemiBold), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** ДЗ к ближайшему учебному дню */
private fun nextDay(): Pair<String, List<Homework>>? {
    val now = Instant.now()
    val upcoming = HomeworkStore.active.filter { it.due >= now }.sortedBy { it.due }
    val first = upcoming.firstOrNull() ?: return null
    val day = Cal.startOfDay(first.due)
    val list = upcoming.filter { Cal.isSameDay(it.due, day) }
    val title = when {
        Cal.isToday(day) -> "ДЗ на сегодня"
        Cal.isTomorrow(day) -> "ДЗ на завтра"
        else -> "ДЗ на " + Fmt.format(day, "EEEE, d MMMM")
    }
    return title to list
}

// MARK: - ДЗ в подробностях пары

@Composable
fun HWPairSection(slot: LessonSlot) {
    HomeworkStore.load()
    val dueHere = HomeworkStore.due(slot)
    val given = HomeworkStore.given(slot).filter { g -> dueHere.none { it.id == g.id } }
    val upcoming = slot.start > Instant.now()
    Glass(22.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SfIcon("book.closed.fill", size = 18.dp, tint = Brand.color)
                Text("Домашка", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
            }
            if (dueHere.isNotEmpty()) {
                Text("Сдать на этой паре", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
                for (h in dueHere) key(h.id) { HWRow(h, showSubject = false, compact = true, onOpen = { HomeworkRouter.show(h) }) }
            }
            if (given.isNotEmpty()) {
                Text("Задали на этой паре", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
                for (h in given) key(h.id) { HWRow(h, showSubject = false, compact = true, onOpen = { HomeworkRouter.show(h) }) }
            }
            if (dueHere.isEmpty() && given.isEmpty()) {
                Text(if (upcoming) "К этой паре ничего не задано" else "С этой пары ДЗ не записано", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            }
            Pressable({ Haptics.tap(); HomeworkRouter.new(slot = slot) }) {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.gradient).padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    SfIcon("plus.circle.fill", size = 16.dp, tint = Color.White)
                    Spacer(Modifier.width(6.dp))
                    Text(if (upcoming) "Записать ДЗ к этой паре" else "Записать, что задали", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Color.White)
                }
            }
        }
    }
}
