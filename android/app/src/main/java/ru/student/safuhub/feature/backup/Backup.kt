package ru.student.safuhub.feature.backup

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.Formatter
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.student.safuhub.App
import ru.student.safuhub.MainActivity
import ru.student.safuhub.core.CRC32
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.Plist
import ru.student.safuhub.core.appleSecondsToInstant
import ru.student.safuhub.core.prefDouble
import ru.student.safuhub.core.toAppleSeconds
import ru.student.safuhub.data.FileService
import ru.student.safuhub.system.rememberFilePicker
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.time.Instant

// MARK: - Резервная копия
// Один файл .safubackup (обычный ZIP без сжатия): настройки и данные приложения, служебные файлы
// (фото доски по парам, лекции, аватар) и вкладка «Файлы». Пишется и читается по частям,
// поэтому даже гигабайт фото не займёт оперативную память. Пароли и ключи в копию не попадают.
// Формат тот же, что у iPhone: копию можно перенести в обе стороны.

object BackupManager {
    /** Что не кладём в копию: модели распознавания (сотни МБ, скачаются заново), старые копии, временное */
    fun skip(rel: String): Boolean {
        val first = rel.substringBefore('/')
        return first in listOf("huggingface", "Inbox", ".Trash", "ocr", "vosk", "models") ||
            rel.endsWith(".safubackup") || rel.endsWith(".part")
    }

    /** Все файлы для копии: (путь в архиве, файл на диске) */
    fun collect(includeFiles: Boolean): List<Pair<String, File>> {
        val out = mutableListOf<Pair<String, File>>()
        fun walk(root: File, prefix: String) {
            fun go(dir: File, rel: String) {
                for (f in dir.listFiles()?.sortedBy { it.name } ?: return) {
                    if (f.name.startsWith(".")) continue
                    val r = if (rel.isEmpty()) f.name else "$rel/${f.name}"
                    if (skip(r)) continue
                    if (f.isDirectory) go(f, r) else if (f.isFile) out.add(prefix + r to f)
                }
            }
            go(root, "")
        }
        walk(FileService.support, "support/")
        if (includeFiles) walk(FileService.root, "files/")
        return out
    }

    /** Сколько займёт копия (для подписи) */
    fun estimate(includeFiles: Boolean): Long = collect(includeFiles).sumOf { it.second.length() }

    /** Собрать копию. progress(готово, всего) */
    fun makeBackup(includeFiles: Boolean, progress: ((Int, Int) -> Unit)? = null): File {
        Defaults.flush()
        val plist = Plist.write(Defaults.snapshot())
        val dir = File(App.ctx.cacheDir, "share").apply { mkdirs() }
        val file = File(dir, "САФУ копия ${Fmt.format(Instant.now(), "yyyy-MM-dd HH-mm")}.safubackup")
        file.delete()
        StreamZipWriter(file).use { w ->
            w.add("data.plist", plist)
            val files = collect(includeFiles)
            files.forEachIndexed { i, (name, f) ->
                w.add(name, f)
                progress?.invoke(i + 1, files.size)
            }
        }
        Defaults.set("backup.last", Instant.now().toAppleSeconds())
        return file
    }

    /** Восстановление: настройки, служебные файлы и файлы. Возвращает число восстановленных файлов */
    fun restore(file: File, progress: ((Int) -> Unit)? = null): Int {
        var domain: Map<*, *>? = null
        var restored = 0
        val supportRoot = FileService.support.canonicalFile
        val filesRoot = FileService.root.canonicalFile
        StreamZipReader.read(file) { name, sink ->
            if (name == "data.plist") {
                domain = Plist.read(sink.data()) as? Map<*, *>
                return@read
            }
            // защита от путей вида ../../ — пишем только внутрь своих папок
            if (name.contains("..") || name.endsWith("/")) return@read
            val dest = when {
                name.startsWith("files/") -> File(filesRoot, name.removePrefix("files/"))
                name.startsWith("support/") -> File(supportRoot, name.removePrefix("support/"))
                else -> return@read
            }
            dest.parentFile?.mkdirs()
            sink.write(dest)
            restored += 1
            progress?.invoke(restored)
        }
        val d = domain ?: throw IllegalStateException("Это не резервная копия САФУ")
        val values = HashMap<String, Any>()
        for ((k, v) in d) if (k is String && v != null) values[k] = v
        values["onboarded"] = true
        Defaults.replaceAll(values)
        return restored
    }

