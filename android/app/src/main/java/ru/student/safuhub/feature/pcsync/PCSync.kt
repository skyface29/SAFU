package ru.student.safuhub.feature.pcsync

import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.json.JSONObject
import ru.student.safuhub.core.APPLE_EPOCH_OFFSET
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.Homework
import ru.student.safuhub.data.HomeworkStore
import ru.student.safuhub.data.StudyTask
import ru.student.safuhub.data.TaskStore
import ru.student.safuhub.feature.notes.Note
import ru.student.safuhub.feature.notes.NotesStore
import ru.student.safuhub.feature.web.SecureStore
import ru.student.safuhub.ui.design.Haptics
import java.time.Instant

// Синхронизация с Арктикой для Windows по домашнему Wi‑Fi (как PCSync.swift на iPhone).
// Один раз связываем телефон с компьютером: телефон находит компьютер в сети, оба показывают код, на компьютере
// нажимают «Разрешить» — или ссылкой arktika://sync из QR-кода на компьютере. Дальше, пока приложение открыто,
// телефон сам заходит на компьютер каждые несколько секунд и сразу после правок: присылает свои ДЗ, задачи и
// заметки и забирает общую версию. Компьютер сводит их по полям (побеждает поздняя правка, windows/src/lib/syncmerge.ts),
// здесь — такие же отметки «что и когда менялось». Всё зашифровано AES-256-GCM ключом связки.

/** Ссылка из QR-кода связки: arktika://sync?h=…&p=…&i=…&k=…&n=… */
data class SyncLink(val hosts: List<String>, val port: Int, val id: String, val key: ByteArray, val name: String) {
    companion object {
        fun parse(text: String): SyncLink? = runCatching {
            val u = Uri.parse(text.trim())
            if (u.scheme?.lowercase() != "arktika" || u.host?.lowercase() != "sync") return null
            val h = u.getQueryParameter("h") ?: return null
            val p = u.getQueryParameter("p")?.toIntOrNull()?.takeIf { it in 1..65535 } ?: return null
            val i = u.getQueryParameter("i")?.takeIf { it.isNotEmpty() && it.length < 64 } ?: return null
            val key = b64url(u.getQueryParameter("k") ?: return null)?.takeIf { it.size == 32 } ?: return null
            val list = h.split(',').map { it.trim() }.filter(LanDiscovery::isLocal)
            if (list.isEmpty()) return null
            val n = (u.getQueryParameter("n") ?: "").replace('+', ' ').trim()
            SyncLink(list.take(5), p, i, key, n.ifEmpty { "Компьютер" }.take(40))
        }.getOrNull()

        /** Связка, которую компьютер прислал после «Разрешить» (без QR-кода) */
        fun fromGrant(j: JSONObject, found: SyncFound): SyncLink? {
            val i = j.optString("id").takeIf { it.isNotEmpty() && it.length < 64 } ?: return null
            val key = b64url(j.optString("key"))?.takeIf { it.size == 32 } ?: return null
            val hosts = LinkedHashSet<String>()
            hosts += found.host
            j.optJSONArray("hosts")?.let { a -> for (x in 0 until a.length()) a.optString(x).takeIf(LanDiscovery::isLocal)?.let { hosts += it } }
            val p = j.optInt("port", found.port).takeIf { it in 1..65535 } ?: found.port
            return SyncLink(hosts.take(5), p, i, key, j.optString("name").trim().ifEmpty { found.pc }.take(40))
        }

        fun b64url(s: String): ByteArray? = runCatching { Base64.decode(s, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }.getOrNull()
    }
}

@Serializable
data class SyncPairing(val hosts: List<String>, val port: Int, val id: String, val key: String, val name: String, val paired: Double)

@Serializable
data class SyncStamp(val h: String, val m: Double)

@Serializable
data class SyncCollState(val stamps: Map<String, Map<String, SyncStamp>> = emptyMap(), val tomb: Map<String, Double> = emptyMap(), val initialized: Boolean = false)

/** Записи ↔ JSON компьютера: даты — миллисекунды с 1970 (здесь в хранилищах — секунды от 2001, как на iPhone) */
object SyncCodec {
    private val dateKeys = mapOf(
        "homework" to setOf("givenAt", "due", "anchor", "doneAt", "created", "custom"),
        "tasks" to setOf("due"),
        "notes" to setOf("created", "updated"),
    )

