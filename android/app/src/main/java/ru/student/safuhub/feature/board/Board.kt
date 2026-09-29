package ru.student.safuhub.feature.board

import android.graphics.Bitmap
import android.graphics.Color as AColor
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.googlecode.tesseract.android.TessBaseAPI
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import ru.student.safuhub.App
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.SharedSchedule
import ru.student.safuhub.data.SubjectFolders
import ru.student.safuhub.feature.files.Thumbs
import ru.student.safuhub.system.Notify
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.time.ZonedDateTime
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// MARK: - Фото доски по парам
// Снимки доски группируются по парам и идут строго по времени: раньше снято — раньше стоит.

data class BoardShot(val file: File, val date: Instant) {
    val id: String get() = file.absolutePath
}

data class BoardBatch(val subject: String, val slot: LessonSlot?, val day: Instant, val shots: List<BoardShot>) {
    val id: String get() = subject + "|" + (slot?.key ?: "${day.epochSecond}")
    val start: Instant get() = slot?.start ?: shots.firstOrNull()?.date ?: day

    val title: String
        get() {
            val d = Fmt.format(start, "EE, d MMMM").capitalizedFirstLetter()
            val s = slot ?: return d
            val pair = if (s.lesson.pair > 0) "${s.lesson.pair} пара · " else ""
            return "$d · $pair${Fmt.format(s.start, "HH:mm")}"
        }

    val shortDate: String get() = Fmt.format(start, "dd.MM")
    val countText: String get() = LessonPhotos.photosWord(shots.size)
}

object LessonPhotos {
    val imageExt = setOf("jpg", "jpeg", "png", "heic")

    fun photosWord(n: Int) = "$n фото"

    private val nameRx = Regex("(\\d{2})\\.(\\d{2}) (\\d{2})-(\\d{2})(?:-(\\d{2}))?(?: \\((\\d+)\\))?")

    /** Время съёмки: из названия «Доска 26.09 12-10-05», потом из индекса досок, потом дата файла */
    fun captureDate(f: File, subject: String): Instant {
        dateFromName(f.nameWithoutExtension)?.let { return it }
        BoardIndex.entries.firstOrNull { it.subject == subject && it.name == f.name }?.let { return it.date }
        return Instant.ofEpochMilli(f.lastModified())
    }

    private fun dateFromName(name: String): Instant? {
        val m = nameRx.find(name) ?: return null
        fun g(i: Int) = m.groups[i]?.value?.toIntOrNull()
        val day = g(1) ?: return null
        val month = g(2) ?: return null
        val hour = g(3) ?: return null
        val minute = g(4) ?: return null
        val now = ZonedDateTime.now(Cal.zone)
        var d = try { now.withMonth(month).withDayOfMonth(day).withHour(hour).withMinute(minute).withSecond(g(5) ?: 0).withNano(0).toInstant() } catch (_: Throwable) { return null }
        // снимок из прошлого года (январь смотрит на декабрьские фото)
        if (d > Instant.now().plusSeconds(86400)) d = d.atZone(Cal.zone).minusYears(1).toInstant()
        // копии с одинаковой минутой — по номеру «(2)», «(3)»
        g(6)?.let { d = d.plusMillis(it.toLong()) }
        return d
    }

    fun isBoardPhoto(f: File) = f.extension.lowercase() in imageExt && f.name.startsWith("Доска")

    /** Все фото доски предмета по времени (раньше — первее) */
    fun shots(subject: String): List<BoardShot> =
        (SubjectFolders.url(subject).listFiles() ?: emptyArray()).filter { it.isFile && isBoardPhoto(it) }
            .map { BoardShot(it, captureDate(it, subject)) }.sortedBy { it.date }

    /** Пара, во время которой (или сразу после) сделан снимок */
    fun slot(date: Instant, subject: String, data: ScheduleData): LessonSlot? =
        ScheduleEngine.slots(Cal.startOfDay(date), data).firstOrNull {
            it.lesson.subject == subject && date >= it.start.minusSeconds(15 * 60) && date <= it.end.plusSeconds(30 * 60)
        }

