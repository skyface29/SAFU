package ru.student.safuhub.ui.kit

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import kotlinx.coroutines.delay
import ru.student.safuhub.App
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File

class AlertAction(val title: String, val role: Role = Role.DEFAULT, val action: () -> Unit = {}) {
    enum class Role { DEFAULT, CANCEL, DESTRUCTIVE, BOLD }
}

private class AlertRequest(
    val title: String?, val message: String?, val actions: List<AlertAction>, val sheet: Boolean,
    val field: FieldSpec? = null,
)

class FieldSpec(val placeholder: String, val initial: String, val keyboard: KeyboardType = KeyboardType.Text, val secure: Boolean = false,
                val onSubmit: (String) -> Unit)

/** Алерты, действия снизу (confirmationDialog) и всплывающие подсказки */
object Dialogs {
    private val queue = mutableStateOf<List<AlertRequest>>(emptyList())
    val toast = mutableStateOf<Pair<String, String?>?>(null)
    private var toastId = 0

    fun alert(title: String?, message: String? = null, vararg actions: AlertAction) {
        val list = if (actions.isEmpty()) listOf(AlertAction("OK", AlertAction.Role.BOLD)) else actions.toList()
        queue.value = queue.value + AlertRequest(title, message, list, sheet = false)
    }

    /** confirmationDialog: список действий снизу + «Отменить» */
    fun actionSheet(title: String?, message: String? = null, vararg actions: AlertAction) {
        queue.value = queue.value + AlertRequest(title, message, actions.toList(), sheet = true)
    }

    fun confirm(title: String, message: String? = null, button: String, destructive: Boolean = true, action: () -> Unit) {
        alert(title, message, AlertAction("Отмена", AlertAction.Role.CANCEL),
            AlertAction(button, if (destructive) AlertAction.Role.DESTRUCTIVE else AlertAction.Role.BOLD, action))
    }

    /** Алерт с полем ввода */
    fun prompt(title: String, message: String? = null, placeholder: String, initial: String = "", button: String = "Готово",
               keyboard: KeyboardType = KeyboardType.Text, secure: Boolean = false, onSubmit: (String) -> Unit) {
        queue.value = queue.value + AlertRequest(title, message,
            listOf(AlertAction("Отмена", AlertAction.Role.CANCEL), AlertAction(button, AlertAction.Role.BOLD)), sheet = false,
            field = FieldSpec(placeholder, initial, keyboard, secure, onSubmit))
    }

    fun showToast(text: String, icon: String? = null) {
        toastId++
        toast.value = text to icon
    }

    internal fun pop() { queue.value = queue.value.drop(1) }

    @Composable
    fun Layer() {
        val req = queue.value.firstOrNull()
        if (req != null) {
            if (req.sheet) ActionSheetView(req) else AlertView(req)
        }
        ToastView()
    }

