package ru.student.safuhub.feature.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.location.Geocoder
import android.util.LruCache
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.yandex.mapkit.Animation
import com.yandex.mapkit.MapKitFactory
import com.yandex.mapkit.geometry.Point
import com.yandex.mapkit.map.CameraPosition
import com.yandex.mapkit.mapview.MapView
import com.yandex.mapkit.traffic.TrafficLayer
import com.yandex.runtime.image.ImageProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import ru.student.safuhub.App
import ru.student.safuhub.R
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.RU
import ru.student.safuhub.feature.commute.BusRoutes
import ru.student.safuhub.feature.commute.CityLocator
import ru.student.safuhub.feature.commute.HomeCity
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.BarIcon
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.tan

// MARK: - Карта транспорта (Yandex MapKit)
// Если ключа нет — карта с пробками не показывается (как в iOS-версии).

object YandexMap {
    /** Ключ подставляется при сборке из секрета YANDEX_MAPKIT_KEY */
    val apiKey: String get() = try { App.ctx.getString(R.string.yandex_mapkit_key).trim() } catch (_: Throwable) { "" }

    val isAvailable: Boolean get() = apiKey.isNotEmpty()

    private var started = false

    fun boot(ctx: Context) {
        if (started) return
        MapKitFactory.setApiKey(apiKey)
        MapKitFactory.setLocale("ru_RU")
        MapKitFactory.initialize(ctx.applicationContext)
        started = true
    }
}

/** Карта Яндекса в компоузе: запускается и останавливается вместе с экраном */
@Composable
fun YandexMapView(modifier: Modifier = Modifier, setup: (MapView) -> Unit, update: (MapView) -> Unit = {}) {
    val ctx = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val view = remember {
        YandexMap.boot(ctx)
        MapView(ctx).also(setup)
    }
    DisposableEffect(lifecycle) {
        MapKitFactory.getInstance().onStart()
        view.onStart()
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> { MapKitFactory.getInstance().onStart(); view.onStart() }
                Lifecycle.Event.ON_STOP -> { view.onStop(); MapKitFactory.getInstance().onStop() }
                else -> {}
            }
        }
        lifecycle.addObserver(obs)
        onDispose {
            lifecycle.removeObserver(obs)
            view.onStop()
            MapKitFactory.getInstance().onStop()
        }
    }
    AndroidView({ view }, modifier, update = update)
}

private fun MapView.moveTo(lat: Double, lon: Double, zoom: Float, animated: Boolean = true) {
    val pos = CameraPosition(Point(lat, lon), zoom, 0f, 0f)
    val map = mapWindow.map
    if (animated) map.move(pos, Animation(Animation.Type.SMOOTH, 0.6f), null) else map.move(pos)
}

/** Экран «Транспорт»: карта с пробками, кнопки «Я», «Архангельск», «Северодвинск», «Трасса», «Пробки» */
@Composable
fun TransportMapScreen() {
    val ctx = LocalContext.current
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var traffic by remember { mutableStateOf<TrafficLayer?>(null) }
    var trafficOn by remember { mutableStateOf(true) }

    Screen("Транспорт", scroll = false, trailing = { BarIcon("arrow.up.forward.app") { Share.url(ctx, BusRoutes.active.mapURL) } }) {
        Box(Modifier.fillMaxSize()) {
            YandexMapView(Modifier.fillMaxSize(), setup = { v ->
                // стартуем с того города, где ты сейчас
                val c = if (CityLocator.cityNow == HomeCity.SEVERODVINSK) HomeCity.sevCenter else HomeCity.arkhCenter
                v.moveTo(c.first, c.second, 12f, animated = false)
                // моя точка
                MapKitFactory.getInstance().createUserLocationLayer(v.mapWindow).isVisible = true
                // пробки: видно, стоит ли трасса Архангельск — Северодвинск
                traffic = MapKitFactory.getInstance().createTrafficLayer(v.mapWindow).also { it.isTrafficVisible = true }
                mapView = v
            })
            Column(Modifier.align(Alignment.TopEnd).padding(top = 12.dp, end = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                MapButton("location.fill") {
                    // последняя известная точка телефона (разрешение уже дано для автобуса)
                    CityLocator.lastLocation()?.let { mapView?.moveTo(it.latitude, it.longitude, 15f) }
                }
                MapButton("building.2.fill", "Арх") { mapView?.moveTo(HomeCity.arkhCenter.first, HomeCity.arkhCenter.second, 12f) }
                MapButton("house.fill", "Свд") { mapView?.moveTo(HomeCity.sevCenter.first, HomeCity.sevCenter.second, 12f) }
                MapButton("road.lanes", "Трасса") {
                    // вся трасса между городами
                    mapView?.moveTo((HomeCity.arkhCenter.first + HomeCity.sevCenter.first) / 2, (HomeCity.arkhCenter.second + HomeCity.sevCenter.second) / 2, 10f)
                }
                MapButton("car.fill", "Пробки") {
                    trafficOn = !trafficOn
                    traffic?.isTrafficVisible = trafficOn
                }
            }
            Text("Пробки по данным Яндекса · автобусы — кнопка ↗", style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.label,
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 24.dp).clip(CircleShape)
                    .background(Ios.secondaryBackground.copy(alpha = 0.92f)).padding(horizontal = 12.dp, vertical = 7.dp))
        }
    }
}