    /** Снимки предмета, собранные по парам: новые пары сверху, внутри пары — по времени */
    fun batches(subject: String?, data: ScheduleData): List<BoardBatch> {
        if (subject == null) return allBatches(data, 100)
        val groups = LinkedHashMap<String, Triple<LessonSlot?, Instant, MutableList<BoardShot>>>()
        for (s in shots(subject)) {
            val sl = slot(s.date, subject, data)
            val day = Cal.startOfDay(s.date)
            val key = sl?.key ?: "day-${day.epochSecond}"
            groups.getOrPut(key) { Triple(sl, day, mutableListOf()) }.third.add(s)
        }
        return groups.values.map { BoardBatch(subject, it.first, it.second, it.third) }.sortedByDescending { it.start }
    }

    /** Все пары с фото по всем предметам */
    fun allBatches(data: ScheduleData, limit: Int = 30): List<BoardBatch> =
        (SubjectFolders.base.listFiles() ?: emptyArray()).filter { it.isDirectory && !it.name.startsWith(".") }
            .flatMap { batches(it.name, data) }.sortedByDescending { it.start }.take(limit)

    /** Пара «сейчас» для кнопки камеры: идёт, скоро начнётся или только что закончилась */
    fun currentSlot(data: ScheduleData, now: Instant = Instant.now()): LessonSlot? {
        val today = ScheduleEngine.slots(Cal.startOfDay(now), data)
        today.firstOrNull { now >= it.start.minusSeconds(10 * 60) && now <= it.end }?.let { return it }
        return today.lastOrNull { it.end < now && now.epochSecond - it.end.epochSecond < 40 * 60 }
    }

    /** Фото конкретной пары */
    fun batch(slot: LessonSlot, data: ScheduleData): BoardBatch? = batches(slot.lesson.subject, data).firstOrNull { it.slot?.key == slot.key }

    /** Пара с фото для уведомления «отправь ребятам» */
    fun batchFor(t: BoardRouter.Target, data: ScheduleData): BoardBatch {
        val list = batches(t.subject, data)
        t.start?.let { start -> list.firstOrNull { kotlin.math.abs(it.start.epochSecond - start.epochSecond) < 120 }?.let { return it } }
        return list.firstOrNull() ?: BoardBatch(t.subject, null, Instant.now(), emptyList())
    }
}

object BoardPhoto {
    /** Сохраняет снимок в «Файлы › Предметы › <предмет>» с датой в названии */
    fun save(src: File, subject: String): File? {
        val dir = SubjectFolders.url(subject).apply { mkdirs() }
        val now = Instant.now()
        // секунды в названии — чтобы фото одной пары шли строго по порядку съёмки
        val dest = FileService.uniqueFile(dir, "Доска ${Fmt.format(now, "dd.MM HH-mm-ss")}.jpg")
        return try {
            // переписываем уменьшенной (до 3000 px) и правильно повёрнутой копией в JPEG 85%
            val bmp = Thumbs.decodeSampled(src, 3000)
            if (bmp != null) FileOutputStream(dest).use { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) } else src.copyTo(dest, overwrite = true)
            BoardScan.process(dest, subject, now)   // распознать текст для поиска
            BoardReminder.schedule(subject)         // после пары — «отправь ребятам»
            dest
        } catch (_: Throwable) { null }
    }
}

// MARK: - PDF со всеми фото пары

object LessonPhotosPDF {
    /** Отпечаток набора фото: те же снимки — тот же PDF */
    fun signature(b: BoardBatch): String {
        var h = b.subject.hashCode().toLong() * 31 + b.title.hashCode()
        for (s in b.shots) h = h * 31 + s.file.name.hashCode() * 17 + s.file.lastModified()
        return java.lang.Long.toString(h and Long.MAX_VALUE, 36)
    }

    private fun fileFor(b: BoardBatch, sig: String): File {
        val safe = b.subject.replace("/", "-").take(60)
        return File(File(App.ctx.cacheDir, "board-pdf-$sig"), "$safe ${b.shortDate} — доска.pdf")
    }

    fun cached(b: BoardBatch, sig: String): File? = fileFor(b, sig).takeIf { it.exists() }

