package ru.student.safuhub.feature.pcsync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONObject
import ru.student.safuhub.App
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.Socket

/**
 * HTTP по домашней сети — простыми сокетами. Обычные HTTP-клиенты Android требуют разрешать
 * незашифрованный HTTP всему приложению; здесь это не нужно: всё, что едет, и так зашифровано AES-256-GCM.
 */
object LanHttp {
    class Response(val status: Int, val headers: Map<String, String>, val body: ByteArray) {
        val json: JSONObject? get() = runCatching { JSONObject(String(body, Charsets.UTF_8)) }.getOrNull()
    }

    class Rejected(val status: Int) : Exception("HTTP $status")

    fun request(host: String, port: Int, method: String, path: String, body: ByteArray? = null,
                headers: Map<String, String> = emptyMap(), connectTimeout: Int = 1500, readTimeout: Int = 6000): Response {
        Socket().use { s ->
            s.connect(InetSocketAddress(host, port), connectTimeout)
            s.soTimeout = readTimeout
            s.tcpNoDelay = true
            val head = StringBuilder()
            head.append("$method $path HTTP/1.1\r\n")
            head.append("Host: $host:$port\r\n")
            head.append("Connection: close\r\n")
            for ((k, v) in headers) head.append("$k: $v\r\n")
            if (body != null) head.append("Content-Length: ${body.size}\r\n")
            head.append("\r\n")
            val out = s.getOutputStream()
            out.write(head.toString().toByteArray(Charsets.UTF_8))
            if (body != null) out.write(body)
            out.flush()
            return read(BufferedInputStream(s.getInputStream()))
        }
    }

    private fun readLine(input: InputStream): String {
        val b = ByteArrayOutputStream()
        while (true) {
            val c = input.read()
            if (c < 0) break
            if (c == '\n'.code) break
            if (c != '\r'.code) b.write(c)
        }
        return String(b.toByteArray(), Charsets.UTF_8)
    }

    private fun read(input: InputStream): Response {
        val status = readLine(input).split(' ').getOrNull(1)?.toIntOrNull() ?: throw java.io.IOException("bad response")
        val headers = HashMap<String, String>()
        while (true) {
            val line = readLine(input)
            if (line.isEmpty()) break
            val i = line.indexOf(':')
            if (i > 0) headers[line.substring(0, i).trim().lowercase()] = line.substring(i + 1).trim()
        }
        val len = headers["content-length"]?.toIntOrNull()
        val body = if (headers["transfer-encoding"]?.contains("chunked") == true) readChunked(input)
        else if (len != null) readExactly(input, len) else input.readBytes()
        return Response(status, headers, body)
    }

    private fun readExactly(input: InputStream, n: Int): ByteArray {
        val buf = ByteArray(n)
        var off = 0
        while (off < n) {
            val r = input.read(buf, off, n - off)
            if (r < 0) throw java.io.EOFException()
            off += r
        }
        return buf
    }

    private fun readChunked(input: InputStream): ByteArray {
        val out = ByteArrayOutputStream()
        while (true) {
            val size = readLine(input).substringBefore(';').trim().toInt(16)
            if (size == 0) { readLine(input); break }
            out.write(readExactly(input, size))
            readLine(input)
        }
        return out.toByteArray()
    }

    fun postJson(host: String, port: Int, path: String, body: JSONObject, readTimeout: Int = 8000): Response =
        request(host, port, "POST", path, body.toString().toByteArray(Charsets.UTF_8),
            mapOf("Content-Type" to "application/json"), connectTimeout = 3000, readTimeout = readTimeout)
}

/** Компьютер с Арктикой, который нашёлся в сети */
data class SyncFound(val host: String, val port: Int, val pc: String, val pair: String?) {
    val id get() = "$host:$port"
}

object LanDiscovery {
    /** Порт синхронизации на компьютере (занят — компьютер берёт следующий, телефон узнаёт его из ответа) */
    const val PORT = 47823

    /** Только адреса домашней сети: ссылка с адресом в интернете не уведёт данные наружу */
    fun isLocal(host: String): Boolean {
        val p = host.split('.').mapNotNull { it.toIntOrNull() }
        if (p.size != 4 || p.any { it !in 0..255 }) return false
        return p[0] == 10 || (p[0] == 172 && p[1] in 16..31) || (p[0] == 192 && p[1] == 168) || (p[0] == 169 && p[1] == 254)
    }

    private data class Iface(val ip: Int, val prefix: Int)