    private fun convert(e: JsonElement, keys: Set<String>, toMs: Boolean): JsonElement = when (e) {
        is JsonObject -> JsonObject(e.mapValues { (k, v) ->
            if (k in keys && v is JsonPrimitive && v !is JsonNull) {
                val d = v.doubleOrNull
                if (d == null) v else if (toMs) JsonPrimitive(Math.round((d + APPLE_EPOCH_OFFSET) * 1000.0)) else JsonPrimitive(d / 1000.0 - APPLE_EPOCH_OFFSET)
            } else convert(v, keys, toMs)
        })
        is JsonArray -> JsonArray(e.map { convert(it, keys, toMs) })
        else -> e
    }

    fun toWire(coll: String, items: JsonElement): List<JsonObject> =
        (convert(items, dateKeys[coll] ?: emptySet(), true) as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()

    fun fromWire(coll: String, items: List<JsonObject>): JsonArray =
        convert(JsonArray(items), dateKeys[coll] ?: emptySet(), false) as JsonArray

    /** JSON с ключами по алфавиту — одинаковые значения дают одинаковую строку */
    fun canon(e: JsonElement?): String = when (e) {
        null, is JsonNull -> "null"
        is JsonObject -> e.keys.sorted().joinToString(",", "{", "}") { k -> JsonPrimitive(k).toString() + ":" + canon(e[k]) }
        is JsonArray -> e.joinToString(",", "[", "]") { canon(it) }
        is JsonPrimitive -> if (e.isString) e.toString() else e.doubleOrNull?.let { d -> if (d == Math.floor(d) && kotlin.math.abs(d) < 1e15) d.toLong().toString() else d.toString() } ?: e.content
    }

    fun fingerprint(e: JsonElement?): String = PCCrypto.hex(PCCrypto.sha256(canon(e).toByteArray(Charsets.UTF_8))).take(20)
}

/** Отметки «что и когда менялось» — так же, как на компьютере и iPhone */
object SyncStamps {
    /** Фото ДЗ — файлы на своём устройстве, их не синхронизируем */
    private val localOnly = mapOf("homework" to setOf("photos"))

    fun synced(coll: String, f: String) = f != "id" && localOnly[coll]?.contains(f) != true

    fun idOf(o: JsonObject) = ((o["id"] as? JsonPrimitive)?.content ?: "").lowercase()

    private fun num(e: JsonElement?) = (e as? JsonPrimitive)?.doubleOrNull ?: 0.0

    private fun hint(coll: String, o: JsonObject, f: String): Double = when {
        coll == "homework" && (f == "done" || f == "doneAt" || f == "steps") -> num(o["doneAt"])
        coll == "notes" -> num(o["updated"])
        else -> 0.0
    }

    /** Свои правки с прошлого раза: поле поменялось — «сейчас», запись пропала — удалена сейчас */
    fun refresh(coll: String, items: List<JsonObject>, st: SyncCollState, now: Double): SyncCollState {
        val first = !st.initialized
        val stamps = HashMap<String, Map<String, SyncStamp>>()
        val tomb = HashMap(st.tomb)
        for (it in items) {
            val id = idOf(it)
            if (id.isEmpty()) continue
            val old = st.stamps[id]
            val s = HashMap<String, SyncStamp>()
            for ((f, v) in it) {
                if (!synced(coll, f)) continue
                val h = SyncCodec.fingerprint(v)
                val prev = old?.get(f)
                s[f] = if (prev != null) (if (prev.h == h) prev else SyncStamp(h, now))
                // новое поле у старой записи (обновление приложения) — не правка; новая запись — правка сейчас
                else SyncStamp(h, if (first) hint(coll, it, f) else if (old != null) 0.0 else now)
            }
            stamps[id] = s
            tomb.remove(id)
        }
        for (id in st.stamps.keys) if (id !in stamps) tomb[id] = now
        return SyncCollState(stamps, tomb.filter { now - it.value < 120.0 * 86_400_000 }, true)
    }

