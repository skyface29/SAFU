package ru.student.safuhub.feature.lectures

import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import ru.student.safuhub.App
import ru.student.safuhub.R
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.FileService
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.UnknownHostException
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

// MARK: - GigaChat (Сбер)

/**
 * Серверы GigaChat подписаны сертификатом «Russian Trusted Root CA» (Минцифры), которому Android по умолчанию не доверяет.
 * Доверяем ему только в клиенте GigaChat и только для доменов Сбера.
 * SHA-256: D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31
 */
object GigaTrust {
    /** Хосты клиента GigaChat (gu-st.ru — сайт, откуда докачиваем промежуточный сертификат) */
    val hosts = setOf("ngw.devices.sberbank.ru", "gigachat.devices.sberbank.ru", "gu-st.ru")

    /** Почему не удалось проверить соединение в последний раз (для экрана проверки) */
    @Volatile var lastError: String? = null

    private fun cert(bytes: ByteArray): X509Certificate? = try {
        CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(bytes)) as? X509Certificate
    } catch (_: Throwable) { null }

    val root: X509Certificate? by lazy {
        try { App.ctx.resources.openRawResource(R.raw.russian_trusted_root_ca).use { cert(it.readBytes()) } } catch (_: Throwable) { null }
    }

    private val cacheFile: File get() = File(FileService.support, "russian_trusted_sub_ca.der")

    /** Подписан ли сертификат корнем Минцифры */
    fun signedByRoot(c: X509Certificate): Boolean {
        val r = root ?: return false
        return try { c.verify(r.publicKey); true } catch (_: Throwable) { false }
    }

    /** Промежуточный сертификат «Russian Trusted Sub CA»: из сборки или скачанный раньше */
    private fun intermediates(): List<X509Certificate> {
        val out = ArrayList<X509Certificate>()
        try { App.ctx.assets.open("certs/RussianTrustedSub.cer").use { s -> cert(s.readBytes())?.let(out::add) } } catch (_: Throwable) {}
        try { if (cacheFile.exists()) cert(cacheFile.readBytes())?.let(out::add) } catch (_: Throwable) {}
        return out.filter { signedByRoot(it) }
    }

    private fun trustOf(ks: KeyStore?): X509TrustManager {
        val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        tmf.init(ks)
        return tmf.trustManagers.filterIsInstance<X509TrustManager>().first()
    }

    /** Обычные корни Android плюс корень Минцифры с промежуточным. В систему телефона ничего не ставится */
    fun trustManager(): X509TrustManager {
        val system = trustOf(null)
        val ks = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null) }
        root?.let { ks.setCertificateEntry("ru-root", it) }
        intermediates().forEachIndexed { i, c -> ks.setCertificateEntry("ru-sub-$i", c) }
        val ru = trustOf(ks)
        return object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = system.checkClientTrusted(chain, authType)

            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
                try {
                    system.checkServerTrusted(chain, authType)
                } catch (_: CertificateException) {
                    try {
                        ru.checkServerTrusted(chain, authType)
                        lastError = null
                    } catch (e: CertificateException) {
                        lastError = e.message
                        throw e
                    }
                }
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> = system.acceptedIssuers + ru.acceptedIssuers
        }
    }

    /** Докачиваем промежуточный сертификат с сайта Минцифры и сохраняем, только если его подписал корень */
    suspend fun fetchIntermediate(client: OkHttpClient): Boolean = withContext(Dispatchers.IO) {
        val urls = listOf(
            "https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt",
            "https://gu-st.ru/content/Other/doc/russian_trusted_sub_ca.cer",
            // подлинность проверяется подписью корня, поэтому годится и http
            "http://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt",
        )
        for (u in urls) {
            val data = try {
                client.newCall(Request.Builder().url(u).build()).execute().use { if (it.isSuccessful) it.body?.bytes() else null }
            } catch (_: Throwable) { null } ?: continue
            val text = String(data, Charsets.US_ASCII)
            val der = if (text.contains("BEGIN CERTIFICATE")) {
                val b64 = text.lines().filter { !it.startsWith("-----") }.joinToString("")
                try { Base64.decode(b64, Base64.DEFAULT) } catch (_: Throwable) { continue }
            } else data
            val c = cert(der) ?: continue
            if (signedByRoot(c)) {
                try { cacheFile.writeBytes(c.encoded) } catch (_: Throwable) { continue }
                return@withContext true
            }
        }
        false
    }
}

