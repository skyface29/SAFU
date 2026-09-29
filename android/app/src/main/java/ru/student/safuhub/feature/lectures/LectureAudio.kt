package ru.student.safuhub.feature.lectures

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.student.safuhub.App
import ru.student.safuhub.MainActivity
import ru.student.safuhub.R
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.FileService
import ru.student.safuhub.system.Notify
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.ui.design.Haptics
import java.io.File
import java.io.IOException
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.log10

/** Длительность звукового файла, секунды */
fun audioDuration(f: File): Double = try {
    val r = MediaMetadataRetriever()
    try {
        r.setDataSource(f.absolutePath)
        (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) / 1000.0
    } finally {
        r.release()
    }
} catch (_: Throwable) { 0.0 }

// MARK: - Запись

/**
 * Запись идёт в сервисе с микрофоном: экран можно заблокировать.
 * Формат — AAC (ADTS): файл читается, даже если приложение закрыли посреди записи.
 */
object LectureRecorder {
    private const val RECORDING_KEY = "lecture.recording"
    private const val RECORDING_SUBJECT = "lecture.recordingSubject"

    /** Экран записи открыт (показывается поверх всего приложения) */
    val screen = mutableStateOf(false)
    var subject by mutableStateOf("")
    var elapsed by mutableDoubleStateOf(0.0)
        private set
    var levels by mutableStateOf(List(48) { 0f })
        private set
    var recording by mutableStateOf(false)
        private set
    var paused by mutableStateOf(false)
        private set
    var marks by mutableStateOf(emptyList<Double>())
        private set
    var denied by mutableStateOf(false)
        private set
    var failed by mutableStateOf<String?>(null)
        private set

    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var started = 0L
    private var pausedTotal = 0L
    private var pausedAt = 0L
    private var ticker: Job? = null

    /** Открыть экран записи */
    fun open(subject: String) {
        if (!recording) {
            this.subject = subject
            elapsed = 0.0
            levels = List(48) { 0f }
            marks = emptyList()
            denied = false
            failed = null
        }
        screen.value = true
    }

    fun start() {
        if (recording) return
        denied = false
        Permissions.request(Manifest.permission.RECORD_AUDIO) { ok -> if (ok) begin() else denied = true }
    }

    private fun begin() {
        if (recording) return
        val f = FileService.uniqueFile(LectureStore.folder, "Лекция ${Fmt.format(Instant.now(), "dd.MM.yyyy HH-mm")}.aac")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(App.ctx) else @Suppress("DEPRECATION") MediaRecorder()
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.AAC_ADTS)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioSamplingRate(16_000)
            r.setAudioChannels(1)
            r.setAudioEncodingBitRate(48_000)
            r.setOutputFile(f.absolutePath)
            r.prepare()
            r.start()
        } catch (_: Throwable) {
            r.release()
            f.delete()
            failed = "Не удалось включить микрофон — возможно, он занят другим приложением"
            return
        }
        recorder = r
        file = f
        started = SystemClock.elapsedRealtime()
        pausedTotal = 0
        paused = false
        marks = emptyList()
        elapsed = 0.0
        failed = null
        recording = true
        Defaults.set(RECORDING_KEY, f.name)
        Defaults.set(RECORDING_SUBJECT, subject)
        LectureService.sync()
        ticker = AppScope.launch {
            while (isActive) {
                tick()
                delay(80)
            }
        }
    }

    /** Сколько записано, мс (без пауз) */
    fun elapsedMs(): Long {
        if (!recording) return (elapsed * 1000).toLong()
        val now = SystemClock.elapsedRealtime()
        return now - started - pausedTotal - (if (paused) now - pausedAt else 0)
    }

    private fun tick() {
        val r = recorder ?: return
        elapsed = elapsedMs() / 1000.0
        if (paused) return
        val amp = try { r.maxAmplitude } catch (_: Throwable) { 0 }
        // пик громее средней мощности примерно на 8 дБ
        val db = if (amp > 0) 20 * log10(amp / 32767.0) - 8 else -160.0
        val level = ((db + 55) / 55).coerceIn(0.0, 1.0).toFloat()
        levels = levels.drop(1) + level
    }

    fun togglePause() {
        val r = recorder ?: return
        try {
            if (paused) {
                r.resume()
                pausedTotal += SystemClock.elapsedRealtime() - pausedAt
            } else {
                r.pause()
                pausedAt = SystemClock.elapsedRealtime()
            }
        } catch (_: Throwable) { return }
        paused = !paused
        Haptics.tap()
        LectureService.sync()
    }

    fun markImportant() {
        if (!recording) return
        marks = marks + elapsedMs() / 1000.0
        Haptics.success()
        LectureService.sync()
    }

    private fun finish(): Pair<File?, Boolean> {
        val r = recorder ?: return null to false
        var ok = true
        try { r.stop() } catch (_: Throwable) { ok = false }
        r.release()
        recorder = null
        ticker?.cancel()
        ticker = null
        recording = false
        paused = false
        val f = file
        file = null
        Defaults.remove(RECORDING_KEY)
        Defaults.remove(RECORDING_SUBJECT)
        LectureService.sync()
        return f to ok
    }

    /** Остановить и сохранить. null — запись пустая */
    fun stop(subject: String): Lecture? {
        val duration = elapsedMs() / 1000.0
        elapsed = duration
        val (f, ok) = finish()
        if (f == null) return null
        if (!ok || duration <= 3) {
            f.delete()
            return null
        }
        val title = subject.ifEmpty { "Лекция ${Fmt.format(Instant.now(), "d MMMM")}" }
        return Lecture(title = title, subject = subject, date = Instant.now(), duration = duration, audioName = f.name, marks = marks)
    }

    fun cancel() {
        finish().first?.delete()
    }

    /** Приложение закрыли посреди записи — возвращаем запись в список лекций */
    fun recover() {
        if (recording) return
        val name = Defaults.string(RECORDING_KEY) ?: return
        val subj = Defaults.string(RECORDING_SUBJECT) ?: ""
        Defaults.remove(RECORDING_KEY)
        Defaults.remove(RECORDING_SUBJECT)
        val f = File(LectureStore.folder, name)
        if (!f.exists() || LectureStore.lectures.any { it.audioName == name }) return
        val duration = audioDuration(f)
        if (duration <= 3) return
        val date = Instant.ofEpochMilli(f.lastModified())
        LectureStore.add(Lecture(title = subj.ifEmpty { "Лекция ${Fmt.format(date, "d MMMM")}" }, subject = subj, date = date,
            duration = duration, audioName = name))
    }
}

