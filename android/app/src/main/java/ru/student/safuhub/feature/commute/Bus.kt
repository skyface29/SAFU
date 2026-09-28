package ru.student.safuhub.feature.commute

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import kotlinx.serialization.Serializable
import ru.student.safuhub.App
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.system.Permissions
import java.net.URLEncoder
import java.time.Instant
import java.util.Base64
import java.util.Locale
import java.util.UUID

// MARK: - Маршруты автобусов

enum class BusDirection(val raw: String) {
    TO_CAMPUS("toCampus"), TO_HOME("toHome");
    val flipped: BusDirection get() = if (this == TO_CAMPUS) TO_HOME else TO_CAMPUS
    companion object { fun of(raw: String?) = entries.firstOrNull { it.raw == raw } ?: TO_CAMPUS }
}

enum class BusDayType(val raw: String, val title: String) {
    WEEKDAY("weekday", "Пн–Пт"), SATURDAY("saturday", "Суббота"), SUNDAY("sunday", "Воскресенье");

    companion object {
        fun of(day: Instant): BusDayType = when (ScheduleEngine.weekday(day)) {
            6 -> SATURDAY
            7 -> SUNDAY
            else -> WEEKDAY
        }
    }
}

data class BusTrip(val departure: Instant, val arrival: Instant)

fun colorFromHex(hex: String): Color? {
    var s = hex.trim()
    if (s.startsWith("#")) s = s.drop(1)
    if (s.length != 6) return null
    val v = s.toLongOrNull(16) ?: return null
    return Color(((v shr 16) and 0xFF).toInt(), ((v shr 8) and 0xFF).toInt(), (v and 0xFF).toInt())
}