@Composable
private fun MapButton(icon: String, label: String? = null, action: () -> Unit) {
    Pressable({ Haptics.tap(); action() }) {
        Column(Modifier.size(46.dp).shadow(6.dp, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp))
            .background(Ios.secondaryBackground.copy(alpha = 0.95f)), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
            SfIcon(icon, size = 17.dp, tint = Brand.color)
            if (label != null) Text(label, style = ft(9f, FontWeight.Bold), color = Brand.color)
        }
    }
}

// MARK: - Адрес → координаты

object Geo {
    private val http by lazy { OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build() }

    /** Кеш «адрес → [широта, долгота]» (как geo.cache в iOS) */
    fun cached(address: String): Pair<Double, Double>? {
        val c = (Defaults.dictionary("geo.cache")?.get(address) as? List<*>)?.mapNotNull { (it as? Number)?.toDouble() } ?: return null
        return if (c.size == 2) c[0] to c[1] else null
    }

    private fun remember(address: String, p: Pair<Double, Double>) {
        val all = HashMap<String, Any>(Defaults.dictionary("geo.cache") ?: emptyMap())
        all[address] = listOf(p.first, p.second)
        Defaults.set("geo.cache", all)
    }

    suspend fun geocode(address: String): Pair<Double, Double>? {
        cached(address)?.let { return it }
        val q = if (address.lowercase(RU).contains("архангельск")) address else "Архангельск, $address"
        val p = withContext(Dispatchers.IO) { system(q) ?: nominatim(q) } ?: return null
        remember(address, p)
        return p
    }

    @Suppress("DEPRECATION")
    private fun system(q: String): Pair<Double, Double>? = try {
        if (!Geocoder.isPresent()) null
        else Geocoder(App.ctx, RU).getFromLocationName(q, 1)?.firstOrNull()?.let { it.latitude to it.longitude }
    } catch (_: Throwable) { null }

    private fun nominatim(q: String): Pair<Double, Double>? = try {
        val url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q=" + URLEncoder.encode(q, "UTF-8")
        http.newCall(Request.Builder().url(url).header("User-Agent", TileMapCache.UA).build()).execute().use { r ->
            val arr = JSONArray(r.body?.string() ?: "[]")
            if (arr.length() == 0) null
            else arr.getJSONObject(0).let { it.getString("lat").toDouble() to it.getString("lon").toDouble() }
        }
    } catch (_: Throwable) { null }
}

// MARK: - Простая карта OpenStreetMap (без ключей): тайлы, перетаскивание, щипок, метки

data class MapPin(val id: String, val lat: Double, val lon: Double, val label: String)

object TileMapCache {
    const val UA = "SAFU-Android/12.5 (student app; ru.student.safuhub)"
    private val http by lazy { OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build() }
    private val memory = object : LruCache<String, ImageBitmap>(96) {}
    private val dir: File get() = File(App.ctx.cacheDir, "tiles").apply { mkdirs() }

    fun peek(z: Int, x: Int, y: Int): ImageBitmap? = memory.get("$z/$x/$y")

    suspend fun load(z: Int, x: Int, y: Int): ImageBitmap? = withContext(Dispatchers.IO) {
        val key = "$z/$x/$y"
        memory.get(key)?.let { return@withContext it }
        val f = File(dir, "$z-$x-$y.png")
        val bytes = if (f.exists() && System.currentTimeMillis() - f.lastModified() < 30L * 86_400_000) f.readBytes() else try {
            http.newCall(Request.Builder().url("https://tile.openstreetmap.org/$z/$x/$y.png").header("User-Agent", UA).build()).execute().use { r ->
                if (!r.isSuccessful) null else r.body?.bytes()?.also { f.writeBytes(it) }
            }
        } catch (_: Throwable) { null } ?: return@withContext null
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() ?: return@withContext null
        memory.put(key, bmp)
        bmp
    }
}

private fun lonToX(lon: Double, world: Double) = (lon + 180) / 360 * world
private fun latToY(lat: Double, world: Double): Double {
    val r = Math.toRadians(lat)
    return (1 - ln(tan(r) + 1 / kotlin.math.cos(r)) / PI) / 2 * world
}
private fun xToLon(x: Double, world: Double) = x / world * 360 - 180
private fun yToLat(y: Double, world: Double): Double {
    val n = PI - 2 * PI * y / world
    return Math.toDegrees(atan(0.5 * (exp(n) - exp(-n))))
}

/**
 * Карта из тайлов OpenStreetMap: пальцем двигается и приближается.
 * pin — что нарисовать на месте метки.
 */
