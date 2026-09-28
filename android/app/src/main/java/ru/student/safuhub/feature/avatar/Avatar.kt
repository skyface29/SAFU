package ru.student.safuhub.feature.avatar

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.student.safuhub.App
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.RU
import ru.student.safuhub.data.FileService
import ru.student.safuhub.feature.files.Thumbs
import ru.student.safuhub.system.rememberCamera
import ru.student.safuhub.system.rememberMediaPicker
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.strokeBorder
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.ft
import java.io.File
import java.io.FileOutputStream

// MARK: - Свой аватар
// Фото обрезается по центру в квадрат 600×600 и хранится только на телефоне.

object Avatar {
    private val file: File get() = File(FileService.support, "avatar.jpg")
    private var cached: Pair<Int, ImageBitmap?>? = null

    fun image(rev: Int): ImageBitmap? {
        cached?.let { if (it.first == rev) return it.second }
        val img = if (file.exists()) BitmapFactory.decodeFile(file.absolutePath)?.asImageBitmap() else null
        cached = rev to img
        return img
    }

    fun save(src: Bitmap) {
        val side = minOf(src.width, src.height)
        val target = 600
        val out = Bitmap.createBitmap(target, target, Bitmap.Config.ARGB_8888)
        val scale = target.toFloat() / maxOf(side, 1)
        val w = src.width * scale
        val h = src.height * scale
        Canvas(out).drawBitmap(src, null, android.graphics.RectF((target - w) / 2, (target - h) / 2, (target + w) / 2, (target + h) / 2), Paint(Paint.FILTER_BITMAP_FLAG))
        try { FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.JPEG, 85, it) } } catch (_: Throwable) {}
        bump()
    }

    fun save(f: File) { Thumbs.decodeSampled(f, 1200)?.let { save(it) } }

    fun save(uri: Uri) {
        val tmp = File(App.ctx.cacheDir, "avatar-src")
        try {
            App.ctx.contentResolver.openInputStream(uri)?.use { input -> tmp.outputStream().use { input.copyTo(it) } }
            save(tmp)
        } catch (_: Throwable) {} finally { tmp.delete() }
    }

    fun remove() {
        file.delete()
        bump()
    }

    val exists: Boolean get() = file.exists()

    private fun bump() = Defaults.set("avatar.rev", Defaults.int("avatar.rev") + 1)
}

/** Круглый аватар: своё фото, иначе инициалы на цвете темы */
@Composable
fun AvatarView(size: Dp = 44.dp) {
    val rev = Defaults.int("avatar.rev")
    val name = Defaults.string("user.name") ?: ""
    val initials = name.split(" ").filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().toString() }.uppercase(RU)
    val img = Avatar.image(rev)
    Box(Modifier.size(size).clip(CircleShape).strokeBorder(Color.White.copy(alpha = 0.18f), 1.dp, CircleShape), contentAlignment = Alignment.Center) {
        if (img != null) Image(img, "Аватар", Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else {
            Box(Modifier.fillMaxSize().background(Brand.gradient))
            if (initials.isEmpty()) SfIcon("snowflake", size = size * 0.46f, tint = Color.White)
            else Text(initials, style = ft(size.value * 0.38f, FontWeight.Bold, Design.ROUNDED), color = Color.White)
        }
    }
}

/** Аватар с меню: выбрать фото, сфоткаться, убрать */
@Composable
fun AvatarEditor(size: Dp = 64.dp) {
    Defaults.int("avatar.rev")
    val picker = rememberMediaPicker(multiple = false) { uris -> uris.firstOrNull()?.let { Avatar.save(it); Haptics.success() } }
    val camera = rememberCamera { f -> if (f != null) { Avatar.save(f); Haptics.success() }; f?.delete() }
    Pressable({
        Haptics.tap()
        val actions = mutableListOf(
            AlertAction("Выбрать из фото") { picker.images() },
            AlertAction("Сфоткаться") { camera.open() },
        )
        if (Avatar.exists) actions.add(AlertAction("Убрать фото", AlertAction.Role.DESTRUCTIVE) { Avatar.remove() })
        actions.add(AlertAction("Отменить", AlertAction.Role.CANCEL))
        Dialogs.actionSheet("Аватар", null, *actions.toTypedArray())
    }) {
        Box(Modifier.size(size)) {
            AvatarView(size)
            Box(Modifier.align(Alignment.BottomEnd).size(size * 0.34f).clip(CircleShape).background(Ios.background).padding(2.dp)
                .clip(CircleShape).background(Brand.color), contentAlignment = Alignment.Center) {
                SfIcon("camera.fill", size = size * 0.17f, tint = Color.White)
            }
        }
    }
}
