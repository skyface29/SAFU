package ru.student.safuhub.widget

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import ru.student.safuhub.App
import ru.student.safuhub.data.FileService
import ru.student.safuhub.feature.files.Thumbs
import ru.student.safuhub.system.rememberMediaPicker
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.RowIcon
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import kotlin.math.roundToInt

// MARK: - Фон «прозрачного» виджета
// Скриншот пустого рабочего стола → рамка размера виджета → двигаешь её на место виджета → «Сохранить».
// Виджет «Пары · Прозрачный» рисует этот кусок обоев фоном и выглядит прозрачным.

object WidgetWallpaper {
    /** Размеры виджета: "small", "medium", "large" */
    fun key(family: String) = "wall.$family"

    private fun file(family: String) = File(FileService.support, key(family) + ".jpg")
    private val cache = HashMap<String, Bitmap?>()

    /** Приложение: сохранить фон для размера виджета */
    fun save(image: Bitmap, family: String): Boolean {
        val small = downscale(image, 700)
        val ok = try { file(family).outputStream().use { small.compress(Bitmap.CompressFormat.JPEG, 72, it) } } catch (_: Throwable) { false }
        synchronized(cache) { cache.remove(family) }
        return ok
    }

    fun remove(family: String) {
        file(family).delete()
        synchronized(cache) { cache.remove(family) }
    }

    /** Виджет и приложение: сохранённый фон (null — не задан) */
    fun load(family: String): Bitmap? = synchronized(cache) {
        cache.getOrPut(family) { file(family).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.absolutePath) } }
    }

    private fun downscale(b: Bitmap, maxSide: Int): Bitmap {
        val side = maxOf(b.width, b.height)
        if (side <= maxSide) return b
        val k = maxSide.toFloat() / side
        return Bitmap.createScaledBitmap(b, (b.width * k).roundToInt().coerceAtLeast(1), (b.height * k).roundToInt().coerceAtLeast(1), true)
    }
}

@Composable
fun WidgetWallpaperScreen() {
    var image by remember { mutableStateOf<Bitmap?>(null) }
    var family by remember { mutableStateOf("small") }
    /** Центр рамки в долях скриншота (0…1) */
    var cx by remember { mutableFloatStateOf(0.28f) }
    var cy by remember { mutableFloatStateOf(0.30f) }
    var scale by remember { mutableFloatStateOf(1f) }
    var result by remember { mutableStateOf<String?>(null) }
    val conf = LocalConfiguration.current
    val screenW = conf.screenWidthDp.toFloat()
    val screenH = conf.screenHeightDp.toFloat()

    // примерный размер виджета в точках экрана; ползунок подгоняет точно
    val small = screenW * 0.402f
    val (ww, wh) = when (family) {
        "medium" -> screenW * 0.86f to small
        "large" -> screenW * 0.86f to small * 2.24f
        else -> small to small
    }
    // рамка в долях скриншота (скриншот = весь экран)
    val fw = ww * scale / screenW
    val fh = wh * scale / screenH
    val familyTitle = when (family) { "medium" -> "среднего"; "large" -> "большого"; else -> "маленького" }

    val picker = rememberMediaPicker(multiple = false) { uris ->
        uris.firstOrNull()?.let { u -> load(u)?.let { image = it; result = null } }
    }

    fun save(img: Bitmap) {
        val pw = img.width
        val ph = img.height
        val x = ((cx - fw / 2) * pw).roundToInt().coerceIn(0, pw - 1)
        val y = ((cy - fh / 2) * ph).roundToInt().coerceIn(0, ph - 1)
        val w = (fw * pw).roundToInt().coerceIn(1, pw - x)
        val h = (fh * ph).roundToInt().coerceIn(1, ph - y)
        val piece = Bitmap.createBitmap(img, x, y, w, h)
        val ok = WidgetWallpaper.save(piece, family)
        Widgets.updateAll()
        Haptics.success()
        result = if (ok) "Сохранено. Виджет «Пары · Прозрачный» $familyTitle размера обновится через несколько секунд."
        else "Не удалось сохранить картинку для виджета."
    }

    FormScreen("Прозрачный виджет") {
        FormSection("Как сделать") {
            for ((i, t) in listOf(
                "Уйди на пустую страницу рабочего стола и сделай скриншот (без иконок).",
                "Выбери скриншот ниже и размер виджета.",
                "Двигай рамку туда, где стоит виджет, ползунком подгони размер → «Сохранить».",
                "Добавь виджет «Пары · Прозрачный»: удержи пустое место на рабочем столе → «Виджеты» → САФУ.",
            ).withIndex()) row {
                RowIcon("${i + 1}.circle.fill", null)
                Text(t, style = ft(Ts.body), color = Ios.label)
            }
        }

        FormSection {
            button(if (image == null) "Выбрать скриншот" else "Другой скриншот", "photo.on.rectangle") { picker.images() }
            segmented(listOf("small" to "Маленький", "medium" to "Средний", "large" to "Большой"), family, { family = it; result = null })
        }

        image?.let { img ->
            FormSection("Совмести рамку с местом виджета", footer = result) {
                raw {
                    Editor(img.asImageBitmap(), cx, cy, fw, fh) { nx, ny ->
                        cx = nx.coerceIn(fw / 2, 1 - fw / 2)
                        cy = ny.coerceIn(fh / 2, 1 - fh / 2)
                    }
                }
                slider(scale, { scale = it }, 0.85f..1.15f, leading = "minus.magnifyingglass", trailing = "plus.magnifyingglass")
                button("Сохранить для $familyTitle виджета", "checkmark.circle.fill") { save(img) }
            }
        }

        FormSection(footer = "Для каждого размера — свой кусок обоев. Сменил обои или переставил виджет — сделай заново.") {
            button("Убрать фон $familyTitle виджета", "trash", destructive = true) {
                WidgetWallpaper.remove(family)
                Widgets.updateAll()
                result = "Фон $familyTitle виджета убран"
            }
        }
    }
}

