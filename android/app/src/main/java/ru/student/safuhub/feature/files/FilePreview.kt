package ru.student.safuhub.feature.files

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.LruCache
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.FileItem
import ru.student.safuhub.data.FileService
import ru.student.safuhub.feature.web.CustomTabs
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.BarIcon
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.ProgressLabel
import ru.student.safuhub.ui.kit.ProminentButton
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.io.FileOutputStream
import java.time.Instant

// MARK: - Миниатюры (как QLThumbnailGenerator)

object Thumbs {
    private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    fun clear() = cache.evictAll()

    /** Уменьшенная картинка без распаковки полного снимка + поворот по EXIF */
    fun decodeSampled(f: File, side: Int): Bitmap? = try {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(f.absolutePath, o)
        var sample = 1
        while (o.outWidth / (sample * 2) >= side && o.outHeight / (sample * 2) >= side) sample *= 2
        val bmp = BitmapFactory.decodeFile(f.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
        bmp?.let { rotateByExif(f, it) }
    } catch (_: Throwable) { null }

    fun rotateByExif(f: File, bmp: Bitmap): Bitmap = try {
        val deg = when (ExifInterface(f.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        if (deg == 0f) bmp else {
            val m = android.graphics.Matrix().apply { postRotate(deg) }
            Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        }
    } catch (_: Throwable) { bmp }

    fun pdfPage(f: File, side: Int, page: Int = 0): Bitmap? = try {
        ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
            PdfRenderer(pfd).use { r ->
                if (r.pageCount == 0) return null
                r.openPage(page.coerceIn(0, r.pageCount - 1)).use { p ->
                    val k = side.toFloat() / maxOf(p.width, p.height)
                    val bmp = Bitmap.createBitmap((p.width * k).toInt().coerceAtLeast(1), (p.height * k).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                    bmp.eraseColor(android.graphics.Color.WHITE)
                    p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bmp
                }
            }
        }
    } catch (_: Throwable) { null }

    fun video(f: File, side: Int): Bitmap? = try {
        val r = MediaMetadataRetriever()
        r.setDataSource(f.absolutePath)
        val frame = r.getFrameAtTime(1_000_000)
        r.release()
        frame?.let { Bitmap.createScaledBitmap(it, side, (side * it.height / it.width.coerceAtLeast(1)).coerceAtLeast(1), true) }
    } catch (_: Throwable) { null }

    suspend fun load(f: File, side: Int): Bitmap? {
        val key = "${f.absolutePath}|${f.lastModified()}|$side"
        cache.get(key)?.let { return it }
        val bmp = withContext(Dispatchers.IO) {
            when {
                FileService.isImage(f) -> decodeSampled(f, side)
                FileService.isPdf(f) -> pdfPage(f, side)
                FileService.isMovie(f) -> video(f, side)
                else -> null
            }
        } ?: return null
        cache.put(key, bmp)
        return bmp
    }
}

@Composable
fun rememberThumb(f: File?, side: Int): ImageBitmap? {
    val v by produceState<ImageBitmap?>(null, f?.absolutePath, f?.lastModified(), side) {
        value = f?.let { Thumbs.load(it, side)?.asImageBitmap() }
    }
    return v
}

// MARK: - PDF из картинок (скан, фото доски)

object PdfMaker {
    /** Страницы A4, картинка вписана по центру */
    fun fromImages(images: List<File>, out: File, maxSide: Int = 2000): Boolean = try {
        val doc = PdfDocument()
        val pw = 595
        val ph = 842
        images.forEachIndexed { i, f ->
            val bmp = Thumbs.decodeSampled(f, maxSide) ?: return@forEachIndexed
            val page = doc.startPage(PdfDocument.PageInfo.Builder(pw, ph, i + 1).create())
            val scale = minOf(pw.toFloat() / bmp.width, ph.toFloat() / bmp.height)
            val w = bmp.width * scale
            val h = bmp.height * scale
            val dst = android.graphics.RectF((pw - w) / 2, (ph - h) / 2, (pw + w) / 2, (ph + h) / 2)
            page.canvas.drawBitmap(bmp, null, dst, Paint(Paint.FILTER_BITMAP_FLAG))
            doc.finishPage(page)
            bmp.recycle()
        }
        FileOutputStream(out).use { doc.writeTo(it) }
        doc.close()
        true
    } catch (_: Throwable) { false }

    fun fromBitmaps(bitmaps: List<Bitmap>, out: File): Boolean = try {
        val doc = PdfDocument()
        bitmaps.forEachIndexed { i, bmp ->
            val page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, i + 1).create())
            val scale = minOf(595f / bmp.width, 842f / bmp.height)
            val w = bmp.width * scale
            val h = bmp.height * scale
            val c: Canvas = page.canvas
            c.drawBitmap(bmp, null, android.graphics.RectF((595 - w) / 2, (842 - h) / 2, (595 + w) / 2, (842 + h) / 2), Paint(Paint.FILTER_BITMAP_FLAG))
            doc.finishPage(page)
        }
        FileOutputStream(out).use { doc.writeTo(it) }
        doc.close()
        true
    } catch (_: Throwable) { false }
}

// MARK: - Просмотр файла (как QuickLook)

@Composable
fun FilePreviewSheet(file: File) {
    DoneSheet { FilePreview(file) }
}

@Composable
fun FilePreview(file: File) {
    val ctx = LocalContext.current
    Screen(file.nameWithoutExtension, scroll = false, background = { Box(Modifier.fillMaxSize().background(Ios.background)) },
        trailing = { BarIcon("square.and.arrow.up") { Share.files(ctx, listOf(file)) } }) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                !file.exists() -> Unsupported(file, "Файл не найден")
                FileService.isImage(file) -> ZoomableImage(file)
                FileService.isPdf(file) -> PdfPages(file)
                FileService.isHtml(file) -> HtmlPreview(file)
                FileService.isText(file) -> TextPreview(file)
                FileService.isMovie(file) || FileService.isAudio(file) -> MediaPreview(file)
                else -> Unsupported(file, null)
            }
        }
    }
}

