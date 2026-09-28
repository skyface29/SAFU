package ru.student.safuhub.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import ru.student.safuhub.App
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.RU
import java.io.File
import java.time.Instant

data class FileItem(
    val file: File,
    val isDirectory: Boolean,
    val size: Long,
    val modified: Instant,
    /** Сколько внутри (для папок) */
    val childCount: Int = 0,
) {
    val id: String get() = file.absolutePath
    val name: String get() = file.name
}

data class FolderEntry(val file: File, val depth: Int)

object FileService {
    /** «Документы» приложения — вкладка «Файлы» */
    val root: File
        get() = File(App.ctx.filesDir, "Documents").apply { mkdirs() }

    /** Служебная папка (как Application Support) */
    val support: File
        get() = File(App.ctx.filesDir, "support").apply { mkdirs() }

    fun path(f: File): String = try { f.canonicalPath } catch (_: Throwable) { f.absolutePath }

    fun isRoot(f: File) = path(f) == path(root)

    fun list(dir: File): List<FileItem> {
        val files = dir.listFiles()?.filter { !it.name.startsWith(".") } ?: emptyList()
        // служебная папка моделей распознавания речи — не файлы пользователя
        val visible = if (isRoot(dir)) files.filter { it.name != "huggingface" && it.name != "models" } else files
        return visible.map { f ->
            val isDir = f.isDirectory
            FileItem(f, isDir, if (isDir) 0 else f.length(), Instant.ofEpochMilli(f.lastModified()),
                if (isDir) (f.list()?.count { !it.startsWith(".") } ?: 0) else 0)
        }.sortedWith(compareBy<FileItem> { !it.isDirectory }.thenComparator { a, b -> NaturalOrder.compare(a.name, b.name) })
    }

    fun uniqueFile(dir: File, name: String): File {
        var candidate = File(dir, name)
        val ext = name.substringAfterLast('.', "").let { if (name.startsWith(".") || !name.contains('.')) "" else it }
        val base = if (ext.isEmpty()) name else name.dropLast(ext.length + 1)
        var n = 2
        while (candidate.exists()) {
            candidate = File(dir, if (ext.isEmpty()) "$base ($n)" else "$base ($n).$ext")
            n++
        }
        return candidate
    }

    fun createFolder(name: String, dir: File) {
        val clean = sanitize(name)
        if (clean.isEmpty()) return
        uniqueFile(dir, clean).mkdirs()
    }