    @Composable
    private fun AlertView(req: AlertRequest) {
        val dark = LocalDark.current
        var text by remember(req) { mutableStateOf(req.field?.initial ?: "") }
        Dialog(onDismissRequest = { pop(); req.actions.firstOrNull { it.role == AlertAction.Role.CANCEL }?.action?.invoke() },
            properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Column(
                Modifier.width(280.dp).clip(RoundedCornerShape(14.dp))
                    .background(if (dark) Color(0xFF2C2C2E) else Color(0xFFF2F2F2)),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 19.dp, bottom = 17.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (req.title != null) Text(req.title, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, textAlign = TextAlign.Center)
                    if (req.message != null) Text(req.message, style = ft(Ts.footnote), color = Ios.label, textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 3.dp))
                    if (req.field != null) {
                        IosTextField(text, { text = it }, req.field.placeholder,
                            Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(6.dp))
                                .background(if (dark) Color(0xFF1C1C1E) else Color.White).padding(horizontal = 8.dp, vertical = 7.dp),
                            style = ft(13f), keyboard = req.field.keyboard, secure = req.field.secure)
                    }
                }
                Divider()
                val horizontal = req.actions.size == 2
                if (horizontal) {
                    Row(Modifier.fillMaxWidth().height(44.dp)) {
                        req.actions.forEachIndexed { i, a ->
                            if (i > 0) Box(Modifier.width(0.5.dp).fillMaxSize().background(Ios.separator).weight(0.001f))
                            AlertButton(a, Modifier.weight(1f)) {
                                pop()
                                if (req.field != null && a.role != AlertAction.Role.CANCEL) req.field.onSubmit(text)
                                a.action()
                            }
                        }
                    }
                } else {
                    req.actions.forEachIndexed { i, a ->
                        if (i > 0) Divider()
                        AlertButton(a, Modifier.fillMaxWidth().height(44.dp)) {
                            pop()
                            if (req.field != null && a.role != AlertAction.Role.CANCEL) req.field.onSubmit(text)
                            a.action()
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun AlertButton(a: AlertAction, modifier: Modifier, onClick: () -> Unit) {
        Box(modifier.clickable { onClick() }, contentAlignment = Alignment.Center) {
            Text(a.title, style = ft(Ts.body, if (a.role == AlertAction.Role.BOLD || a.role == AlertAction.Role.CANCEL && false) FontWeight.SemiBold else FontWeight.Normal),
                color = if (a.role == AlertAction.Role.DESTRUCTIVE) Ios.red else Brand.color)
        }
    }

    @Composable
    private fun ActionSheetView(req: AlertRequest) {
        val dark = LocalDark.current
        val card = if (dark) Color(0xFF2C2C2E) else Color(0xFFF7F7F7)
        Dialog(onDismissRequest = { pop() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { pop() }, contentAlignment = Alignment.BottomCenter) {
                Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(8.dp)) {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(card)) {
                        if (req.title != null || req.message != null) {
                            Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                if (req.title != null) Text(req.title, style = ft(13f, FontWeight.SemiBold), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
                                if (req.message != null) Text(req.message, style = ft(13f), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
                            }
                            Divider()
                        }
                        req.actions.filter { it.role != AlertAction.Role.CANCEL }.forEachIndexed { i, a ->
                            if (i > 0) Divider()
                            Box(Modifier.fillMaxWidth().height(57.dp).clickable { pop(); a.action() }, contentAlignment = Alignment.Center) {
                                Text(a.title, style = ft(20f), color = if (a.role == AlertAction.Role.DESTRUCTIVE) Ios.red else Brand.color)
                            }
                        }
                    }
                    Box(Modifier.padding(top = 8.dp).fillMaxWidth().height(57.dp).clip(RoundedCornerShape(14.dp))
                        .background(if (dark) Color(0xFF2C2C2E) else Color.White)
                        .clickable { pop(); req.actions.firstOrNull { it.role == AlertAction.Role.CANCEL }?.action?.invoke() },
                        contentAlignment = Alignment.Center) {
                        Text(req.actions.firstOrNull { it.role == AlertAction.Role.CANCEL }?.title ?: "Отменить",
                            style = ft(20f, FontWeight.SemiBold), color = Brand.color)
                    }
                }
            }
        }
    }

    @Composable
    private fun ToastView() {
        val t = toast.value
        var shown by remember { mutableStateOf<Pair<String, String?>?>(null) }
        LaunchedEffect(t) {
            if (t != null) {
                shown = t
                delay(2200)
                if (toast.value === t) toast.value = null
            } else shown = null
        }
        Box(Modifier.fillMaxSize().navigationBarsPadding().padding(bottom = 96.dp), contentAlignment = Alignment.BottomCenter) {
            AnimatedVisibility(t != null, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                val s = shown ?: t
                if (s != null) {
                    Glass(20.dp) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (s.second != null) SfIcon(s.second!!, size = 17.dp, tint = Ios.label)
                            Text(s.first, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Буфер обмена и «Поделиться»

object Share {
    fun copy(text: String, sensitive: Boolean = false) {
        val cm = App.ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("САФУ", text)
        if (sensitive && android.os.Build.VERSION.SDK_INT >= 24) {
            clip.description.extras = android.os.PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
        }
        cm.setPrimaryClip(clip)
    }

    fun pasteText(): String? {
        val cm = App.ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        return cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(App.ctx)?.toString()
    }

    fun clearClipboard() {
        val cm = App.ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        try { if (android.os.Build.VERSION.SDK_INT >= 28) cm.clearPrimaryClip() else cm.setPrimaryClip(ClipData.newPlainText("", "")) } catch (_: Throwable) {}
    }

    fun text(ctx: Context, text: String, title: String? = null) {
        val i = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
            if (title != null) putExtra(Intent.EXTRA_SUBJECT, title)
        }
        ctx.startActivity(Intent.createChooser(i, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun uriFor(file: File): Uri = FileProvider.getUriForFile(App.ctx, App.ctx.packageName + ".files", file)

    fun files(ctx: Context, files: List<File>, mime: String? = null, text: String? = null) {
        if (files.isEmpty()) return
        val uris = ArrayList(files.map { uriFor(it) })
        val type = mime ?: if (files.size == 1) mimeOf(files[0]) else "*/*"
        val i = if (uris.size == 1) Intent(Intent.ACTION_SEND).apply { putExtra(Intent.EXTRA_STREAM, uris[0]) }
        else Intent(Intent.ACTION_SEND_MULTIPLE).apply { putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris) }
        i.type = type
        if (text != null) i.putExtra(Intent.EXTRA_TEXT, text)
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        i.clipData = ClipData.newRawUri("", uris[0]).also { c -> uris.drop(1).forEach { c.addItem(ClipData.Item(it)) } }
        ctx.startActivity(Intent.createChooser(i, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
    }

    fun open(ctx: Context, file: File) {
        val i = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uriFor(file), mimeOf(file))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try { ctx.startActivity(i) } catch (_: Throwable) { files(ctx, listOf(file)) }
    }

    fun url(ctx: Context, url: String) {
        try {
            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Throwable) {
            Dialogs.showToast("Не удалось открыть ссылку")
        }
    }

    fun mimeOf(f: File): String {
        val ext = f.extension.lowercase()
        return android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: when (ext) {
            "safubackup" -> "application/zip"
            "md" -> "text/markdown"
            else -> "application/octet-stream"
        }
    }
}
