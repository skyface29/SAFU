package ru.student.safuhub.feature.mail

import android.util.Base64
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import ru.student.safuhub.App
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.feature.web.CredentialStore
import ru.student.safuhub.feature.web.SiteCredential
import ru.student.safuhub.system.Notify
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

// MARK: - Уведомления о новых письмах в почте САФУ
// У университетской почты (Samoware) нет своего приложения с уведомлениями.
// Приложение само заглядывает в ящик по IMAP — напрямую на сервер университета, без посредников, —
// и если пришло новое письмо, показывает уведомление: от кого и тема.
// Логин и пароль — те же, что сохранены для почты в приложении (зашифрованы ключом телефона).
// Письма не скачиваются и не помечаются прочитанными: смотрим только «от кого» и «тема».

object MailWatch {
    /** Сайт почты: для него сохранён логин и пароль */
    const val webHost = "edu.narfu.ru"

    var enabled: Boolean
        get() = Defaults.bool("mail.notify")
        set(v) = Defaults.set("mail.notify", v)
    var badge: Boolean
        get() = Defaults.boolOrNull("mail.badge") ?: true
        set(v) = Defaults.set("mail.badge", v)
    var server: String
        get() = (Defaults.string("mail.server") ?: "").ifEmpty { webHost }
        set(v) = Defaults.set("mail.server", v.trim())
    var port: Int
        get() = Defaults.int("mail.port").let { if (it > 0) it else 993 }
        set(v) = Defaults.set("mail.port", v)
    /** Последнее письмо, о котором уже сказали (номер письма на сервере) */
    private var lastUID: Long
        get() = Defaults.long("mail.lastUID")
        set(v) = Defaults.set("mail.lastUID", v)
    private var uidValidity: Long
        get() = Defaults.long("mail.uidValidity")
        set(v) = Defaults.set("mail.uidValidity", v)
    var unseen: Int
        get() = Defaults.int("mail.unseen")
        set(v) = Defaults.set("mail.unseen", v)
    val lastCheck: Instant?
        get() {
            val t = Defaults.double("mail.lastCheck")
            return if (t > 0) Instant.ofEpochMilli((t * 1000).toLong()) else null
        }
    var lastError: String?
        get() = Defaults.string("mail.lastError")
        set(v) = Defaults.set("mail.lastError", v)

    val credential: SiteCredential? get() = CredentialStore.get(webHost)

    data class Message(val uid: Long, val from: String, val subject: String)
    data class Report(val unseen: Int, val fresh: List<Message>)

    class Failure(message: String) : Exception(message) {
        companion object {
            val noPassword get() = Failure("Нет сохранённого пароля от почты. Открой почту в приложении, войди и сохрани пароль — или введи его здесь.")
            fun network(s: String) = Failure("Нет связи с сервером почты: $s")
            fun login(s: String) = Failure("Сервер не принял логин или пароль. $s")
            fun server(s: String) = Failure("Сервер ответил ошибкой: $s")
            val timeout get() = Failure("Сервер почты не ответил вовремя")
        }
    }

    /** Не чаще раза в 50 секунд — и приложение, и фон могут позвать одновременно */
    private val running = AtomicBoolean(false)

    /** Проверить, если уведомления включены. Ошибки запоминаются и видны в настройках */
    suspend fun checkIfEnabled() {
        if (!enabled) return
        lastCheck?.let { if (Instant.now().epochSecond - it.epochSecond < 50) return }
        try { check() } catch (_: Throwable) {}
    }