// MARK: - Проигрыватель

class LecturePlayer {
    var playing by mutableStateOf(false)
        private set
    var time by mutableDoubleStateOf(0.0)
        private set
    var duration by mutableDoubleStateOf(0.0)
        private set
    var rate by mutableFloatStateOf(1f)
        private set

    private var player: MediaPlayer? = null

    fun load(f: File) {
        release()
        try {
            val p = MediaPlayer()
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            p.setDataSource(f.absolutePath)
            p.prepare()
            p.setOnCompletionListener { playing = false }
            player = p
            duration = p.duration / 1000.0
        } catch (_: Throwable) {
            player = null
        }
    }

    fun toggle() {
        val p = player ?: return
        if (p.isPlaying) {
            p.pause()
            playing = false
        } else {
            // скорость с ненулевым значением сама запускает воспроизведение
            try { p.playbackParams = p.playbackParams.setSpeed(rate) } catch (_: Throwable) {}
            if (!p.isPlaying) p.start()
            playing = true
        }
    }

    /** Текущее время (экран спрашивает, пока играет) */
    fun update() {
        val p = player ?: return
        try { if (p.isPlaying) time = p.currentPosition / 1000.0 } catch (_: Throwable) {}
    }

    fun seek(t: Double) {
        val v = t.coerceIn(0.0, maxOf(duration, 0.0))
        try { player?.seekTo((v * 1000).toLong(), MediaPlayer.SEEK_CLOSEST) } catch (_: Throwable) {}
        time = v
    }

    fun cycleRate() {
        rate = if (rate >= 2f) 1f else if (rate >= 1.5f) 2f else 1.5f
        val p = player ?: return
        if (p.isPlaying) try { p.playbackParams = p.playbackParams.setSpeed(rate) } catch (_: Throwable) {}
    }

    fun release() {
        try { player?.release() } catch (_: Throwable) {}
        player = null
        playing = false
    }
}

// MARK: - Обработка в фоне: расшифровка → конспект

object LectureProcessor {
    sealed interface Status {
        data class Downloading(val progress: Float) : Status
        data class Transcribing(val since: Instant, val progress: Float) : Status
        data object Summarizing : Status
        data class Failed(val message: String) : Status
    }

    val status = mutableStateMapOf<String, Status>()
    private val jobs = HashMap<String, Job>()

    /** Что сейчас обрабатывается (для уведомления) */
    val working: List<Pair<String, Status>> get() = status.entries.filter { it.value !is Status.Failed }.map { it.key to it.value }