    /** Отметки для того, что получилось после сведения: отпечатки — свои, «когда менялось» — общее */
    fun restamp(coll: String, items: List<JsonObject>, m: Map<String, Map<String, Double>>, tomb: Map<String, Double>): SyncCollState {
        val stamps = HashMap<String, Map<String, SyncStamp>>()
        for (it in items) {
            val id = idOf(it)
            if (id.isEmpty()) continue
            stamps[id] = it.filterKeys { f -> synced(coll, f) }.mapValues { (f, v) -> SyncStamp(SyncCodec.fingerprint(v), m[id]?.get(f) ?: 0.0) }
        }
        return SyncCollState(stamps, tomb, true)
    }

    fun wireM(st: SyncCollState): JsonObject = JsonObject(st.stamps.mapValues { (_, s) -> JsonObject(s.mapValues { JsonPrimitive(it.value.m) }) })

    fun readM(e: JsonElement?): Map<String, Map<String, Double>> = (e as? JsonObject)?.mapValues { (_, v) ->
        (v as? JsonObject)?.mapNotNull { (f, x) -> (x as? JsonPrimitive)?.doubleOrNull?.let { f to it } }?.toMap() ?: emptyMap()
    } ?: emptyMap()

    fun readTomb(e: JsonElement?): Map<String, Double> =
        (e as? JsonObject)?.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.doubleOrNull?.let { k to it } }?.toMap() ?: emptyMap()
}

object PCSync {
    private const val pairKey = "pcsync.pair.v1"
    private const val stateKey = "pcsync.state.v1"
    private const val lastKey = "pcsync.last"
    private const val route = "/v2/sync"
    private const val offerLastKey = "pcsync.offer.last"
    private const val offerNeverKey = "pcsync.offer.never"

    var pairing by mutableStateOf<SyncPairing?>(null)
        private set
    var lastSync by mutableStateOf<Instant?>(null)
        private set
    var syncing by mutableStateOf(false)
        private set
    /** Что мешает: компьютер не в сети, связку сбросили… */
    var problem by mutableStateOf<String?>(null)
        private set
    var nearby by mutableStateOf<List<SyncFound>>(emptyList())
        private set
    var searching by mutableStateOf(false)
        private set
    var searched by mutableStateOf(false)
        private set

    sealed class PairStep {
        data class Connecting(val pc: String) : PairStep()
        data class Code(val code: String, val pc: String) : PairStep()
        data class Failed(val message: String) : PairStep()
    }
    /** Подробность последней ошибки — для экрана «Для разработчика» и проверок */
    var lastError: String? = null
        private set
    var pairStep by mutableStateOf<PairStep?>(null)
        private set
    /** Телефон не связан, а рядом нашёлся компьютер — предложить */
    var offer by mutableStateOf<SyncFound?>(null)

    private var loaded = false
    private var loop: Job? = null
    private var pairJob: Job? = null
    private var inFlight = false
    private var again = false
    private var rescanAfter = 0L
    private var lastSent = ""

    val isPaired get() = pairing != null

    val deviceName: String get() = Build.MODEL?.let { m -> if (Build.MANUFACTURER != null && !m.startsWith(Build.MANUFACTURER, true)) "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} $m" else m } ?: "Android"

    fun load() {
        if (loaded) return
        loaded = true
        pairing = SecureStore.get(pairKey)?.let { runCatching { AppJson.decodeFromString(SyncPairing.serializer(), String(it, Charsets.UTF_8)) }.getOrNull() }
        val t = Defaults.double(lastKey)
        lastSync = if (t > 0) Instant.ofEpochMilli(t.toLong()) else null
    }

    private fun savePairing(p: SyncPairing?) {
        // сначала прочитать сохранённое: иначе позднее чтение затрёт только что сделанную связку
        load()
        if (p == null) SecureStore.delete(pairKey)
        else SecureStore.set(pairKey, AppJson.encodeToString(SyncPairing.serializer(), p).toByteArray(Charsets.UTF_8))
        pairing = p
    }

    // MARK: приложение открыто / ушли из приложения