    /** Заглянуть в ящик. notify — показать уведомления о новых письмах */
    suspend fun check(notify: Boolean = true): Report {
        if (!running.compareAndSet(false, true)) return Report(unseen, emptyList())
        try {
            val r = try {
                withTimeout(30_000) { fetch() }
            } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                throw Failure.timeout
            }
            Defaults.set("mail.lastCheck", System.currentTimeMillis() / 1000.0)
            lastError = null
            unseen = r.unseen
            if (notify) post(r.fresh, r.unseen)
            return r
        } catch (e: Throwable) {
            Defaults.set("mail.lastCheck", System.currentTimeMillis() / 1000.0)
            lastError = e.message
            throw e
        } finally {
            running.set(false)
        }
    }

    /** Выключили уведомления */
    fun disable() {
        enabled = false
    }

    // MARK: Разговор с сервером

    private suspend fun fetch(): Report = withContext(Dispatchers.IO) {
        val cred = credential
        if (cred == null || cred.pass.isEmpty()) throw Failure.noPassword
        val imap = IMAPConnection(server, port)
        // время вышло — рвём соединение, иначе ожидание ответа сервера не прервать
        val watchdog = java.util.Timer()
        watchdog.schedule(object : java.util.TimerTask() { override fun run() = imap.close() }, 30_000)
        try {
            session(imap, cred)
        } finally {
            watchdog.cancel()
            imap.close()
        }
    }

    private fun session(imap: IMAPConnection, cred: SiteCredential): Report {
        imap.open()

        // логин как сохранён; не подошёл и в нём нет «@» — пробуем полный адрес
        val logins = mutableListOf(cred.user.trim())
        if (!logins[0].contains("@")) logins.add(logins[0] + "@" + webHost)
        var lastNo = ""
        var ok = false
        for (l in logins) {
            try {
                imap.command("LOGIN ${IMAPConnection.quote(l)} ${IMAPConnection.quote(cred.pass)}", secret = true)
                ok = true
                break
            } catch (e: IMAPConnection.No) {
                lastNo = e.text
            }
        }
        if (!ok) throw Failure.login(lastNo)

        // только чтение: письма не помечаются прочитанными
        val sel = imap.command("EXAMINE INBOX")
        val validity = firstMatch(sel, "UIDVALIDITY (\\d+)")?.toLongOrNull() ?: 0
        val uidNext = firstMatch(sel, "UIDNEXT (\\d+)")?.toLongOrNull() ?: 0

        val search = imap.command("UID SEARCH UNSEEN")
        val unseenUIDs = search.split("\r\n").filter { it.startsWith("* SEARCH") }
            .flatMap { it.drop(8).split(" ").mapNotNull { x -> x.toLongOrNull() } }.sorted()

        val maxKnown = maxOf(unseenUIDs.lastOrNull() ?: 0, uidNext - 1)
        var fresh = emptyList<Message>()
        if (lastUID > 0 && validity == uidValidity) {
            val newUIDs = unseenUIDs.filter { it > lastUID }.takeLast(5)
            if (newUIDs.isNotEmpty()) {
                val resp = imap.command("UID FETCH ${newUIDs.joinToString(",")} (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])")
                fresh = parseFetch(resp).sortedBy { it.uid }
                // заголовки не пришли — всё равно скажем, что письмо есть
                if (fresh.isEmpty()) fresh = newUIDs.map { Message(it, "Почта САФУ", "Новое письмо") }
            }
        }
        // первый раз (или ящик пересоздан) — просто запоминаем, где мы, без потока старых уведомлений
        uidValidity = validity
        lastUID = maxOf(lastUID, maxKnown)
        try { imap.command("LOGOUT") } catch (_: Throwable) {}
        return Report(unseenUIDs.size, fresh)
    }

    private fun firstMatch(s: String, pattern: String, opts: Set<RegexOption> = emptySet()): String? =
        Regex(pattern, opts).find(s)?.groupValues?.getOrNull(1)?.trim()

    /** Ответ на FETCH → письма (от кого и тема) */
    fun parseFetch(text: String): List<Message> {
        val out = mutableListOf<Message>()
        val parts = text.split("\r\n* ").let { if (text.startsWith("* ")) it else it.drop(1) }
        for (raw in parts) {
            val b = if (raw.startsWith("* ")) raw.drop(2) else raw
            if (!Regex("^\\d+ FETCH").containsMatchIn(b)) continue
            val uid = firstMatch(b, "UID (\\d+)")?.toLongOrNull() ?: continue
            val headers = unfold(b)
            val from = firstMatch(headers, "(?im)^From:\\s*(.*)$")?.let { senderName(decodeMIME(it)) } ?: ""
            val subject = firstMatch(headers, "(?im)^Subject:\\s*(.*)$")?.let { decodeMIME(it) } ?: ""
            out.add(Message(uid, from.ifEmpty { "Почта САФУ" }, subject.ifEmpty { "(без темы)" }))
        }
        return out
    }

    /** Длинные заголовки переносятся на следующую строку с пробелом в начале — склеиваем */
    private fun unfold(s: String) = s.replace(Regex("\\r?\\n[ \\t]+"), " ")

    /** «"Иванов И. И." <ivanov@narfu.ru>» → «Иванов И. И.» */
    fun senderName(from: String): String {
        val f = from.trim()
        val lt = f.indexOf('<')
        if (lt >= 0) {
            val name = f.substring(0, lt).trim { it == ' ' || it == '"' }
            if (name.isNotEmpty()) return name
            return f.substring(lt + 1).trim { it == '>' || it == ' ' }
        }
        return f.trim('"')
    }

    /** Русские темы приходят закодированными: =?UTF-8?B?0J/RgNC40LLQtdGC?= */
    fun decodeMIME(s: String): String {
        val rx = Regex("=\\?([^?]+)\\?([bBqQ])\\?([^?]*)\\?=")
        // пробелы между двумя закодированными кусками не считаются
        val joined = s.replace(Regex("(\\?=)\\s+(=\\?)"), "$1$2")
        val result = StringBuilder()
        var pos = 0
        for (m in rx.findAll(joined)) {
            result.append(joined, pos, m.range.first)
            val charset = m.groupValues[1]
            val kind = m.groupValues[2].uppercase()
            val body = m.groupValues[3]
            val bytes: ByteArray? = if (kind == "B") {
                var b64 = body
                while (b64.length % 4 != 0) b64 += "="
                try { Base64.decode(b64, Base64.DEFAULT) } catch (_: Throwable) { null }
            } else {
                val data = ByteArrayOutputStream()
                val chars = body.replace("_", " ").toByteArray(Charsets.US_ASCII)
                var i = 0
                while (i < chars.size) {
                    val c = chars[i]
                    // «=» и две шестнадцатеричные цифры — один байт
                    if (c == '='.code.toByte() && i + 3 <= chars.size) {
                        val v = String(chars, i + 1, 2, Charsets.US_ASCII).toIntOrNull(16)
                        if (v != null) { data.write(v); i += 3; continue }
                    }
                    data.write(c.toInt())
                    i++
                }
                data.toByteArray()
            }
            val cs = try { Charset.forName(charset) } catch (_: Throwable) { Charsets.UTF_8 }
            result.append(bytes?.let { String(it, cs) } ?: m.value)
            pos = m.range.last + 1
        }
        result.append(joined.substring(pos))
        return result.toString().trim()
    }

    // MARK: Уведомления

    private fun post(list: List<Message>, unseen: Int) {
        val ctx = App.ctx
        val number = if (badge) unseen else 0
        val extras = mapOf(MailRouter.key to "1")
        for (m in list.takeLast(3)) {
            Notify.show(ctx, "mail.${m.uid}", m.from, m.subject, Notify.CH_MAIL, extras, number = number)
        }
        if (list.size > 3) {
            Notify.show(ctx, "mail.more.${list.lastOrNull()?.uid ?: 0}", "Почта САФУ", "И ещё ${list.size - 3} новых писем", Notify.CH_MAIL, extras,
                number = number)
        }
    }
}

