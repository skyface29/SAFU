package ru.student.safuhub.feature.web

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.FileService
import ru.student.safuhub.data.Resource
import ru.student.safuhub.data.ResourceStore
import ru.student.safuhub.data.RuzClient
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.hostOf
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.PausesAmbient
import ru.student.safuhub.ui.design.iosShadow
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavBar
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.kit.barTint
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.util.concurrent.TimeUnit

// MARK: - Как открыть сайт

object WebLauncher {
    /** Сайт, открытый во встроенном браузере (лист на весь экран в RootView) */
    val opened = mutableStateOf<Resource?>(null)
    const val plainKey = "web.plain.hosts"

    /** «Как в браузере»: сайт открывается в настоящем Chrome внутри приложения (Custom Tabs) */
    fun isPlain(host: String?): Boolean {
        host ?: return false
        // почта Samoware: в браузере подсказки адресов работают, во встроенном — нет. Один раз включаем ей этот режим
        if (!Defaults.bool("web.plain.samoware")) {
            Defaults.set("web.plain.samoware", true)
            setPlain("edu.narfu.ru", true)
        }
        return (Defaults.stringArray(plainKey) ?: emptyList()).contains(host)
    }

    fun setPlain(host: String, on: Boolean) {
        val list = (Defaults.stringArray(plainKey) ?: emptyList()).toMutableSet()
        if (on) list.add(host) else list.remove(host)
        Defaults.set(plainKey, list.toList())
    }

    fun open(ctx: Context, r: Resource) {
        val host = hostOf(r.url)
        if (isPlain(host)) {
            val url = ResourceStore.lastURL(r) ?: r.url
            CustomTabs.open(ctx, url)
        } else {
            opened.value = r
        }
    }
}

/** Настоящий браузер внутри приложения (как SFSafariViewController) */
object CustomTabs {
    fun open(ctx: Context, url: String, dark: Boolean = false) {
        try {
            val params = CustomTabColorSchemeParams.Builder()
                .setToolbarColor(if (dark) 0xFF1C1C1E.toInt() else 0xFFF9F9F9.toInt()).build()
            val intent = CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(params)
                .setShowTitle(true)
                .setShareState(CustomTabsIntent.SHARE_STATE_ON)
                .build()
            intent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            intent.launchUrl(ctx, Uri.parse(url))
        } catch (_: Throwable) {
            Share.url(ctx, url)
        }
    }
}

// MARK: - Скрипты для страниц

object LoginScript {
    val source = """
    (function(){
      if (window.__safuHooked) return; window.__safuHooked = true;
      function visible(el){ return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
      function fields(){
        var ps = Array.prototype.slice.call(document.querySelectorAll('input[type="password"]')).filter(visible);
        if (!ps.length) return null;
        var p = ps[0];
        var scope = p.form || document;
        var all = Array.prototype.slice.call(scope.querySelectorAll('input')).filter(function(i){
          var t = (i.getAttribute('type') || 'text').toLowerCase();
          return (t === 'text' || t === 'email' || t === 'tel') && visible(i);
        });
        var u = null;
        for (var k = 0; k < all.length; k++) {
          if (all[k].compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) u = all[k];
        }
        if (!u && all.length) u = all[0];
        return { u: u, p: p, form: p.form };
      }
      function post(msg){ try { window.safuLogin.postMessage(JSON.stringify(msg)); } catch(e) {} }
      function setVal(el, v){
        if (!el) return;
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }
      window.__safuFill = function(user, pass, submit){
        var f = fields(); if (!f) return false;
        if (f.u && user) setVal(f.u, user);
        setVal(f.p, pass);
        if (submit) {
          setTimeout(function(){
            var scope = f.form || document;
            var b = scope.querySelector('#submitButton, button[type="submit"], input[type="submit"], button:not([type]), [role="button"], .login-button, .btn-login');
            if (b) { b.click(); }
            else if (f.form) { f.form.submit(); }
            else { f.p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true })); }
          }, 400);
        }
        return true;
      };
      function capture(){
        var f = fields(); if (!f || !f.p.value) return;
        post({ kind: 'creds', host: location.host, user: f.u ? f.u.value : '', pass: f.p.value });
      }
      document.addEventListener('submit', capture, true);
      document.addEventListener('change', function(e){ if (e.target && e.target.type === 'password') capture(); }, true);
      document.addEventListener('input', function(e){ if (e.target && e.target.type === 'password') capture(); }, true);
      document.addEventListener('click', function(){ if (fields()) capture(); }, true);
      document.addEventListener('keydown', function(e){ if (e.key === 'Enter' && fields()) capture(); }, true);
      var hadForm = false;
      function check(){
        var has = !!fields();
        if (has && !hadForm) { post({ kind: 'form', host: location.host }); }
        if (!has && hadForm) { post({ kind: 'gone', host: location.host }); }
        hadForm = has;
      }
      check();
      var timer = null;
      new MutationObserver(function(){
        if (timer) return;
        timer = setTimeout(function(){ timer = null; check(); }, 400);
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      window.addEventListener('load', check);
      setTimeout(check, 1500); setTimeout(check, 4000);
    })();
    """.trimIndent()