    /** Пока приложение открыто — заглядываем на компьютер каждые несколько секунд и сразу после правок */
    fun onForeground() {
        load()
        loop?.cancel()
        loop = AppScope.launch {
            delay(1500)
            var lastFull = 0L
            while (isActive) {
                if (isPaired) {
                    val now = System.currentTimeMillis()
                    val period = if (problem == null) 10_000L else 45_000L
                    // правка — сразу (раз в 3 секунды смотрим, изменилось ли своё), иначе — по расписанию
                    if (now - lastFull > period || localFingerprint() != lastSent) {
                        lastFull = now
                        syncNow()
                    }
                } else lookAround()
                delay(3000)
            }
        }
    }

    /** Ушли из приложения — последний обмен, чтобы правка не ждала следующего открытия */
    fun onBackground() {
        loop?.cancel()
        loop = null
        if (isPaired) AppScope.launch { syncNow(background = true) }
    }

    // MARK: связка

    fun pair(link: SyncLink) {
        savePairing(SyncPairing(link.hosts, link.port, link.id, Base64.encodeToString(link.key, Base64.NO_WRAP), link.name, System.currentTimeMillis().toDouble()))
        // новая связка — отметки с чистого листа: первая встреча сводится по самим данным
        Defaults.remove(stateKey)
        Defaults.remove(lastKey)
        lastSync = null
        problem = null
        offer = null
        rescanAfter = 0
        lastSent = ""
        Haptics.success()
        AppScope.launch { syncNow() }
    }

    fun unpair() {
        savePairing(null)
        Defaults.remove(stateKey)
        Defaults.remove(lastKey)
        lastSync = null
        problem = null
    }

    fun neverOffer() { Defaults.set(offerNeverKey, true); offer = null }

    /** Телефон не связан — раз в полдня тихо смотрим, нет ли в этом Wi‑Fi компьютера с Арктикой */
    private suspend fun lookAround() {
        val now = System.currentTimeMillis()
        if (isPaired || pairStep != null || offer != null || searching || !Defaults.bool("onboarded") || Defaults.bool(offerNeverKey)) return
        if (now - Defaults.double(offerLastKey) < 6 * 3600_000) return
        Defaults.set(offerLastKey, now.toDouble())
        if (!LanDiscovery.hasLan) return
        val list = LanDiscovery.scan(stop = { true })
        if (!isPaired && pairStep == null && list.isNotEmpty()) { nearby = list; offer = list.first() }
    }

    suspend fun searchNearby() {
        if (searching) return
        searching = true
        try {
            var list = LanDiscovery.scan(first = pairing?.hosts ?: emptyList())
            if (list.isEmpty()) list = LanDiscovery.scan(wide = true)
            val mine = pairing?.let { LanDiscovery.tag(it.id) }
            nearby = list.sortedWith(compareBy<SyncFound> { !(it.pair != null && it.pair == mine) }.thenBy { it.pc.lowercase() })
        } finally {
            searching = false
            searched = true
        }
    }

    class PairFailure(message: String) : Exception(message)

    private fun pairPost(f: SyncFound, step: String, body: JSONObject, timeout: Int): JSONObject {
        val r = try { LanHttp.postJson(f.host, f.port, "/v2/pair/$step", body, timeout) }
        catch (_: Throwable) { throw PairFailure("Компьютер перестал отвечать. Проверь, что он в той же сети Wi‑Fi и Арктика на нём запущена.") }
        when (r.status) {
            409 -> throw PairFailure("На компьютере уже открыт другой запрос — ответь на него и попробуй снова.")
            410 -> throw PairFailure("Компьютер долго не отвечал — запрос устарел. Попробуй ещё раз.")
        }
        return (if (r.status == 200) r.json else null) ?: throw PairFailure("Компьютер ответил что-то не то. Обнови Арктику на компьютере и попробуй снова.")
    }

    /** Код для сверки глазами: одинаковый на обоих экранах, только если ключи никто не подменил */
    fun sasCode(phonePub: ByteArray, pcPub: ByteArray): String {
        val d = PCCrypto.sha256("arktika-sas|".toByteArray(), phonePub, pcPub)
        val n = ((d[0].toLong() and 255) shl 24) or ((d[1].toLong() and 255) shl 16) or ((d[2].toLong() and 255) shl 8) or (d[3].toLong() and 255)
        return "%04d".format(n % 10000)
    }

