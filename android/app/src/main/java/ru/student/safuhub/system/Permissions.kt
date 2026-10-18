package ru.student.safuhub.system

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.result.ActivityResultLauncher
import androidx.core.content.ContextCompat
import ru.student.safuhub.App
import ru.student.safuhub.core.Defaults

/**
 * Запрос разрешений из любого места приложения (как requestAuthorization в iOS).
 * Активити регистрирует лаунчер при создании.
 */
object Permissions {
    internal var launcher: ActivityResultLauncher<Array<String>>? = null
    private val pending = ArrayDeque<Pair<Array<String>, (Boolean) -> Unit>>()
    private var inFlight: Pair<Array<String>, (Boolean) -> Unit>? = null

    fun has(permission: String): Boolean =
        ContextCompat.checkSelfPermission(App.ctx, permission) == PackageManager.PERMISSION_GRANTED

    /** Уже отказывали дважды — система больше не покажет запрос */
    fun wasDenied(permission: String): Boolean = Defaults.int("perm.denied.$permission") >= 2

    fun request(permission: String, done: (Boolean) -> Unit = {}) = requestAll(arrayOf(permission), done)

    fun requestAll(perms: Array<String>, done: (Boolean) -> Unit = {}) {
        val missing = perms.filter { !has(it) }.toTypedArray()
        if (missing.isEmpty()) { done(true); return }
        pending.addLast(missing to done)
        next()
    }

    private fun next() {
        if (inFlight != null) return
        val l = launcher ?: return
        val item = pending.removeFirstOrNull() ?: return
        inFlight = item
        try { l.launch(item.first) } catch (_: Throwable) { inFlight = null; item.second(false); next() }
    }

    internal fun onResult(result: Map<String, Boolean>) {
        val item = inFlight
        inFlight = null
        val ok = result.isNotEmpty() && result.values.all { it }
        for ((p, g) in result) if (!g) Defaults.set("perm.denied.$p", Defaults.int("perm.denied.$p") + 1)
        item?.second?.invoke(ok)
        next()
    }

    /** Открыть настройки приложения (если разрешение запрещено навсегда) */
    fun openAppSettings() {
        val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + App.ctx.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { App.ctx.startActivity(i) } catch (_: Throwable) {}
    }

    fun openNotificationSettings() {
        val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, App.ctx.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { App.ctx.startActivity(i) } catch (_: Throwable) { openAppSettings() }
    }

    /** Разрешение на уведомления (Android 13+) */
    fun requestNotifications(done: (Boolean) -> Unit = {}) {
        if (android.os.Build.VERSION.SDK_INT >= 33) request(android.Manifest.permission.POST_NOTIFICATIONS, done) else done(true)
    }
}
