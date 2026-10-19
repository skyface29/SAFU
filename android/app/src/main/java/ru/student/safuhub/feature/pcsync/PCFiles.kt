package ru.student.safuhub.feature.pcsync

import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.HWFiles
import ru.student.safuhub.data.HomeworkStore
import java.io.File
import java.io.RandomAccessFile
import java.time.Instant

// MARK: - Файлы на компьютер — сами, по связке синхронизации (как iPhone 19.5)
//
// После удачного обмена ДЗ телефон смотрит, не появилось ли новых файлов: файлы предметов, фото доски,
// записи лекций и фото к ДЗ («ДЗ с iPhone/<номер ДЗ>/…» — на компьютере они прикрепляются к тому же ДЗ).
// Протокол и шифр — как у переноса по QR (/v1/*), только ключ — ключ связки, а номер сеанса — номер связки.
// Компьютер сам говорит, что у него уже есть, поэтому идут только новые файлы; оборвалось — докачается.

object PCFiles {
    const val ON_KEY = "pcsync.files"
    private const val SIG_KEY = "pcsync.files.sig"
    private const val LAST_KEY = "pcsync.files.last"
    /** Та же папка, что у iPhone: компьютер по ней узнаёт фото к ДЗ */
    const val HW_DIR = "ДЗ с iPhone"
    private const val CHUNK = 4 * 1024 * 1024

    class Item(val rel: String, val file: File, val size: Long, val mtime: Long)

    var line by mutableStateOf<String?>(null)
        private set
    var busy by mutableStateOf(false)
        private set
    private var job: Job? = null
    private var checkedAt = 0L

    val enabled: Boolean get() = Defaults.boolOrNull(ON_KEY) ?: true

    val lastSent: Instant? get() = Defaults.double(LAST_KEY).takeIf { it > 0 }?.let { Instant.ofEpochMilli(it.toLong()) }

    fun forget() { Defaults.remove(SIG_KEY); Defaults.remove(LAST_KEY); line = null }

    private fun skip(rel: String): Boolean {
        val first = rel.substringBefore('/')
        return first in setOf("huggingface", "models", "Inbox", ".Trash") || rel.endsWith(".safubackup") || rel.endsWith(".part")
    }

    /** Всё из «Файлов» приложения: предметы (с фото доски), лекции, загрузки */
    fun inventory(): List<Item> {
        val root = FileService.root.canonicalFile
        val out = mutableListOf<Item>()
        root.walkTopDown().onEnter { d -> d == root || (!d.name.startsWith(".") && !skip(d.relativeTo(root).invariantSeparatorsPath)) }
            .filter { it.isFile && !it.name.startsWith(".") }
            .forEach { f ->
                val rel = f.relativeTo(root).invariantSeparatorsPath
                if (!skip(rel)) out += Item(rel, f, f.length(), f.lastModified())
            }
        return out
    }

    /** Фото к ДЗ как файлы для переноса */
    fun homeworkItems(): List<Item> = HomeworkStore.items.flatMap { h ->
        h.photos.mapNotNull { name ->
            val f = HWFiles.file(h.id, name)
            if (f.isFile) Item("$HW_DIR/${h.id.lowercase()}/$name", f, f.length(), f.lastModified()) else null
        }
    }

    /** Отпечаток набора файлов: не изменился — компьютер и так всё получил */
    fun signature(items: List<Item>, pair: String): String {
        val sb = StringBuilder(pair)
        for (i in items.sortedBy { it.rel }) sb.append("${i.rel}|${i.size}|${i.mtime}\n")
        return PCCrypto.hex(PCCrypto.sha256(sb.toString().toByteArray(Charsets.UTF_8))).take(24)
    }