    /** Перезапуск, чтобы всё приложение прочитало восстановленные данные */
    fun restartApp(ctx: Context) {
        val i = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        ctx.startActivity(i)
        Runtime.getRuntime().exit(0)
    }

    /** Файл из «Открыть с помощью» / выбора документа → во временный файл */
    fun copyToTemp(uri: Uri): File? = try {
        val f = File(App.ctx.cacheDir, "restore.safubackup")
        App.ctx.contentResolver.openInputStream(uri)?.use { input -> f.outputStream().use { input.copyTo(it, 1 shl 20) } }
        if (f.exists() && f.length() > 0) f else null
    } catch (_: Throwable) { null }
}

// MARK: - ZIP по частям (без сжатия, как .docx и копии с iPhone)

class StreamZipWriter(file: File) : AutoCloseable {
    private val out = FileOutputStream(file)
    private var offset = 0L
    private val central = java.io.ByteArrayOutputStream()
    private var count = 0

    private fun le16(o: java.io.OutputStream, v: Int) { o.write(v and 0xFF); o.write((v shr 8) and 0xFF) }
    private fun le32(o: java.io.OutputStream, v: Long) { for (i in 0 until 4) o.write(((v shr (8 * i)) and 0xFF).toInt()) }

    fun add(name: String, data: ByteArray) {
        add(name, data.size.toLong(), CRC32.checksum(data)) { out.write(data) }
    }

    /** Файл читается кусками по 1 МБ: сначала считаем CRC, потом пишем */
    fun add(name: String, file: File) {
        val size = file.length()
        if (size >= 0xFFFFFFFFL) return     // файлы больше 4 ГБ не поддерживаем
        var c = 0xFFFFFFFFL
        val buf = ByteArray(1 shl 20)
        file.inputStream().use { r ->
            while (true) {
                val n = r.read(buf)
                if (n <= 0) break
                c = CRC32.update(c, buf, 0, n)
            }
        }
        val crc = c xor 0xFFFFFFFFL
        add(name, size, crc) {
            file.inputStream().use { r ->
                while (true) {
                    val n = r.read(buf)
                    if (n <= 0) break
                    out.write(buf, 0, n)
                }
            }
        }
    }

    private fun add(name: String, size: Long, crc: Long, body: () -> Unit) {
        if (offset >= 0xFFFFFFFFL) return
        val n = name.toByteArray(Charsets.UTF_8)
        val local = java.io.ByteArrayOutputStream()
        le32(local, 0x04034b50)
        le16(local, 20); le16(local, 0x0800); le16(local, 0); le16(local, 0); le16(local, 0x21)   // 0x0800 — имена в UTF-8
        le32(local, crc); le32(local, size); le32(local, size)
        le16(local, n.size); le16(local, 0)
        local.write(n)
        val head = local.toByteArray()
        out.write(head)
        body()

        le32(central, 0x02014b50)
        le16(central, 20); le16(central, 20); le16(central, 0x0800); le16(central, 0); le16(central, 0); le16(central, 0x21)
        le32(central, crc); le32(central, size); le32(central, size)
        le16(central, n.size); le16(central, 0); le16(central, 0); le16(central, 0); le16(central, 0)
        le32(central, 0); le32(central, offset)
        central.write(n)
        offset += head.size + size
        count += 1
    }

    override fun close() {
        val cdOffset = minOf(offset, 0xFFFFFFFFL)
        val cd = central.toByteArray()
        out.write(cd)
        val end = java.io.ByteArrayOutputStream()
        le32(end, 0x06054b50); le16(end, 0); le16(end, 0)
        le16(end, minOf(count, 65535)); le16(end, minOf(count, 65535))
        le32(end, cd.size.toLong()); le32(end, cdOffset); le16(end, 0)
        out.write(end.toByteArray())
        out.close()
    }
}

object StreamZipReader {
    /** Кусок архива: можно прочитать в память (маленький) или сразу записать в файл (большой) */
    class Sink(private val raf: RandomAccessFile, val size: Int) {
        fun data(): ByteArray {
            val b = ByteArray(size)
            raf.readFully(b)
            return b
        }

        fun write(dest: File) {
            FileOutputStream(dest).use { w ->
                val buf = ByteArray(1 shl 20)
                var left = size
                while (left > 0) {
                    val n = raf.read(buf, 0, minOf(left, buf.size))
                    if (n <= 0) break
                    w.write(buf, 0, n)
                    left -= n
                }
            }
        }
    }