@Composable
fun TileMap(
    lat: Double, lon: Double, zoom: Double,
    pins: List<MapPin>,
    modifier: Modifier = Modifier,
    pin: @Composable (MapPin) -> Unit,
) {
    val density = LocalDensity.current.density
    // тайл 256 точек на экранах с обычной плотностью, крупнее — на плотных (иначе надписи мелкие)
    val tile = 256.0 * maxOf(1f, density / 2f)
    var cLat by remember { mutableDoubleStateOf(lat) }
    var cLon by remember { mutableDoubleStateOf(lon) }
    var z by remember { mutableDoubleStateOf(zoom) }
    var rev by remember { mutableIntStateOf(0) }
    LaunchedEffect(lat, lon, zoom) { cLat = lat; cLon = lon; z = zoom }

    BoxWithConstraints(modifier.clip(RoundedCornerShape(0.dp)).background(Color(0xFFE8E4DC)).pointerInput(Unit) {
        detectTransformGestures { centroid, pan, zoomChange, _ ->
            val world = tile * 2.0.pow(z)
            val cx = lonToX(cLon, world)
            val cy = latToY(cLat, world)
            // приближаем к точке под пальцами
            val newZ = (z + log2(zoomChange.toDouble())).coerceIn(3.0, 18.0)
            val k = 2.0.pow(newZ - z)
            val w = size.width / 2.0
            val h = size.height / 2.0
            val fx = cx + (centroid.x - w)
            val fy = cy + (centroid.y - h)
            val nx = fx * k - (centroid.x - w) - pan.x
            val ny = fy * k - (centroid.y - h) - pan.y
            val nw = tile * 2.0.pow(newZ)
            z = newZ
            cLon = xToLon(nx, nw)
            cLat = yToLat(ny.coerceIn(0.0, nw), nw)
        }
    }) {
        val wPx = constraints.maxWidth.toDouble()
        val hPx = constraints.maxHeight.toDouble()
        val zi = floor(z).toInt().coerceIn(0, 19)
        val scale = 2.0.pow(z - zi)
        val worldI = tile * 2.0.pow(zi)
        val cx = lonToX(cLon, worldI)
        val cy = latToY(cLat, worldI)
        val ts = tile * scale
        val left = cx * scale - wPx / 2
        val top = cy * scale - hPx / 2
        val x0 = floor(left / ts).toInt()
        val y0 = floor(top / ts).toInt()
        val x1 = floor((left + wPx) / ts).toInt()
        val y1 = floor((top + hPx) / ts).toInt()
        val n = 1 shl zi
        // подгрузка видимых тайлов
        LaunchedEffect(zi, x0, y0, x1, y1) {
            for (ty in y0..y1) for (tx in x0..x1) {
                if (ty !in 0 until n) continue
                val xx = ((tx % n) + n) % n
                if (TileMapCache.peek(zi, xx, ty) == null && TileMapCache.load(zi, xx, ty) != null) rev++
            }
        }
        Canvas(Modifier.fillMaxSize()) {
            rev
            for (ty in y0..y1) for (tx in x0..x1) {
                if (ty !in 0 until n) continue
                val xx = ((tx % n) + n) % n
                val img = TileMapCache.peek(zi, xx, ty) ?: continue
                val dx = (tx * ts - left).toFloat()
                val dy = (ty * ts - top).toFloat()
                drawImage(img, IntOffset.Zero, IntSize(img.width, img.height), IntOffset(dx.toInt(), dy.toInt()),
                    IntSize((ts + 1).toInt(), (ts + 1).toInt()))
            }
        }
        for (p in pins) {
            val px = lonToX(p.lon, worldI) * scale - left
            val py = latToY(p.lat, worldI) * scale - top
            if (px < -60 || py < -60 || px > wPx + 60 || py > hPx + 60) continue
            Box(Modifier.offset { IntOffset(px.toInt(), py.toInt()) }.offset((-17).dp, (-17).dp)) { pin(p) }
        }
        Text("© OpenStreetMap", style = ft(9f), color = Color.Black.copy(alpha = 0.7f),
            modifier = Modifier.align(Alignment.BottomEnd).background(Color.White.copy(alpha = 0.7f)).padding(horizontal = 4.dp, vertical = 1.dp))
    }
}

/** Кружок с числом для метки на карте Яндекса */
fun countBadge(count: Int, color: Color, density: Float): ImageProvider {
    val size = (34 * density).toInt()
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color.toArgb() }
    c.drawCircle(size / 2f, size / 2f, size / 2f - density, p)
    p.color = android.graphics.Color.WHITE
    p.textSize = 12 * density
    p.isFakeBoldText = true
    p.textAlign = Paint.Align.CENTER
    val fm = p.fontMetrics
    c.drawText("$count", size / 2f, size / 2f - (fm.ascent + fm.descent) / 2, p)
    return ImageProvider.fromBitmap(bmp)
}
