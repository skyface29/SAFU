package ru.student.safuhub.core

import android.content.Context
import android.util.Base64
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateMapOf
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Аналог UserDefaults: словарь «ключ → значение» с типами как у iOS
 * (строка, логическое, целое, дробное, дата, данные, массив, словарь).
 * Всё в памяти, на диск пишется пачкой в фоне. Чтение внутри Compose подписывает экран на ключ.
 */
object Defaults {
    private val lock = Any()
    private val map = HashMap<String, Any>()
    private val versions = mutableStateMapOf<String, Int>()
    private lateinit var file: File
    private val io = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "defaults-io").apply { isDaemon = true } }
    private var pending: ScheduledFuture<*>? = null
    @Volatile private var loaded = false

    fun init(ctx: Context) {
        if (loaded) return
        synchronized(lock) {
            if (loaded) return
            file = File(ctx.filesDir, "defaults.json")
            try {
                if (file.exists()) {
                    val o = JSONObject(file.readText())
                    for (k in o.keys()) decode(o.get(k))?.let { map[k] = it }
                }
            } catch (_: Throwable) {
                // повреждённый файл — пробуем запасной
                try {
                    val bak = File(ctx.filesDir, "defaults.bak.json")
                    if (bak.exists()) {
                        val o = JSONObject(bak.readText())
                        for (k in o.keys()) decode(o.get(k))?.let { map[k] = it }
                    }
                } catch (_: Throwable) {}
            }
            loaded = true
        }
    }

    private fun touch(key: String) {
        try { versions[key] = (versions[key] ?: 0) + 1 } catch (_: Throwable) {}
    }

    private fun observe(key: String) {
        try { versions[key] } catch (_: Throwable) {}
    }

    fun obj(key: String): Any? {
        observe(key)
        synchronized(lock) { return map[key] }
    }

    fun has(key: String): Boolean = obj(key) != null

    fun string(key: String): String? = when (val v = obj(key)) {
        is String -> v
        is Number -> v.toString()
        else -> null
    }

    fun bool(key: String): Boolean = boolOrNull(key) ?: false

    fun boolOrNull(key: String): Boolean? = when (val v = obj(key)) {
        is Boolean -> v
        is Number -> v.toDouble() != 0.0
        is String -> when (v.lowercase()) { "true", "yes", "1" -> true; "false", "no", "0" -> false; else -> null }
        else -> null
    }

    fun int(key: String): Int = intOrNull(key) ?: 0

    fun intOrNull(key: String): Int? = when (val v = obj(key)) {
        is Int -> v
        is Long -> v.toInt()
        is Double -> v.toInt()
        is Float -> v.toInt()
        is Boolean -> if (v) 1 else 0
        is String -> v.toDoubleOrNull()?.toInt()
        else -> null
    }

    fun long(key: String): Long = when (val v = obj(key)) {
        is Number -> v.toLong()
        is String -> v.toDoubleOrNull()?.toLong() ?: 0L
        else -> 0L
    }

    fun double(key: String): Double = doubleOrNull(key) ?: 0.0

    fun doubleOrNull(key: String): Double? = when (val v = obj(key)) {
        is Number -> v.toDouble()
        is Boolean -> if (v) 1.0 else 0.0
        is String -> v.toDoubleOrNull()
        is Instant -> v.toAppleSeconds()
        else -> null
    }

    fun date(key: String): Instant? = when (val v = obj(key)) {
        is Instant -> v
        else -> null
    }

    fun data(key: String): ByteArray? = when (val v = obj(key)) {
        is ByteArray -> v
        is String -> v.toByteArray()
        else -> null
    }

    @Suppress("UNCHECKED_CAST")
    fun stringArray(key: String): List<String>? = (obj(key) as? List<Any?>)?.mapNotNull { it as? String }

    @Suppress("UNCHECKED_CAST")
    fun dictionary(key: String): Map<String, Any>? = obj(key) as? Map<String, Any>

    fun set(key: String, value: Any?) {
        if (value == null) { remove(key); return }
        val v: Any = when (value) {
            is Int, is Long, is Double, is Boolean, is String, is ByteArray, is Instant -> value
            is Float -> value.toDouble()
            is Short -> value.toInt()
            is List<*> -> value.filterNotNull()
            is Set<*> -> value.filterNotNull().toList()
            is Map<*, *> -> value.entries.filter { it.key != null && it.value != null }
                .associate { it.key.toString() to it.value!! }
            else -> value.toString()
        }
        synchronized(lock) { map[key] = v }
        touch(key)
        schedulePersist()
    }

    fun remove(key: String) {
        val had = synchronized(lock) { map.remove(key) != null }
        if (had) { touch(key); schedulePersist() }
    }

    /** Весь словарь (для резервной копии) */
    fun snapshot(): Map<String, Any> = synchronized(lock) { HashMap(map) }

    /** Заменить всё целиком (восстановление из копии) */
    fun replaceAll(values: Map<String, Any>) {
        val keys: Set<String>
        synchronized(lock) {
            keys = map.keys + values.keys
            map.clear()
            map.putAll(values)
        }
        keys.forEach { touch(it) }
        flush()
    }

    private fun schedulePersist() {
        if (!::file.isInitialized) return
        synchronized(lock) {
            pending?.cancel(false)
            pending = io.schedule({ writeNow() }, 400, TimeUnit.MILLISECONDS)
        }
    }

    /** Записать немедленно (приложение уходит в фон) */
    fun flush() {
        if (!::file.isInitialized) return
        synchronized(lock) { pending?.cancel(false) }
        io.submit { writeNow() }.get(3, TimeUnit.SECONDS)
    }

    private fun writeNow() {
        val copy = synchronized(lock) { HashMap(map) }
        val o = JSONObject()
        for ((k, v) in copy) encode(v)?.let { o.put(k, it) }
        val text = o.toString()
        try {
            val tmp = File(file.parentFile, "defaults.tmp")
            tmp.writeText(text)
            if (file.exists()) file.copyTo(File(file.parentFile, "defaults.bak.json"), overwrite = true)
            if (!tmp.renameTo(file)) { file.writeText(text); tmp.delete() }
        } catch (_: Throwable) {}
    }

    // Типизированное хранение: {"t":"s","v":…}
    private fun encode(v: Any): Any? = when (v) {
        is String -> JSONObject().put("t", "s").put("v", v)
        is Boolean -> JSONObject().put("t", "b").put("v", v)
        is Int -> JSONObject().put("t", "i").put("v", v.toLong())
        is Long -> JSONObject().put("t", "i").put("v", v)
        is Double -> JSONObject().put("t", "d").put("v", if (v.isNaN() || v.isInfinite()) 0.0 else v)
        is Instant -> JSONObject().put("t", "date").put("v", v.toAppleSeconds())
        is ByteArray -> JSONObject().put("t", "data").put("v", Base64.encodeToString(v, Base64.NO_WRAP))
        is List<*> -> JSONObject().put("t", "a").put("v", JSONArray().apply { v.forEach { e -> e?.let { encode(it) }?.let { put(it) } } })
        is Map<*, *> -> JSONObject().put("t", "m").put("v", JSONObject().apply {
            v.forEach { (k, e) -> if (k != null && e != null) encode(e)?.let { put(k.toString(), it) } }
        })
        else -> null
    }

    private fun decode(raw: Any?): Any? {
        val o = raw as? JSONObject ?: return null
        return when (o.optString("t")) {
            "s" -> o.optString("v")
            "b" -> o.optBoolean("v")
            "i" -> o.optLong("v").let { if (it in Int.MIN_VALUE..Int.MAX_VALUE) it.toInt() else it }
            "d" -> o.optDouble("v")
            "date" -> appleSecondsToInstant(o.optDouble("v"))
            "data" -> Base64.decode(o.optString("v"), Base64.NO_WRAP)
            "a" -> o.optJSONArray("v")?.let { a -> (0 until a.length()).mapNotNull { decode(a.opt(it)) } } ?: emptyList<Any>()
            "m" -> o.optJSONObject("v")?.let { m -> m.keys().asSequence().mapNotNull { k -> decode(m.opt(k))?.let { k to it } }.toMap() } ?: emptyMap<String, Any>()
            else -> null
        }
    }
}