    const val lightCss = "(function(){if(window.__safuLight)return;window.__safuLight=true;var s=document.createElement('style');s.textContent=':root{color-scheme:light only !important}';(document.head||document.documentElement).appendChild(s);})();"
}

/** Невидимый текст в полях ввода (белое на белом, как в Samoware) — делаем читаемым */
object ContrastFix {
    val source = """
    (function(){
      if (window.__safuContrast) return; window.__safuContrast = true;
      function rgb(s){ var m = s && s.match(/rgba?\(([^)]+)\)/); if(!m) return null;
        var p = m[1].split(',').map(function(x){ return parseFloat(x); });
        return { r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1 }; }
      function lum(c){ function f(v){ v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
        return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b); }
      function bgOf(el){
        while (el && el.nodeType === 1) {
          var c = rgb(getComputedStyle(el).backgroundColor);
          if (c && c.a > 0.5) return c;
          el = el.parentElement;
        }
        return { r:255, g:255, b:255, a:1 };
      }
      function fix(el){
        if (!el || el.nodeType !== 1) return;
        var editable = el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
        if (!editable) return;
        var cs = getComputedStyle(el);
        var fg = rgb(cs.webkitTextFillColor && cs.webkitTextFillColor !== 'currentcolor' ? cs.webkitTextFillColor : cs.color) || rgb(cs.color);
        if (!fg) return;
        var bg = bgOf(el);
        var l1 = lum(fg), l2 = lum(bg);
        var ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (ratio >= 2.2 && fg.a > 0.4) return;
        var c = l2 > 0.5 ? '#111111' : '#f2f2f2';
        el.style.setProperty('color', c, 'important');
        el.style.setProperty('-webkit-text-fill-color', c, 'important');
      }
      document.addEventListener('focusin', function(e){ fix(e.target); }, true);
      document.addEventListener('input', function(e){ fix(e.target); }, true);
      document.addEventListener('keyup', function(e){ fix(e.target); }, true);
      function fixText(el){
        if (!el || el.nodeType !== 1 || !el.textContent || !el.textContent.trim()) return;
        var own = false;
        for (var i = 0; i < el.childNodes.length; i++) {
          var n = el.childNodes[i];
          if (n.nodeType === 3 && n.textContent.trim()) { own = true; break; }
        }
        if (!own) return;
        var cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        var fg = rgb(cs.color); if (!fg) return;
        var bg = bgOf(el);
        var l1 = lum(fg), l2 = lum(bg);
        var ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (ratio >= 1.6) return;
        el.style.setProperty('color', l2 > 0.5 ? '#111111' : '#f2f2f2', 'important');
      }
      var queue = [];
      var timer = null;
      function flush(){
        timer = null;
        var list = queue.splice(0, queue.length);
        var n = 0;
        for (var i = 0; i < list.length && n < 300; i++) {
          var root = list[i];
          if (!root || !root.querySelectorAll) continue;
          fixText(root); n++;
          var inner = root.querySelectorAll('*');
          for (var j = 0; j < inner.length && n < 300; j++) { fixText(inner[j]); n++; }
        }
      }
      new MutationObserver(function(ms){
        for (var i = 0; i < ms.length; i++) {
          for (var k = 0; k < ms[i].addedNodes.length; k++) {
            var a = ms[i].addedNodes[k];
            queue.push(a.nodeType === 1 ? a : a.parentElement);
          }
        }
        if (!timer && queue.length) timer = setTimeout(flush, 150);
      }).observe(document.documentElement, { childList: true, subtree: true });
    })();
    """.trimIndent()
}