    /** После удачного обмена: не появилось ли новых файлов? Проверяем не чаще раза в пару минут */
    fun pushSoon(force: Boolean = false) {
        val p = PCSync.pairing ?: return
        if (job != null || !enabled) return
        if (!force && System.currentTimeMillis() - checkedAt < 120_000) return
        checkedAt = System.currentTimeMillis()
        job = AppScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { inventory() + homeworkItems() }
                val sig = signature(items, p.id)
                if (items.isEmpty() || (!force && Defaults.string(SIG_KEY) == sig)) return@launch
                busy = true
                val sent = withContext(Dispatchers.IO) { send(items, p) { done, total -> line = "Отправляю файлы на компьютер: $done из $total" } }
                Defaults.set(SIG_KEY, sig)
                Defaults.set(LAST_KEY, System.currentTimeMillis().toDouble())
                line = if (sent > 0) "Отправлено файлов: $sent — уже на компьютере" else null
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Throwable) {
                android.util.Log.w("PCFiles", "send failed", e)
                line = "Файлы не ушли — попробую снова при следующей синхронизации"
            } finally {
                busy = false
                job = null
            }
        }
    }

    // MARK: сеть

    private class Client(val p: SyncPairing) {
        val key: ByteArray = Base64.decode(p.key, Base64.DEFAULT)
        var host: String? = null

        fun call(method: String, path: String, body: ByteArray, timeout: Int = 25_000): Pair<Int, JSONObject> =
            send(method, path, PCCrypto.seal(body, key, "$method $path"), timeout)

        fun send(method: String, path: String, sealed: ByteArray, timeout: Int = 25_000): Pair<Int, JSONObject> {
            val hosts = host?.let { listOf(it) } ?: p.hosts
            var last: Throwable = java.io.IOException("unreachable")
            for (h in hosts) {
                try {
                    val r = LanHttp.request(h, p.port, method, path, sealed,
                        mapOf("X-Arktika-Session" to p.id, "Content-Type" to "application/octet-stream"),
                        connectTimeout = 2500, readTimeout = timeout)
                    if (r.headers["content-type"]?.startsWith("application/octet-stream") != true) throw LanHttp.Rejected(r.status)
                    val plain = PCCrypto.open(r.body, key, "R $method $path")
                    host = h
                    return r.status to (runCatching { JSONObject(String(plain, Charsets.UTF_8)) }.getOrNull() ?: JSONObject())
                } catch (e: LanHttp.Rejected) {
                    throw e
                } catch (e: Throwable) {
                    last = e
                }
            }
            throw last
        }
    }

    private fun appVersion(): String = runCatching {
        val ctx = ru.student.safuhub.App.ctx
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName
    }.getOrNull() ?: ""

    /** Отправить новое. progress(отправлено файлов, всего новых). Возвращает, сколько файлов ушло */
    fun send(list: List<Item>, p: SyncPairing, progress: (Int, Int) -> Unit): Int {
        val c = Client(p)
        c.call("POST", "/v1/hello", JSONObject().put("device", PCSync.deviceName).put("app", appVersion())
            .toString().toByteArray(Charsets.UTF_8), 6000)
        val files = JSONArray()
        for (i in list) files.put(JSONObject().put("p", i.rel).put("s", i.size).put("m", i.mtime))
        val (code, plan) = c.call("POST", "/v1/plan", JSONObject().put("files", files).put("data", false).toString().toByteArray(Charsets.UTF_8), 60_000)
        if (code != 200) throw LanHttp.Rejected(code)
        val offsets = HashMap<Int, Long>()
        plan.optJSONArray("files")?.let { a -> for (k in 0 until a.length()) a.optJSONObject(k)?.let { offsets[it.optInt("i", -1)] = it.optLong("o", -1) } }
        val todo = list.mapIndexedNotNull { i, item -> offsets[i]?.takeIf { it in 0..item.size }?.let { Triple(i, item, it) } }
        if (todo.isNotEmpty()) progress(0, todo.size)
        var sent = 0
        for ((i, item, start) in todo) {
            var off = start
            RandomAccessFile(item.file, "r").use { raf ->
                while (off < item.size) {
                    val len = minOf(CHUNK.toLong(), item.size - off).toInt()
                    val buf = ByteArray(len)
                    raf.seek(off)
                    raf.readFully(buf)
                    val path = "/v1/file?i=$i&o=$off"
                    val (st, j) = c.send("PUT", path, PCCrypto.seal(buf, c.key, "PUT $path"), 60_000)
                    if (st != 200 && st != 409) throw LanHttp.Rejected(st)
                    val now = minOf(item.size, maxOf(0L, if (j.has("o")) j.optLong("o") else off + len))
                    if (now == off || (st == 200 && now < off)) throw java.io.IOException("broken")
                    off = now
                }
            }
            sent += 1
            progress(sent, todo.size)
        }
        c.call("POST", "/v1/done", "{}".toByteArray())
        return sent
    }
}
