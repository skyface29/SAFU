package ru.student.safuhub.system

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import ru.student.safuhub.App
import ru.student.safuhub.ui.kit.Dialogs
import java.io.File

fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/** Сканер документов (как VNDocumentCameraViewController): страницы → один PDF */
class DocScanner(private val start: () -> Unit) {
    fun open() = start()
}

@Composable
fun rememberDocScanner(onResult: (File?) -> Unit): DocScanner {
    val ctx = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        if (r.resultCode != Activity.RESULT_OK) { onResult(null); return@rememberLauncherForActivityResult }
        val res = GmsDocumentScanningResult.fromActivityResultIntent(r.data)
        val pdf = res?.pdf?.uri
        if (pdf == null) { onResult(null); return@rememberLauncherForActivityResult }
        val out = File(App.ctx.cacheDir, "scan-${System.currentTimeMillis()}.pdf")
        try {
            App.ctx.contentResolver.openInputStream(pdf)?.use { input -> out.outputStream().use { input.copyTo(it) } }
            onResult(out)
        } catch (_: Throwable) { onResult(null) }
    }
    return remember(launcher) {
        DocScanner {
            val activity = ctx.findActivity() ?: return@DocScanner
            val options = GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setPageLimit(50)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                .build()
            GmsDocumentScanning.getClient(options).getStartScanIntent(activity)
                .addOnSuccessListener { sender -> launcher.launch(IntentSenderRequest.Builder(sender).build()) }
                .addOnFailureListener {
                    Dialogs.alert("Сканер недоступен", "Для сканера документов нужны сервисы Google Play. Можно сфотографировать страницы камерой.")
                }
        }
    }
}