    /** Связаться с найденным компьютером: код на обоих экранах, «Разрешить» на компьютере */
    fun pairWith(f: SyncFound) {
        pairJob?.cancel()
        pairStep = PairStep.Connecting(f.pc)
        pairJob = AppScope.launch {
            try {
                val link = withContext(Dispatchers.IO) {
                    val start = pairPost(f, "start", JSONObject().put("device", deviceName), 8000)
                    val sid = start.optString("sid").ifEmpty { throw PairFailure("Компьютер ответил что-то не то.") }
                    val commit = start.optString("commit")
                    val me = X25519.generate()
                    val answer = pairPost(f, "key", JSONObject().put("sid", sid).put("pub", Base64.encodeToString(me.publicKey, Base64.NO_WRAP)), 8000)
                    val pcPub = runCatching { Base64.decode(answer.optString("pub"), Base64.DEFAULT) }.getOrNull()
                    if (pcPub == null || pcPub.size != 32 || Base64.encodeToString(PCCrypto.sha256(pcPub), Base64.NO_WRAP) != commit) {
                        throw PairFailure("Компьютер ответил что-то не то. Обнови Арктику на компьютере и попробуй снова.")
                    }
                    val shared = X25519.shared(me.privateKey, pcPub)
                    val key = PCCrypto.hkdf(shared, "arktika-pair-v1".toByteArray(), me.publicKey + pcPub, 32)
                    val code = sasCode(me.publicKey, pcPub)
                    withContext(Dispatchers.Main) { pairStep = PairStep.Code(code, f.pc); Haptics.tap() }
                    // компьютер держит запрос, пока человек думает, и отвечает «жди» — спрашиваем снова
                    while (true) {
                        val w = pairPost(f, "wait", JSONObject().put("sid", sid), 40_000)
                        when (w.optString("status")) {
                            "ok" -> {
                                val box = runCatching { Base64.decode(w.optString("box"), Base64.DEFAULT) }.getOrNull()
                                val plain = box?.let { runCatching { PCCrypto.open(it, key, "arktika pair") }.getOrNull() }
                                val j = plain?.let { runCatching { JSONObject(String(it, Charsets.UTF_8)) }.getOrNull() }
                                return@withContext j?.let { SyncLink.fromGrant(it, f) } ?: throw PairFailure("Компьютер прислал непонятный ответ.")
                            }
                            "denied" -> throw PairFailure("На компьютере нажали «Отклонить».")
                        }
                    }
                    @Suppress("UNREACHABLE_CODE") null
                }
                pairStep = null
                nearby = emptyList()
                if (link != null) pair(link)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: PairFailure) {
                pairStep = PairStep.Failed(e.message ?: "Не получилось связаться")
            } catch (e: Throwable) {
                pairStep = PairStep.Failed("Не получилось связаться. Попробуй ещё раз.")
            }
        }
    }

    fun cancelPairing() { pairJob?.cancel(); pairJob = null; pairStep = null }

    /** Адрес компьютера ввели руками (написан на компьютере в «Синхронизации с телефоном») */
    fun connectManually(text: String) {
        val host = text.trim().replace(',', '.')
        pairJob?.cancel()
        pairStep = PairStep.Connecting(host)
        pairJob = AppScope.launch {
            if (!LanDiscovery.isLocal(host)) {
                pairStep = PairStep.Failed("«$host» — не адрес домашней сети. Он выглядит как 192.168.1.5 и написан на компьютере в «Синхронизации с телефоном».")
                return@launch
            }
            val f = LanDiscovery.find(host)
            if (f == null) {
                pairStep = PairStep.Failed("По адресу $host Арктика не ответила. Проверь, что компьютер в той же сети Wi‑Fi, Арктика на нём запущена, а брандмауэр разрешён: на компьютере «Синхронизация» → «Разрешить синхронизацию».")
                return@launch
            }
            if (nearby.none { it.host == f.host }) nearby = nearby + f
            pairWith(f)
        }
    }

    // MARK: состояние

    private fun loadState(): MutableMap<String, SyncCollState> = runCatching {
        AppJson.decodeFromString<Map<String, SyncCollState>>(Defaults.string(stateKey) ?: "{}").toMutableMap()
    }.getOrDefault(HashMap())