@Serializable
data class BusRoute(
    val id: String = UUID.randomUUID().toString().uppercase(),
    val number: String = "",
    /** Откуда ты едешь на пары (дом) */
    val homeCity: String = "",
    val homeStop: String = "",
    /** Куда (к универу) */
    val campusCity: String = "Архангельск",
    val campusStop: String = "",
    val travelMinutes: Int = 30,
    /** Для пар без особых правил: выехать не позже чем за N минут до начала */
    val leadMinutes: Int = 60,
    val colorHex: String = "F28C1A",
    /** Расписания: BusDayType.raw → «06:20 06:40 …» */
    val toCampus: Map<String, String> = emptyMap(),
    val toHome: Map<String, String> = emptyMap(),
    val mapLink: String = "",
    /** Направление по геолокации: в Архангельске — домой, вне — в город. Только для межгорода. */
    val useGeo: Boolean = false,
    val builtIn: Boolean = false,
) {
    val color: Color get() = colorFromHex(colorHex) ?: Color(0xFFFF9500)
    val title: String get() = if (number.isEmpty()) "Автобус" else "Автобус $number"
    val routeText: String get() = "${homeCity.ifEmpty { homeStop }} ⇄ ${campusCity.ifEmpty { campusStop }}"

    fun fromCity(d: BusDirection) = if (d == BusDirection.TO_CAMPUS) homeCity else campusCity
    fun toCity(d: BusDirection) = if (d == BusDirection.TO_CAMPUS) campusCity else homeCity
    fun fromStop(d: BusDirection) = if (d == BusDirection.TO_CAMPUS) homeStop else campusStop
    fun toStop(d: BusDirection) = if (d == BusDirection.TO_CAMPUS) campusStop else homeStop

    /** Своя ссылка на Яндекс Карты или поиск по номеру */
    val mapURL: String
        get() {
            val l = mapLink.trim()
            if (l.contains("://")) return l
            val q = URLEncoder.encode("автобус $number $campusCity", "UTF-8").replace("+", "%20")
            return "https://yandex.ru/maps/20/arkhangelsk/?text=$q"
        }

    fun timesRaw(d: BusDirection, type: BusDayType): String = (if (d == BusDirection.TO_CAMPUS) toCampus else toHome)[type.raw] ?: ""

    fun withTimes(d: BusDirection, type: BusDayType, raw: String): BusRoute {
        val clean = normalize(raw)
        return if (d == BusDirection.TO_CAMPUS) copy(toCampus = toCampus + (type.raw to clean)) else copy(toHome = toHome + (type.raw to clean))
    }

    fun times(d: BusDirection, type: BusDayType): List<String> = timesRaw(d, type).split(" ").filter { it.isNotEmpty() }
    fun times(d: BusDirection, day: Instant): List<String> = times(d, BusDayType.of(day))

    fun trips(d: BusDirection, day: Instant): List<BusTrip> {
        val travel = travelMinutes * 60L
        return times(d, day).mapNotNull { t ->
            val p = t.split(":").mapNotNull { it.toIntOrNull() }
            if (p.size != 2) return@mapNotNull null
            val dep = Cal.setting(day, p[0], p[1])
            BusTrip(dep, dep.plusSeconds(travel))
        }
    }

    val isEmpty: Boolean
        get() = BusDayType.entries.all { times(BusDirection.TO_CAMPUS, it).isEmpty() && times(BusDirection.TO_HOME, it).isEmpty() }

    /** Для обмена с одногруппниками */
    val shareCode: String
        get() = sharePrefix + Base64.getEncoder().encodeToString(AppJson.encodeToString(serializer(), copy(builtIn = false)).toByteArray())

    companion object {
        const val sharePrefix = "SAFU-BUS:"

        /** Любой текст («6.20, 7:40; 8:15») → «06:20 07:40 08:15», по порядку и без повторов */
        fun normalize(raw: String): String {
            val set = sortedSetOf<Int>()
            for (m in Regex("(\\d{1,2})[:.](\\d{2})").findAll(raw)) {
                val h = m.groupValues[1].toIntOrNull() ?: continue
                val mi = m.groupValues[2].toIntOrNull() ?: continue
                if (h < 24 && mi < 60) set.add(h * 60 + mi)
            }
            return set.joinToString(" ") { String.format(Locale.US, "%02d:%02d", it / 60, it % 60) }
        }

        val default150 = BusRoute(
            id = "builtin-150", number = "150", homeCity = "Северодвинск", homeStop = "о. Ягры",
            campusCity = "Архангельск", campusStop = "м.р. вокзал", travelMinutes = 60, leadMinutes = 100,
            colorHex = "F28C1A", useGeo = true, builtIn = true,
            mapLink = "https://yandex.ru/maps/20/arkhangelsk/routes/bus_150/796d617073626d313a2f2f7472616e7369742f6c696e653f69643d31373034383535383634266c6c3d34302e31383136333325324336342e353534353734266e616d653d31353026723d313833383726747970653d627573/",
            toCampus = mapOf(
                "weekday" to "06:20 06:40 07:00 07:25 07:50 08:30 09:35 10:30 11:10 12:00 12:40 13:20 14:00 14:30 15:10 16:00 16:35 17:30 18:30 19:30",
                "saturday" to "06:40 07:10 07:50 08:30 09:35 10:30 11:10 12:00 12:40 13:20 14:30 15:10 16:00 16:35 17:30 18:30 19:30",
                "sunday" to "07:10 07:50 08:30 09:35 10:30 11:10 12:00 12:40 13:20 14:30 15:10 16:00 16:35 17:30 18:30 19:30",
            ),
            toHome = mapOf(
                "weekday" to "06:10 07:40 08:15 08:40 09:20 10:00 10:35 11:10 12:00 13:00 14:00 14:50 15:30 16:00 16:30 17:00 17:30 18:15 19:00 20:00",
                "saturday" to "08:15 08:40 09:20 10:00 10:35 11:10 12:00 13:00 14:00 14:50 16:00 16:30 17:00 17:30 18:15 19:00 20:00",
                "sunday" to "08:40 09:20 10:00 10:35 11:10 12:00 13:00 14:00 14:50 16:00 16:30 17:00 17:30 18:15 19:00 20:00",
            ),
        )

        fun fromShareCode(text: String): BusRoute? {
            val i = text.indexOf(sharePrefix)
            if (i < 0) return null
            val tail = text.substring(i + sharePrefix.length).takeWhile { !it.isWhitespace() }
            return try {
                val json = String(Base64.getDecoder().decode(tail))
                AppJson.decodeFromString(serializer(), json).copy(id = UUID.randomUUID().toString().uppercase(), builtIn = false)
            } catch (_: Throwable) { null }
        }
    }
}

