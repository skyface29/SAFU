package ru.student.safuhub.system

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.serialization.Serializable
import ru.student.safuhub.App
import ru.student.safuhub.MainActivity
import ru.student.safuhub.R
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.Defaults
import java.time.Instant

/**
 * Локальные уведомления по времени (как UNUserNotificationCenter):
 * запросы хранятся в настройках, будильник системы будит приёмник, тот показывает уведомление.
 */
object Notify {
    const val CH_GENERAL = "general"
    const val CH_PAIRS = "pairs"
    const val CH_CHANGES = "changes"
    const val CH_TASKS = "tasks"
    const val CH_MAIL = "mail"
    const val CH_LIVE = "live"
    const val CH_BUS = "bus"
    const val CH_ALARM = "alarm"
    const val CH_FUN = "fun"

    private const val storeKey = "notify.pending.v1"

    @Serializable
    data class Req(
        val id: String,
        val title: String,
        val body: String,
        val at: Long,
        val channel: String = CH_GENERAL,
        val extras: Map<String, String> = emptyMap(),
        val sound: Boolean = true,
    )

    fun createChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        fun ch(id: String, name: String, imp: Int, desc: String? = null, silent: Boolean = false) {
            val c = NotificationChannel(id, name, imp)
            if (desc != null) c.description = desc
            if (silent) c.setSound(null, null)
            nm.createNotificationChannel(c)
        }
        ch(CH_GENERAL, "Общие", NotificationManager.IMPORTANCE_DEFAULT)
        ch(CH_PAIRS, "Напоминания о парах", NotificationManager.IMPORTANCE_HIGH)
        ch(CH_CHANGES, "Замены и отмены пар", NotificationManager.IMPORTANCE_HIGH)
        ch(CH_TASKS, "Дедлайны", NotificationManager.IMPORTANCE_HIGH)
        ch(CH_MAIL, "Новые письма", NotificationManager.IMPORTANCE_HIGH)
        ch(CH_LIVE, "Текущая пара на экране блокировки", NotificationManager.IMPORTANCE_LOW, silent = true)
        ch(CH_BUS, "Автобус на экране блокировки", NotificationManager.IMPORTANCE_LOW, silent = true)
        ch(CH_ALARM, "Будильник к паре", NotificationManager.IMPORTANCE_HIGH)
        ch(CH_FUN, "Праздники и пасхалки", NotificationManager.IMPORTANCE_DEFAULT)
    }

    val permitted: Boolean
        get() = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(App.ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    // MARK: хранилище запросов

    private fun loadAll(): MutableMap<String, Req> {
        val raw = Defaults.dictionary(storeKey) ?: return mutableMapOf()
        val out = mutableMapOf<String, Req>()
        for ((k, v) in raw) {
            val s = v as? String ?: continue
            try { out[k] = AppJson.decodeFromString(Req.serializer(), s) } catch (_: Throwable) {}
        }
        return out
    }

    private fun saveAll(map: Map<String, Req>) {
        Defaults.set(storeKey, map.mapValues { AppJson.encodeToString(Req.serializer(), it.value) })
    }

    @Synchronized
    fun pendingIds(): List<String> = loadAll().keys.toList()

    @Synchronized
    fun pending(): List<Req> = loadAll().values.sortedBy { it.at }

    /** Запланировать (тот же id заменяет старое) */
    @Synchronized
    fun add(id: String, title: String, body: String, at: Instant, channel: String = CH_GENERAL,
            extras: Map<String, String> = emptyMap(), sound: Boolean = true) {
        val req = Req(id, title, body, at.toEpochMilli(), channel, extras, sound)
        val map = loadAll()
        map[id] = req
        saveAll(map)
        arm(App.ctx, req)
    }

    /** Показать через несколько секунд (UNTimeIntervalNotificationTrigger) */
    fun after(id: String, title: String, body: String, seconds: Double, channel: String = CH_GENERAL, extras: Map<String, String> = emptyMap()) =
        add(id, title, body, Instant.now().plusMillis((seconds * 1000).toLong().coerceAtLeast(1000)), channel, extras)

    @Synchronized
    fun remove(ids: Collection<String>) {
        if (ids.isEmpty()) return
        val map = loadAll()
        var changed = false
        for (id in ids) {
            map.remove(id)?.let { changed = true }
            disarm(App.ctx, id)
        }
        if (changed) saveAll(map)
    }

    fun removePrefix(prefix: String) = remove(pendingIds().filter { it.startsWith(prefix) })

    /** Убрать уже показанные уведомления */
    fun removeDelivered(ids: Collection<String>) {
        val nm = NotificationManagerCompat.from(App.ctx)
        for (id in ids) nm.cancel(id, 0)
    }

    /** После перезагрузки телефона — заново завести все будильники */
    @Synchronized
    fun rearmAll(ctx: Context) {
        val map = loadAll()
        val now = System.currentTimeMillis()
        val stale = map.values.filter { it.at < now - 10 * 60_000 }
        stale.forEach { map.remove(it.id) }
        if (stale.isNotEmpty()) saveAll(map)
        map.values.forEach { arm(ctx, it) }
    }

    private fun intentFor(ctx: Context, id: String): PendingIntent {
        val i = Intent(ctx, NotifyReceiver::class.java).setAction("ru.student.safuhub.NOTIFY")
            .setData(Uri.parse("safu-notify://" + Uri.encode(id)))
        return PendingIntent.getBroadcast(ctx, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun arm(ctx: Context, req: Req) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val pi = intentFor(ctx, req.id)
        val at = maxOf(req.at, System.currentTimeMillis() + 500)
        try {
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (_: Throwable) {
            am.set(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    private fun disarm(ctx: Context, id: String) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        am.cancel(intentFor(ctx, id))
    }

    /** Будильник сработал: показываем уведомление и забываем запрос */
    @Synchronized
    fun fire(ctx: Context, id: String) {
        val map = loadAll()
        val req = map.remove(id) ?: return
        saveAll(map)
        if (!NotifyHooks.shouldPresent(req)) return
        show(ctx, req.id, req.title, req.body, req.channel, req.extras, req.sound)
    }

    /** Показать сразу */
    fun show(ctx: Context, id: String, title: String, body: String, channel: String = CH_GENERAL,
             extras: Map<String, String> = emptyMap(), sound: Boolean = true, number: Int = 0) {
        if (!permitted) return
        val open = Intent(ctx, MainActivity::class.java).apply {
            action = "ru.student.safuhub.OPEN_NOTIFICATION"
            data = Uri.parse("safu-open://" + Uri.encode(id))
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            for ((k, v) in extras) putExtra(k, v)
        }
        val pi = PendingIntent.getActivity(ctx, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_stat_snowflake)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setColor(0xFF2873FA.toInt())
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .apply { if (!sound) setSilent(true) }
            // цифра на значке приложения (там, где лаунчер её показывает)
            .apply { if (number > 0) setNumber(number) }
            .build()
        try { NotificationManagerCompat.from(ctx).notify(id, 0, n) } catch (_: SecurityException) {}
    }
}

/** Приложение открыто: решаем, показывать ли баннер (как willPresent) */
object NotifyHooks {
    @Volatile var foreground = false
    var onForegroundFxEnd: (() -> Unit)? = null

    fun shouldPresent(req: Notify.Req): Boolean {
        if (req.id.startsWith("fx.end.") && foreground) {
            // приложение открыто — салют уже на экране, баннер не нужен
            onForegroundFxEnd?.invoke()
            return false
        }
        return true
    }
}

class NotifyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.data?.schemeSpecificPart?.removePrefix("//")?.let { Uri.decode(it) } ?: return
        Defaults.init(context)
        Notify.fire(context, id)
    }
}
