package ru.student.safuhub.feature.place

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import ru.student.safuhub.App
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decodeOrNull
import ru.student.safuhub.core.encodeBytes
import ru.student.safuhub.core.g
import ru.student.safuhub.core.hm
import ru.student.safuhub.core.rx
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.Bells
import ru.student.safuhub.data.Building
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.NaturalOrder
import ru.student.safuhub.data.RuzClient
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.features.Maps
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.ProgressBar
import ru.student.safuhub.ui.design.glass
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.DateChips
import ru.student.safuhub.ui.kit.DateMode
import ru.student.safuhub.ui.kit.Divider
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.Segmented
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.time.Instant

// MARK: - «Где пара»: аудитория, корпус, этаж, как найти, маршрут
// MARK: - «Свободные аудитории»: по расписанию всех групп школы из РУЗ

/** Свои заметки «как найти аудиторию» — один раз записал, дальше подсказка всегда под рукой */
object RoomNotes {
    private const val key = "room.notes"

    fun key(room: String, address: String): String =
        "${AddressFormat.full(address).lowercase(RU)}|${room.lowercase(RU)}"

    fun get(room: String, address: String): String {
        val all = Defaults.dictionary(key) ?: emptyMap()
        return all[key(room, address)] as? String ?: ""
    }

    fun set(text: String, room: String, address: String) {
        val all = HashMap<String, Any>(Defaults.dictionary(key) ?: emptyMap())
        val k = key(room, address)
        val t = text.trim()
        if (t.isEmpty()) all.remove(k) else all[k] = t
        Defaults.set(key, all)
    }

    /** Этаж по номеру аудитории: у трёхзначных номеров первая цифра — этаж */
    fun floorHint(room: String): String? {
        val digits = room.takeWhile { it.isDigit() }
        if (digits.length != 3) return null
        val n = digits.first().digitToInt()
        return if (n > 0) "$n этаж" else null
    }
}

/** Лист «Где пара» со своим стеком (оттуда — «Свободные аудитории») */
@Composable
fun PairPlaceSheet(slot: LessonSlot) = DoneSheet { PairPlaceScreen(slot) }

