package ru.student.safuhub.feature.mail

import android.util.Xml
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.FormBody
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.xmlpull.v1.XmlPullParser
import java.io.IOException
import java.util.concurrent.TimeUnit

// Клиент XIMSS: тот же протокол, которым пользуется сайт почты Samoware (как XIMSSClient на iPhone).
// Вход:     POST https://<сервер>/XIMSSLogin/  (username, password, version, errorAsXML=1) → <session urlID="…"/>
// Запросы:  POST https://<сервер>/Session/<urlID>/sync  с телом <XIMSS>…</XIMSS>
// Выход:    <bye/>

/** Маленькое XML-дерево для ответов XIMSS */
class XNode(val name: String, val attrs: Map<String, String>) {
    var text = ""
    val children = mutableListOf<XNode>()

    fun attr(key: String) = attrs.entries.firstOrNull { it.key.equals(key, true) }?.value
    fun child(n: String) = children.firstOrNull { it.name.equals(n, true) }
    fun walk(f: (XNode) -> Unit) { f(this); children.forEach { it.walk(f) } }
    fun all(n: String): List<XNode> { val out = mutableListOf<XNode>(); walk { if (it.name.equals(n, true)) out += it }; return out }
    val fullText: String get() = text + children.joinToString("") { it.fullText }
    val sessionID: String? get() = all("session").firstNotNullOfOrNull { it.attr("urlID") }
    val errorText: String? get() { var e: String? = null; walk { if (e == null) it.attr("errorText")?.takeIf { t -> t.isNotEmpty() }?.let { t -> e = t } }; return e }
    fun error(id: String) = all("response").firstOrNull { it.attr("id") == id }?.attr("errorText")

    companion object {
        fun parse(text: String): XNode? = try {
            val p = Xml.newPullParser()
            p.setInput(text.reader())
            var root: XNode? = null
            val stack = ArrayDeque<XNode>()
            var ev = p.eventType
            while (ev != XmlPullParser.END_DOCUMENT) {
                when (ev) {
                    XmlPullParser.START_TAG -> {
                        val attrs = (0 until p.attributeCount).associate { p.getAttributeName(it) to p.getAttributeValue(it) }
                        val n = XNode(p.name, attrs)
                        stack.lastOrNull()?.children?.add(n) ?: run { if (root == null) root = n }
                        stack.addLast(n)
                    }
                    XmlPullParser.END_TAG -> stack.removeLastOrNull()
                    XmlPullParser.TEXT, XmlPullParser.CDSECT -> stack.lastOrNull()?.let { it.text += p.text ?: "" }
                }
                ev = p.next()
            }
            root
        } catch (_: Throwable) { null }
    }
}

class XimssClient(private val host: String, timeoutSec: Long = 15) {
    data class Item(val uid: Long, val seen: Boolean, val from: String, val subject: String)