    /** Wi‑Fi (и раздача интернета с телефона): адрес и маска */
    private fun interfaces(): List<Iface> {
        val cm = App.ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val out = mutableListOf<Iface>()
        for (n in cm.allNetworks) {
            val caps = cm.getNetworkCapabilities(n) ?: continue
            if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) continue
            val lp = cm.getLinkProperties(n) ?: continue
            for (la in lp.linkAddresses) {
                val a = la.address as? Inet4Address ?: continue
                if (!isLocal(a.hostAddress ?: "")) continue
                val b = a.address
                val ip = (b[0].toInt() and 255 shl 24) or (b[1].toInt() and 255 shl 16) or (b[2].toInt() and 255 shl 8) or (b[3].toInt() and 255)
                out += Iface(ip, la.prefixLength)
            }
        }
        // раздача интернета с этого телефона: сеть точки доступа в системе не видна как Wi‑Fi — ищем по интерфейсам
        runCatching {
            for (ni in java.net.NetworkInterface.getNetworkInterfaces()) {
                if (!ni.isUp || ni.isLoopback || !(ni.name.startsWith("ap") || ni.name.startsWith("swlan") || ni.name.startsWith("wlan"))) continue
                for (ia in ni.interfaceAddresses) {
                    val a = ia.address as? Inet4Address ?: continue
                    val b = a.address
                    val ip = (b[0].toInt() and 255 shl 24) or (b[1].toInt() and 255 shl 16) or (b[2].toInt() and 255 shl 8) or (b[3].toInt() and 255)
                    if (isLocal(a.hostAddress ?: "") && out.none { it.ip == ip }) out += Iface(ip, ia.networkPrefixLength.toInt())
                }
            }
        }
        return out
    }

    private fun dotted(v: Int) = "${v ushr 24 and 255}.${v ushr 16 and 255}.${v ushr 8 and 255}.${v and 255}"

    val hasLan: Boolean get() = interfaces().isNotEmpty()

    /** Соседи по сети: свои 254 адреса, а wide — остальная сеть, но не больше /22 */
    fun neighbours(wide: Boolean = false): List<String> {
        val near = mutableListOf<String>()
        val far = mutableListOf<String>()
        val seen = HashSet<String>()
        for (i in interfaces()) {
            val prefix = if (i.prefix >= 22) i.prefix else 22
            val mask = if (prefix == 0) 0 else (-1 shl (32 - prefix))
            val net = i.ip and mask
            val last = net or mask.inv()
            val block = i.ip and -256
            var v = net + 1
            while (v < last) {
                if (v != i.ip && (v and 255) != 0 && (v and 255) != 255) {
                    val s = dotted(v)
                    if (seen.add(s)) { if ((v and -256) == block) near += s else far += s }
                }
                v++
            }
        }
        return if (wide) far else near
    }

    /** «Кто тут?» — отвечает только Арктика для Windows */
    fun hello(host: String, port: Int): SyncFound? = try {
        val r = LanHttp.request(host, port, "GET", "/v2/hello", connectTimeout = 900, readTimeout = 1600)
        val j = if (r.status == 200) r.json else null
        if (j == null || j.optString("app") != "arktika") null else {
            val p = j.optInt("port", port).takeIf { it in 1..65535 } ?: port
            SyncFound(host, p, j.optString("pc").take(40).ifEmpty { "Компьютер" }, j.optString("pair").takeIf { it.isNotEmpty() && it != "null" })
        }
    } catch (_: Throwable) { null }

    /** Обойти сеть: сначала адреса из first, потом соседей. stop — нашли нужный, дальше не ищем */
    suspend fun scan(first: List<String> = emptyList(), ports: List<Int> = listOf(PORT), wide: Boolean = false,
                     stop: ((SyncFound) -> Boolean)? = null): List<SyncFound> = withContext(Dispatchers.IO) {
        val hosts = LinkedHashSet<String>()
        hosts += first.filter(::isLocal)
        hosts += neighbours(wide)
        val targets = hosts.take(1100).flatMap { h -> ports.map { h to it } }
        val found = java.util.Collections.synchronizedList(mutableListOf<SyncFound>())
        val gate = Semaphore(64)
        val stopped = java.util.concurrent.atomic.AtomicBoolean(false)
        coroutineScope {
            targets.map { (h, p) ->
                async {
                    if (stopped.get()) return@async
                    gate.withPermit {
                        if (stopped.get()) return@withPermit
                        val r = hello(h, p) ?: return@withPermit
                        synchronized(found) { if (found.none { it.host == r.host }) found += r }
                        if (stop?.invoke(r) == true) stopped.set(true)
                    }
                }
            }.awaitAll()
        }
        found.toList()
    }

    /** Компьютер по адресу, который ввели руками: основной порт, потом запасные */
    suspend fun find(host: String): SyncFound? = withContext(Dispatchers.IO) {
        val h = host.trim()
        if (!isLocal(h)) return@withContext null
        hello(h, PORT) ?: coroutineScope {
            (PORT + 1..PORT + 7).map { p -> async { hello(h, p) } }.awaitAll().firstOrNull { it != null }
        }
    }

    /** Отпечаток номера связки — как на компьютере (sha256, первые 12 знаков) */
    fun tag(id: String) = PCCrypto.hex(PCCrypto.sha256(id.toByteArray(Charsets.UTF_8))).take(12)
}
