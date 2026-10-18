package ru.student.safuhub.screens.tools

import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.ZipWriter
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefDouble
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.AddressFormat
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.files.FilePreviewSheet
import ru.student.safuhub.feature.features.Maps
import ru.student.safuhub.feature.map.Geo
import ru.student.safuhub.feature.map.MapPin
import ru.student.safuhub.feature.map.TileMap
import ru.student.safuhub.feature.map.YandexMap
import ru.student.safuhub.feature.map.YandexMapView
import ru.student.safuhub.feature.map.countBadge
import ru.student.safuhub.system.Notify
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.ProgressRing
import ru.student.safuhub.ui.design.rememberNow
import ru.student.safuhub.ui.kit.FormColumn
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalPushed
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.Segmented
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.max

// MARK: - Карта корпусов

private data class AddrInfo(val address: String, val count: Int, val next: String)

@Composable
fun CampusMapScreen() {
    val ctx = LocalContext.current
    val data = ScheduleStore.data
    val addresses = remember(data) {
        val counts = LinkedHashMap<String, Int>()
        val firsts = HashMap<String, String>()
        for (s in ScheduleQuery.slots(data, days = 14)) {
            if (s.address.isEmpty()) continue
            counts[s.address] = (counts[s.address] ?: 0) + 1
            if (s.address !in firsts) firsts[s.address] = "${Fmt.format(s.start, "EE, d MMM · H:mm")}: ${s.lesson.subject}"
        }
        counts.map { AddrInfo(it.key, it.value, firsts[it.key] ?: "") }.sortedByDescending { it.count }
    }
    var pins by remember { mutableStateOf<List<Pair<AddrInfo, Pair<Double, Double>>>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(addresses) {
        if (addresses.isEmpty()) return@LaunchedEffect
        loading = true
        val out = mutableListOf<Pair<AddrInfo, Pair<Double, Double>>>()
        for (a in addresses) {
            if (AddressFormat.isRemote(a.address)) continue
            Geo.geocode(a.address)?.let { out.add(a to it) }
        }
        pins = out
        loading = false
    }
    val center = pins.firstOrNull()?.second ?: (64.5401 to 40.5433)

    Screen("Карта корпусов", scroll = false) {
        Box(Modifier.fillMaxWidth().height(320.dp)) {
            if (YandexMap.isAvailable) {
                val dens = LocalDensity.current.density
                val brand = Brand.color
                YandexMapView(Modifier.fillMaxSize(), setup = { v ->
                    v.mapWindow.map.move(com.yandex.mapkit.map.CameraPosition(com.yandex.mapkit.geometry.Point(64.5401, 40.5433), 12f, 0f, 0f))
                }, update = { v ->
                    val objs = v.mapWindow.map.mapObjects
                    objs.clear()
                    for ((a, p) in pins) objs.addPlacemark(com.yandex.mapkit.geometry.Point(p.first, p.second), countBadge(a.count, brand, dens))
                    pins.firstOrNull()?.second?.let {
                        v.mapWindow.map.move(com.yandex.mapkit.map.CameraPosition(com.yandex.mapkit.geometry.Point(it.first, it.second), 13f, 0f, 0f))
                    }
                })
            } else {
                TileMap(center.first, center.second, 13.0, pins.map { (a, p) -> MapPin(a.address, p.first, p.second, "${a.count}") },
                    Modifier.fillMaxSize()) { p ->
                    Box(Modifier.size(34.dp).shadow(4.dp, CircleShape).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                        Text(p.label, style = ft(Ts.caption, FontWeight.ExtraBold), color = Color.White)
                    }
                }
            }
            if (loading) Glass(14.dp, Modifier.align(Alignment.TopEnd).padding(10.dp)) { Box(Modifier.padding(10.dp)) { Spinner(18.dp) } }
        }
        Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())) {
            FormColumn {
                FormSection {
                    if (addresses.isEmpty()) row { Text("На ближайшие две недели адресов в расписании нет.", style = ft(Ts.body), color = Ios.secondaryLabel) }
                    for (item in addresses) row {
                        Column(Modifier.weight(1f).padding(vertical = 2.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(AddressFormat.full(item.address), style = ft(Ts.subheadline, FontWeight.Bold), color = Ios.label)
                            Text("Пар за 2 недели: ${item.count} · ближайшая ${item.next}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                TextButton({ Maps.url(item.address)?.let { Share.url(ctx, it) } }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                    Text("Яндекс Карты", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color)
                                }
                                TextButton({ Maps.googleURL(item.address)?.let { Share.url(ctx, it) } }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                    Text("Google Карты", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Фокус (помодоро)

@Composable
fun FocusScreen() {
    var workMin by prefInt("focus.work", 25)
    var breakMin by prefInt("focus.break", 5)
    var endTime by prefDouble("focus.end", 0.0)
    var pausedLeft by prefDouble("focus.remaining", 0.0)
    var isBreak by prefBool("focus.isBreak", false)
    var doneToday by prefInt("focus.done", 0)
    var doneDay by prefString("focus.day", "")

    val total = (if (isBreak) breakMin else workMin) * 60.0
    val running = endTime > 0
    val now = rememberNow(1)
    fun epoch() = System.currentTimeMillis() / 1000.0
    val todayKey = Fmt.format(Instant.now(), "yyyy-MM-dd")
    val todayCount = if (doneDay == todayKey) doneToday else 0

    fun remaining(): Double = if (running) max(0.0, endTime - epoch()) else if (pausedLeft > 0) pausedLeft else total
    fun cancelNotification() = Notify.remove(listOf("focus"))
    fun scheduleNotification(seconds: Double) {
        Notify.after("focus", if (isBreak) "Перерыв окончен" else "Время отдохнуть",
            if (isBreak) "Возвращайся к учёбе 💪" else "Ты отлично поработал. Перерыв $breakMin мин.", max(1.0, seconds))
    }
    fun reset() { endTime = 0.0; pausedLeft = 0.0; cancelNotification() }
    fun finish() {
        if (!isBreak) {
            if (doneDay != todayKey) { doneDay = todayKey; doneToday = 0 }
            doneToday += 1
        }
        Haptics.success()
        isBreak = !isBreak
        reset()
    }
    fun toggle() {
        Haptics.tap()
        if (running) {
            pausedLeft = max(0.0, endTime - epoch())
            endTime = 0.0
            cancelNotification()
        } else {
            val left = if (pausedLeft > 0) pausedLeft else total
            pausedLeft = 0.0
            endTime = epoch() + left
            scheduleNotification(left)
        }
    }

    LaunchedEffect(endTime) {
        if (endTime <= 0) return@LaunchedEffect
        val d = endTime - epoch()
        if (d > 0) delay((d * 1000).toLong())
        if (endTime > 0 && epoch() >= endTime - 0.5) finish()
    }

    Screen("Фокус", large = !LocalPushed.current) {
        Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(26.dp)) {
            Segmented(listOf(15 to "15 / 3", 25 to "25 / 5", 50 to "50 / 10"), workMin, { v ->
                workMin = v
                breakMin = if (v == 50) 10 else if (v == 15) 3 else 5
                reset()
            }, enabled = !running)

            now.let {
                val left = remaining()
                Box(Modifier.size(260.dp), contentAlignment = Alignment.Center) {
                    ProgressRing(if (total > 0) (1 - left / total).toFloat() else 0f, if (isBreak) Ios.green else Brand.color, Modifier.fillMaxSize(),
                        lineWidth = 16.dp, brush = if (isBreak) Brush.verticalGradient(listOf(Ios.green.copy(alpha = 0.8f), Ios.green)) else Brand.gradient)
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(if (isBreak) "ПЕРЕРЫВ" else "ФОКУС", style = ft(Ts.caption, FontWeight.ExtraBold), color = if (isBreak) Ios.green else Brand.color)
                        val v = ceil(left).toInt()
                        Text(String.format(java.util.Locale.US, "%02d:%02d", v / 60, v % 60), style = ft(56f, FontWeight.Bold, Design.ROUNDED, mono = true),
                            color = Ios.label)
                        Text("Сегодня: $todayCount", style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Pressable({ reset() }) {
                    Glass(30.dp, Modifier.size(60.dp), interactive = true, contentAlignment = Alignment.Center) {
                        SfIcon("arrow.counterclockwise", size = 24.dp, tint = Ios.label)
                    }
                }
                Pressable({ toggle() }) {
                    Box(Modifier.size(84.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                        SfIcon(if (running) "pause.fill" else "play.fill", size = 34.dp, tint = Color.White)
                    }
                }
                Pressable({ finish() }) {
                    Glass(30.dp, Modifier.size(60.dp), interactive = true, contentAlignment = Alignment.Center) {
                        SfIcon("forward.end.fill", size = 24.dp, tint = Ios.label)
                    }
                }
            }

            Text("Телефон пришлёт уведомление, когда время выйдет, даже если приложение закрыто.", style = ft(Ts.caption), color = Ios.secondaryLabel,
                textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
        }
    }
}

// MARK: - Титульный лист по СТО САФУ

private val reportKinds = listOf("Лабораторная работа", "Практическая работа", "Курсовая работа", "Реферат", "Отчёт по практике")

@Composable
fun ReportScreen() {
    val data = ScheduleStore.data
    var student by prefString("report.student", "")
    var group by prefString("group", "")
    var supervisor by prefString("report.supervisor", "")
    var position by prefString("report.position", "")
    var school by prefString("report.school", "")
    var kind by prefInt("report.kind", 0)
    var number by prefString("report.number", "1")
    var discipline by prefString("report.discipline", "")
    var topic by prefString("report.topic", "")
    val preview = remember { mutableStateOf<File?>(null) }
    var created by remember { mutableStateOf<File?>(null) }
    val ctx = LocalContext.current

    fun makeWith(workTitle: String) {
        val year = Cal.year(Instant.now())
        val bytes = DocxBuilder.titlePage(school, workTitle, discipline, topic, student, group, supervisor, position, year)
        val dir = File(FileService.root, "Отчёты").apply { mkdirs() }
        val short = if (kind < 2) "${if (kind == 0) "ЛР" else "ПР"}_$number" else reportKinds[kind]
        val name = "Титульник $short${if (discipline.isEmpty()) "" else " — ${discipline.take(30)}"}.docx".replace("/", "-")
        val f = FileService.uniqueFile(dir, name)
        try {
            f.writeBytes(bytes)
            created = f
            preview.value = f
            Haptics.success()
        } catch (_: Throwable) {
            created = null
        }
    }

    fun create() = when (kind) {
        0 -> makeWith("ЛАБОРАТОРНАЯ РАБОТА № $number")
        1 -> makeWith("ПРАКТИЧЕСКАЯ РАБОТА № $number")
        2 -> makeWith("КУРСОВАЯ РАБОТА")
        3 -> makeWith("РЕФЕРАТ")
        else -> makeWith("ОТЧЁТ ПО ПРАКТИКЕ")
    }

    FormScreen("Титульник", large = !LocalPushed.current) {
        FormSection("Работа") {
            picker("Вид", reportKinds.indices.map { it to reportKinds[it] }, kind, { kind = it })
            if (kind < 2) field("Номер", number, { number = it }, keyboard = KeyboardType.Number)
            field("Дисциплина", discipline, { discipline = it })
            val subs = ScheduleQuery.subjects(data)
            if (subs.isNotEmpty()) raw {
                IosMenu({ for (s in subs) item(s) { discipline = s } }, Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                        IconLabel("Выбрать из расписания", "list.bullet", color = Brand.color, iconColor = Brand.color)
                    }
                }
            }
            row {
                IosTextField(topic, { topic = it }, "Тема", Modifier.fillMaxWidth(), singleLine = false)
            }
        }
        FormSection("Студент") {
            field("ФИО", student, { student = it }, capitalize = true)
            field("Группа", group, { group = it }, keyboard = KeyboardType.Number)
            row { IosTextField(school, { school = it }, "Высшая школа", Modifier.fillMaxWidth(), singleLine = false) }
        }
        FormSection("Руководитель") {
            field("ФИО", supervisor, { supervisor = it })
            field("Должность (например, доцент)", position, { position = it })
        }
        FormSection(footer = "Файл сохраняется в «Файлы › Отчёты». Шрифт Times New Roman 14, поля по СТО. Сверь с методичкой преподавателя: на кафедрах бывают свои требования.") {
            row(onClick = { create() }) {
                IconLabel("Создать титульник .docx", "doc.badge.plus", style = ft(Ts.headline, FontWeight.SemiBold), color = Brand.color)
            }
            created?.let { f ->
                button("Посмотреть", "eye") { preview.value = f }
                button("Отправить / открыть в Word", "square.and.arrow.up") { Share.files(ctx, listOf(f)) }
            }
        }
    }
    SheetItem(preview) { f -> FilePreviewSheet(f) }
}

// MARK: - Сборка .docx (минимальный документ Word без сторонних библиотек)

object DocxBuilder {
    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private fun p(text: String, align: String = "center", bold: Boolean = false, size: Int = 28, caps: Boolean = false, indentLeft: Int = 0): String {
        val ind = if (indentLeft > 0) "<w:ind w:left=\"$indentLeft\"/>" else ""
        val b = if (bold) "<w:b/><w:bCs/>" else ""
        val c = if (caps) "<w:caps/>" else ""
        return "<w:p><w:pPr><w:jc w:val=\"$align\"/><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"276\" w:lineRule=\"auto\"/>$ind</w:pPr>" +
            "<w:r><w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\" w:cs=\"Times New Roman\"/>$b$c" +
            "<w:sz w:val=\"$size\"/><w:szCs w:val=\"$size\"/></w:rPr><w:t xml:space=\"preserve\">${esc(text)}</w:t></w:r></w:p>"
    }

    private fun blank(n: Int) = p("").repeat(n)

    fun titlePage(school: String, workTitle: String, discipline: String, topic: String, student: String, group: String,
                  supervisor: String, position: String, year: Int): ByteArray {
        var body = ""
        body += p("МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ", size = 24)
        body += p("федеральное государственное автономное образовательное учреждение высшего образования", size = 24)
        body += p("«Северный (Арктический) федеральный университет имени М.В. Ломоносова»", bold = true, size = 24)
        body += blank(1)
        body += p(school, size = 28)
        body += blank(6)
        body += p(workTitle, bold = true, size = 32)
        body += blank(1)
        if (discipline.isNotEmpty()) body += p("по дисциплине «$discipline»", size = 28)
        if (topic.isNotEmpty()) body += p("на тему: «$topic»", size = 28)
        body += blank(6)
        body += p("Выполнил:", align = "left", size = 28, indentLeft = 5103)
        body += p("студент группы $group", align = "left", size = 28, indentLeft = 5103)
        body += p(student, align = "left", size = 28, indentLeft = 5103)
        body += blank(1)
        body += p("Проверил:", align = "left", size = 28, indentLeft = 5103)
        if (position.isNotEmpty()) body += p(position, align = "left", size = 28, indentLeft = 5103)
        body += p(supervisor, align = "left", size = 28, indentLeft = 5103)
        body += blank(7)
        body += p("Архангельск $year", size = 28)

        val document = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" +
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>$body" +
            "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1134\" w:right=\"567\" w:bottom=\"1134\" w:left=\"1701\" w:header=\"709\" w:footer=\"709\" w:gutter=\"0\"/></w:sectPr>" +
            "</w:body></w:document>"
        val contentTypes = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" +
            "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
            "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
            "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
            "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
            "</Types>"
        val rels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" +
            "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
            "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>" +
            "</Relationships>"
        return ZipWriter.make(listOf(
            "[Content_Types].xml" to contentTypes.toByteArray(Charsets.UTF_8),
            "_rels/.rels" to rels.toByteArray(Charsets.UTF_8),
            "word/document.xml" to document.toByteArray(Charsets.UTF_8),
        ))
    }
}