    private fun saveState(s: Map<String, SyncCollState>) = Defaults.set(stateKey, AppJson.encodeToString(s))

    /** Что сейчас лежит в хранилищах — в виде для сети */
    private fun snapshot(): Map<String, List<JsonObject>> {
        HomeworkStore.load(); TaskStore.load()
        return mapOf(
            "homework" to SyncCodec.toWire("homework", AppJson.encodeToJsonElement(ListSerializer(Homework.serializer()), HomeworkStore.items)),
            "tasks" to SyncCodec.toWire("tasks", AppJson.encodeToJsonElement(ListSerializer(StudyTask.serializer()), TaskStore.tasks)),
            "notes" to SyncCodec.toWire("notes", AppJson.encodeToJsonElement(ListSerializer(Note.serializer()), NotesStore.notes)),
        )
    }

    private fun fingerprints(s: Map<String, List<JsonObject>>) = s.map { (k, v) -> k + "=" + SyncCodec.fingerprint(JsonArray(v)) }.sorted().joinToString("|")

    private fun localFingerprint() = runCatching { fingerprints(snapshot()) }.getOrDefault("")

    // MARK: один обмен

    suspend fun syncNow(background: Boolean = false) {
        load()
        val p = pairing ?: return
        if (inFlight) { again = true; return }
        inFlight = true
        syncing = true
        try {
            val now = System.currentTimeMillis().toDouble()
            val state = loadState()
            val local = snapshot()
            val sentPrint = fingerprints(local)
            val data = buildJsonObject {
                for ((coll, items) in local) {
                    val st = SyncStamps.refresh(coll, items, state[coll] ?: SyncCollState(), now)
                    state[coll] = st
                    put(coll, buildJsonObject {
                        put("items", JsonArray(items))
                        put("m", SyncStamps.wireM(st))
                        put("tomb", JsonObject(st.tomb.mapValues { JsonPrimitive(it.value) }))
                    })
                }
            }
            // свои правки и удаления помним, даже если компьютер сейчас не ответит
            saveState(state)
            val body = buildJsonObject { put("device", deviceName); put("data", data) }.toString().toByteArray(Charsets.UTF_8)
            val answer = post(body, p)
            val rdata = (answer["data"] as? JsonObject) ?: throw LanHttp.Rejected(0)
            // пока ждали ответа, что-то поправили — сводим ещё раз, с этой правкой
            if (fingerprints(snapshot()) != sentPrint) { again = true; return }
            for (coll in local.keys) {
                val r = rdata[coll] as? JsonObject ?: continue
                val items = (r["items"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: continue
                apply(coll, items)
                val final = snapshot()[coll] ?: emptyList()
                state[coll] = SyncStamps.restamp(coll, final, SyncStamps.readM(r["m"]), SyncStamps.readTomb(r["tomb"]))
            }
            saveState(state)
            remember(answer, p)
            lastSent = localFingerprint()
            lastSync = Instant.now()
            Defaults.set(lastKey, System.currentTimeMillis().toDouble())
            problem = null
        } catch (e: LanHttp.Rejected) {
            lastError = e.toString()
            problem = if (e.status == 403 || e.status == 400) "Компьютер не узнаёт этот телефон: связку обновили или отключили. Свяжи их заново."
            else "Компьютер ответил ошибкой (${e.status}). Обнови Арктику на компьютере."
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Throwable) {
            lastError = e.toString()
            // компьютеру выдали в сети новый адрес — находим его и сразу пробуем снова
            if (!background && rediscover(p)) { again = true; return }
            problem = "Компьютер не отвечает. Нужно, чтобы он был в той же сети Wi‑Fi и Арктика на нём была запущена. Если всё так — на компьютере: «Синхронизация» → «Разрешить синхронизацию» (брандмауэр Windows)"
        } finally {
            inFlight = false
            syncing = false
            if (again) { again = false; AppScope.launch { delay(400); syncNow() } }
        }
    }

    /** Компьютер сменил адрес или порт — запоминаем новые */
    private fun remember(answer: JsonObject, p: SyncPairing) {
        var n = p
        (answer["hosts"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }?.filter(LanDiscovery::isLocal)?.takeIf { it.isNotEmpty() }
            ?.let { n = n.copy(hosts = it.take(5)) }
        (answer["port"] as? JsonPrimitive)?.doubleOrNull?.toInt()?.takeIf { it in 1..65535 }?.let { n = n.copy(port = it) }
        (answer["pc"] as? JsonPrimitive)?.content?.takeIf { it.isNotEmpty() }?.let { n = n.copy(name = it.take(40)) }
        if (n != p && pairing?.id == p.id) savePairing(n)
    }

    /** Компьютер не ответил по старым адресам: наверное, ему выдали новый — ищем по отпечатку связки */
    private suspend fun rediscover(p: SyncPairing): Boolean {
        if (System.currentTimeMillis() < rescanAfter || !LanDiscovery.hasLan) return false
        rescanAfter = System.currentTimeMillis() + 5 * 60_000
        val tag = LanDiscovery.tag(p.id)
        val ports = if (p.port == LanDiscovery.PORT) listOf(p.port) else listOf(p.port, LanDiscovery.PORT)
        var list = LanDiscovery.scan(ports = ports, stop = { it.pair == tag })
        if (list.none { it.pair == tag }) list = LanDiscovery.scan(ports = ports, wide = true, stop = { it.pair == tag })
        val f = list.firstOrNull { it.pair == tag } ?: return false
        if (pairing?.id != p.id) return false
        rescanAfter = System.currentTimeMillis() + 60_000
        val cur = pairing ?: p
        savePairing(cur.copy(hosts = (listOf(f.host) + cur.hosts.filter { it != f.host }).take(5), port = f.port))
        return true
    }

    // MARK: общая версия — в хранилища

    private fun apply(coll: String, items: List<JsonObject>) {
        when (coll) {
            "homework" -> {
                val local = HomeworkStore.items.associateBy { it.id.lowercase() }
                val arr = SyncCodec.fromWire(coll, items)
                val list = arr.mapNotNull { e ->
                    runCatching {
                        val h = AppJson.decodeFromJsonElement(Homework.serializer(), e)
                        // фото — свои: у пришедшей с компьютера записи их здесь нет
                        h.copy(photos = local[h.id.lowercase()]?.photos ?: emptyList())
                    }.getOrNull()
                }
                HomeworkStore.applySync(list)
            }
            "tasks" -> TaskStore.applySync(SyncCodec.fromWire(coll, items).mapNotNull { runCatching { AppJson.decodeFromJsonElement(StudyTask.serializer(), it) }.getOrNull() })
            "notes" -> NotesStore.applySync(SyncCodec.fromWire(coll, items).mapNotNull { runCatching { AppJson.decodeFromJsonElement(Note.serializer(), it) }.getOrNull() })
        }
    }

    // MARK: сеть

    /** Запрос на компьютер: пробуем все его адреса сразу, отвечает первый */
    private suspend fun post(body: ByteArray, p: SyncPairing): JsonObject = withContext(Dispatchers.IO) {
        val key = Base64.decode(p.key, Base64.DEFAULT)
        val sealed = PCCrypto.seal(body, key, "POST $route")
        val results = coroutineScope {
            p.hosts.map { h ->
                async {
                    runCatching {
                        val r = LanHttp.request(h, p.port, "POST", route, sealed,
                            mapOf("X-Arktika-Pair" to p.id, "Content-Type" to "application/octet-stream"), connectTimeout = 2500, readTimeout = 15_000)
                        if (r.status != 200 || r.headers["content-type"]?.startsWith("application/octet-stream") != true) throw LanHttp.Rejected(r.status)
                        PCCrypto.open(r.body, key, "R POST $route")
                    }
                }
            }.awaitAll()
        }
        results.firstOrNull { it.isSuccess }?.getOrNull()?.let { plain ->
            return@withContext AppJson.parseToJsonElement(String(plain, Charsets.UTF_8)).jsonObject
        }
        results.mapNotNull { it.exceptionOrNull() as? LanHttp.Rejected }.firstOrNull()?.let { throw it }
        throw java.io.IOException("unreachable")
    }

    /** «только что», «5 минут назад» */
    fun ago(d: Instant): String =
        if (Instant.now().epochSecond - d.epochSecond < 50) "только что" else ru.student.safuhub.core.Fmt.relative(d, full = true)
}