    /** Одна страница — одно фото, по порядку, с подписью «предмет · дата · 3/7» */
    fun make(b: BoardBatch, sig: String = signature(b), progress: ((Int, Int) -> Unit)? = null): File? {
        cached(b, sig)?.let { return it }
        val out = fileFor(b, sig)
        out.parentFile?.mkdirs()
        val tmp = File(out.parentFile, out.name + ".part")
        val pageWidth = 842
        val header = 34
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 13f; color = AColor.DKGRAY; isFakeBoldText = true }
        val total = b.shots.size
        return try {
            val doc = PdfDocument()
            b.shots.forEachIndexed { i, shot ->
                val bmp = Thumbs.decodeSampled(shot.file, 2000) ?: return@forEachIndexed
                val ratio = bmp.height.toFloat() / maxOf(bmp.width, 1)
                val h = (pageWidth * ratio).toInt() + header
                val page = doc.startPage(PdfDocument.PageInfo.Builder(pageWidth, h, i + 1).create())
                val c = page.canvas
                c.drawColor(AColor.WHITE)
                c.drawText("${b.subject} · ${b.title} · ${Fmt.format(shot.date, "HH:mm")}   ${i + 1}/$total", 14f, 22f, paint)
                c.drawBitmap(bmp, null, android.graphics.RectF(0f, header.toFloat(), pageWidth.toFloat(), h.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG))
                doc.finishPage(page)
                bmp.recycle()
                progress?.invoke(i + 1, total)
            }
            FileOutputStream(tmp).use { doc.writeTo(it) }
            doc.close()
            out.delete()
            tmp.renameTo(out)
            out
        } catch (_: Throwable) {
            tmp.delete()
            null
        }
    }

    /** Удаляем PDF и копии фото, оставшиеся после отправки */
    fun cleanTemp() {
        for (f in App.ctx.cacheDir.listFiles() ?: emptyArray()) {
            if (f.name.startsWith("board-") || f.name.endsWith("— доска.pdf")) f.deleteRecursively()
        }
    }

    /** Фото с номерами в названии — чтобы в чате они легли по порядку */
    fun numberedCopies(b: BoardBatch): List<File> {
        val dir = File(App.ctx.cacheDir, "board-${java.util.UUID.randomUUID()}").apply { mkdirs() }
        return b.shots.mapIndexedNotNull { i, s ->
            val dst = File(dir, String.format("%02d %s %s.%s", i + 1, b.shortDate, Fmt.format(s.date, "HH-mm"), s.file.extension))
            try {
                try { java.nio.file.Files.createLink(dst.toPath(), s.file.toPath()) } catch (_: Throwable) { s.file.copyTo(dst, overwrite = true) }
                dst
            } catch (_: Throwable) { null }
        }
    }
}

/** Сборка PDF в фоне. Один и тот же набор не собирается дважды одновременно */
object BoardPDFBuilder {
    private val running = HashMap<String, Deferred<File?>>()

    suspend fun pdf(b: BoardBatch, progress: ((Int, Int) -> Unit)? = null): File? {
        val sig = LessonPhotosPDF.signature(b)
        LessonPhotosPDF.cached(b, sig)?.let { return it }
        val t = synchronized(running) {
            running.getOrPut(sig) { AppScope.async(Dispatchers.IO) { LessonPhotosPDF.make(b, sig, progress) } }
        }
        val f = t.await()
        synchronized(running) { running.remove(sig) }
        return f
    }

    /** Заранее, пока смотришь фото пары — к моменту «Отправить» PDF уже готов */
    fun prewarm(b: BoardBatch) {
        if (b.shots.isEmpty()) return
        val sig = LessonPhotosPDF.signature(b)
        if (LessonPhotosPDF.cached(b, sig) != null) return
        synchronized(running) {
            if (running.containsKey(sig)) return
            val t = AppScope.async(Dispatchers.IO) { LessonPhotosPDF.make(b, sig) }
            running[sig] = t
            AppScope.launch { t.await(); synchronized(running) { running.remove(sig) } }
        }
    }
}

// MARK: - Напоминание после пары

object BoardReminder {
    const val subjectKey = "board.subject"
    const val startKey = "board.start"