class GigaError(val code: Int, detail: String) : Exception(
    when (code) {
        401 -> "GigaChat не принял ключ авторизации — проверь его в настройках"
        402 -> "Закончились бесплатные токены GigaChat в этом месяце"
        429 -> "GigaChat просит подождать — слишком много запросов"
        else -> "GigaChat ответил $code: $detail"
    }
)

object GigaChat {
    val models = listOf("GigaChat" to "Lite", "GigaChat-Pro" to "Pro", "GigaChat-Max" to "Max")

    var model: String
        get() = Defaults.string("gigachat.model") ?: "GigaChat"
        set(v) = Defaults.set("gigachat.model", v)

    @Volatile private var client: OkHttpClient? = null

    private fun client(): OkHttpClient = client ?: build().also { client = it }

    private fun build(): OkHttpClient {
        val tm = GigaTrust.trustManager()
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(tm), null) }
        return OkHttpClient.Builder()
            .sslSocketFactory(ssl.socketFactory, tm)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(180, TimeUnit.SECONDS)
            // этот клиент доверяет корню Минцифры — пускаем его только на серверы Сбера
            .addInterceptor { chain ->
                if (chain.request().url.host !in GigaTrust.hosts) throw IOException("Недопустимый адрес для GigaChat")
                chain.proceed(chain.request())
            }
            .build()
    }

    private class Token(val value: String, val until: Long)
    @Volatile private var token: Token? = null

    fun resetToken() { token = null }

    private fun trustFailure(e: Throwable): Boolean = e is SSLException || e.cause is CertificateException

    private suspend fun call(req: Request, timeoutSec: Long?): Pair<Int, String> {
        val c = if (timeoutSec != null) client().newBuilder().callTimeout(timeoutSec, TimeUnit.SECONDS).build() else client()
        return c.newCall(req).await().use { it.code to (it.body?.string() ?: "") }
    }

    /** Запрос с одной повторной попыткой: если соединение не проверилось, докачиваем промежуточный сертификат */
    private suspend fun send(req: Request, timeoutSec: Long? = null): Pair<Int, String> = try {
        call(req, timeoutSec)
    } catch (e: IOException) {
        if (!trustFailure(e) || !GigaTrust.fetchIntermediate(client())) throw e
        client = null
        call(req, timeoutSec)
    }

    private suspend fun accessToken(authKey: String): String {
        token?.let { if (it.until > System.currentTimeMillis() + 60_000) return it.value }
        val basic = if (authKey.startsWith("Basic ")) authKey else "Basic $authKey"
        val req = Request.Builder().url("https://ngw.devices.sberbank.ru:9443/api/v2/oauth")
            .post("scope=GIGACHAT_API_PERS".toByteArray().toRequestBody("application/x-www-form-urlencoded".toMediaType()))
            .header("Authorization", basic)
            .header("RqUID", UUID.randomUUID().toString())
            .header("Accept", "application/json")
            .build()
        val (code, body) = send(req, 30)
        val obj = try { JSONObject(body) } catch (_: Throwable) { null }
        val value = obj?.optString("access_token")?.takeIf { it.isNotEmpty() }
        if (code != 200 || value == null) throw GigaError(code, body.take(200))
        val until = obj.optLong("expires_at", 0L).takeIf { it > 0 } ?: (System.currentTimeMillis() + 1_500_000)
        token = Token(value, until)
        return value
    }

    /** Проверка подключения: получаем токен и список моделей (бесплатно, токены не тратятся) */
    suspend fun check(): List<String> {
        val key = GigaKey.value ?: throw GigaError(401, "")
        token = null
        val t = accessToken(key)
        val req = Request.Builder().url("https://gigachat.devices.sberbank.ru/api/v1/models")
            .header("Authorization", "Bearer $t")
            .header("Accept", "application/json")
            .build()
        val (code, body) = send(req, 20)
        if (code != 200) throw GigaError(code, body.take(200))
        val arr = try { JSONObject(body).optJSONArray("data") } catch (_: Throwable) { null } ?: return emptyList()
        return (0 until arr.length()).mapNotNull { arr.optJSONObject(it)?.optString("id")?.takeIf { s -> s.isNotEmpty() } }
    }

    suspend fun complete(system: String, user: String): String {
        val key = GigaKey.value ?: throw GigaError(401, "")
        val t = accessToken(key)
        val body = JSONObject()
            .put("model", model)
            .put("messages", JSONArray()
                .put(JSONObject().put("role", "system").put("content", system))
                .put(JSONObject().put("role", "user").put("content", user)))
            .put("max_tokens", 4000)
        val req = Request.Builder().url("https://gigachat.devices.sberbank.ru/api/v1/chat/completions")
            .post(body.toString().toRequestBody(jsonType))
            .header("Authorization", "Bearer $t")
            .header("Accept", "application/json")
            .build()
        val (code, text) = send(req)
        if (code == 401) token = null
        val obj = try { JSONObject(text) } catch (_: Throwable) { null }
        val msg = obj?.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")
        if (code != 200 || msg == null || !msg.has("content")) {
            throw GigaError(code, (obj?.optString("message")?.takeIf { it.isNotEmpty() } ?: text).take(200))
        }
        return msg.optString("content")
    }
}

