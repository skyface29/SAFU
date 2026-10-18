package ru.student.safuhub.system

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.ActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import ru.student.safuhub.App
import java.io.File

/** Камера: снимок во временный файл (как UIImagePickerController) */
class CameraCapture(private val launch: (Uri) -> Unit, private val fileHolder: Array<File?>) {
    fun open() {
        val dir = File(App.ctx.cacheDir, "camera").apply { mkdirs() }
        val f = File(dir, "shot-${System.currentTimeMillis()}.jpg")
        fileHolder[0] = f
        val uri = FileProvider.getUriForFile(App.ctx, App.ctx.packageName + ".files", f)
        try { launch(uri) } catch (_: Throwable) { fileHolder[0] = null }
    }
}

@Composable
fun rememberCamera(onResult: (File?) -> Unit): CameraCapture {
    val holder = remember { arrayOfNulls<File>(1) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = holder[0]
        holder[0] = null
        onResult(if (ok && f != null && f.exists() && f.length() > 0) f else null)
    }
    return remember(launcher) { CameraCapture({ launcher.launch(it) }, holder) }
}

/** Выбор файлов (UIDocumentPicker) */
class FilePicker(private val launch: (Array<String>) -> Unit) {
    fun open(types: Array<String> = arrayOf("*/*")) = try { launch(types) } catch (_: Throwable) {}
}

@Composable
fun rememberFilePicker(multiple: Boolean = true, onResult: (List<Uri>) -> Unit): FilePicker {
    val launcher = if (multiple) {
        rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { onResult(it) }
    } else {
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { onResult(listOfNotNull(it)) }
    }
    return remember(launcher) { FilePicker { t -> @Suppress("UNCHECKED_CAST") (launcher as androidx.activity.result.ActivityResultLauncher<Array<String>>).launch(t) } }
}

/** Выбор фото и видео из галереи (PhotosPicker) */
class MediaPicker(private val launch: (PickVisualMediaRequest) -> Unit) {
    fun images() = launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    fun any() = launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
}

@Composable
fun rememberMediaPicker(multiple: Boolean = true, onResult: (List<Uri>) -> Unit): MediaPicker {
    val launcher = if (multiple) {
        rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(30)) { onResult(it) }
    } else {
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { onResult(listOfNotNull(it)) }
    }
    return remember(launcher) { MediaPicker { r -> launcher.launch(r) } }
}

/** Сохранить файл через системный диалог (в «Загрузки», на диск и т.п.) */
class SaveAs(private val launch: (String) -> Unit) {
    var source: File? = null
    fun save(file: File) {
        source = file
        try { launch(file.name) } catch (_: Throwable) {}
    }
}

@Composable
fun rememberSaveAs(mime: String = "application/octet-stream", done: (Boolean) -> Unit = {}): SaveAs {
    val ctx = LocalContext.current
    val holder = remember { arrayOfNulls<SaveAs>(1) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(mime)) { uri ->
        val src = holder[0]?.source
        if (uri == null || src == null) { done(false); return@rememberLauncherForActivityResult }
        val ok = try {
            ctx.contentResolver.openOutputStream(uri)?.use { out -> src.inputStream().use { it.copyTo(out) } }
            true
        } catch (_: Throwable) { false }
        done(ok)
    }
    return remember(launcher) { SaveAs { launcher.launch(it) }.also { holder[0] = it } }
}

/** Запуск активити с ответом (IntentSender — сканер документов) */
@Composable
fun rememberIntentSender(onResult: (ActivityResult) -> Unit) =
    rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult(), onResult)

@Composable
fun rememberActivityResult(onResult: (ActivityResult) -> Unit) =
    rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult(), onResult)

fun resultOk(r: ActivityResult) = r.resultCode == Activity.RESULT_OK

fun viewIntent(uri: Uri, mime: String) = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

fun senderRequest(sender: android.content.IntentSender) = IntentSenderRequest.Builder(sender).build()