    /** Сфоткал доску на паре — после её конца придёт «Отправь ребятам N фото» */
    fun schedule(subject: String) {
        val data = SharedSchedule.load()
        if (!(Defaults.boolOrNull("board.remind") ?: true)) return
        val slot = LessonPhotos.slot(Instant.now(), subject, data) ?: return
        val fire = maxOf(slot.end.plusSeconds(60), Instant.now().plusSeconds(5))
        if (fire.epochSecond - Instant.now().epochSecond >= 3 * 3600) return
        val count = LessonPhotos.batch(slot, data)?.shots?.size ?: 1
        Notify.add("board.${slot.key}", "Фото с пары: ${slot.lesson.subject}",
            "${LessonPhotos.photosWord(count)} доски по порядку — нажми, чтобы собрать PDF и отправить ребятам", fire,
            extras = mapOf(subjectKey to subject, startKey to "${slot.start.epochSecond}"))
    }
}

/** Какую пару с фото открыть (из уведомления или ссылки safu://board) */
object BoardRouter {
    const val subjectKey = BoardReminder.subjectKey
    const val startKey = BoardReminder.startKey

    data class Target(val subject: String, val start: Instant?) {
        val id: String get() = subject + "${start?.epochSecond ?: 0}"
    }

    var target by mutableStateOf<Target?>(null)
    /** Открыть камеру для текущей пары */
    var camera by mutableStateOf(false)
    /** Для какого предмета снимаем (из виджета); null — текущая пара */
    var cameraSubject: String? = null
    /** Предмет из виджета: закреплённые материалы, файлы, заметки */
    var subject by mutableStateOf<String?>(null)
}

// MARK: - Доска → текст (поиск по словам с доски)

@Serializable
data class BoardEntry(val name: String, val subject: String, val text: String = "", val date: AppleDate, val straightened: Boolean = false) {
    val id: String get() = "$subject/$name"
    val file: File get() = File(SubjectFolders.url(subject), name)
    val exists: Boolean get() = file.exists()
}

object BoardIndex {
    private var _entries = mutableStateOf<List<BoardEntry>>(emptyList())
    val entries: List<BoardEntry> get() { load(); return _entries.value }
    private val workingState = mutableIntStateOf(0)
    /** Сколько снимков сейчас распознаётся */
    val working: Int get() = workingState.intValue
    private var loaded = false
    private val file: File get() = File(FileService.support, "board-index.json")

    private fun load() {
        if (loaded) return
        loaded = true
        try {
            if (file.exists()) _entries.value = AppJson.decodeFromString<List<BoardEntry>>(file.readText())
        } catch (_: Throwable) {}
    }

    fun reload() { loaded = false; load() }

    private fun save() {
        val list = _entries.value
        AppScope.launch(Dispatchers.IO) {
            try { file.writeText(AppJson.encodeToString(list)) } catch (_: Throwable) {}
        }
    }

    fun begin() { workingState.intValue += 1 }
    fun end() { workingState.intValue = maxOf(0, workingState.intValue - 1) }

    fun upsert(e: BoardEntry) {
        load()
        val list = _entries.value
        _entries.value = if (list.any { it.id == e.id }) list.map { if (it.id == e.id) e else it } else listOf(e) + list
        save()
    }

    /** Убираем из индекса фото, которые удалили или переименовали */
    fun prune() {
        load()
        val alive = _entries.value.filter { it.exists }
        if (alive.size != _entries.value.size) { _entries.value = alive; save() }
    }

    fun contains(subject: String, name: String) = entries.any { it.subject == subject && it.name == name }

    fun search(query: String): List<BoardEntry> {
        val q = query.trim().lowercase()
        val all = entries.sortedByDescending { it.date }
        if (q.isEmpty()) return all
        val words = q.split(" ").filter { it.isNotEmpty() }
        return all.filter { e -> val hay = (e.text + " " + e.subject).lowercase(); words.all { hay.contains(it) } }
    }
}

/** Распознавание текста на телефоне (Tesseract, русский и английский). Модели скачиваются один раз */
object BoardOCR {
    private val dir: File get() = File(FileService.support, "ocr")
    private val tessdata: File get() = File(dir, "tessdata")
    private val langs = listOf("rus", "eng")
    var downloading by mutableStateOf(false)
        private set
    var progress by mutableStateOf(0f)
        private set

    val ready: Boolean get() = langs.all { File(tessdata, "$it.traineddata").let { f -> f.exists() && f.length() > 1_000_000 } }