    private fun message(e: Throwable, vpnHint: Boolean): String =
        if (e is IOException) LectureAIProbe.describe(e, vpnHint) else e.message ?: e.toString()

    /** Полный путь: расшифровка → конспект */
    fun process(id: String) {
        val l = LectureStore.lecture(id) ?: return
        val cur = status[id]
        if (cur is Status.Transcribing || cur is Status.Downloading) return
        val since = Instant.now()
        status[id] = Status.Transcribing(since, 0f)
        LectureService.sync()
        jobs[id] = AppScope.launch {
            val me = coroutineContext.job
            val last = AtomicInteger(-1)
            try {
                val segs = LectureASR.transcribe(l.audioFile) { stage ->
                    val next = when (stage) {
                        is LectureASR.Stage.Download -> Status.Downloading(stage.progress)
                        is LectureASR.Stage.Transcribe -> Status.Transcribing(since, stage.progress)
                    }
                    val p = if (stage is LectureASR.Stage.Download) 1000 + (stage.progress * 100).toInt()
                    else ((stage as LectureASR.Stage.Transcribe).progress * 100).toInt()
                    if (last.getAndSet(p) != p) AppScope.launch {
                        if (me.isActive && status[id] !is Status.Failed) {
                            status[id] = next
                            LectureService.sync()
                        }
                    }
                }
                LectureStore.update(id) { it.copy(segments = segs) }
                status.remove(id)
                summarize(id, LectureStyle.NORMAL)
            } catch (e: CancellationException) {
                status.remove(id)
                throw e
            } catch (e: Throwable) {
                status[id] = Status.Failed("Не удалось распознать: ${message(e, false)}")
            } finally {
                if (jobs[id] === me) jobs.remove(id)
                LectureService.sync()
            }
        }
    }

    fun summarize(id: String, style: LectureStyle) {
        val l = LectureStore.lecture(id) ?: return
        if (l.segments.isEmpty()) return
        status[id] = Status.Summarizing
        LectureService.sync()
        jobs[id] = AppScope.launch {
            val me = coroutineContext.job
            val ai = LectureAI.resolved()
            try {
                val s = when (ai) {
                    LectureAI.CLAUDE -> LectureSummarizer.claude(l, style, ClaudeKey.value ?: "")
                    LectureAI.GIGACHAT -> LectureSummarizer.chat(l, style, chunkWords = 2500, finalWords = 5000) { system, user ->
                        GigaChat.complete(system, user)
                    }
                    else -> withContext(Dispatchers.Default) { LectureSummarizer.local(l) }
                }
                val byAI = ai != LectureAI.LOCAL && ai != LectureAI.AUTO
                LectureStore.update(id) {
                    it.copy(summary = s, summaryByAI = byAI, engine = ai.raw,
                        title = if (byAI && it.title.startsWith("Лекция") && s.title.isNotBlank()) s.title else it.title)
                }
                status.remove(id)
            } catch (e: CancellationException) {
                status.remove(id)
                throw e
            } catch (e: Throwable) {
                // без сети, без токенов или ИИ недоступен — хотя бы простой конспект
                val s = withContext(Dispatchers.Default) { LectureSummarizer.local(l) }
                LectureStore.update(id) {
                    if (it.summary == null) it.copy(summary = s, summaryByAI = false, engine = LectureAI.LOCAL.raw) else it
                }
                status[id] = Status.Failed(message(e, ai == LectureAI.CLAUDE))
            } finally {
                if (jobs[id] === me) jobs.remove(id)
                LectureService.sync()
            }
            Haptics.success()
        }
    }

    fun clearError(id: String) {
        if (status[id] is Status.Failed) status.remove(id)
    }

    fun cancel(id: String) {
        jobs.remove(id)?.cancel()
        status.remove(id)
        LectureService.sync()
    }
}

// MARK: - Сервис: запись при заблокированном экране и распознавание в фоне