// MARK: - Хранилище

object BusRouteStore {
    private const val key = "bus.routes.v1"
    private const val activeKey = "bus.active"

    private var _routes = mutableStateOf<List<BusRoute>>(emptyList())
    var routes: List<BusRoute>
        get() = _routes.value
        set(v) { _routes.value = v; Defaults.encode(key, v) }
    private var _active = mutableStateOf(BusRoute.default150.id)
    var activeID: String
        get() = _active.value
        set(v) { _active.value = v; Defaults.set(activeKey, v) }
    private var loaded = false

    fun load() {
        if (loaded) return
        loaded = true
        val list = Defaults.decode<List<BusRoute>>(key)
        _routes.value = if (!list.isNullOrEmpty()) list else listOf(BusRoute.default150)
        _active.value = Defaults.string(activeKey) ?: BusRoute.default150.id
    }

    fun reload() { loaded = false; load() }

    val active: BusRoute get() { load(); return routes.firstOrNull { it.id == activeID } ?: routes.firstOrNull() ?: BusRoute.default150 }

    fun upsert(r: BusRoute) {
        routes = if (routes.any { it.id == r.id }) routes.map { if (it.id == r.id) r else it } else routes + r
    }

    fun delete(r: BusRoute) {
        var list = routes.filter { it.id != r.id }
        if (list.isEmpty()) list = listOf(BusRoute.default150)
        routes = list
        if (list.none { it.id == activeID }) activeID = list[0].id
    }

    fun activate(r: BusRoute) {
        if (r.id == activeID) return
        activeID = r.id
        ru.student.safuhub.system.BusLive.stop()
    }

    /** Вернуть встроенный 150, если его удалили */
    fun restore150() {
        if (routes.none { it.id == BusRoute.default150.id }) routes = listOf(BusRoute.default150) + routes
    }

    /** Поправить активный маршрут (время в пути, запас) из настроек */
    fun updateActive(change: (BusRoute) -> BusRoute) = upsert(change(active))
}

object BusRoutes {
    val active: BusRoute get() = BusRouteStore.active
}

object BusPalette {
    val hexes = listOf("F28C1A", "E94B4B", "E8457C", "8B5CF6", "3B82F6", "06B6D4", "10B981", "84CC16", "EAB308", "64748B")
}

// MARK: - Где я: Архангельск или Северодвинск

enum class HomeCity(val raw: String, val title: String) {
    ARKHANGELSK("arkhangelsk", "Архангельске"), SEVERODVINSK("severodvinsk", "Северодвинске");

    /** Куда логично ехать из этого города */
    val busDirection: BusDirection get() = if (this == ARKHANGELSK) BusDirection.TO_HOME else BusDirection.TO_CAMPUS

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw }
        val arkhCenter = 64.5393 to 40.5170
        val sevCenter = 64.5635 to 39.8302

        fun distance(a: Pair<Double, Double>, b: Pair<Double, Double>): Float {
            val out = FloatArray(1)
            Location.distanceBetween(a.first, a.second, b.first, b.second, out)
            return out[0]
        }

        /** Ближайший город, если до него не дальше 40 км */
        fun nearest(lat: Double, lon: Double): HomeCity? {
            val a = distance(lat to lon, arkhCenter)
            val s = distance(lat to lon, sevCenter)
            if (minOf(a, s) >= 40_000) return null
            return if (a < s) ARKHANGELSK else SEVERODVINSK
        }
    }
}