@Composable
fun PairPlaceScreen(slot: LessonSlot) {
    val ctx = LocalContext.current
    val nav = LocalNav.current
    val room = slot.lesson.room
    val remote = slot.isRemote
    val note = remember { mutableStateOf(RoomNotes.get(room, slot.address)) }
    var copied by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { RoomNotes.set(note.value, room, slot.address) } }
    LaunchedEffect(copied) { if (copied) { delay(1500); copied = false } }

    Screen("Где пара", background = { AmbientBackground() }) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // герой: большая аудитория
            Glass(26.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(vertical = 20.dp, horizontal = 12.dp), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(70.dp).shadow(14.dp, CircleShape, ambientColor = Brand.color.copy(alpha = 0.4f), spotColor = Brand.color.copy(alpha = 0.4f))
                        .clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                        SfIcon(if (remote) "laptopcomputer" else "mappin.and.ellipse", size = 32.dp, tint = Color.White)
                    }
                    Text(if (room.isEmpty()) (if (remote) "Дистанционно" else "Аудитория не указана") else "ауд. $room",
                        style = ft(34f, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label, textAlign = TextAlign.Center)
                    Text(slot.lesson.subject, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
                    Text(timeText(slot), style = ft(Ts.caption, FontWeight.Bold), color = Brand.color)
                }
            }
            // корпус, этаж, преподаватель
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    InfoRow("building.2.fill", "Корпус", if (slot.address.isEmpty()) "не указан в расписании" else AddressFormat.full(slot.address))
                    RoomNotes.floorHint(room)?.let { f ->
                        Divider(alpha = 0.4f)
                        InfoRow("stairs", "Этаж", "$f (по номеру аудитории)")
                    }
                    if (slot.lesson.teacher.isNotEmpty()) {
                        Divider(alpha = 0.4f)
                        InfoRow("person.fill", "Преподаватель", slot.lesson.teacher)
                    }
                }
            }
            // маршрут и копирование
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val noRoute = slot.address.isEmpty() || remote
                Pressable({ Haptics.tap(); Maps.smartURL(slot.address)?.let { Share.url(ctx, it) } }, Modifier.weight(1f).alpha(if (noRoute) 0.5f else 1f),
                    enabled = !noRoute) {
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brand.gradient).padding(vertical = 13.dp), contentAlignment = Alignment.Center) {
                        IconLabel("Маршрут", "figure.walk", style = ft(Ts.subheadline, FontWeight.Bold), color = Color.White, iconColor = Color.White, spacing = 6.dp)
                    }
                }
                Pressable({
                    val parts = mutableListOf<String>()
                    if (room.isNotEmpty()) parts.add("ауд. $room")
                    if (slot.address.isNotEmpty()) parts.add(AddressFormat.full(slot.address))
                    Share.copy(parts.joinToString(", "))
                    Haptics.success()
                    copied = true
                }, Modifier.weight(1f)) {
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brand.color.copy(alpha = 0.14f)).padding(vertical = 13.dp),
                        contentAlignment = Alignment.Center) {
                        AnimatedContent(copied, label = "copied") { c ->
                            IconLabel(if (c) "Скопировано" else "Скопировать", if (c) "checkmark" else "doc.on.doc",
                                style = ft(Ts.subheadline, FontWeight.Bold), color = Brand.color, iconColor = Brand.color, spacing = 6.dp)
                        }
                    }
                }
            }
            // как найти
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconLabel("Как найти", "signpost.right.fill", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), iconColor = Brand.color, spacing = 6.dp)
                    IosTextField(note.value, { note.value = it }, "Например: 3 этаж, от лестницы направо, дверь в конце", Modifier.fillMaxWidth(),
                        style = ft(Ts.subheadline), singleLine = false, minLines = 2)
                    Text("Запиши один раз — подсказка будет появляться у этой аудитории всегда.", style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
            }
            // свободные аудитории рядом
            Pressable({ Haptics.tap(); nav?.push { FreeRoomsScreen(slot.address) } }, Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().glass(22.dp).padding(16.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    SfGradientIcon("door.left.hand.open", size = 24.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Свободные аудитории рядом", style = ft(Ts.subheadline, FontWeight.Bold), color = Ios.label)
                        Text("Где посидеть в окно между парами", style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                    SfIcon("chevron.right", size = 14.dp, tint = Ios.tertiaryLabel)
                }
            }
        }
    }
}

private fun timeText(slot: LessonSlot): String {
    val f = Fmt.format(slot.start, if (Cal.isToday(slot.start)) "'сегодня', H:mm" else "EEEE d MMMM, H:mm")
    return "$f–${hm(slot.end)}"
}

@Composable
private fun InfoRow(icon: String, title: String, value: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) { SfGradientIcon(icon, size = 17.dp) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = ft(Ts.caption), color = Ios.secondaryLabel)
            Text(value, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
        }
    }
}

// MARK: - Свободные аудитории

@Serializable
data class RoomBusy(
    val room: String,
    val address: String,
    val start: AppleDate,
    val end: AppleDate,
    /** Как аудитория записана в РУЗ целиком («А-НСД2/1016» и т.п.) */
    val code: String? = null,
)

data class FreeRoom(val room: String, val code: String, val until: Instant?)

/**
 * Сканирует расписания всех групп школы. Запросы идут без кук —
 * сканирование сотен групп не трогает сессию РУЗ с твоим расписанием.
 */
object FreeRoomsStore {
    var busy by mutableStateOf<List<RoomBusy>>(emptyList()); private set
    var scannedAt by mutableStateOf<Instant?>(null); private set
    var institution by mutableIntStateOf(0); private set
    var scanning by mutableStateOf(false); private set
    var done by mutableIntStateOf(0); private set
    var total by mutableIntStateOf(0); private set
    var error by mutableStateOf<String?>(null)

    @Serializable
    private data class Blob(val busy: List<RoomBusy>, val scannedAt: AppleDate, val institution: Int)