    /** Имя файла из content:// */
    fun displayName(ctx: Context, uri: Uri): String {
        var name: String? = null
        try {
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) name = c.getString(0)
            }
        } catch (_: Throwable) {}
        return name ?: uri.lastPathSegment?.substringAfterLast('/') ?: "Файл"
    }

    /** Скопировать выбранный файл внутрь приложения */
    fun importFile(ctx: Context, src: Uri, dir: File, nameHint: String? = null): File? = try {
        dir.mkdirs()
        val target = uniqueFile(dir, sanitize(nameHint ?: displayName(ctx, src)).ifEmpty { "Файл" })
        ctx.contentResolver.openInputStream(src)?.use { input -> target.outputStream().use { input.copyTo(it) } }
        target
    } catch (_: Throwable) { null }

    fun save(data: ByteArray, ext: String, dir: File): File {
        dir.mkdirs()
        val name = "Фото ${Fmt.format(Instant.now(), "yyyy-MM-dd HH-mm-ss")}.$ext"
        val f = uniqueFile(dir, name)
        f.writeBytes(data)
        return f
    }

    fun rename(item: FileItem, newName: String) {
        var name = sanitize(newName)
        if (name.isEmpty() || name == item.name) return
        val oldExt = item.file.extension
        if (!item.isDirectory && oldExt.isNotEmpty() && !name.contains('.')) name += ".$oldExt"
        val dir = item.file.parentFile ?: return
        item.file.renameTo(uniqueFile(dir, name))
    }

    fun move(item: FileItem, dir: File) {
        // нельзя переместить папку саму в себя
        if (item.isDirectory && path(dir).startsWith(path(item.file))) return
        if (path(dir) == path(item.file.parentFile ?: return)) return
        val target = uniqueFile(dir, item.name)
        if (!item.file.renameTo(target)) {
            item.file.copyRecursively(target, overwrite = false)
            item.file.deleteRecursively()
        }
    }

    fun delete(item: FileItem) {
        item.file.deleteRecursively()
    }

    fun allFolders(excluding: File?): List<FolderEntry> {
        val result = mutableListOf(FolderEntry(root, 0))
        fun walk(dir: File, depth: Int) {
            for (item in list(dir)) {
                if (!item.isDirectory) continue
                if (excluding != null && path(item.file) == path(excluding)) continue
                result.add(FolderEntry(item.file, depth))
                walk(item.file, depth + 1)
            }
        }
        walk(root, 1)
        return result
    }

    // MARK: типы файлов

    private val images = setOf("jpg", "jpeg", "png", "heic", "heif", "gif", "webp", "bmp", "tif", "tiff", "svg")
    private val movies = setOf("mov", "mp4", "m4v", "avi", "mkv", "3gp", "webm", "mpg", "mpeg")
    private val audio = setOf("m4a", "mp3", "wav", "aac", "ogg", "flac", "caf", "aiff", "aif", "opus", "amr", "3ga")
    private val presentations = setOf("ppt", "pptx", "key", "odp", "pps", "ppsx")
    private val spreadsheets = setOf("xls", "xlsx", "numbers", "ods", "csv", "tsv")
    private val archives = setOf("zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "safubackup")
    private val code = setOf("swift", "kt", "java", "c", "cpp", "h", "hpp", "py", "js", "ts", "html", "css", "json", "xml", "sh", "m", "go", "rs", "php", "rb", "sql", "yml", "yaml")
    private val texts = setOf("txt", "md", "rtf", "log", "ini", "tex")

    fun isImage(f: File) = f.extension.lowercase() in images
    fun isMovie(f: File) = f.extension.lowercase() in movies
    fun isAudio(f: File) = f.extension.lowercase() in audio
    fun isPdf(f: File) = f.extension.lowercase() == "pdf"
    fun isText(f: File) = f.extension.lowercase() in texts || f.extension.lowercase() in code

    fun icon(item: FileItem): String {
        if (item.isDirectory) return "folder.fill"
        val e = item.file.extension.lowercase()
        return when {
            e.isEmpty() -> "doc"
            e == "pdf" -> "doc.richtext.fill"
            e in images -> "photo.fill"
            e in movies -> "film.fill"
            e in audio -> "waveform"
            e in presentations -> "rectangle.on.rectangle.angled"
            e in spreadsheets -> "tablecells.fill"
            e in archives -> "doc.zipper"
            e in code -> "chevron.left.forwardslash.chevron.right"
            e in texts -> "doc.text.fill"
            else -> "doc.fill"
        }
    }

    enum class Kind(val title: String, val icon: String) {
        ALL("Все", "square.grid.2x2"), FOLDERS("Папки", "folder"), DOCS("Документы", "doc.text"),
        PDF("PDF", "doc.richtext"), IMAGES("Фото", "photo"), VIDEO("Видео", "film");
    }

    fun kind(item: FileItem): Kind {
        if (item.isDirectory) return Kind.FOLDERS
        val e = item.file.extension.lowercase()
        return when {
            e == "pdf" -> Kind.PDF
            e in images -> Kind.IMAGES
            e in movies -> Kind.VIDEO
            else -> Kind.DOCS
        }
    }

    fun matches(item: FileItem, k: Kind) = k == Kind.ALL || kind(item) == k

    data class Summary(var files: Int = 0, var folders: Int = 0, var bytes: Long = 0, val byKind: MutableMap<Kind, Long> = mutableMapOf())

    fun summary(): Summary {
        val s = Summary()
        root.walkTopDown().filter { it != root && !it.name.startsWith(".") }.forEach { f ->
            if (f.isDirectory) s.folders++
            else {
                val size = f.length()
                s.files++
                s.bytes += size
                val k = kind(FileItem(f, false, size, Instant.ofEpochMilli(f.lastModified())))
                s.byKind[k] = (s.byKind[k] ?: 0) + size
            }
        }
        return s
    }

    fun recentFiles(limit: Int = 10): List<FileItem> =
        root.walkTopDown().filter { it.isFile && !it.name.startsWith(".") }
            .map { FileItem(it, false, it.length(), Instant.ofEpochMilli(it.lastModified())) }
            .sortedByDescending { it.modified }.take(limit).toList()

    fun sorted(items: List<FileItem>, mode: Int): List<FileItem> = items.sortedWith { a, b ->
        if (a.isDirectory != b.isDirectory) return@sortedWith if (a.isDirectory) -1 else 1
        when (mode) {
            1 -> b.modified.compareTo(a.modified)
            2 -> b.size.compareTo(a.size)
            3 -> {
                val ea = a.file.extension.lowercase()
                val eb = b.file.extension.lowercase()
                if (ea == eb) NaturalOrder.compare(a.name, b.name) else ea.compareTo(eb)
            }
            else -> NaturalOrder.compare(a.name, b.name)
        }
    }

    fun createTextFile(name: String, text: String, dir: File) {
        var clean = sanitize(name)
        if (clean.isEmpty()) clean = "Заметка"
        if (!clean.contains('.')) clean += ".txt"
        uniqueFile(dir, clean).writeText(text)
    }

    fun savePDF(data: ByteArray, dir: File): File {
        dir.mkdirs()
        val f = uniqueFile(dir, "Скан ${Fmt.format(Instant.now(), "dd.MM HH-mm")}.pdf")
        f.writeBytes(data)
        return f
    }

    fun sanitize(s: String): String = s.replace("/", "-").replace(":", "-").trim()

    fun byteCount(bytes: Long): String {
        if (bytes < 1000) return "$bytes байт"
        val units = listOf("КБ", "МБ", "ГБ", "ТБ")
        var v = bytes / 1000.0
        var i = 0
        while (v >= 1000 && i < units.size - 1) { v /= 1000; i++ }
        val s = if (v >= 100 || i == 0) String.format(RU, "%.0f", v) else String.format(RU, "%.1f", v)
        return "$s ${units[i]}"
    }
}