// MARK: - Проверка подключения ИИ

data class AIProbe(val state: State, val text: String) {
    enum class State { OK, WARN, FAIL }
}

object LectureAIProbe {
    private fun online(): Boolean {
        val cm = App.ctx.getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** Понятный текст для сетевых ошибок */
    fun describe(e: Throwable, vpnHint: Boolean): String = when {
        e is GigaError || e is LectureError -> e.message ?: ""
        !online() -> "Нет интернета"
        e is SSLException || e.cause is CertificateException -> "Не удалось проверить защищённое соединение"
        e is UnknownHostException || e is ConnectException || e is InterruptedIOException ->
            if (vpnHint) "Сервер недоступен — из России нужен VPN" else "Сервер не отвечает, попробуй позже"
        else -> e.message ?: e.toString()
    }

    suspend fun gigachat(): AIProbe {
        if (GigaKey.value == null) return AIProbe(AIProbe.State.WARN, "Ключ не введён")
        val start = System.currentTimeMillis()
        return try {
            val models = GigaChat.check()
            val ms = System.currentTimeMillis() - start
            val chosen = GigaChat.model
            if (models.isNotEmpty() && chosen !in models) {
                AIProbe(AIProbe.State.WARN, "Подключено, но модель $chosen недоступна на твоём тарифе — выбери Lite")
            } else AIProbe(AIProbe.State.OK, "Подключено · $chosen · $ms мс")
        } catch (e: Throwable) {
            var text = describe(e, vpnHint = false)
            GigaTrust.lastError?.let { text += "\n$it" }
            AIProbe(AIProbe.State.FAIL, text)
        }
    }

    private val http by lazy { OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build() }

    /** Ключ Claude проверяем бесплатным запросом информации о модели */
    suspend fun claude(): AIProbe {
        val key = ClaudeKey.value ?: return AIProbe(AIProbe.State.WARN, "Ключ не введён (необязательно)")
        val req = Request.Builder().url("https://api.anthropic.com/v1/models/claude-opus-5")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .build()
        return try {
            when (val c = http.newCall(req).await().use { it.code }) {
                200 -> AIProbe(AIProbe.State.OK, "Подключено · claude-opus-5")
                401 -> AIProbe(AIProbe.State.FAIL, "Ключ неверный")
                403 -> AIProbe(AIProbe.State.FAIL, "Доступ запрещён — из России нужен VPN")
                404 -> AIProbe(AIProbe.State.FAIL, "Модель недоступна для этого ключа")
                else -> AIProbe(AIProbe.State.FAIL, "Anthropic ответил $c")
            }
        } catch (e: Throwable) {
            AIProbe(AIProbe.State.FAIL, describe(e, vpnHint = true))
        }
    }

    /** Обе проверки сразу */
    suspend fun all(): Map<LectureAI, AIProbe> = coroutineScope {
        val g = async { gigachat() }
        val c = async { claude() }
        mapOf(LectureAI.GIGACHAT to g.await(), LectureAI.CLAUDE to c.await())
    }
}