    /** Скачать модели распознавания (≈38 МБ) */
    suspend fun download(): Boolean = withContext(Dispatchers.IO) {
        if (ready) return@withContext true
        downloading = true
        progress = 0f
        try {
            tessdata.mkdirs()
            val http = OkHttpClient.Builder().connectTimeout(30, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build()
            val sizes = mapOf("rus" to 16_152_507L, "eng" to 21_876_550L)
            val total = sizes.values.sum().toFloat()
            var done = 0L
            for (l in langs) {
                val out = File(tessdata, "$l.traineddata")
                if (out.exists() && out.length() > 1_000_000) { done += out.length(); continue }
                val tmp = File(tessdata, "$l.part")
                val req = Request.Builder().url("https://raw.githubusercontent.com/tesseract-ocr/tessdata/3.04.00/$l.traineddata").build()
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext false
                    val input = resp.body?.byteStream() ?: return@withContext false
                    tmp.outputStream().use { o ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            o.write(buf, 0, n)
                            done += n
                            progress = (done / total).coerceIn(0f, 1f)
                        }
                    }
                }
                tmp.renameTo(out)
            }
            ready
        } catch (_: Throwable) {
            false
        } finally {
            downloading = false
        }
    }

    /** Текст картинки построчно, сверху вниз */
    fun recognize(bmp: Bitmap): String {
        if (!ready) return ""
        val api = TessBaseAPI()
        return try {
            if (!api.init(dir.absolutePath, langs.joinToString("+"))) return ""
            api.pageSegMode = TessBaseAPI.PageSegMode.PSM_AUTO
            api.setImage(bmp)
            (api.utF8Text ?: "").lines().map { it.trim() }.filter { it.length > 1 }.joinToString("\n")
        } catch (_: Throwable) {
            ""
        } finally {
            try { api.end() } catch (_: Throwable) {}
        }
    }
}

object BoardScan {
    /** Снимки обрабатываются строго по одному: несколько сразу — это сотни мегабайт памяти */
    private val queue = Executors.newSingleThreadExecutor { r -> Thread(r, "boardscan").apply { priority = Thread.MIN_PRIORITY } }

    /** Распознать и добавить в индекс (в фоне) */
    fun process(f: File, subject: String, date: Instant = Instant.now()) {
        BoardIndex.begin()
        queue.execute {
            try {
                val bmp = Thumbs.decodeSampled(f, 2000) ?: return@execute
                val text = if (BoardOCR.ready) BoardOCR.recognize(enhance(bmp)) else ""
                bmp.recycle()
                AppScope.launch { BoardIndex.upsert(BoardEntry(f.name, subject, text, date, false)) }
            } catch (_: Throwable) {
            } finally {
                AppScope.launch { BoardIndex.end() }
            }
        }
    }

    /** Все фото доски, которых ещё нет в поиске (или без текста, если модели появились позже) */
    fun indexExisting() {
        for (dir in SubjectFolders.base.listFiles() ?: emptyArray()) {
            if (!dir.isDirectory) continue
            val subject = dir.name
            for (f in dir.listFiles() ?: emptyArray()) {
                if (f.extension.lowercase() !in LessonPhotos.imageExt) continue
                val e = BoardIndex.entries.firstOrNull { it.subject == subject && it.name == f.name }
                if (e != null && (e.text.isNotEmpty() || !BoardOCR.ready)) continue
                process(f, subject, e?.date ?: Instant.ofEpochMilli(f.lastModified()))
            }
        }
    }

    /** Чёрно-белая картинка с повышенным контрастом — Tesseract так читает лучше */
    private fun enhance(src: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(out)
        val cm = ColorMatrix().apply { setSaturation(0f) }
        val contrast = 1.35f
        val t = (1f - contrast) * 128f
        cm.postConcat(ColorMatrix(floatArrayOf(contrast, 0f, 0f, 0f, t, 0f, contrast, 0f, 0f, t, 0f, 0f, contrast, 0f, t, 0f, 0f, 0f, 1f, 0f)))
        c.drawBitmap(src, 0f, 0f, Paint().apply { colorFilter = ColorMatrixColorFilter(cm) })
        return out
    }
}