class LectureService : Service() {
    private var types = 0
    private var wake: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        releaseWake()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        refresh(first = true)
        return START_NOT_STICKY
    }

    /** Android 15: сервис обработки проработал слишком долго */
    override fun onTimeout(startId: Int, fgsType: Int) {
        releaseWake()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private val processingType: Int
        get() = if (Build.VERSION.SDK_INT >= 35) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING
        else ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC

    fun refresh(first: Boolean) {
        val rec = LectureRecorder.recording
        val work = LectureProcessor.working
        val need = (if (rec) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0) or (if (work.isNotEmpty()) processingType else 0)
        if (need == 0) {
            // сервис запустили, а делать уже нечего: система всё равно ждёт startForeground
            if (first && types == 0) startTyped(notification(false, emptyList()), processingType)
            releaseWake()
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            types = 0
            return
        }
        val n = notification(rec, work)
        // типы только добавляем: снимать их без нужды не стоит, сервис всё равно скоро остановится
        if (first || need and types.inv() != 0) {
            types = types or need
            startTyped(n, types)
        } else {
            try { NotificationManagerCompat.from(this).notify(ID, n) } catch (_: SecurityException) {}
        }
        if (work.isNotEmpty()) acquireWake() else releaseWake()
    }

    private fun startTyped(n: Notification, t: Int) {
        try {
            ServiceCompat.startForeground(this, ID, n, t)
        } catch (_: Throwable) {
            try { ServiceCompat.startForeground(this, ID, n, processingType) } catch (_: Throwable) {}
        }
    }

    private fun acquireWake() {
        if (wake?.isHeld == true) return
        wake = getSystemService(PowerManager::class.java)?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "safu:lecture")?.apply {
            acquire(3 * 60 * 60 * 1000L)
        }
    }

    private fun releaseWake() {
        try { if (wake?.isHeld == true) wake?.release() } catch (_: Throwable) {}
        wake = null
    }

    private fun action(action: String, code: Int): PendingIntent =
        PendingIntent.getBroadcast(this, code, Intent(this, LectureActionReceiver::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun notification(rec: Boolean, work: List<Pair<String, LectureProcessor.Status>>): Notification {
        val open = PendingIntent.getActivity(this, 7300,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val b = NotificationCompat.Builder(this, Notify.CH_LECTURE)
            .setSmallIcon(R.drawable.ic_stat_snowflake)
            .setColor(0xFF2873FA.toInt())
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        if (rec) {
            val r = LectureRecorder
            b.setContentTitle(if (r.paused) "Запись лекции на паузе" else "Идёт запись лекции")
            val parts = listOfNotNull(r.subject.ifBlank { null }, if (r.marks.isNotEmpty()) "⭐ ${r.marks.size}" else null)
            b.setContentText(if (parts.isEmpty()) "Можно заблокировать экран — запись продолжится" else parts.joinToString(" · "))
            if (!r.paused) {
                b.setUsesChronometer(true)
                b.setShowWhen(true)
                b.setWhen(System.currentTimeMillis() - r.elapsedMs())
            }
            b.addAction(0, "⭐ Важно", action(ACTION_MARK, 7301))
            b.addAction(0, if (r.paused) "Продолжить" else "Пауза", action(ACTION_PAUSE, 7302))
            b.setCategory(NotificationCompat.CATEGORY_SERVICE)
        } else if (work.isNotEmpty()) {
            val (id, st) = work.first()
            val title = LectureStore.lecture(id)?.title ?: "Лекция"
            when (st) {
                is LectureProcessor.Status.Downloading -> {
                    val p = (st.progress * 100).toInt()
                    b.setContentTitle("Скачиваю модель распознавания · $p%")
                    b.setContentText("Один раз, дальше — без интернета")
                    b.setProgress(100, p, false)
                }
                is LectureProcessor.Status.Transcribing -> {
                    val p = (st.progress * 100).toInt()
                    b.setContentTitle("Распознаю лекцию · $p%")
                    b.setContentText(title)
                    b.setProgress(100, p, false)
                }
                else -> {
                    b.setContentTitle("Пишу конспект")
                    b.setContentText(title)
                    b.setProgress(0, 0, true)
                }
            }
            if (work.size > 1) b.setSubText("и ещё ${work.size - 1}")
            b.setCategory(NotificationCompat.CATEGORY_PROGRESS)
        } else {
            b.setContentTitle("Лекции")
        }
        return b.build()
    }

    companion object {
        private const val ID = 7300
        const val ACTION_MARK = "ru.student.safuhub.lecture.MARK"
        const val ACTION_PAUSE = "ru.student.safuhub.lecture.PAUSE"

        @Volatile private var instance: LectureService? = null

        /** Привести сервис в соответствие: запись или обработка идут — работает, нет — останавливается */
        fun sync() {
            instance?.let { it.refresh(first = false); return }
            if (!LectureRecorder.recording && LectureProcessor.working.isEmpty()) return
            val ctx = App.ctx
            try { ContextCompat.startForegroundService(ctx, Intent(ctx, LectureService::class.java)) } catch (_: Throwable) {}
        }
    }
}

/** Кнопки в уведомлении записи */
class LectureActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            LectureService.ACTION_MARK -> LectureRecorder.markImportant()
            LectureService.ACTION_PAUSE -> LectureRecorder.togglePause()
        }
    }
}