/** Секунды от 1 января 2001 (как Date в iOS) */
const val APPLE_EPOCH_OFFSET = 978_307_200L

fun Instant.toAppleSeconds(): Double = (toEpochMilli() - APPLE_EPOCH_OFFSET * 1000) / 1000.0
fun appleSecondsToInstant(s: Double): Instant = Instant.ofEpochMilli((s * 1000).toLong() + APPLE_EPOCH_OFFSET * 1000)

/** Состояние, привязанное к ключу настроек (как @AppStorage) */
class PrefState<T>(private val getter: () -> T, private val setter: (T) -> Unit) : MutableState<T> {
    override var value: T
        get() = getter()
        set(v) = setter(v)
    override fun component1(): T = value
    override fun component2(): (T) -> Unit = { value = it }
}

fun prefString(key: String, def: String) = PrefState({ Defaults.string(key) ?: def }, { Defaults.set(key, it) })
fun prefBool(key: String, def: Boolean) = PrefState({ Defaults.boolOrNull(key) ?: def }, { Defaults.set(key, it) })
fun prefInt(key: String, def: Int) = PrefState({ Defaults.intOrNull(key) ?: def }, { Defaults.set(key, it) })
fun prefDouble(key: String, def: Double) = PrefState({ Defaults.doubleOrNull(key) ?: def }, { Defaults.set(key, it) })
