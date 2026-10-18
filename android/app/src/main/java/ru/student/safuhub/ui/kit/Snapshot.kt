package ru.student.safuhub.ui.kit

import android.graphics.Bitmap
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.student.safuhub.App
import java.io.File

// MARK: - Картинка из вью (как ImageRenderer)

/** Содержимое рисуется и одновременно записывается в слой — из него потом берётся картинка */
fun Modifier.recordInto(layer: GraphicsLayer): Modifier = drawWithContent {
    layer.record { this@drawWithContent.drawContent() }
    drawLayer(layer)
}

object Snapshots {
    /** Снимок слоя в PNG во временной папке (для «Поделиться») */
    suspend fun png(layer: GraphicsLayer, name: String): File? {
        val img: ImageBitmap = try { layer.toImageBitmap() } catch (_: Throwable) { return null }
        return withContext(Dispatchers.IO) {
            try {
                val dir = File(App.ctx.cacheDir, "share").apply { mkdirs() }
                val f = File(dir, name)
                f.outputStream().use { img.asAndroidBitmap().copy(Bitmap.Config.ARGB_8888, false).compress(Bitmap.CompressFormat.PNG, 100, it) }
                f
            } catch (_: Throwable) { null }
        }
    }
}