object SubjectFolders {
    val base: File get() = File(FileService.root, "Предметы")

    fun url(subject: String): File {
        val clean = subject.replace("/", "-").replace(":", "-").trim()
        return File(base, clean.ifEmpty { "Без названия" })
    }

    /** Создаём папку для каждого предмета из расписания */
    fun ensureAll(subjects: List<String>) {
        for (s in subjects) url(s).mkdirs()
        // убираем пустые папки со «сломанными» названиями вроде «… Ссылка на курс …»
        for (u in base.listFiles() ?: emptyArray()) {
            val name = u.name
            if (EventText.cleanSubject(name).first == name) continue
            val empty = (u.list() ?: emptyArray()).none { !it.startsWith(".") }
            if (empty) u.deleteRecursively()
        }
    }

    private val countCache = HashMap<String, Triple<Int, Long, Long>>()

    /** Сколько файлов у предмета (кеш на 15 с или до изменения папки) */
    fun fileCount(subject: String): Int {
        val dir = url(subject)
        val stamp = dir.lastModified()
        synchronized(countCache) {
            countCache[subject]?.let { c -> if (c.second == stamp && System.currentTimeMillis() - c.third < 15_000) return c.first }
        }
        val n = dir.walkTopDown().count { it.isFile && !it.name.startsWith(".") }
        synchronized(countCache) { countCache[subject] = Triple(n, stamp, System.currentTimeMillis()) }
        return n
    }
}

object SubjectNotes {
    private const val key = "subject.notes"
    fun get(subject: String): String = (Defaults.dictionary(key)?.get(subject) as? String) ?: ""
    fun set(text: String, subject: String) {
        val d = (Defaults.dictionary(key) ?: emptyMap()).toMutableMap()
        d[subject] = text
        Defaults.set(key, d)
    }
}
