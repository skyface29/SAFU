package ru.student.safuhub.screens.teachers

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.RoundedCornerShape
import ru.student.safuhub.data.RuzLecturers
import ru.student.safuhub.ui.kit.Spinner
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.core.containsCI
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.NaturalOrder
import ru.student.safuhub.data.RuzEvent
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.SchoolTimetable
import ru.student.safuhub.data.TeacherMode
import ru.student.safuhub.feature.features.Maps
import ru.student.safuhub.screens.teacher.BetaBadge
import ru.student.safuhub.system.LiveFormat
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.KindBadge
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.design.ProgressBar
import ru.student.safuhub.ui.kit.FormColumn
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.LocalPushed
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SearchField
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// MARK: - Преподаватели

data class TeacherInfo(
    val name: String,
    val subjects: MutableSet<String> = mutableSetOf(),
    val kinds: MutableSet<String> = mutableSetOf(),
    var now: LessonSlot? = null,
    var next: LessonSlot? = null,
    var total: Int = 0,
)

object TeacherIndex {
    fun build(data: ScheduleData): List<TeacherInfo> {
        val map = LinkedHashMap<String, TeacherInfo>()
        val now = Instant.now()
        for (s in ScheduleQuery.slots(data, from = -120, days = 240)) {
            if (s.lesson.teacher.isEmpty()) continue
            val info = map.getOrPut(s.lesson.teacher) { TeacherInfo(s.lesson.teacher) }
            info.subjects.add(s.lesson.subject)
            info.kinds.add(KindStyle.of(s.lesson.kind).label)
            info.total += 1
            if (s.start <= now && now < s.end) info.now = s
            if (s.start > now && (info.next == null || s.start < info.next!!.start)) info.next = s
        }
        return map.values.sortedWith { a, b -> NaturalOrder.compare(a.name, b.name) }
    }
}