@Composable
private fun Unsupported(file: File, error: String?) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically)) {
        SfGradientIcon(FileService.icon(FileItem(file, false, file.length(), Instant.ofEpochMilli(file.lastModified()))), size = 64.dp)
        Text(file.name, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, textAlign = TextAlign.Center)
        Text(error ?: FileService.byteCount(file.length()), style = ft(Ts.subheadline), color = Ios.secondaryLabel)
        if (error == null) {
            ProminentButton("Открыть в другом приложении", "arrow.up.forward.app", Modifier.padding(horizontal = 24.dp)) {
                Haptics.tap()
                Share.open(ctx, file)
            }
        }
    }
}

/** Картинка: сведение пальцев — увеличить, двойное касание — ×2 */
@Composable
fun ZoomableImage(file: File) {
    val img = rememberThumb(file, 2400)
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    Box(Modifier.fillMaxSize().background(Color.Black)
        .pointerInput(Unit) {
            detectTapGestures(onDoubleTap = {
                if (scale > 1.05f) { scale = 1f; offset = Offset.Zero } else scale = 2.5f
            })
        }
        .pointerInput(Unit) {
            detectTransformGestures { _, pan, zoom, _ ->
                scale = (scale * zoom).coerceIn(1f, 6f)
                offset = if (scale <= 1f) Offset.Zero else offset + pan
            }
        }, contentAlignment = Alignment.Center) {
        if (img == null) ProgressLabel("Открываю…")
        else Image(img, null, Modifier.fillMaxSize().graphicsLayer {
            scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y
        }, contentScale = ContentScale.Fit)
    }
}

@Composable
private fun PdfPages(file: File) {
    val count by produceState(-1, file) {
        value = withContext(Dispatchers.IO) {
            try {
                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd -> PdfRenderer(pfd).use { it.pageCount } }
            } catch (_: Throwable) { 0 }
        }
    }
    when {
        count < 0 -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { ProgressLabel("Открываю…") }
        count == 0 -> Unsupported(file, null)
        else -> LazyColumn(Modifier.fillMaxSize().background(Ios.secondaryBackground), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items((0 until count).toList()) { i ->
                val bmp by produceState<ImageBitmap?>(null, file, i) {
                    value = withContext(Dispatchers.IO) { Thumbs.pdfPage(file, 1600, i)?.asImageBitmap() }
                }
                Box(Modifier.fillMaxWidth().padding(horizontal = 10.dp).aspectRatio(bmp?.let { it.width.toFloat() / it.height } ?: 0.707f)
                    .background(Color.White)) {
                    bmp?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
                }
            }
        }
    }
}