private fun load(uri: Uri): Bitmap? = try {
    val tmp = File(App.ctx.cacheDir, "wall-src")
    App.ctx.contentResolver.openInputStream(uri)?.use { input -> tmp.outputStream().use { input.copyTo(it) } }
    val b = Thumbs.decodeSampled(tmp, 2400)
    tmp.delete()
    b
} catch (_: Throwable) { null }

@Composable
private fun Editor(img: ImageBitmap, cx: Float, cy: Float, fw: Float, fh: Float, onMove: (Float, Float) -> Unit) {
    val aspect = img.height.toFloat() / maxOf(img.width, 1)
    var start by remember { mutableStateOf<Offset?>(null) }
    val curX by rememberUpdatedState(cx)
    val curY by rememberUpdatedState(cy)
    val move by rememberUpdatedState(onMove)
    BoxWithConstraints(Modifier.fillMaxWidth().padding(8.dp).aspectRatio(1 / aspect)) {
        val wPx = constraints.maxWidth.toFloat()
        val hPx = wPx * aspect
        Canvas(Modifier.fillMaxWidth().aspectRatio(1 / aspect).pointerInput(fw, fh) {
            detectDragGestures(
                onDragStart = { start = Offset(curX, curY) },
                onDragEnd = { start = null },
                onDragCancel = { start = null },
            ) { change, drag ->
                change.consume()
                val s = start ?: Offset(curX, curY)
                val n = Offset(s.x + drag.x / wPx, s.y + drag.y / hPx)
                start = n
                move(n.x, n.y)
            }
        }) {
            val dst = IntSize(size.width.roundToInt(), size.height.roundToInt())
            drawImage(img, IntOffset.Zero, IntSize(img.width, img.height), IntOffset.Zero, dst)
            drawRect(Color.Black.copy(alpha = 0.35f))
            val w = fw * size.width
            val h = fh * size.height
            val left = cx * size.width - w / 2
            val top = cy * size.height - h / 2
            val r = CornerRadius(w * 0.13f)
            // рамка виджета: внутри — без затемнения
            val path = Path().apply { addRoundRect(RoundRect(left, top, left + w, top + h, r)) }
            clipPath(path) { drawImage(img, IntOffset.Zero, IntSize(img.width, img.height), IntOffset.Zero, dst) }
            drawRoundRect(Color.White, Offset(left, top), Size(w, h), r, style = Stroke(2.dp.toPx()))
        }
    }
}