    private val file: File get() = File(App.ctx.cacheDir, "free-rooms.v3.json")

    init {
        decodeOrNull<Blob>(try { file.readBytes() } catch (_: Throwable) { null })?.let { b ->
            busy = b.busy
            scannedAt = b.scannedAt
            institution = b.institution
        }
    }

    fun isFresh(inst: Int): Boolean {
        val s = scannedAt ?: return false
        return inst == institution && Instant.now().epochSecond - s.epochSecond < 12 * 3600
    }

    /** Корпуса, которые встречаются в расписании школы (самые загруженные сверху) */
    val addresses: List<String>
        get() = busy.groupingBy { it.address }.eachCount().entries.sortedByDescending { it.value }.map { it.key }

    /** Аудитории корпуса, свободные весь промежуток; до скольки свободна — если дальше в этот день есть пара */
    fun free(address: String, from: Instant, to: Instant): List<FreeRoom> {
        val here = busy.filter { it.address == address }
        val dayEnd = Cal.addDays(Cal.startOfDay(from), 1)
        val out = mutableListOf<FreeRoom>()
        for ((r, list) in here.groupBy { it.room }) {
            if (list.any { it.start < to && it.end > from }) continue
            val next = list.filter { it.start >= to && it.start < dayEnd }.minOfOrNull { it.start }
            val code = list.mapNotNull { it.code }.firstOrNull { it.isNotEmpty() } ?: ""
            out.add(FreeRoom(r, code, next))
        }
        return out.sortedWith { a, b -> NaturalOrder.compare(a.room, b.room) }
    }

    /** Даты, на которые в РУЗ есть данные */
    val coveredRange: ClosedRange<Instant>?
        get() {
            val lo = busy.minOfOrNull { it.start } ?: return null
            val hi = busy.maxOfOrNull { it.end } ?: return null
            return lo..hi
        }

    suspend fun scan(inst: Int, buildings: List<Building>) {
        if (scanning) return
        scanning = true
        error = null
        done = 0
        total = 0
        try {
            val html = try { RuzClient.fetch("${RuzClient.base}?groups&institution=$inst") } catch (_: Throwable) { null }
            if (html == null) {
                error = "Нет связи с РУЗ. Попробуй позже."
                return
            }
            val ids = LinkedHashSet<String>()
            for (m in html.rx("group=(\\d+)")) ids.add(m.g(1))
            if (ids.isEmpty()) {
                error = "Не нашёл группы этой школы в РУЗ."
                return
            }
            total = ids.size
            val result = HashSet<RoomBusy>()
            for (chunk in ids.toList().chunked(8)) {
                val part = coroutineScope { chunk.map { id -> async { fetchBusy(id, buildings) } }.awaitAll() }
                part.forEach { result.addAll(it) }
                done += chunk.size
            }
            busy = result.toList()
            scannedAt = Instant.now()
            institution = inst
            if (busy.isEmpty()) error = "В РУЗ не нашлось пар с аудиториями."
            val blob = Blob(busy, Instant.now(), inst)
            AppScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    val tmp = File(file.path + ".tmp")
                    tmp.writeBytes(encodeBytes(blob))
                    tmp.renameTo(file)
                } catch (_: Throwable) {}
            }
        } finally {
            scanning = false
        }
    }

    private suspend fun fetchBusy(groupID: String, buildings: List<Building>): List<RoomBusy> {
        val html = try { RuzClient.fetch(RuzClient.timetableURL(groupID)) } catch (_: Throwable) { return emptyList() }
        return RuzClient.parseHTML(html).mapNotNull { e ->
            if (AddressFormat.isRemote(e.address) || AddressFormat.isRemote(e.room)) return@mapNotNull null
            val (locRoom, locAddress) = AddressFormat.decode(e.room, e.address, buildings)
            val room = locRoom.trim()
            if (room.isEmpty() || locAddress.isEmpty()) return@mapNotNull null
            // как аудитория записана в РУЗ целиком: «ауд. 1016, А-НСД2/1016»
            val parts = mutableListOf<String>()
            val rawRoom = e.room.trim()
            val rawAddr = e.address.trim()
            if (rawRoom.isNotEmpty()) parts.add("ауд. $rawRoom")
            if (rawAddr.isNotEmpty()) parts.add(rawAddr)
            RoomBusy(room, locAddress, e.start, e.end, parts.joinToString(", "))
        }
    }
}

