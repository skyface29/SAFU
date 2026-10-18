package ru.student.safuhub.feature.weather

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.feature.commute.HomeCity
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.roundToInt

// MARK: - Погода к выезду (Open-Meteo, без ключа)

@Serializable
data class WeatherHour(
    val time: AppleDate,
    val temp: Double,
    val feels: Double,
    val wind: Double,
    val precip: Double,
    val code: Int,
)

object WeatherCache {
    @Serializable
    private data class Blob(val hours: List<WeatherHour>, val fetchedAt: AppleDate, val city: String)

    private const val key = "weather.cache"

    data class Loaded(val hours: List<WeatherHour>, val fetchedAt: Instant?, val city: String)

    fun load(): Loaded {
        val b = Defaults.decode<Blob>(key) ?: return Loaded(emptyList(), null, "")
        return Loaded(b.hours, b.fetchedAt, b.city)
    }

    fun save(hours: List<WeatherHour>, city: String) = Defaults.encode(key, Blob(hours, Instant.now(), city))

    /** Час прогноза, ближайший к моменту (не дальше 90 минут) */
    fun hour(date: Instant, hours: List<WeatherHour>): WeatherHour? {
        val best = hours.minByOrNull { abs(it.time.epochSecond - date.epochSecond) } ?: return null
        return if (abs(best.time.epochSecond - date.epochSecond) <= 90 * 60) best else null
    }

    /** Для уведомлений — из кеша, без сети */
    fun cachedHour(date: Instant): WeatherHour? = hour(date, load().hours)

    fun emoji(code: Int): String = when (code) {
        0 -> "☀️"
        1, 2 -> "🌤"
        3 -> "☁️"
        45, 48 -> "🌫"
        in 51..67, in 80..82 -> "🌧"
        in 71..77, 85, 86 -> "🌨"
        in 95..99 -> "⛈"
        else -> "🌡"
    }

    fun deg(v: Double): String {
        val r = v.roundToInt()
        return if (r < 0) "−${-r}°" else "$r°"
    }

    /** «🌨 −18° · ощущается −26° · ветер 9 м/с» */
    fun line(h: WeatherHour): String {
        var s = "${emoji(h.code)} ${deg(h.temp)}"
        if (abs(h.feels - h.temp) >= 3) s += " · ощущается ${deg(h.feels)}"
        if (h.wind >= 5) s += " · ветер ${h.wind.roundToInt()} м/с"
        return s
    }

    /** Короткий совет или null, если погода обычная */
    fun advice(h: WeatherHour): String? {
        val parts = mutableListOf<String>()
        when {
            h.feels <= -25 -> parts.add("Лютый мороз: выходи на пару минут раньше, автобус может опоздать")
            h.feels <= -15 -> parts.add("Морозно: шапка, шарф, перчатки")
            h.feels <= -5 -> parts.add("Холодно, оденься потеплее")
        }
        when (h.code) {
            in 71..77, 85, 86 -> parts.add(if (h.precip >= 1) "Сильный снег — в дороге может быть медленно" else "Идёт снег")
            in 51..67, in 80..82 -> parts.add("Дождь — возьми зонт")
            in 95..99 -> parts.add("Гроза")
        }
        if (h.wind >= 12) parts.add("Сильный ветер")
        return if (parts.isEmpty()) null else parts.joinToString(". ")
    }
}

object WeatherStore {
    var hours by mutableStateOf<List<WeatherHour>>(emptyList())
        private set
    private var fetchedAt: Instant? = null
    private var city = ""
    private var loading = false
    private var inited = false

    private fun init() {
        if (inited) return
        inited = true
        val c = WeatherCache.load()
        hours = c.hours
        fetchedAt = c.fetchedAt
        city = c.city
    }

    fun hour(date: Instant): WeatherHour? { init(); return WeatherCache.hour(date, hours) }

    private val client by lazy { OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build() }

    suspend fun refresh(c: HomeCity?) {
        init()
        val place = c ?: HomeCity.ARKHANGELSK
        fetchedAt?.let { if (city == place.raw && Instant.now().epochSecond - it.epochSecond < 3600) return }
        if (loading) return
        loading = true
        try {
            val loc = if (place == HomeCity.ARKHANGELSK) HomeCity.arkhCenter else HomeCity.sevCenter
            val url = "https://api.open-meteo.com/v1/forecast?latitude=${loc.first}&longitude=${loc.second}" +
                "&hourly=temperature_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code" +
                "&wind_speed_unit=ms&timezone=auto&forecast_days=3&timeformat=unixtime"
            val out = withContext(Dispatchers.IO) {
                try {
                    client.newCall(Request.Builder().url(url).build()).execute().use { r ->
                        if (r.code != 200) return@withContext null
                        val obj = JSONObject(r.body?.string() ?: return@withContext null)
                        val hourly = obj.optJSONObject("hourly") ?: return@withContext null
                        val times = hourly.optJSONArray("time") ?: return@withContext null
                        fun col(k: String): (Int) -> Double? {
                            val a = hourly.optJSONArray(k)
                            return { i -> if (a == null || i >= a.length() || a.isNull(i)) null else a.optDouble(i) }
                        }
                        val temp = col("temperature_2m"); val feels = col("apparent_temperature")
                        val wind = col("wind_speed_10m"); val precip = col("precipitation"); val code = col("weather_code")
                        val list = mutableListOf<WeatherHour>()
                        for (i in 0 until times.length()) {
                            val ts = times.optLong(i, -1)
                            if (ts < 0) continue
                            val tv = temp(i) ?: continue
                            list.add(WeatherHour(Instant.ofEpochSecond(ts), tv, feels(i) ?: tv, wind(i) ?: 0.0, precip(i) ?: 0.0, (code(i) ?: 0.0).toInt()))
                        }
                        list
                    }
                } catch (_: Throwable) { null }
            } ?: return
            if (out.isEmpty()) return
            hours = out
            fetchedAt = Instant.now()
            city = place.raw
            WeatherCache.save(out, place.raw)
        } finally {
            loading = false
        }
    }
}