    // свои cookie на один сеанс, ничего не сохраняется
    private val jar = object : CookieJar {
        private val store = mutableListOf<Cookie>()
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) { synchronized(store) { store.removeAll { c -> cookies.any { it.name == c.name } }; store += cookies } }
        override fun loadForRequest(url: HttpUrl): List<Cookie> = synchronized(store) { store.filter { it.matches(url) } }
    }
    private val http = OkHttpClient.Builder().cookieJar(jar)
        .connectTimeout(timeoutSec, TimeUnit.SECONDS).readTimeout(timeoutSec, TimeUnit.SECONDS).callTimeout(timeoutSec * 2, TimeUnit.SECONDS).build()
    private var urlID: String? = null
    private var counter = 0

    private data class Answer(val root: XNode?, val code: Int, val head: String)

    private fun send(req: Request): Answer = try {
        http.newCall(req).execute().use { r ->
            val body = r.body?.string() ?: ""
            Answer(XNode.parse(body), r.code, body.take(200))
        }
    } catch (e: IOException) {
        throw MailWatch.Failure.network(e.message ?: "ошибка сети")
    }

    private fun looksLikeAuth(t: String): Boolean {
        val s = t.lowercase()
        return listOf("password", "пароль", "account", "учетн", "учётн", "authentic", "unknown user", "incorrect", "неверн", "credentials").any { s.contains(it) }
    }

    fun login(candidates: List<String>, password: String) {
        val base = "https://$host/XIMSSLogin/"
        var lastAuth: String? = null
        for (user in candidates) {
            val form = FormBody.Builder().add("username", user).add("password", password).add("version", "6.1").add("errorAsXML", "1").build()
            var answer = send(Request.Builder().url(base).post(form).build())
            val rejected = answer.root?.errorText?.let(::looksLikeAuth) ?: false
            if (answer.root?.sessionID == null && !rejected) {
                // так, как входит сам сайт почты: параметрами в адресе
                val u = HttpUrl.Builder().scheme("https").host(host).addPathSegment("XIMSSLogin").addPathSegment("")
                    .addQueryParameter("username", user).addQueryParameter("password", password)
                    .addQueryParameter("version", "6.1").addQueryParameter("errorAsXML", "1").build()
                answer = send(Request.Builder().url(u).get().build())
            }
            answer.root?.sessionID?.let { urlID = it; return }
            val e = answer.root?.errorText
            if (e != null) {
                if (looksLikeAuth(e)) { lastAuth = e; continue }
                throw MailWatch.Failure.server(e)
            }
            throw MailWatch.Failure("Сайт почты не пустил приложение (HTTP ${answer.code})")
        }
        throw MailWatch.Failure.login(lastAuth ?: "")
    }

    fun request(xml: String): XNode {
        val id = urlID ?: throw MailWatch.Failure("Нет сеанса почты")
        counter++
        val req = Request.Builder().url("https://$host/Session/$id/sync?random=$counter")
            .post("<XIMSS>$xml</XIMSS>".toRequestBody("text/xml; charset=utf-8".toMediaType())).build()
        val a = send(req)
        if (a.code != 200) throw MailWatch.Failure.server("HTTP ${a.code}")
        return a.root ?: throw MailWatch.Failure.server("непонятный ответ: ${a.head.take(80)}")
    }

    /** Последние письма «Входящих» (новые сверху), всего писем и непрочитанных — если сервер сообщил */
    fun inbox(limit: Int): Triple<List<Item>, Int?, Int?> {
        val fields = "<field>FLAGS</field><field>From</field><field>Subject</field>"
        var opened: XNode? = null
        var lastErr = ""
        for (sort in listOf(" sortField=\"INTERNALDATE\" sortOrder=\"desc\"", " sortField=\"Date\" sortOrder=\"desc\"", "")) {
            val r = request("<folderOpen id=\"open\" folder=\"INBOX\" mailbox=\"INBOX\"$sort>$fields</folderOpen>")
            val e = r.error("open")
            if (e != null) { lastErr = e; continue }
            opened = r
            break
        }
        if (opened == null) throw MailWatch.Failure("Не открылась папка «Входящие»: $lastErr")
        val head = opened.all("folderReport").firstOrNull()
        val total = head?.attr("messages")?.toIntOrNull()
        val unseen = head?.attr("unseen")?.toIntOrNull()
        val n = total ?: limit
        var items = emptyList<Item>()
        if (n > 0) {
            // смотрим оба края списка: если сервер не понял сортировку и отдал письма «старые сверху»,
            // свежие окажутся в конце
            val ranges = mutableListOf(0 to minOf(n, limit) - 1)
            if (n > limit) ranges += (n - limit) to (n - 1)
            val byUID = HashMap<Long, Item>()
            for ((i, r) in ranges.withIndex()) {
                val b = request("<folderBrowse id=\"browse$i\" folder=\"INBOX\"><index from=\"${r.first}\" till=\"${r.second}\"/></folderBrowse>")
                b.error("browse$i")?.let { throw MailWatch.Failure.server(it) }
                for (it in b.all("folderReport").mapNotNull(::item)) byUID[it.uid] = it
            }
            items = byUID.values.sortedByDescending { it.uid }.take(limit)
        }
        runCatching { request("<folderClose id=\"close\" folder=\"INBOX\"/>") }
        return Triple(items, total, unseen)
    }

    fun bye() {
        if (urlID == null) return
        runCatching { request("<bye id=\"bye\"/>") }
        urlID = null
    }

    private fun item(n: XNode): Item? {
        val uid = n.attr("UID")?.toLongOrNull() ?: return null
        val flags = (n.child("FLAGS")?.fullText ?: "").lowercase().split(',', ' ').map { it.trim('\\', ' ') }
        var from = ""
        (n.child("From") ?: n.child("E-From"))?.let { f -> from = f.attr("realName") ?: f.children.firstOrNull()?.attr("realName") ?: f.fullText }
        from = MailWatch.senderName(MailWatch.decodeMIME(from.trim()))
        val subject = MailWatch.decodeMIME((n.child("Subject")?.fullText ?: "").trim())
        return Item(uid, flags.contains("seen"), from, subject)
    }
}
