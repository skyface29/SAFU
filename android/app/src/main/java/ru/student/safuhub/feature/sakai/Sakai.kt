package ru.student.safuhub.feature.sakai

import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.StudyTask
import ru.student.safuhub.data.TaskStore
import ru.student.safuhub.feature.web.SessionKeeper
import java.time.Instant
import java.util.concurrent.TimeUnit

// MARK: - Дедлайны из Sakai → «Задачи»
// Используем вход, который уже есть во встроенном браузере (cookie Sakai), и стандартный API Sakai:
// /direct/assignment/my.json — все задания пользователя.

data class SakaiAssignment(val id: String, val title: String, val site: String, val due: Instant, val url: String)

object SakaiSync {
    const val base = "https://sakai.narfu.ru"
    private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build()

    class SyncError(message: String) : Exception(message)
    private val notLoggedIn get() = SyncError("Сначала войди в Sakai: главная → Sakai. Потом повтори.")
    private val bad get() = SyncError("Sakai ответил непонятно. Попробуй позже.")

    private fun cookies(): String? = try { CookieManager.getInstance().getCookie(base) } catch (_: Throwable) { null }

    private fun getJSON(path: String, cookie: String): JSONObject {
        val req = Request.Builder().url(base + path).header("Cookie", cookie).header("Accept", "application/json").build()
        http.newCall(req).execute().use { resp ->
            if (resp.code == 401 || resp.code == 403) throw notLoggedIn
            val body = resp.body?.string() ?: throw notLoggedIn
            return try { JSONObject(body) } catch (_: Throwable) { throw notLoggedIn }
        }
    }

    private fun date(v: Any?): Instant? {
        if (v is JSONObject) {
            if (v.has("epochSecond")) return Instant.ofEpochSecond(v.optDouble("epochSecond").toLong())
            if (v.has("time")) return Instant.ofEpochMilli(v.optDouble("time").toLong())
        }
        if (v is Number) {
            val d = v.toDouble()
            return if (d > 1e11) Instant.ofEpochMilli(d.toLong()) else Instant.ofEpochSecond(d.toLong())
        }
        return null
    }

    suspend fun fetch(): List<SakaiAssignment> = withContext(Dispatchers.IO) {
        SessionKeeper.restore()
        val cookie = cookies()
        if (cookie.isNullOrEmpty()) throw notLoggedIn
        val obj = getJSON("/direct/assignment/my.json", cookie)
        val list = obj.optJSONArray("assignment_collection") ?: throw bad
        val siteTitles = HashMap<String, String>()
        val result = mutableListOf<SakaiAssignment>()
        for (i in 0 until list.length()) {
            val a = list.optJSONObject(i) ?: continue
            val id = a.optString("id").ifEmpty { a.optString("entityId") }.ifEmpty { null } ?: continue
            val title = a.optString("title").ifEmpty { null } ?: continue
            val due = date(a.opt("dueTime")) ?: date(a.opt("dueDate")) ?: continue
            if (a.optBoolean("draft", false)) continue
            val context = a.optString("context")
            var site = a.optString("siteTitle").ifEmpty { siteTitles[context] ?: "" }
            if (site.isEmpty() && context.isNotEmpty()) {
                try {
                    val t = getJSON("/direct/site/$context.json", cookie).optString("title")
                    if (t.isNotEmpty()) { site = t; siteTitles[context] = t }
                } catch (_: Throwable) {}
            }
            val link = a.optString("entityURL").ifEmpty { base }
            result.add(SakaiAssignment(id, title, site, due, link))
        }
        result
    }

    /** Забираем задания и кладём в «Задачи» (без дублей; срок обновляется, если его перенесли) */
    suspend fun importInto(): String {
        return try {
            val list = fetch()
            val map = (Defaults.dictionary("sakai.map") ?: emptyMap()).mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap().toMutableMap()
            var added = 0
            var updated = 0
            for (a in list.filter { it.due > Instant.now().minusSeconds(86_400) }) {
                val tid = map[a.id]
                val existing = tid?.let { id -> TaskStore.tasks.firstOrNull { it.id.equals(id, true) } }
                if (existing != null) {
                    if (existing.due != a.due || existing.title != a.title) {
                        TaskStore.upsert(existing.copy(due = a.due, title = a.title))
                        updated += 1
                    }
                } else {
                    val t = StudyTask(title = a.title, subject = a.site, due = a.due, note = "Из Sakai\n${a.url}")
                    TaskStore.upsert(t)
                    map[a.id] = t.id
                    added += 1
                }
            }
            Defaults.set("sakai.map", map)
            Defaults.set("sakai.last", (System.currentTimeMillis() / 1000.0) - ru.student.safuhub.core.APPLE_EPOCH_OFFSET)
            if (added == 0 && updated == 0) "Новых заданий в Sakai нет" else "Из Sakai: новых $added, обновлено $updated"
        } catch (e: SyncError) {
            e.message ?: "Ошибка"
        } catch (e: Throwable) {
            "Нет связи с Sakai"
        }
    }

    /** Тихая автозагрузка не чаще раза в 6 часов (если вход в Sakai уже был) */
    suspend fun autoImport() {
        val last = Defaults.double("sakai.last")
        val now = System.currentTimeMillis() / 1000.0 - ru.student.safuhub.core.APPLE_EPOCH_OFFSET
        if (now - last <= 6 * 3600) return
        importInto()
    }
}