/** Один запрос геолокации по требованию. Координаты никуда не отправляются — запоминается только город. */
object CityLocator {
    var city by mutableStateOf<HomeCity?>(null)
        private set
    var denied by mutableStateOf(false)
        private set
    private var inited = false

    val enabled: Boolean get() = Defaults.boolOrNull("commute.geo") ?: true

    private fun init() {
        if (inited) return
        inited = true
        val c = HomeCity.of(Defaults.string("geo.city"))
        if (c != null && System.currentTimeMillis() / 1000.0 - Defaults.double("geo.time") < 3 * 3600) city = c
    }

    val cityNow: HomeCity? get() { init(); return city }

    private fun granted(ctx: Context) =
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** Обновить, если давно не обновляли (не чаще раза в 10 минут) */
    fun refresh(force: Boolean = false) {
        init()
        if (!enabled) return
        val ctx = App.ctx
        if (!force && System.currentTimeMillis() / 1000.0 - Defaults.double("geo.time") < 600 && city != null) return
        if (!granted(ctx)) {
            if (Permissions.wasDenied(Manifest.permission.ACCESS_COARSE_LOCATION)) { denied = true; return }
            Permissions.request(Manifest.permission.ACCESS_COARSE_LOCATION) { ok ->
                denied = !ok
                if (ok) requestOnce(ctx)
            }
            return
        }
        denied = false
        requestOnce(ctx)
    }

    /** Последняя известная точка телефона */
    fun lastLocation(): Location? {
        val ctx = App.ctx
        if (!granted(ctx)) return null
        val lm = ctx.getSystemService(LocationManager::class.java) ?: return null
        return try {
            listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)
                .mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
        } catch (_: SecurityException) { null }
    }

    @Suppress("MissingPermission")
    private fun requestOnce(ctx: Context) {
        val lm = ctx.getSystemService(LocationManager::class.java) ?: return
        lastLocation()?.let { if (System.currentTimeMillis() - it.time < 30 * 60_000) apply(it) }
        try {
            val provider = when {
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                Build.VERSION.SDK_INT >= 31 && lm.isProviderEnabled(LocationManager.FUSED_PROVIDER) -> LocationManager.FUSED_PROVIDER
                lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                else -> return
            }
            if (Build.VERSION.SDK_INT >= 30) {
                lm.getCurrentLocation(provider, null, ContextCompat.getMainExecutor(ctx)) { loc -> if (loc != null) apply(loc) }
            } else {
                @Suppress("DEPRECATION")
                lm.requestSingleUpdate(provider, { loc -> apply(loc) }, android.os.Looper.getMainLooper())
            }
        } catch (_: Throwable) {}
    }

    private fun apply(loc: Location) {
        val c = HomeCity.nearest(loc.latitude, loc.longitude)
        city = c
        Defaults.set("geo.city", c?.raw)
        Defaults.set("geo.time", System.currentTimeMillis() / 1000.0)
    }
}

/** Какое направление показать: по геолокации, иначе — последний выбор */
object BusDirectionMemory {
    fun suggested(): BusDirection {
        if (CityLocator.enabled && BusRoutes.active.useGeo) CityLocator.cityNow?.let { return it.busDirection }
        if (BusRoutes.active.useGeo) {
            return if (Defaults.string("bus.lastDirection") == "sev") BusDirection.TO_HOME else BusDirection.TO_CAMPUS
        }
        return if (Cal.hour(Instant.now()) < 12) BusDirection.TO_CAMPUS else BusDirection.TO_HOME
    }

    fun remember(d: BusDirection) = Defaults.set("bus.lastDirection", if (d == BusDirection.TO_HOME) "sev" else "arh")
}
