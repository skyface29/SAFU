package ru.student.safuhub.feature.web

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import ru.student.safuhub.App
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Невидимый браузер (как WKWebView без окна): те же куки и вход, что во встроенном браузере.
 * Умеет ждать загрузку страницы и выполнять async-JS с ответом строкой.
 * hook — скрипт, который ставится в начале каждой страницы.
 */
class HeadlessWeb(private val hook: String? = null) {
    private var web: WebView? = null
    private var pageDone: CompletableDeferred<Unit>? = null
    private val pending = ConcurrentHashMap<String, CompletableDeferred<String?>>()

    private inner class Bridge {
        @JavascriptInterface
        fun done(id: String, value: String?) {
            pending.remove(id)?.complete(value)
        }
    }

    /** Создать браузер (на главном потоке) */
    @SuppressLint("SetJavaScriptEnabled")
    suspend fun start(): Boolean = withContext(Dispatchers.Main) {
        if (web != null) return@withContext true
        SessionKeeper.restore()
        val wv = try { WebView(App.ctx) } catch (_: Throwable) { return@withContext false }
        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true
        // как во встроенном браузере: обычный Chrome, без пометки WebView
        wv.settings.userAgentString = wv.settings.userAgentString.replace("; wv", "")
        try { CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true) } catch (_: Throwable) {}
        wv.addJavascriptInterface(Bridge(), "SafuBridge")
        wv.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                hook?.let { view.evaluateJavascript(it, null) }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                hook?.let { view.evaluateJavascript(it, null) }
                pageDone?.complete(Unit)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) pageDone?.complete(Unit)
            }
        }
        // размер как у телефона — вёрстка страниц рассчитана на экран
        val d = App.ctx.resources.displayMetrics.density
        wv.measure(android.view.View.MeasureSpec.makeMeasureSpec((390 * d).toInt(), android.view.View.MeasureSpec.EXACTLY),
            android.view.View.MeasureSpec.makeMeasureSpec((800 * d).toInt(), android.view.View.MeasureSpec.EXACTLY))
        wv.layout(0, 0, (390 * d).toInt(), (800 * d).toInt())
        web = wv
        true
    }

    /** Открыть адрес и дождаться загрузки (не дольше timeout) */
    suspend fun load(url: String, timeoutMs: Long = 20_000) {
        val done = CompletableDeferred<Unit>()
        withContext(Dispatchers.Main) {
            pageDone = done
            web?.loadUrl(url) ?: done.complete(Unit)
        }
        withTimeoutOrNull(timeoutMs) { done.await() }
    }

    /** Текущий адрес страницы */
    suspend fun url(): String? = withContext(Dispatchers.Main) { web?.url }

    /**
     * Выполнить тело async-функции (можно await) с аргументами-строками; вернуть строку или null.
     * Как callAsyncJavaScript в WebKit.
     */
    suspend fun callAsync(body: String, args: Map<String, String> = emptyMap(), timeoutMs: Long = 30_000): String? {
        val id = UUID.randomUUID().toString()
        val result = CompletableDeferred<String?>()
        pending[id] = result
        val decl = args.entries.joinToString("") { "const ${it.key} = ${JSONObject.quote(it.value)};" }
        val js = "(async function(){ $decl\n$body\n})().then(function(v){ SafuBridge.done('$id', v == null ? null : String(v)); }," +
            " function(e){ SafuBridge.done('$id', null); });"
        val started = withContext(Dispatchers.Main) {
            val w = web ?: return@withContext false
            w.evaluateJavascript(js, null)
            true
        }
        if (!started) { pending.remove(id); return null }
        return withTimeoutOrNull(timeoutMs) { result.await() }.also { pending.remove(id) }
    }

    /** Выполнить выражение JS, вернуть строку (если результат — строка) */
    suspend fun eval(js: String, timeoutMs: Long = 10_000): String? {
        val result = CompletableDeferred<String?>()
        val started = withContext(Dispatchers.Main) {
            val w = web ?: return@withContext false
            w.evaluateJavascript(js) { raw -> result.complete(decodeJSValue(raw)) }
            true
        }
        if (!started) return null
        return withTimeoutOrNull(timeoutMs) { result.await() }
    }

    /** Закрыть браузер */
    suspend fun stop() = withContext(kotlinx.coroutines.NonCancellable + Dispatchers.Main) {
        pending.values.forEach { it.complete(null) }
        pending.clear()
        web?.let { w ->
            try { w.stopLoading(); w.removeJavascriptInterface("SafuBridge"); w.destroy() } catch (_: Throwable) {}
        }
        web = null
        try { CookieManager.getInstance().flush() } catch (_: Throwable) {}
    }

    companion object {
        /** evaluateJavascript отдаёт JSON-значение: строку в кавычках, null, число… */
        fun decodeJSValue(raw: String?): String? {
            if (raw == null || raw == "null" || raw == "undefined") return null
            return try { JSONArray("[$raw]").get(0).let { if (it == JSONObject.NULL) null else it.toString() } } catch (_: Throwable) { raw }
        }
    }
}

/** JSON-объекты org.json → обычные Map/List (как JSONSerialization) */
fun jsonToKotlin(v: Any?): Any? = when (v) {
    is JSONObject -> v.keys().asSequence().associateWith { jsonToKotlin(v.opt(it)) }
    is JSONArray -> (0 until v.length()).map { jsonToKotlin(v.opt(it)) }
    JSONObject.NULL -> null
    else -> v
}

/** Разобрать текст JSON (объект или массив) в Map/List */
fun parseJSONAny(text: String?): Any? {
    val t = text?.trim() ?: return null
    return try {
        when {
            t.startsWith("{") -> jsonToKotlin(JSONObject(t))
            t.startsWith("[") -> jsonToKotlin(JSONArray(t))
            else -> null
        }
    } catch (_: Throwable) { null }
}