@Composable
fun FreeRoomsScreen(preferredAddress: String? = null) {
    val data = ScheduleStore.data
    val store = FreeRoomsStore
    var institution by remember { mutableIntStateOf(0) }
    var address by remember { mutableStateOf("") }
    var from by remember { mutableStateOf(Instant.now()) }
    var span by remember { mutableIntStateOf(95) }

    /** Корпуса из твоего расписания — их показываем первыми и выбираем по умолчанию */
    fun myAddresses(): List<String> {
        val seen = HashSet<String>()
        return ScheduleQuery.slots(data, days = 14).mapNotNull { s ->
            val a = s.address
            if (a.isEmpty() || AddressFormat.isRemote(a) || !seen.add(a)) null else a
        }
    }

    fun pickAddress() {
        val list = store.addresses
        if (list.isEmpty()) return
        if (address.isNotEmpty() && address in list) return
        if (preferredAddress.isNullOrEmpty()) {
            val mine = myAddresses().map { AddressFormat.full(it) }
            list.firstOrNull { AddressFormat.full(it) in mine }?.let { address = it; return }
        }
        if (!preferredAddress.isNullOrEmpty()) {
            val p: String = preferredAddress
            val loc = AddressFormat.decode("", p, data.buildings).second
            list.firstOrNull { it == p || it == loc || AddressFormat.full(it) == AddressFormat.full(p) }?.let { address = it; return }
        }
        address = list[0]
    }

    fun rescan() {
        val inst = institution
        AppScope.launch { store.scan(inst, ScheduleStore.data.buildings) }
    }

    LaunchedEffect(Unit) {
        if (institution == 0) {
            val mine = data.ruzInstitution
            institution = if (mine > 0) mine else (RuzClient.institutions.firstOrNull()?.first ?: 3)
        }
        pickAddress()
        if (!store.isFresh(institution)) rescan()
    }
    // после сканирования — выбрать корпус
    LaunchedEffect(store.scannedAt, store.busy) { pickAddress() }

    Screen("Свободные аудитории", background = { AmbientBackground() }) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // школа и состояние сканирования
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IosMenu({
                            for ((id, name) in RuzClient.institutions) item(name, checked = id == institution) {
                                if (id != institution) {
                                    institution = id
                                    if (store.isFresh(id)) pickAddress() else rescan()
                                }
                            }
                        }) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(RuzClient.institutions.firstOrNull { it.first == institution }?.second ?: "Школа",
                                    style = ft(Ts.body), color = Brand.color)
                                SfIcon("chevron.up.chevron.down", size = 14.dp, tint = Brand.color)
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        Pressable({ Haptics.tap(); rescan() }, enabled = !store.scanning) {
                            IconLabel("Обновить", "arrow.clockwise", style = ft(Ts.caption, FontWeight.Bold),
                                color = if (store.scanning) Ios.tertiaryLabel else Brand.color,
                                iconColor = if (store.scanning) Ios.tertiaryLabel else Brand.color, spacing = 4.dp)
                        }
                    }
                    val err = store.error
                    val at = store.scannedAt
                    when {
                        store.scanning -> {
                            ProgressBar(store.done.toFloat() / maxOf(1, store.total), Brand.color)
                            Text(if (store.total == 0) "Загружаю список групп…" else "Смотрю расписания групп: ${store.done} из ${store.total}",
                                style = ft(Ts.caption), color = Ios.secondaryLabel)
                        }
                        err != null -> Text(err, style = ft(Ts.caption), color = Ios.orange)
                        at != null -> Text("Обновлено ${Fmt.relative(at)} · аудиторий: ${store.busy.map { it.address + it.room }.toSet().size}",
                            style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                }
            }

            if (store.busy.isNotEmpty()) {
                // фильтры: корпус, время, длительность
                Glass(22.dp, Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        IosMenu({
                            val mine = myAddresses().map { AddressFormat.full(it) }.toSet()
                            val all = store.addresses
                            val sorted = all.filter { AddressFormat.full(it) in mine } + all.filter { AddressFormat.full(it) !in mine }
                            for (a in sorted) item(AddressFormat.full(a), checked = a == address) { address = a }
                        }, Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                SfGradientIcon("building.2.fill", size = 18.dp)
                                Text(if (address.isEmpty()) "Выбери корпус" else AddressFormat.full(address), style = ft(Ts.subheadline, FontWeight.SemiBold),
                                    color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                SfIcon("chevron.up.chevron.down", size = 13.dp, tint = Ios.secondaryLabel)
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Когда", style = ft(Ts.subheadline), color = Ios.label, modifier = Modifier.weight(1f))
                            DateChips(from, { from = it }, DateMode.DATE_TIME)
                        }
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Chip("Сейчас") { from = Instant.now() }
                            for (i in Bells.times.indices) {
                                Chip("${i + 1} пара") {
                                    Bells.interval(i + 1, from)?.let { from = it.first; span = 95 }
                                }
                            }
                        }
                        Segmented(listOf(30 to "30 мин", 95 to "Пара", 200 to "Две пары"), span, { span = it }, Modifier.fillMaxWidth())
                    }
                }
                Results(address, from, from.plusSeconds(span * 60L))
            }

            Text("Считается по расписанию всех групп выбранной школы в РУЗ. Аудиторию могут занять другие школы, консультации или мероприятия — это подсказка, а не гарантия.",
                style = ft(Ts.caption), color = Ios.secondaryLabel)
        }
    }
}

