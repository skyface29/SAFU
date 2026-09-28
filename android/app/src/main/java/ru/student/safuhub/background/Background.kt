package ru.student.safuhub.background

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.SharedSchedule
import ru.student.safuhub.feature.fx.Celebrations
import ru.student.safuhub.feature.mail.MailWatch
import ru.student.safuhub.feature.wake.WakePlanner
import ru.student.safuhub.system.BusLive
import ru.student.safuhub.system.LiveLesson
import ru.student.safuhub.system.Notify
import ru.student.safuhub.widget.Widgets
import java.util.concurrent.TimeUnit

/**
 * Фоновое обновление (как BGAppRefreshTask): расписание, замены, уведомление о паре,
 * автобус, почта и виджеты — даже когда приложение закрыто.
 */
object BackgroundRefresh {
    private const val periodic = "ru.student.safuhub.refresh"
    private const val once = "ru.student.safuhub.refresh.once"

    /** Периодически (не чаще раза в 20–30 минут — ограничение Android) и разово через 20 минут */
    fun schedule(ctx: Context) {
        val wm = try { WorkManager.getInstance(ctx) } catch (_: Throwable) { return }
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        wm.enqueueUniquePeriodicWork(periodic, ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES).setConstraints(net).build())
        wm.enqueueUniqueWork(once, ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<RefreshWorker>().setInitialDelay(20, TimeUnit.MINUTES).setConstraints(net).build())
    }

    suspend fun run(ctx: Context) {
        ScheduleStore.backgroundSync()   // замены и отмены — уведомлением, даже если приложение закрыто
        val data = SharedSchedule.load()
        try { Celebrations.scheduleNotifications(data) } catch (_: Throwable) {}
        try { LiveLesson.update(data) } catch (_: Throwable) {}
        try { BusLive.auto(data) } catch (_: Throwable) {}
        try { MailWatch.checkIfEnabled() } catch (_: Throwable) {}
        try { Widgets.updateAll(ctx) } catch (_: Throwable) {}
        Defaults.flush()
    }
}

class RefreshWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        Defaults.init(applicationContext)
        return try {
            BackgroundRefresh.run(applicationContext)
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}

/** После перезагрузки, обновления приложения или смены времени — заново заводим все напоминания */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Defaults.init(context)
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            try {
                Notify.rearmAll(context)
                val data = SharedSchedule.load()
                try { WakePlanner.schedule(data) } catch (_: Throwable) {}
                try { LiveLesson.update(data) } catch (_: Throwable) {}
                try { BusLive.auto(data) } catch (_: Throwable) {}
                try { Widgets.updateAll(context) } catch (_: Throwable) {}
                BackgroundRefresh.schedule(context)
            } finally {
                pending.finish()
            }
        }
    }
}