@Composable
fun TeachersScreen() {
    val nav = LocalNav.current
    val data = ScheduleStore.data
    val school = SchoolTimetable
    var query by remember { mutableStateOf("") }
    val inst = if (data.ruzInstitution > 0) data.ruzInstitution else 3
    val index = remember(data) { TeacherIndex.build(data) }
    val q = query.trim()

    /** С моей группой (у преподавателя в поле «преподаватель» — номера групп, их не показываем) */
    val mine = if (TeacherMode.isOn) emptyList() else index.filter { q.isEmpty() || it.name.containsCI(q) || it.subjects.any { s -> s.containsCI(q) } }
    /** Все преподаватели школы из общего расписания */
    val mineNames = mine.map { it.name }.toSet()
    val all = if (TeacherMode.isOn) school.teachers().filter { (name, subjects) ->
        name !in mineNames && (q.isEmpty() || name.containsCI(q) || subjects.any { it.containsCI(q) })
    } else emptyList()

    LaunchedEffect(Unit) { if (TeacherMode.isOn) school.load(inst) }

    Screen("Преподаватели", large = !LocalPushed.current) {
        SearchField(query, { query = it }, "Фамилия или предмет", Modifier.padding(horizontal = 16.dp).padding(bottom = 12.dp))
        FormColumn {
            if (mine.isNotEmpty()) {
                FormSection("Ведут пары у тебя") {
                    for (t in mine) row(onClick = { Haptics.tap(); nav?.push { TeacherDetailScreen(t.name) } }) {
                        TeacherRow(t.name, t.subjects.sorted(), t.now != null)
                    }
                }
            }
            if (!TeacherMode.isOn && mine.isEmpty()) {
                FormSection {
                    row { Text(if (query.isEmpty()) "В твоём расписании пока нет преподавателей" else "Никого не нашлось", style = ft(Ts.body), color = Ios.secondaryLabel) }
                }
            }
            if (TeacherMode.isOn) {
                val footer = when {
                    school.scannedAt != null && school.institution == inst ->
                        "Из расписаний всех групп всех школ и филиалов · обновлено ${Fmt.format(school.scannedAt!!, "d MMM, HH:mm")}" +
                            if (school.failedGroups > 0) " · не ответили групп: ${school.failedGroups}" else ""
                    school.error != null -> school.error!!
                    else -> "Приложение один раз просмотрит расписания всех групп САФУ — своя школа первой, потом остальные школы и филиалы (несколько минут). Дальше полное расписание любого преподавателя открывается сразу."
                }
                FormSection(headerContent = {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("ВСЕ ПРЕПОДАВАТЕЛИ САФУ", style = ft(Ts.footnote), color = Ios.secondaryLabel)
                        BetaBadge()
                    }
                }, footer = footer) {
                    when {
                        school.isScanning -> row {
                            Column(Modifier.weight(1f).padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Загружаю расписание всех групп САФУ…", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                                ProgressBar((school.progress ?: 0.0).toFloat(), Brand.color)
                            }
                        }
                        school.institution != inst || school.events.isEmpty() ->
                            button("Загрузить всех преподавателей САФУ", "arrow.down.circle.fill") { AppScope.launch { school.ensure(inst) } }
                        else -> {
                            for ((name, subjects) in all.take(if (query.isEmpty()) 60 else 300)) {
                                row(onClick = { Haptics.tap(); nav?.push { TeacherDetailScreen(name) } }) { TeacherRow(name, subjects, false) }
                            }
                            if (query.isEmpty() && all.size > 60) row {
                                Text("И ещё ${all.size - 60} — найди поиском по фамилии или предмету", style = ft(Ts.caption), color = Ios.secondaryLabel)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TeacherRow(name: String, subjects: List<String>, now: Boolean) {
    Column(Modifier.weight(1f).padding(vertical = 2.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(name, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, modifier = Modifier.weight(1f, fill = false))
            if (now) Text("СЕЙЧАС", style = ft(Ts.caption2, FontWeight.ExtraBold), color = Color.White,
                modifier = Modifier.clip(CircleShape).background(Ios.green).padding(horizontal = 6.dp, vertical = 2.dp))
        }
        Text(subjects.joinToString(", "), style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
    SfIcon("chevron.right", size = 14.dp, tint = Ios.tertiaryLabel)
}

private fun dayTitle(d: Instant): String = when {
    Cal.isToday(d) -> "Сегодня"
    Cal.isTomorrow(d) -> "Завтра"
    else -> Fmt.format(d, "EEEE, d MMMM").split(" ").joinToString(" ") { it.capitalizedFirstLetter() }
}

/** Полное расписание преподавателя по всем группам школы: где он сейчас, где будет, какие группы */
@Composable
fun TeacherDetailScreen(name: String) {
    if (TeacherMode.isOn) FullTeacher(name) else MyTeacher(name)
}

@Composable
private fun FullTeacher(name: String) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val data = ScheduleStore.data
    val school = SchoolTimetable
    val inst = if (data.ruzInstitution > 0) data.ruzInstitution else 3
    // Все пары преподавателя (одинаковые пары разных групп склеены). Считаются, когда меняются данные школы
    val lessons = remember(school.events, school.institution) {
        if (school.institution == inst) TeacherMode.merge(school.events(name)) else emptyList()
    }
    LaunchedEffect(Unit) { school.ensure(inst) }
    val now = Instant.now()
    val current = lessons.firstOrNull { it.start <= now && now < it.end }
    val upcoming = lessons.filter { it.start > now }
    val days = upcoming.take(80).groupBy { Cal.startOfDay(it.start) }.toSortedMap()
    val subjects = lessons.map { it.subject }.toSet().sorted()
    val groupsList = lessons.flatMap { TeacherMode.groups(it.teacher) }.toSet().sorted()

    Screen("Преподаватель") {
        FormColumn {
            FormSection {
                raw {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(name, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label, modifier = Modifier.weight(1f, fill = false))
                            BetaBadge()
                        }
                        if (subjects.isNotEmpty()) Text(subjects.joinToString(", "), style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                        if (groupsList.isNotEmpty()) {
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                for (g in groupsList) Text(g, style = ft(Ts.caption, FontWeight.SemiBold, mono = true), color = Ios.label,
                                    modifier = Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.12f)).padding(horizontal = 9.dp, vertical = 5.dp))
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            TextButton({ Share.copy(name); Haptics.success() }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                IconLabel("Скопировать ФИО", "doc.on.doc", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color, spacing = 4.dp)
                            }
                            if (lessons.isNotEmpty()) Text("пар впереди: ${upcoming.size}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                    }
                }
            }
            if (school.isScanning && lessons.isEmpty()) {
                FormSection {
                    row {
                        Column(Modifier.weight(1f).padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Собираю расписание по всем группам САФУ…", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                            ProgressBar((school.progress ?: 0.0).toFloat(), Brand.color)
                            Text("Один раз — несколько минут, своя школа первой. Дальше открывается сразу.", style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                    }
                }
            } else if (lessons.isEmpty()) {
                FormSection {
                    row { Text(school.error ?: "В расписаниях групп САФУ пар этого преподавателя не нашлось.", style = ft(Ts.body), color = Ios.secondaryLabel) }
                    button("Обновить из РУЗ", "arrow.clockwise") { scope.launch { school.ensure(inst, force = true) } }
                }
            }
            current?.let { c -> FormSection("Сейчас") { raw { EventRow(c, true) { openMap(ctx, it) } } } }
            for ((day, items) in days) {
                FormSection(dayTitle(day)) { for (e in items) raw { EventRow(e, false) { openMap(ctx, it) } } }
            }
        }
    }
}

private fun openMap(ctx: android.content.Context, address: String) {
    if (address.isEmpty()) return
    Maps.smartURL(address)?.let { Share.url(ctx, it) }
}

@Composable
private fun EventRow(e: RuzEvent, highlight: Boolean, onMap: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().background(if (highlight) Ios.green.copy(alpha = 0.15f) else Color.Transparent)
        .clickable(enabled = e.address.isNotEmpty()) { onMap(e.address) }
        .padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.width(48.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(Fmt.format(e.start, "HH:mm"), style = ft(Ts.subheadline, FontWeight.Bold, mono = true), color = Ios.label)
            Text(Fmt.format(e.end, "HH:mm"), style = ft(Ts.caption, mono = true), color = Ios.secondaryLabel)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (e.kind.isNotEmpty()) KindBadge(e.kind, 9f)
                Text(e.teacher, style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color)
            }
            Text(e.subject, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
            if (e.room.isNotEmpty() || e.address.isNotEmpty()) {
                IconLabel(listOf(if (e.room.isEmpty()) "" else "ауд. ${e.room}", AddressFormat.full(e.address)).filter { it.isNotEmpty() }.joinToString(" · "),
                    "mappin.and.ellipse", style = ft(Ts.caption), color = Ios.secondaryLabel, spacing = 4.dp)
            }
        }
    }
}

private data class TeacherRowData(
    val start: Instant, val end: Instant, val kind: String, val subject: String,
    val groups: String, val room: String, val address: String, val mine: Boolean,
)

/** Студенту: все пары преподавателя по всему вузу — со страницы преподавателя в РУЗ (как iPhone 19.8).
 *  Пока она грузится (или если РУЗ не ответил) — пары этого преподавателя из своего расписания. */
@Composable
private fun MyTeacher(name: String) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val data = ScheduleStore.data
    val school = SchoolTimetable
    val slots = remember(data.lastSync, data) { ScheduleQuery.slots(data, from = 0, days = 60).filter { it.lesson.teacher == name } }
    var everywhere by remember(name) { mutableStateOf<List<RuzEvent>?>(null) }
    var loading by remember { mutableStateOf(false) }
    var scanning by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val myGroup = data.ruzGroupNumber.trim()

    // Запасной путь: пары преподавателя из расписания всех групп вуза (собирается один раз)
    suspend fun loadFromSchool(force: Boolean) {
        val inst = if (data.ruzInstitution > 0) data.ruzInstitution else 3
        school.load(inst)
        fun take(): Boolean {
            val found = TeacherMode.merge(school.events(name))
            if (found.isEmpty()) return false
            everywhere = found
            problem = null
            return true
        }
        val had = take()
        if (had && !force && school.isFresh(inst)) return
        scanning = true
        try { school.ensure(inst, force) { _, _ -> take() } } catch (_: Throwable) {}
        scanning = false
        if (!take() && everywhere == null) problem = "В РУЗ не нашлось пар этого преподавателя — показаны пары вашей группы"
    }

    // Сначала с диска, потом свежие из РУЗ (не чаще раза в 3 часа)
    suspend fun loadEverywhere(force: Boolean) {
        var id = RuzLecturers.knownID(name)
        if (id != null && everywhere == null) RuzLecturers.cached(id)?.let { (ev, at) ->
            everywhere = ev
            if (!force && java.time.Duration.between(at, Instant.now()).seconds < 3 * 3600) return
        }
        loading = true
        try {
            if (id == null) id = RuzLecturers.findID(name, data.ruzGroupID)
            if (id == null) { loadFromSchool(force); return }
            val list = try { RuzLecturers.load(id) } catch (_: Throwable) { emptyList() }
            if (list.isNotEmpty()) { everywhere = list; problem = null } else loadFromSchool(force)
        } finally { loading = false }
    }

    LaunchedEffect(name, data.lastSync) { loadEverywhere(false) }

    val rows = everywhere?.map { e ->
        TeacherRowData(e.start, e.end, e.kind, e.subject, e.teacher, e.room, e.address,
            myGroup.isNotEmpty() && myGroup in TeacherMode.groups(e.teacher))
    } ?: slots.map {
        TeacherRowData(it.start, it.end, it.lesson.kind, it.lesson.subject, if (myGroup.isEmpty()) "" else "Группа $myGroup",
            it.lesson.room, it.address, true)
    }
    val now = Instant.now()
    val days = rows.filter { it.end > now }.sortedBy { it.start }.take(120).groupBy { Cal.startOfDay(it.start) }.toSortedMap()
    val subjects = rows.map { it.subject }.filter { it.isNotEmpty() }.toSet().sorted()
    val busy = loading || scanning

    Screen("Преподаватель") {
        FormColumn {
            FormSection {
                raw {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(name, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                        if (subjects.isNotEmpty()) Text(subjects.joinToString(", "), style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                        if (busy) TeacherLoadingCard(if (scanning) school.progress else null)
                        else NowStatus(rows, everywhere != null) { openMap(ctx, it) }
                        if (!busy) {
                            when {
                                everywhere != null -> IconLabel("Все пары по вузу из РУЗ", "building.columns", style = ft(Ts.caption), color = Ios.secondaryLabel, spacing = 6.dp)
                                problem != null -> IconLabel(problem!!, "exclamationmark.circle", style = ft(Ts.caption), color = Ios.secondaryLabel, spacing = 6.dp)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            TextButton({ Share.copy(name); Haptics.success() }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                IconLabel("Скопировать ФИО", "doc.on.doc", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color, spacing = 4.dp)
                            }
                            if (!busy) TextButton({ scope.launch { loadEverywhere(true) } }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                IconLabel("Обновить", "arrow.clockwise", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color, spacing = 4.dp)
                            }
                        }
                    }
                }
            }
            if (days.isEmpty() && !busy) FormSection { row { Text("Пар с этим преподавателем впереди нет", style = ft(Ts.body), color = Ios.secondaryLabel) } }
            for ((day, items) in days) {
                FormSection(dayTitle(day)) {
                    for (s in items) raw {
                        val live = s.start <= now && now < s.end
                        Row(Modifier.fillMaxWidth().background(if (live) Ios.green.copy(alpha = 0.15f) else Color.Transparent)
                            .clickable(enabled = s.address.isNotEmpty()) { openMap(ctx, s.address) }
                            .padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.width(48.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(LiveFormat.hmText(s.start), style = ft(Ts.subheadline, FontWeight.Bold, mono = true), color = Ios.label)
                                Text(LiveFormat.hmText(s.end), style = ft(Ts.caption, mono = true), color = Ios.secondaryLabel)
                            }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                KindBadge(s.kind, 9f)
                                Text(s.subject, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                                if (everywhere != null && s.groups.isNotEmpty()) {
                                    IconLabel(if (s.mine) "${s.groups} · ваша" else s.groups, "person.3",
                                        style = ft(Ts.caption, if (s.mine) FontWeight.SemiBold else FontWeight.Normal),
                                        color = if (s.mine) Brand.color else Ios.secondaryLabel, spacing = 4.dp)
                                }
                                if (s.room.isNotEmpty() || s.address.isNotEmpty()) {
                                    IconLabel(listOf(if (s.room.isEmpty()) "" else "ауд. ${s.room}", AddressFormat.full(s.address))
                                        .filter { it.isNotEmpty() }.joinToString(" · "), "mappin.and.ellipse", style = ft(Ts.caption),
                                        color = Ios.secondaryLabel, spacing = 4.dp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Крупная понятная плашка, пока РУЗ собирает пары преподавателя */
@Composable
private fun TeacherLoadingCard(progress: Double?) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Brand.color.copy(alpha = 0.1f))
        .border(1.dp, Brand.color.copy(alpha = 0.25f), RoundedCornerShape(18.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Spinner(20.dp)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Загружаю расписание из РУЗ", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                Text("Подожди немного — собираю все пары преподавателя по вузу", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            }
        }
        if (progress != null) {
            ProgressBar(progress.toFloat(), Brand.color)
            Row {
                Text("${(progress * 100).toInt()}%", style = ft(Ts.subheadline, FontWeight.Bold, mono = true), color = Brand.color)
                Spacer(Modifier.weight(1f))
                Text("в первый раз — около минуты, потом сразу", style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
        }
        Text("Пока загружается, ниже — пары только с вашей группой", style = ft(Ts.caption), color = Ios.secondaryLabel)
    }
}

/** Где преподаватель сейчас: на паре (аудитория, до скольки) или свободен до следующей */
@Composable
private fun NowStatus(rows: List<TeacherRowData>, full: Boolean, onMap: (String) -> Unit) {
    val now = Instant.now()
    val cur = rows.firstOrNull { it.start <= now && now < it.end }
    val next = rows.filter { it.start > now && Cal.isToday(it.start) }.minByOrNull { it.start }
    when {
        cur != null -> StatusLine("dot.radiowaves.left.and.right", Ios.green, "Сейчас на паре до ${LiveFormat.hmText(cur.end)}",
            listOf(if (cur.room.isEmpty()) "" else "ауд. ${cur.room}", AddressFormat.full(cur.address), cur.groups).filter { it.isNotEmpty() }.joinToString(" · ")) { onMap(cur.address) }
        next != null -> StatusLine("clock", Brand.color, "Сейчас свободен · следующая пара в ${LiveFormat.hmText(next.start)}",
            listOf(if (next.room.isEmpty()) "" else "ауд. ${next.room}", AddressFormat.full(next.address)).filter { it.isNotEmpty() }.joinToString(" · ")) { onMap(next.address) }
        full -> StatusLine("moon.zzz", Ios.secondaryLabel, "Сегодня пар больше нет", "") {}
    }
}

@Composable
private fun StatusLine(icon: String, color: Color, title: String, detail: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(color.copy(alpha = 0.1f)).clickable { onClick() }.padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SfIcon(icon, Modifier.padding(horizontal = 3.dp), size = 16.dp, tint = color)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
            if (detail.isNotEmpty()) Text(detail, style = ft(Ts.caption), color = Ios.secondaryLabel)
        }
    }
}