@Composable
private fun Chip(title: String, action: () -> Unit) {
    Pressable({ Haptics.tap(); action() }) {
        Text(title, style = ft(Ts.caption, FontWeight.Bold), color = Brand.color,
            modifier = Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.14f)).padding(horizontal = 12.dp, vertical = 7.dp))
    }
}

@Composable
private fun Results(address: String, from: Instant, to: Instant) {
    val list = if (address.isEmpty()) emptyList() else FreeRoomsStore.free(address, from, to)
    val covered = FreeRoomsStore.coveredRange?.contains(from) ?: false
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Свободно: ${list.size}", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
        when {
            !covered -> Text("На эту дату в РУЗ пока нет расписания — обычно там только эта и следующая неделя.",
                style = ft(Ts.caption), color = Ios.orange)
            list.isEmpty() -> Text("Всё занято. Попробуй другое время или корпус.", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            else -> BoxWithConstraints(Modifier.fillMaxWidth()) {
                // как LazyVGrid(.adaptive(minimum: 150), spacing: 10)
                val columns = maxOf(1, ((maxWidth.value + 10) / 160).toInt())
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    for (row in list.chunked(columns)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            for (r in row) RoomCard(r, address, Modifier.weight(1f))
                            repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RoomCard(r: FreeRoom, address: String, modifier: Modifier) {
    ContextMenuBox({
        item("Скопировать", "doc.on.doc") { Share.copy("ауд. ${r.room}, ${AddressFormat.full(address)}") }
    }, modifier) {
        Glass(16.dp, Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("ауд. ${r.room}", style = ft(Ts.headline, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label, maxLines = 1,
                    overflow = TextOverflow.Ellipsis)
                Text(roomPlace(r, address), style = ft(Ts.caption2), color = Ios.secondaryLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(r.until?.let { "свободна до ${hm(it)}" } ?: "свободна до вечера", style = ft(Ts.caption2, FontWeight.SemiBold),
                    color = if (r.until == null) Ios.green else Ios.secondaryLabel)
            }
        }
    }
}

/** Корпус и код РУЗ под номером аудитории */
private fun roomPlace(r: FreeRoom, address: String): String {
    val place = AddressFormat.full(address)
    if (r.code.isEmpty() || r.code == "ауд. ${r.room}") return place
    return "${r.code} · $place"
}
