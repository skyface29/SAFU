package ru.student.safuhub.system

import android.app.Activity
import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import ru.student.safuhub.App
import ru.student.safuhub.MainActivity
import ru.student.safuhub.R
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.feature.wake.WakePlan
import ru.student.safuhub.feature.wake.WakeSettings
import java.time.Instant

/**
 * Настоящий будильник (как AlarmKit на iOS 26): системный будильник Android
 * с полноэкранным звонком и кнопкой «Встаю».
 */
object WakeAlarms {
    private const val key = "wake.alarmIDs"
    const val EXTRA_TITLE = "title"
    private const val NOTIF_ID = 7401

    private fun pi(ctx: Context, index: Int, title: String?): PendingIntent {
        val i = Intent(ctx, WakeAlarmReceiver::class.java).setAction("ru.student.safuhub.WAKE_ALARM.$index")
        if (title != null) i.putExtra(EXTRA_TITLE, title)
        return PendingIntent.getBroadcast(ctx, 7500 + index, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun sync(plans: List<WakePlan>) {
        val ctx = App.ctx
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        for (i in 0 until 3) am.cancel(pi(ctx, i, null))
        Defaults.set(key, emptyList<String>())
        if (!WakeSettings.enabled || !WakeSettings.realAlarm) return
        val ids = mutableListOf<String>()
        for ((i, p) in plans.filter { it.wake > Instant.now() }.take(3).withIndex()) {
            val title = "Подъём — пара в ${Fmt.format(p.pair.start, "H:mm")}"
            val show = PendingIntent.getActivity(ctx, 7600 + i, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            try {
                am.setAlarmClock(AlarmManager.AlarmClockInfo(p.wake.toEpochMilli(), show), pi(ctx, i, title))
                ids.add(p.wake.epochSecond.toString())
            } catch (_: SecurityException) {}
        }
        Defaults.set(key, ids)
    }

    /** Будильник сработал: полноэкранное уведомление и звонок */
    fun ring(ctx: Context, title: String) {
        val full = PendingIntent.getActivity(ctx, 7700, Intent(ctx, AlarmActivity::class.java)
            .putExtra(EXTRA_TITLE, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getBroadcast(ctx, 7701, Intent(ctx, WakeAlarmReceiver::class.java).setAction("ru.student.safuhub.WAKE_STOP"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, Notify.CH_ALARM)
            .setSmallIcon(R.drawable.ic_stat_snowflake)
            .setContentTitle(title)
            .setContentText("Пора вставать ☀️")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(full, true)
            .setContentIntent(full)
            .addAction(0, "Встаю", stop)
            .setOngoing(true)
            .setColor(0xFFFF9500.toInt())
            .build()
        try { NotificationManagerCompat.from(ctx).notify(NOTIF_ID, n) } catch (_: SecurityException) {}
        AlarmSound.start(ctx)
    }

    fun dismiss(ctx: Context) {
        AlarmSound.stop()
        NotificationManagerCompat.from(ctx).cancel(NOTIF_ID)
    }
}

object AlarmSound {
    private var player: MediaPlayer? = null

    fun start(ctx: Context) {
        if (player != null) return
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(ctx, uri)
                isLooping = true
                prepare()
                start()
            }
        } catch (_: Throwable) { player = null }
    }

    fun stop() {
        try { player?.stop(); player?.release() } catch (_: Throwable) {}
        player = null
    }
}

class WakeAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Defaults.init(context)
        if (intent.action == "ru.student.safuhub.WAKE_STOP") {
            WakeAlarms.dismiss(context)
            return
        }
        WakeAlarms.ring(context, intent.getStringExtra(WakeAlarms.EXTRA_TITLE) ?: "Подъём")
        // следующий будильник на неделе
        ru.student.safuhub.feature.wake.WakePlanner.schedule(ru.student.safuhub.data.SharedSchedule.load())
    }
}

/** Экран звонка поверх блокировки */
class AlarmActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            (getSystemService(KEYGUARD_SERVICE) as? KeyguardManager)?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        val title = intent.getStringExtra(WakeAlarms.EXTRA_TITLE) ?: "Подъём"
        val d = resources.displayMetrics.density
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFF0B1A3D.toInt())
            setPadding((32 * d).toInt(), (32 * d).toInt(), (32 * d).toInt(), (32 * d).toInt())
        }
        root.addView(TextView(this).apply {
            text = "⏰"
            textSize = 72f
            gravity = Gravity.CENTER
        })
        root.addView(TextView(this).apply {
            text = Fmt.format(Instant.now(), "H:mm")
            textSize = 64f
            setTextColor(0xFFFFFFFF.toInt())
            gravity = Gravity.CENTER
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        root.addView(TextView(this).apply {
            text = title
            textSize = 20f
            setTextColor(0xCCFFFFFF.toInt())
            gravity = Gravity.CENTER
            setPadding(0, (12 * d).toInt(), 0, (40 * d).toInt())
        })
        root.addView(Button(this).apply {
            text = "☀️  Встаю"
            textSize = 20f
            setOnClickListener {
                WakeAlarms.dismiss(this@AlarmActivity)
                finish()
            }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (64 * d).toInt()))
        setContentView(root)
    }
}