// MARK: - Модель браузера

@Stable
class WebModel(ctx: Context) {
    val webView: WebView = WebView(ctx)
    var canGoBack by mutableStateOf(false)
    var canGoForward by mutableStateOf(false)
    var isLoading by mutableStateOf(false)
    var progress by mutableStateOf(0f)
    var url by mutableStateOf<String?>(null)
    var title by mutableStateOf("")
    var errorText by mutableStateOf<String?>(null)
    var toast by mutableStateOf<String?>(null)
    var pendingCredential by mutableStateOf<SiteCredential?>(null)
    var loginUser by mutableStateOf<String?>(null)
    var homeURL: String? = null
    private var candidate: SiteCredential? = null
    private val autoAttempts = HashMap<String, List<Long>>()
    private var triedFallback = false
    var fileCallback: ValueCallback<Array<Uri>>? = null
    var onFileChooser: ((WebChromeClient.FileChooserParams) -> Unit)? = null

    private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

    init {
        setup()
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun setup() {
        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.setSupportMultipleWindows(false)
        s.javaScriptCanOpenWindowsAutomatically = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        // некоторые сайты не пускают встроенные браузеры — убираем пометку «wv»
        s.userAgentString = s.userAgentString.replace("; wv", "")
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.addJavascriptInterface(Bridge(), "safuLogin")
        webView.webViewClient = Client()
        webView.webChromeClient = Chrome()
        webView.setDownloadListener { dlUrl, ua, cd, mime, _ -> download(dlUrl, ua, cd, mime) }
    }

    fun load(u: String) {
        if (webView.url != null) return
        errorText = null
        webView.loadUrl(u)
    }

    fun goHome() {
        val u = homeURL ?: return
        errorText = null
        webView.loadUrl(u)
    }

    fun retry() {
        errorText = null
        if (webView.url != null) webView.reload() else homeURL?.let { webView.loadUrl(it) }
    }

    fun back() {
        Haptics.tap()
        if (webView.canGoBack()) webView.goBack() else webView.evaluateJavascript("history.back()", null)
    }

    fun forward() {
        Haptics.tap()
        if (webView.canGoForward()) webView.goForward() else webView.evaluateJavascript("history.forward()", null)
    }

    private fun update() {
        canGoBack = webView.canGoBack()
        canGoForward = webView.canGoForward()
        url = webView.url
        title = webView.title ?: ""
    }

    fun showToast(text: String) {
        toast = text
        AppScope.launch {
            delay(2500)
            if (toast == text) toast = null
        }
    }

    private fun injectScripts() {
        webView.evaluateJavascript(LoginScript.source, null)
        webView.evaluateJavascript(ContrastFix.source, null)
        if (Defaults.boolOrNull("web.light") ?: true) webView.evaluateJavascript(LoginScript.lightCss, null)
    }

    // MARK: логины и пароли

    private fun js(s: String) = JSONObject.quote(s)

    private fun currentHttpsHost(): String? {
        val u = webView.url ?: return null
        val uri = Uri.parse(u)
        if (uri.scheme != "https") return null
        return uri.host?.lowercase()
    }

    private inner class Bridge {
        @JavascriptInterface
        fun postMessage(json: String) {
            webView.post { onMessage(json) }
        }
    }

    private fun onMessage(json: String) {
        // адрес берём у самого браузера, а не из сообщения страницы — подделать его нельзя
        val host = currentHttpsHost() ?: return
        val body = try { JSONObject(json) } catch (_: Throwable) { return }
        when (body.optString("kind")) {
            "form" -> {
                if (CredentialStore.enabled) CredentialStore.get(host)?.let { c -> loginUser = c.user }
                autofill(host)
            }
            "gone" -> {
                loginUser = null
                SessionKeeper.save()
                val c = candidate
                if (c != null && CredentialStore.get(c.host) != c) {
                    candidate = null
                    pendingCredential = c
                }
            }
            "creds" -> if (CredentialStore.enabled) {
                val pass = body.optString("pass")
                if (pass.isNotEmpty()) candidate = SiteCredential(host, body.optString("user"), pass)
            }
        }
    }

    /** Кнопка «Вставить пароль» */
    fun fillPasswordNow() {
        val host = currentHttpsHost() ?: Uri.parse(webView.url ?: "").host ?: return
        val c = CredentialStore.get(host)
        if (c == null) {
            showToast("Для этого сайта пароль ещё не сохранён — войди один раз вручную")
            return
        }
        webView.evaluateJavascript("window.__safuFill ? window.__safuFill(${js(c.user)}, ${js(c.pass)}, false) : false") { v ->
            if (v == "true") Haptics.success() else showToast("На этой странице нет поля для пароля")
        }
    }

    private fun autofill(host: String) {
        if (!CredentialStore.enabled) return
        val c = CredentialStore.get(host) ?: return
        // автонажатие «Войти» — не чаще 2 раз за 5 минут, чтобы не зациклиться при неверном пароле
        val now = System.currentTimeMillis()
        val recent = (autoAttempts[host] ?: emptyList()).filter { now - it < 300_000 }
        val submit = CredentialStore.autoLogin && recent.size < 2
        if (submit) autoAttempts[host] = recent + now
        webView.evaluateJavascript("window.__safuFill && window.__safuFill(${js(c.user)}, ${js(c.pass)}, ${if (submit) "true" else "false"})", null)
        if (submit) showToast("Вход выполняется автоматически…")
    }

    /** Если после ввода пароля страница больше не просит пароль — вход удался, предлагаем сохранить */
    private fun offerToSaveIfLoggedIn() {
        val c = candidate ?: return
        webView.postDelayed({
            webView.evaluateJavascript("!!document.querySelector('input[type=\"password\"]')") { v ->
                if (v == "true") return@evaluateJavascript
                candidate = null
                if (CredentialStore.get(c.host) != c) pendingCredential = c
            }
        }, 1000)
    }

    fun saveCredential(c: SiteCredential) {
        CredentialStore.save(c)
        pendingCredential = null
        showToast("Пароль сохранён")
    }

    // MARK: навигация

    private inner class Client : WebViewClient() {
        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            errorText = null
            loginUser = null
            isLoading = true
            SessionKeeper.remember(Uri.parse(url ?: "").host)
            if (Defaults.boolOrNull("web.light") ?: true) view.evaluateJavascript(LoginScript.lightCss, null)
            update()
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            injectScripts()
            update()
        }

        override fun onPageFinished(view: WebView, url: String?) {
            isLoading = false
            triedFallback = true
            injectScripts()
            update()
            SessionKeeper.save()
            offerToSaveIfLoggedIn()
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) { update() }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val u = request.url
            val scheme = u.scheme?.lowercase() ?: return false
            if (scheme in listOf("http", "https", "about", "blob", "data", "javascript")) return false
            // почта, телефон, другие приложения — только по нажатию пользователя; safu:// сайтам не отдаём
            if (scheme != "safu" && request.hasGesture()) {
                try { view.context.startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Throwable) {}
            }
            return true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            isLoading = false
            update()
            // сохранённая страница не открылась — тихо идём на главную сайта
            val home = homeURL
            if (!triedFallback && home != null) {
                triedFallback = true
                view.loadUrl(home)
                return
            }
            errorText = when (error.errorCode) {
                ERROR_HOST_LOOKUP, ERROR_CONNECT -> if (isOnline(view.context)) "Сайт сейчас недоступен" else "Нет интернета"
                ERROR_TIMEOUT -> "Сайт долго не отвечает"
                ERROR_FAILED_SSL_HANDSHAKE -> "Проблема с защищённым соединением сайта"
                else -> error.description?.toString() ?: "Не удалось открыть страницу"
            }
        }