/** Нажали на уведомление о письме — открываем почту */
object MailRouter {
    const val key = "safu.mail"
    /** Ждёт, пока главная откроет почту (главная могла ещё не загрузиться) */
    var pending by mutableStateOf(false)
}

// MARK: - Минимальный IMAP-клиент (TLS, порт 993)

class IMAPConnection(private val host: String, private val port: Int) {
    class No(val text: String) : Exception(text)

    private var socket: SSLSocket? = null
    private var input: InputStream? = null
    private var output: OutputStream? = null
    private val buffer = ByteArrayOutputStream()
    private var counter = 0

    companion object {
        fun quote(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    }

    fun open() {
        try {
            val s = SSLSocketFactory.getDefault().createSocket() as SSLSocket
            s.connect(java.net.InetSocketAddress(host, port), 15_000)
            s.soTimeout = 20_000
            s.startHandshake()
            socket = s
            input = s.inputStream
            output = s.outputStream
        } catch (e: Throwable) {
            throw MailWatch.Failure.network(e.message ?: e.javaClass.simpleName)
        }
        // приветствие сервера: «* OK …»
        val hello = readLine()
        if (!hello.startsWith("* OK") && !hello.startsWith("* PREAUTH")) throw MailWatch.Failure.server(hello)
    }

    fun close() {
        try { socket?.close() } catch (_: Throwable) {}
    }

    /** Отправить команду и дождаться ответа с её меткой. NO/BAD → ошибка */
    fun command(cmd: String, secret: Boolean = false): String {
        counter += 1
        val tag = "s$counter"
        send("$tag $cmd\r\n")
        val text = readTagged(tag)
        val last = text.split("\r\n").lastOrNull { it.startsWith("$tag ") } ?: ""
        val status = last.drop(tag.length + 1)
        if (status.startsWith("OK")) return text
        val msg = status.dropWhile { it != ' ' }.trim()
        if (status.startsWith("NO")) throw No(msg)
        throw MailWatch.Failure.server(if (secret) "команда не принята" else msg)
    }

    private fun send(s: String) {
        try {
            output?.write(s.toByteArray(Charsets.UTF_8))
            output?.flush()
        } catch (e: Throwable) {
            throw MailWatch.Failure.network(e.message ?: "ошибка отправки")
        }
    }

    private fun receive() {
        val buf = ByteArray(64 * 1024)
        val n = try { input?.read(buf) ?: -1 } catch (e: Throwable) { throw MailWatch.Failure.network(e.message ?: "ошибка чтения") }
        if (n <= 0) throw MailWatch.Failure.network(if (n < 0) "сервер закрыл соединение" else "пустой ответ")
        buffer.write(buf, 0, n)
    }

    private fun indexOf(data: ByteArray, pat: ByteArray, from: Int = 0): Int {
        outer@ for (i in from..data.size - pat.size) {
            for (j in pat.indices) if (data[i + j] != pat[j]) continue@outer
            return i
        }
        return -1
    }

    private fun take(upTo: Int): String {
        val all = buffer.toByteArray()
        val chunk = String(all, 0, upTo, Charsets.UTF_8)
        buffer.reset()
        buffer.write(all, upTo, all.size - upTo)
        return chunk
    }

    private fun readLine(): String {
        val crlf = "\r\n".toByteArray()
        while (true) {
            val all = buffer.toByteArray()
            val r = indexOf(all, crlf)
            if (r >= 0) return take(r + 2).removeSuffix("\r\n")
            receive()
        }
    }

    /** Читаем, пока не придёт строка «<метка> OK/NO/BAD …» */
    private fun readTagged(tag: String): String {
        val crlf = "\r\n".toByteArray()
        val prefix = "$tag ".toByteArray()
        while (true) {
            val all = buffer.toByteArray()
            var start = -1
            if (all.size >= prefix.size && indexOf(all, prefix) == 0) start = 0
            else {
                val r = indexOf(all, crlf + prefix)
                if (r >= 0) start = r + 2
            }
            if (start >= 0) {
                val end = indexOf(all, crlf, start)
                if (end >= 0) return take(end + 2)
            }
            receive()
        }
    }
}

// MARK: - Настройки

@Composable
fun MailNotifyScreen() {
    val scope = rememberCoroutineScope()
    var on by remember { mutableStateOf(MailWatch.enabled) }
    var badge by remember { mutableStateOf(MailWatch.badge) }
    var login by remember { mutableStateOf(MailWatch.credential?.user ?: "") }
    var password by remember { mutableStateOf("") }
    var server by remember { mutableStateOf(MailWatch.server) }
    var port by remember { mutableStateOf(MailWatch.port.toString()) }
    var checking by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }
    var good by remember { mutableStateOf(false) }