@Composable
private fun TextPreview(file: File) {
    val text by produceState<String?>(null, file) {
        value = withContext(Dispatchers.IO) { try { file.readText().take(400_000) } catch (_: Throwable) { "" } }
    }
    val code = file.extension.lowercase() !in listOf("txt", "md", "rtf", "log")
    SelectionContainer {
        Text(text ?: "", style = ft(if (code) 13f else Ts.body, mono = code).let { if (code) it.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace) else it },
            color = Ios.label, modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .let { if (code) it.horizontalScroll(rememberScrollState()) else it }.padding(16.dp))
    }
}

/** Где остановился в каждом HTML: место на странице в её собственных точках (без масштаба).
 *  Ключ — папка и имя файла: полный путь после переноса или восстановления копии меняется */
object HtmlPlaces {
    private const val KEY = "files.htmlPlace.v1"
    private fun id(f: File) = (f.parentFile?.name ?: "") + "/" + f.name

    fun get(f: File): Float? = (Defaults.dictionary(KEY)?.get(id(f)) as? String)?.substringBefore('|')?.toFloatOrNull()

    fun put(f: File, y: Float) {
        val all = HashMap<String, Any>(Defaults.dictionary(KEY) ?: emptyMap())
        all[id(f)] = "$y|${System.currentTimeMillis()}"
        // помним последние 200 файлов
        if (all.size > 200) all.entries.sortedBy { (it.value as? String)?.substringAfter('|')?.toLongOrNull() ?: 0L }
            .take(all.size - 200).map { it.key }.forEach { all.remove(it) }
        Defaults.set(KEY, all)
    }
}

/** HTML (решебники, сохранённые страницы) — страницей, как в браузере, с работающими кнопками.
 *  Открывается там, где её оставили; если система выгрузила страницу в фоне — загружается на то же место */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun HtmlPreview(file: File) {
    // страницу выгрузили (у WebView умер процесс отрисовки) — создаём новую, номер её пересоздаёт
    var generation by remember(file) { mutableIntStateOf(0) }
    // место в точках страницы; < 0 — ещё не знаем
    val place = remember(file) { floatArrayOf(HtmlPlaces.get(file) ?: -1f) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner, file) {
        val save = { if (place[0] >= 0) HtmlPlaces.put(file, place[0]) }
        // уходит в фон — запоминаем и на случай, если система закроет приложение
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_PAUSE) save() }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs); save() }
    }
    key(generation) {
        AndroidView({ c ->
            WebView(c).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = true
                settings.builtInZoomControls = true
                settings.displayZoomControls = false
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                // пока возвращаемся на место, прыжки страницы не запоминаем
                var restoring = place[0] > 0
                setOnScrollChangeListener { v, _, y, _, _ ->
                    val s = (v as WebView).scale
                    if (!restoring && s > 0) place[0] = y / s
                }
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                        val u = req.url
                        val scheme = u.scheme?.lowercase()
                        // сама страница, якоря, соседние файлы и окна внутри страницы
                        if (scheme == "file" || scheme == "about" || scheme == "data" || scheme == "blob" || !req.isForMainFrame) return false
                        // сайт — во встроенном браузере; почта, телефон и другие приложения — только по нажатию
                        if (scheme == "http" || scheme == "https") CustomTabs.open(view.context, u.toString())
                        else if (req.hasGesture()) Share.url(view.context, u.toString())
                        return true
                    }

                    override fun onPageFinished(view: WebView, url: String?) {
                        if (!restoring) return
                        // картинки догружаются уже после загрузки, и страница ещё растёт — ждём до трёх секунд
                        fun attempt(n: Int) {
                            val target = (place[0] * view.scale).toInt()
                            val max = ((view.contentHeight * view.scale).toInt() - view.height).coerceAtLeast(0)
                            if (target <= max || n >= 12) {
                                view.scrollTo(0, target.coerceIn(0, max))
                                restoring = false
                            } else view.postDelayed({ attempt(n + 1) }, 250)
                        }
                        attempt(0)
                    }

                    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                        // этим WebView пользоваться больше нельзя — Compose уберёт его и создаст новый на том же месте
                        generation++
                        return true
                    }
                }
                loadUrl(Uri.fromFile(file).toString())
            }
        }, Modifier.fillMaxSize(), onRelease = { it.destroy() })
    }
}

@Composable
private fun MediaPreview(file: File) {
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        AndroidView({ c ->
            VideoView(c).apply {
                val mc = MediaController(c)
                mc.setAnchorView(this)
                setMediaController(mc)
                setVideoPath(file.absolutePath)
                setOnPreparedListener { it.isLooping = false; start(); mc.show(3000) }
            }
        }, Modifier.fillMaxWidth(), onRelease = { it.stopPlayback() })
    }
}