        override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
            view.reload()
            return true
        }
    }

    private fun isOnline(ctx: Context): Boolean = try {
        val cm = ctx.getSystemService(android.net.ConnectivityManager::class.java)
        cm?.activeNetwork != null
    } catch (_: Throwable) { true }

    // MARK: окна JavaScript и выбор файлов

    private inner class Chrome : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progress = newProgress / 100f
            isLoading = newProgress < 100
        }

        override fun onReceivedTitle(view: WebView, t: String?) { title = t ?: "" }

        override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
            Dialogs.alert(null, message, AlertAction("OK", AlertAction.Role.BOLD) { result.confirm() })
            return true
        }

        override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
            Dialogs.alert(null, message, AlertAction("Отмена", AlertAction.Role.CANCEL) { result.cancel() },
                AlertAction("OK", AlertAction.Role.BOLD) { result.confirm() })
            return true
        }

        override fun onJsPrompt(view: WebView, url: String?, message: String?, defaultValue: String?, result: JsPromptResult): Boolean {
            Dialogs.prompt(message ?: "", null, "", defaultValue ?: "", "OK", onCancel = { result.cancel() }) { result.confirm(it) }
            return true
        }

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            val chooser = onFileChooser
            if (chooser == null) { callback.onReceiveValue(null); fileCallback = null; return true }
            chooser(params)
            return true
        }
    }

    // MARK: скачивание файлов → «Файлы › Загрузки»

    private fun download(dlUrl: String, ua: String?, cd: String?, mime: String?) {
        if (dlUrl.startsWith("blob:") || dlUrl.startsWith("data:")) {
            showToast("Этот файл можно сохранить только в браузере")
            return
        }
        val name = URLUtil.guessFileName(dlUrl, cd, mime).ifEmpty { "Файл" }
        showToast("Скачиваю: $name")
        AppScope.launch {
            val ok = withContext(Dispatchers.IO) {
                try {
                    val req = Request.Builder().url(dlUrl)
                        .header("User-Agent", ua ?: webView.settings.userAgentString)
                        .apply { CookieManager.getInstance().getCookie(dlUrl)?.let { header("Cookie", it) } }
                        .apply { webView.url?.let { header("Referer", it) } }
                        .build()
                    http.newCall(req).execute().use { resp ->
                        if (!resp.isSuccessful) return@use null
                        val dir = File(FileService.root, "Загрузки").apply { mkdirs() }
                        val dest = FileService.uniqueFile(dir, name)
                        resp.body?.byteStream()?.use { input -> dest.outputStream().use { input.copyTo(it) } }
                        dest.name
                    }
                } catch (_: Throwable) { null }
            }
            if (ok != null) {
                Haptics.success()
                showToast("Скачано: $ok → Файлы › Загрузки")
            } else showToast("Не удалось скачать файл")
        }
    }

    fun destroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        try {
            webView.stopLoading()
            webView.removeJavascriptInterface("safuLogin")
            webView.destroy()
        } catch (_: Throwable) {}
    }
}