    fun saveCredential() {
        val user = login.trim()
        val pass = password.ifEmpty { MailWatch.credential?.pass ?: "" }
        if (user.isEmpty() || pass.isEmpty()) return
        CredentialStore.save(SiteCredential(MailWatch.webHost, user, pass))
        password = ""
    }

    fun test() {
        MailWatch.server = server
        MailWatch.port = port.toIntOrNull() ?: 993
        checking = true
        status = null
        scope.launch {
            try {
                val r = MailWatch.check(notify = false)
                good = true
                status = "Работает. Непрочитанных писем: ${r.unseen}. О новых письмах придёт уведомление."
            } catch (e: Throwable) {
                good = false
                status = e.message
            }
            checking = false
        }
    }

    FormScreen("Уведомления почты") {
        FormSection(footer = "Пока приложение открыто, почта проверяется каждую минуту. В фоне Android сам решает, когда разбудить приложение: обычно раз в 15–60 минут, реже — если батарея садится. Мгновенных уведомлений без своего сервера не бывает, а сервер мы не держим: пароль никуда, кроме почты САФУ, не уходит.") {
            toggle("Уведомлять о новых письмах", on, { v ->
                on = v
                if (v) {
                    Permissions.requestNotifications()
                    MailWatch.enabled = true
                    test()
                } else MailWatch.disable()
            }, icon = "envelope.badge.fill")
            toggle("Цифра непрочитанных на иконке", badge, { v -> badge = v; MailWatch.badge = v }, icon = "app.badge")
        }

        FormSection("Вход в почту", footer = "Это тот же логин и пароль, что для почты на edu.narfu.ru. Хранятся зашифрованными, только на этом телефоне.") {
            row {
                IosTextField(login, { login = it }, "Логин (как на сайте почты)", Modifier.fillMaxWidth(), keyboard = KeyboardType.Email, capitalize = false)
            }
            row {
                IosTextField(password, { password = it }, if (MailWatch.credential == null) "Пароль" else "Пароль сохранён — можно не вводить",
                    Modifier.fillMaxWidth(), keyboard = KeyboardType.Password, secure = true)
            }
            button("Сохранить и проверить", "checkmark.circle.fill", enabled = !checking && login.isNotBlank(),
                trailing = if (checking) ({ Spinner(18.dp) }) else null) {
                saveCredential()
                test()
            }
            status?.let { s ->
                row {
                    IconLabel(s, if (good) "checkmark.seal.fill" else "exclamationmark.triangle.fill", style = ft(Ts.subheadline),
                        color = if (good) Ios.green else Ios.orange)
                }
            }
        }

        FormSection("Сервер IMAP", footer = "Менять не нужно. Если проверка не проходит — узнай в поддержке САФУ адрес IMAP-сервера студенческой почты и впиши сюда.") {
            row { IosTextField(server, { server = it }, "Сервер", Modifier.fillMaxWidth(), keyboard = KeyboardType.Uri, capitalize = false) }
            row { IosTextField(port, { port = it }, "Порт", Modifier.fillMaxWidth(), keyboard = KeyboardType.Number) }
            button("Вернуть как было") {
                server = MailWatch.webHost
                port = "993"
            }
        }

        MailWatch.lastCheck?.let { last ->
            FormSection {
                info("Проверено", Fmt.format(last, "d MMM, HH:mm"))
                info("Непрочитанных", "${MailWatch.unseen}")
                MailWatch.lastError?.let { e -> row { Text(e, style = ft(Ts.caption), color = Ios.secondaryLabel) } }
            }
        }
    }
}