    fun read(file: File, entry: (String, Sink) -> Unit) {
        RandomAccessFile(file, "r").use { raf ->
            val head = ByteArray(30)
            fun u16(p: Int) = (head[p].toInt() and 0xFF) or ((head[p + 1].toInt() and 0xFF) shl 8)
            fun u32(p: Int) = u16(p).toLong() or (u16(p + 2).toLong() shl 16)
            while (raf.filePointer + 30 <= raf.length()) {
                raf.readFully(head)
                if (u32(0) != 0x04034b50L) break
                val method = u16(8)
                val size = u32(18)
                val nameLen = u16(26)
                val extraLen = u16(28)
                val nameData = ByteArray(nameLen)
                raf.readFully(nameData)
                if (extraLen > 0) raf.seek(raf.filePointer + extraLen)
                val start = raf.filePointer
                val name = String(nameData, Charsets.UTF_8)
                if (method == 0) entry(name, Sink(raf, size.toInt()))
                // к следующей записи — независимо от того, сколько прочитали
                raf.seek(start + size)
            }
        }
    }
}

// MARK: - Экран

@Composable
fun BackupScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var includeFiles by remember { mutableStateOf(true) }
    var backupFile by remember { mutableStateOf<File?>(null) }
    var working by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var restoredOK by remember { mutableStateOf(false) }
    val lastBackup by prefDouble("backup.last", 0.0)

    val lastText = if (lastBackup > 0) "Последняя копия " + Fmt.relative(appleSecondsToInstant(lastBackup), full = true) else "Копий ещё не было"

    fun restore(uri: Uri) {
        working = true
        status = "Восстанавливаю…"
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val f = BackupManager.copyToTemp(uri) ?: throw IllegalStateException("Не удалось открыть файл")
                    try {
                        BackupManager.restore(f) { n -> scope.launch { status = "Восстанавливаю… файлов: $n" } }
                    } finally { f.delete() }
                }
            }
            working = false
            status = null
            result.onSuccess { n ->
                message = "Готово: настройки восстановлены, файлов: $n. Приложение перезапустится, чтобы всё подхватить."
                restoredOK = true
                Haptics.success()
            }.onFailure { e -> message = e.message ?: "Ошибка" }
        }
    }

    val picker = rememberFilePicker(multiple = false) { uris -> uris.firstOrNull()?.let { restore(it) } }

    FormScreen("Резервная копия") {
        FormSection("Резервная копия", footer = "$lastText. В копии: расписание и память недель, задачи, заметки, посещаемость, лекции с конспектами, фото доски по парам, аватар, настройки и файлы. Пароли и ключи в копию не попадают — это безопаснее. Модели распознавания речи и текста не копируются, они скачаются заново.") {
            toggle("Вместе с файлами и фото доски", includeFiles, { includeFiles = it })
            button("Сделать копию", "arrow.down.doc.fill", enabled = !working, trailing = if (working) ({ Spinner(18.dp) }) else null) {
                working = true
                status = "Собираю копию…"
                val withFiles = includeFiles
                scope.launch {
                    val result = withContext(Dispatchers.IO) {
                        runCatching { BackupManager.makeBackup(withFiles) { i, n -> scope.launch { status = "Собираю копию… $i из $n" } } }
                    }
                    working = false
                    status = null
                    result.onSuccess { f ->
                        backupFile = f
                        val size = Formatter.formatShortFileSize(ctx, f.length())
                        message = "Копия готова ($size). Сохрани её в «Файлы», на Google Диск или отправь себе в Telegram."
                        Haptics.success()
                    }.onFailure { e -> message = e.message ?: "Ошибка" }
                }
            }
            status?.let { s -> row { Text(s, style = ft(Ts.caption, mono = true), color = Ios.secondaryLabel) } }
            backupFile?.let { f -> button("Сохранить копию / отправить", "square.and.arrow.up") { Share.files(ctx, listOf(f), "application/octet-stream") } }
        }

        FormSection(footer = "Выбери файл .safubackup — с этого телефона или с iPhone. После восстановления приложение перезапустится.") {
            button("Восстановить из копии", "arrow.uturn.backward.circle.fill", enabled = !working) { picker.open() }
        }

        message?.let { m ->
            FormSection {
                row { Text(m, style = ft(Ts.subheadline), color = Ios.label) }
                if (restoredOK) button("Перезапустить сейчас", "arrow.clockwise") { BackupManager.restartApp(ctx) }
            }
        }
    }
}