// MARK: - Экран сайта

@Composable
fun WebScreen(resource: Resource) {
    val ctx = LocalContext.current
    val dismiss = LocalDismiss.current
    val model = remember { WebModel(ctx) }
    var forceLight by prefBool("web.light", true)
    var ruzConnected by remember { mutableStateOf(false) }
    val homeURL = resource.url
    val currentURL = model.url ?: homeURL
    PausesAmbient()

    // выбор файлов для загрузки на сайт (задания в Sakai, вложения в почте)
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val cb = model.fileCallback
        model.fileCallback = null
        cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
    }
    model.onFileChooser = { params ->
        try { picker.launch(params.createIntent()) } catch (_: Throwable) {
            model.fileCallback?.onReceiveValue(null); model.fileCallback = null
        }
    }

    fun remember() {
        model.webView.url?.let { ResourceStore.saveLastURL(it, resource) }
        SessionKeeper.save()
    }
    fun close() { remember(); dismiss() }

    LaunchedEffect(Unit) {
        model.homeURL = homeURL
        val start = ResourceStore.lastURL(resource) ?: homeURL
        withContext(Dispatchers.IO) { SessionKeeper.restore() }
        model.load(start)
    }
    // сохраняем вход каждые 20 секунд, даже если приложение потом закроют смахиванием
    LaunchedEffect(Unit) {
        while (true) { delay(20_000); SessionKeeper.save() }
    }
    DisposableEffect(Unit) {
        onDispose {
            remember()
            model.destroy()
        }
    }
    BackHandler(enabled = model.canGoBack) { model.back() }

    model.pendingCredential?.let { c ->
        LaunchedEffect(c) {
            Dialogs.alert("Сохранить пароль?",
                "Для ${c.host}${if (c.user.isEmpty()) "" else " (${c.user})"}. В следующий раз вход будет автоматическим. Пароль хранится зашифрованно только на этом телефоне.",
                AlertAction("Сохранить", AlertAction.Role.BOLD) { model.saveCredential(c) },
                AlertAction("Не сейчас", AlertAction.Role.CANCEL) { model.pendingCredential = null })
        }
    }

    val ruzCandidate = model.url?.takeIf { it.contains("ruz.narfu.ru") }?.let { RuzClient.groupID(it) }

    Column(Modifier.fillMaxSize().background(Ios.background)) {
        NavBar(model.title.ifEmpty { resource.title },
            leading = { TextButton({ close() }) { SfIcon("xmark", size = 20.dp, tint = barTint()) } },
            trailing = {
                IosMenu(items = {
                    item("Открыть в браузере", "safari") { Share.url(ctx, currentURL) }
                    item("Скопировать ссылку", "link") { Share.copy(currentURL); Haptics.success() }
                    item("Вставить пароль", "key.fill") { model.fillPasswordNow() }
                    hostOf(currentURL)?.let { host ->
                        item("Открывать как в браузере (если что-то не работает)", "safari") {
                            WebLauncher.setPlain(host, true)
                            Haptics.tap()
                            remember()
                            dismiss()
                            CustomTabs.open(ctx, currentURL)
                        }
                    }
                    item(if (forceLight) "Разрешить тёмную тему сайта" else "Всегда светлый сайт", if (forceLight) "moon" else "sun.max") {
                        forceLight = !forceLight
                        model.webView.reload()
                    }
                    item("Начать с главной", "house", destructive = true) {
                        ResourceStore.clearLastURL(resource)
                        model.goHome()
                    }
                }) { Box(Modifier.padding(8.dp)) { SfIcon("ellipsis.circle", size = 22.dp, tint = barTint()) } }
            })
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView({ model.webView }, Modifier.fillMaxSize())
            if (model.isLoading) {
                BoxWithConstraints(Modifier.fillMaxWidth().height(3.dp)) {
                    Box(Modifier.width(maxOf(24.dp, maxWidth * model.progress)).height(3.dp).clip(CircleShape).background(Brand.gradient))
                }
            }
            model.errorText?.let { err -> ErrorView(err, model, resource, currentURL) }
            Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 14.dp), horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AnimatedVisibility(model.loginUser != null, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                    val user = model.loginUser ?: ""
                    Pressable({ model.fillPasswordNow() }) {
                        Row(Modifier.iosShadow(Color.Black.copy(alpha = 0.25f), 8.dp, y = 3.dp, shape = CircleShape).clip(CircleShape)
                            .background(Brand.gradient).padding(horizontal = 18.dp, vertical = 12.dp)) {
                            IconLabel(if (user.isEmpty()) "Вставить пароль" else "Вставить пароль · $user", "key.fill",
                                style = ft(Ts.subheadline, FontWeight.SemiBold), color = Color.White, maxLines = 1)
                        }
                    }
                }
                AnimatedVisibility(model.toast != null, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                    Glass(20.dp) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 11.dp)) {
                            IconLabel(model.toast ?: "", "arrow.down.circle.fill", style = ft(Ts.subheadline, FontWeight.SemiBold))
                        }
                    }
                }
                if (ruzCandidate != null) {
                    val data = ScheduleStore.data
                    if (ruzConnected || (data.usesRuz && data.ruzGroupID == ruzCandidate)) {
                        Glass(22.dp) {
                            Row(Modifier.padding(horizontal = 18.dp, vertical = 12.dp)) {
                                IconLabel("Это твоё расписание", "checkmark.circle.fill", style = ft(Ts.subheadline, FontWeight.SemiBold))
                            }
                        }
                    } else {
                        Pressable({
                            val number = RuzClient.groupNumber(model.title) ?: data.ruzGroupNumber
                            ScheduleStore.connectRuz(number, data.ruzInstitution, ruzCandidate)
                            AppScope.launch { ScheduleStore.sync(force = true) }
                            Haptics.success()
                            ruzConnected = true
                        }) {
                            Row(Modifier.iosShadow(Color.Black.copy(alpha = 0.25f), 12.dp, y = 6.dp, shape = CircleShape).clip(CircleShape)
                                .background(Brand.gradient).padding(horizontal = 20.dp, vertical = 13.dp)) {
                                IconLabel("Сделать моим расписанием", "calendar.badge.checkmark", style = ft(Ts.subheadline, FontWeight.Bold), color = Color.White)
                            }
                        }
                    }
                }
            }
        }
        // панель снизу: назад, вперёд, домой, обновить, поделиться
        Column(Modifier.fillMaxWidth().background(if (LocalDark.current) Color(0xF0161618) else Color(0xF0F9F9F9))) {
            Box(Modifier.fillMaxWidth().height(0.5.dp).background(Ios.separator))
            Row(Modifier.fillMaxWidth().height(48.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                ToolbarButton("chevron.backward", model.canGoBack) { model.back() }
                Spacer(Modifier.weight(1f))
                ToolbarButton("chevron.forward", model.canGoForward) { model.forward() }
                Spacer(Modifier.weight(1f))
                ToolbarButton("house", true) { Haptics.tap(); model.goHome() }
                Spacer(Modifier.weight(1f))
                ToolbarButton(if (model.isLoading) "xmark" else "arrow.clockwise", true) {
                    if (model.isLoading) model.webView.stopLoading() else model.webView.reload()
                }
                Spacer(Modifier.weight(1f))
                ToolbarButton("square.and.arrow.up", true) { Share.text(ctx, currentURL) }
            }
            Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
        }
    }
}

@Composable
private fun ToolbarButton(icon: String, enabled: Boolean, onClick: () -> Unit) {
    TextButton(onClick, enabled = enabled) { SfIcon(icon, size = 22.dp, tint = if (enabled) barTint() else Ios.tertiaryLabel) }
}

@Composable
private fun ErrorView(text: String, model: WebModel, resource: Resource, currentURL: String) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize().background(Ios.background).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically)) {
        SfGradientIcon("wifi.exclamationmark", size = 44.dp)
        Text(text, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, textAlign = TextAlign.Center)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Pressable({ Haptics.tap(); model.retry() }) {
                Row(Modifier.clip(CircleShape).background(Brand.gradient).padding(horizontal = 16.dp, vertical = 11.dp)) {
                    IconLabel("Повторить", "arrow.clockwise", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Color.White)
                }
            }
            Pressable({ ResourceStore.clearLastURL(resource); model.goHome() }) {
                Glass(22.dp, interactive = true) {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 11.dp)) {
                        IconLabel("Главная", "house", style = ft(Ts.subheadline, FontWeight.SemiBold))
                    }
                }
            }
        }
        TextButton({ Share.url(ctx, currentURL) }) {
            Text("Открыть в браузере", style = ft(Ts.footnote, FontWeight.SemiBold), color = Brand.color, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
