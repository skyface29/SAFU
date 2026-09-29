package ru.student.safuhub.feature.lectures

import android.app.ActivityManager
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.StatFs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.vosk.LibVosk
import org.vosk.LogLevel
import org.vosk.Recognizer
import ru.student.safuhub.App
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.data.FileService
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.zip.ZipInputStream
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

// MARK: - Распознавание речи лекции: Vosk на телефоне
// Модель скачивается один раз с alphacephei.com, дальше всё работает без интернета. Запись никуда не отправляется.

object LectureASR {
    class Model(val id: String, val title: String, val note: String, val url: String, val bytes: Long, val minRamGB: Int)

    val models = listOf(
        Model("vosk-model-ru-0.42", "Точная", "Vosk Big · ~1,8 ГБ · понимает русский лучше, но медленнее; нужен телефон с 8 ГБ памяти",
            "https://alphacephei.com/vosk/models/vosk-model-ru-0.42.zip", 1_800_000_000L, 8),
        Model("vosk-model-small-ru-0.22", "Быстрая", "Vosk Small · ~45 МБ · быстро и на любом телефоне, но ошибается чаще",
            "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip", 45_000_000L, 0),
    )

    private val fast: Model get() = models[1]

    /** Свой ключ: на iPhone в «lecture.model» — модели Whisper, копии должны переноситься в обе стороны */
    var selected: String
        get() = Defaults.string("lecture.asr")?.takeIf { id -> models.any { it.id == id } } ?: fast.id
        set(v) = Defaults.set("lecture.asr", v)

    fun model(id: String): Model = models.firstOrNull { it.id == id } ?: fast

    /** Память телефона, ГБ («8 ГБ» телефоны показывают около 7,3) */
    val ramGB: Double by lazy {
        val mi = ActivityManager.MemoryInfo()
        App.ctx.getSystemService(ActivityManager::class.java)?.getMemoryInfo(mi)
        mi.totalMem / 1_000_000_000.0
    }

    fun fits(m: Model): Boolean = m.minRamGB == 0 || ramGB >= m.minRamGB - 1.2

    /** Какая модель будет работать: большой не хватит памяти — берём быструю */
    val active: Model get() = model(selected).let { if (fits(it)) it else fast }

    private val dir: File get() = File(FileService.support, "vosk").apply { mkdirs() }

    private fun folder(m: Model) = File(dir, m.id)

    fun ready(m: Model): Boolean = File(folder(m), ".ready").exists()

    fun remove(m: Model) {
        folder(m).deleteRecursively()
        File(dir, m.id + ".zip.part").delete()
    }

    sealed interface Stage {
        data class Download(val progress: Float) : Stage
        data class Transcribe(val progress: Float) : Stage
    }

    private val http by lazy {
        OkHttpClient.Builder().connectTimeout(30, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build()
    }

    private fun size(bytes: Long): String =
        if (bytes >= 1_000_000_000) "%.1f ГБ".format(bytes / 1e9).replace('.', ',') else "${bytes / 1_000_000} МБ"

    /** Скачать и распаковать модель (один раз, с докачкой после обрыва). progress 0…1 */
    suspend fun download(m: Model, progress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val out = folder(m)
        if (ready(m)) return@withContext out
        val zip = File(dir, m.id + ".zip.part")
        // место: архив + распакованная модель
        val need = (m.bytes * 2.5).toLong() - zip.length()
        if (StatFs(dir.path).availableBytes < need) throw LectureError("Не хватает места для модели распознавания: освободи ещё ${size(need)}")
        var have = zip.length()
        val req = Request.Builder().url(m.url).apply { if (have > 0) header("Range", "bytes=$have-") }.build()
        http.newCall(req).await().use { resp ->
            // 416 — архив уже скачан целиком
            if (resp.code != 416) {
                if (!resp.isSuccessful) throw LectureError("Не удалось скачать модель распознавания (${resp.code})")
                val append = resp.code == 206
                if (!append) have = 0
                val body = resp.body ?: throw LectureError("Не удалось скачать модель распознавания")
                val total = body.contentLength().let { if (it > 0) it + have else m.bytes }
                var done = have
                FileOutputStream(zip, append).use { o ->
                    val input = body.byteStream()
                    val buf = ByteArray(256 * 1024)
                    while (true) {
                        ensureActive()
                        val n = input.read(buf)
                        if (n < 0) break
                        o.write(buf, 0, n)
                        done += n
                        progress((done.toFloat() / total).coerceIn(0f, 1f) * 0.9f)
                    }
                }
            }
        }
        try {
            unzip(zip, out, m) { progress(0.9f + 0.1f * it) }
        } catch (e: Throwable) {
            // битый архив — в следующий раз скачаем заново
            zip.delete()
            throw e
        }
        zip.delete()
        out
    }

    private class Counting(input: InputStream) : FilterInputStream(input) {
        var count = 0L
        override fun read(): Int = super.read().also { if (it >= 0) count++ }
        override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { if (it > 0) count += it }
    }

    private fun unzip(zip: File, out: File, m: Model, progress: (Float) -> Unit) {
        val tmp = File(dir, m.id + ".tmp")
        tmp.deleteRecursively()
        tmp.mkdirs()
        val root = tmp.canonicalPath + File.separator
        val total = zip.length().toFloat()
        val counting = Counting(BufferedInputStream(FileInputStream(zip), 256 * 1024))
        ZipInputStream(counting).use { z ->
            while (true) {
                val e = z.nextEntry ?: break
                // в архиве всё лежит в папке «vosk-model-…/» — её убираем
                val rel = if (e.name.startsWith("vosk-model")) e.name.substringAfter('/', "") else e.name
                // RNNLM заметно увеличивает расход памяти — на телефоне модель работает без неё
                if (rel.isEmpty() || rel.startsWith("rnnlm/")) continue
                val f = File(tmp, rel)
                if (!f.canonicalPath.startsWith(root)) continue
                if (e.isDirectory) { f.mkdirs(); continue }
                f.parentFile?.mkdirs()
                f.outputStream().use { z.copyTo(it, 256 * 1024) }
                progress((counting.count / total).coerceIn(0f, 1f))
            }
        }
        if (!File(tmp, "am").isDirectory) {
            tmp.deleteRecursively()
            throw LectureError("Архив модели распознавания повреждён — попробуй ещё раз")
        }
        File(tmp, ".ready").writeText(m.id)
        out.deleteRecursively()
        if (!tmp.renameTo(out)) throw LectureError("Не удалось сохранить модель распознавания")
    }

    // MARK: распознавание

    private class Word(val text: String, val start: Double, val end: Double) {
        /** Конец высказывания (Vosk услышал паузу) */
        var last = false
    }

    /** Расшифровка файла: список фраз с временем начала и конца */
    suspend fun transcribe(audio: File, onStage: (Stage) -> Unit): List<SpeechSegment> = withContext(Dispatchers.IO) {
        val m = active
        val modelDir = download(m) { onStage(Stage.Download(it)) }
        onStage(Stage.Transcribe(0f))
        val pcmFile = File(App.ctx.cacheDir, "lecture-${System.nanoTime()}.pcm")
        try {
            val pcm = AudioPcm.decode(audio, pcmFile, { onStage(Stage.Transcribe(it * 0.08f)) }) { ensureActive() }
            if (pcm.samples < AudioPcm.RATE / 2) return@withContext emptyList()
            LibVosk.setLogLevel(LogLevel.WARNINGS)
            val model = try { org.vosk.Model(modelDir.absolutePath) } catch (_: Throwable) {
                throw LectureError("Не удалось загрузить модель распознавания — удали её в настройках лекций и скачай заново")
            }
            try {
                val chunks = plan(pcm)
                val cores = Runtime.getRuntime().availableProcessors()
                val threads = (if (m.minRamGB > 0) min(2, cores / 2) else cores - 2).coerceIn(1, 4).coerceAtMost(chunks.size)
                val results = arrayOfNulls<List<Word>>(chunks.size)
                val next = AtomicInteger()
                val done = AtomicLong()
                val total = pcm.samples.toFloat()
                val pool = Executors.newFixedThreadPool(threads).asCoroutineDispatcher()
                try {
                    coroutineScope {
                        repeat(threads) {
                            launch(pool) {
                                RandomAccessFile(pcm.file, "r").use { raf ->
                                    while (true) {
                                        val i = next.getAndIncrement()
                                        if (i >= chunks.size) break
                                        results[i] = recognize(model, raf, chunks[i]) { n ->
                                            onStage(Stage.Transcribe(0.08f + 0.92f * (done.addAndGet(n) / total).coerceIn(0f, 1f)))
                                        }
                                    }
                                }
                            }
                        }
                    }
                } finally {
                    pool.close()
                }
                segments(results.flatMap { it.orEmpty() }.sortedBy { it.start })
            } finally {
                model.close()
            }
        } finally {
            pcmFile.delete()
        }
    }

    /** Куски по ~2,5 минуты, разрезанные в самом тихом месте рядом — чтобы не резать слова */
    private fun plan(pcm: AudioPcm.Result): List<LongRange> {
        val e = pcm.energy
        val target = 1500
        val window = 100
        val cuts = ArrayList<Long>()
        var at = target
        while (at < e.size - target / 3) {
            var best = at
            for (i in (at - window).coerceAtLeast(1)..(at + window).coerceAtMost(e.size - 1)) if (e[i] < e[best]) best = i
            cuts.add(best.toLong() * AudioPcm.FRAME + AudioPcm.FRAME / 2)
            at = best + target
        }
        val bounds = listOf(0L) + cuts + pcm.samples
        return bounds.zipWithNext { s, end -> s until end }.filter { !it.isEmpty() }
    }

    private suspend fun recognize(model: org.vosk.Model, raf: RandomAccessFile, range: LongRange, onSamples: (Long) -> Unit): List<Word> {
        val out = ArrayList<Word>()
        val offset = range.first.toDouble() / AudioPcm.RATE
        Recognizer(model, AudioPcm.RATE.toFloat()).use { rec ->
            rec.setWords(true)
            raf.seek(range.first * 2)
            var left = (range.last - range.first + 1) * 2
            val buf = ByteArray(16_000)
            while (left > 0) {
                currentCoroutineContext().ensureActive()
                val n = min(buf.size.toLong(), left).toInt()
                raf.readFully(buf, 0, n)
                left -= n
                if (rec.acceptWaveForm(buf, n)) parse(rec.result, offset, out)
                onSamples(n / 2L)
            }
            parse(rec.finalResult, offset, out)
        }
        return out
    }

    private fun parse(json: String, offset: Double, out: MutableList<Word>) {
        val arr = try { JSONObject(json).optJSONArray("result") } catch (_: Throwable) { null } ?: return
        var added = false
        for (i in 0 until arr.length()) {
            val w = arr.optJSONObject(i) ?: continue
            val text = w.optString("word").trim()
            if (text.isEmpty() || text == "[unk]" || text == "<unk>") continue
            out.add(Word(text, offset + w.optDouble("start", 0.0), offset + w.optDouble("end", 0.0)))
            added = true
        }
        if (added) out.last().last = true
    }

    /** Vosk пишет без знаков препинания: фразы режем по паузам и оформляем как предложения */
    private fun segments(words: List<Word>): List<SpeechSegment> {
        val out = ArrayList<SpeechSegment>()
        var cur = ArrayList<Word>()
        fun flush() {
            if (cur.isEmpty()) return
            val text = cur.joinToString(" ") { it.text }.capitalizedFirstLetter() + "."
            out.add(SpeechSegment(cur.first().start, cur.last().end, text))
            cur = ArrayList()
        }
        for (w in words) {
            val last = cur.lastOrNull()
            if (last != null) {
                val gap = w.start - last.end
                val split = cur.size >= 28 ||
                    (last.last && cur.size >= 3) ||
                    (gap >= 1.0 && cur.size >= 2) ||
                    (gap >= 0.45 && cur.size >= 14)
                if (split) flush()
            }
            cur.add(w)
        }
        flush()
        return out
    }
}

// MARK: - Звук любого формата → 16 кГц, моно, 16 бит

object AudioPcm {
    const val RATE = 16_000
    /** Шаг громкости: 0,1 с */
    const val FRAME = 1_600

    class Result(val file: File, val samples: Long, val energy: FloatArray)

    fun decode(src: File, out: File, progress: (Float) -> Unit, check: () -> Unit): Result {
        val ex = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            ex.setDataSource(src.absolutePath)
            val track = (0 until ex.trackCount).firstOrNull {
                ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            } ?: throw LectureError("В файле нет звука")
            ex.selectTrack(track)
            val fmt = ex.getTrackFormat(track)
            val durationUs = if (fmt.containsKey(MediaFormat.KEY_DURATION)) fmt.getLong(MediaFormat.KEY_DURATION) else 0L
            val c = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME)!!)
            codec = c
            c.configure(fmt, null, null, 0)
            c.start()

            var rate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var channels = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
            var encoding = AudioFormat.ENCODING_PCM_16BIT
            var resampler = Resampler(rate)
            val sink = Sink(out)
            var mono = FloatArray(8192)
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false
            var lastProgress = -1

            while (!outputDone) {
                check()
                if (!inputDone) {
                    val i = c.dequeueInputBuffer(10_000)
                    if (i >= 0) {
                        val buf = c.getInputBuffer(i)!!
                        val n = ex.readSampleData(buf, 0)
                        if (n < 0) {
                            c.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            c.queueInputBuffer(i, 0, n, ex.sampleTime, 0)
                            ex.advance()
                        }
                    }
                }
                val o = c.dequeueOutputBuffer(info, 10_000)
                if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    val f = c.outputFormat
                    val newRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
                    encoding = if (f.containsKey(MediaFormat.KEY_PCM_ENCODING)) f.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
                    if (newRate != rate) {
                        resampler.finish(sink::write)
                        rate = newRate
                        resampler = Resampler(rate)
                    }
                } else if (o >= 0) {
                    val buf = c.getOutputBuffer(o)
                    if (buf != null && info.size > 0) {
                        buf.position(info.offset)
                        buf.limit(info.offset + info.size)
                        val data = buf.slice().order(ByteOrder.LITTLE_ENDIAN)
                        val frames: Int
                        if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
                            val fb = data.asFloatBuffer()
                            frames = fb.remaining() / channels
                            if (mono.size < frames) mono = FloatArray(frames)
                            for (f in 0 until frames) {
                                var s = 0f
                                for (ch in 0 until channels) s += fb.get(f * channels + ch)
                                mono[f] = s / channels
                            }
                        } else if (encoding == AudioFormat.ENCODING_PCM_8BIT) {
                            frames = data.remaining() / channels
                            if (mono.size < frames) mono = FloatArray(frames)
                            for (f in 0 until frames) {
                                var s = 0f
                                for (ch in 0 until channels) s += ((data.get(f * channels + ch).toInt() and 0xff) - 128) / 128f
                                mono[f] = s / channels
                            }
                        } else {
                            val sb = data.asShortBuffer()
                            frames = sb.remaining() / channels
                            if (mono.size < frames) mono = FloatArray(frames)
                            for (f in 0 until frames) {
                                var s = 0f
                                for (ch in 0 until channels) s += sb.get(f * channels + ch)
                                mono[f] = s / (channels * 32768f)
                            }
                        }
                        resampler.push(mono, frames, sink::write)
                    }
                    c.releaseOutputBuffer(o, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                    if (durationUs > 0) {
                        val p = (info.presentationTimeUs * 100 / durationUs).toInt()
                        if (p != lastProgress) { lastProgress = p; progress((p / 100f).coerceIn(0f, 1f)) }
                    }
                }
            }
            resampler.finish(sink::write)
            return sink.close()
        } finally {
            try { codec?.stop() } catch (_: Throwable) {}
            try { codec?.release() } catch (_: Throwable) {}
            ex.release()
        }
    }

    /** Пишет 16-битные отсчёты в файл и считает громкость каждые 0,1 с */
    private class Sink(private val file: File) {
        private val out = BufferedOutputStream(FileOutputStream(file), 256 * 1024)
        private val bytes = ByteArray(8192)
        private var samples = 0L
        private val energy = ArrayList<Float>()
        private var acc = 0.0
        private var inFrame = 0

        fun write(x: FloatArray, n: Int) {
            var i = 0
            while (i < n) {
                val m = min(n - i, bytes.size / 2)
                for (j in 0 until m) {
                    val v = x[i + j].coerceIn(-1f, 1f)
                    val s = (v * 32767f).roundToInt()
                    bytes[2 * j] = (s and 0xff).toByte()
                    bytes[2 * j + 1] = (s shr 8 and 0xff).toByte()
                    acc += v * v
                    if (++inFrame == FRAME) {
                        energy.add((acc / FRAME).toFloat())
                        acc = 0.0
                        inFrame = 0
                    }
                }
                out.write(bytes, 0, 2 * m)
                samples += m
                i += m
            }
        }

        fun close(): Result {
            if (inFrame > 0) energy.add((acc / inFrame).toFloat())
            out.close()
            return Result(file, samples, energy.toFloatArray())
        }
    }

    /**
     * Пересчёт частоты в 16 кГц: фильтр-синк с окном Ханна (6 переходов через ноль), 256 фаз.
     * Для записей из приложения (уже 16 кГц) — без изменений.
     */
    private class Resampler(inRate: Int) {
        private val pass = inRate == RATE
        private val step = inRate.toDouble() / RATE
        private val cut = min(1.0, RATE.toDouble() / inRate)
        private val half = ceil(6 / cut).toInt()
        private val taps = 2 * half
        private val phases = 256
        private val table = FloatArray((phases + 1) * taps).also { t ->
            for (p in 0..phases) {
                val frac = p.toDouble() / phases
                var sum = 0.0
                for (j in 0 until taps) {
                    val d = (j - half + 1) - frac
                    val x = d * cut
                    val sinc = if (abs(x) < 1e-9) 1.0 else sin(PI * x) / (PI * x)
                    val w = if (abs(d) >= half) 0.0 else 0.5 * (1 + cos(PI * d / half))
                    val v = sinc * w
                    t[p * taps + j] = v.toFloat()
                    sum += v
                }
                if (sum != 0.0) for (j in 0 until taps) t[p * taps + j] = (t[p * taps + j] / sum).toFloat()
            }
        }
        private var buf = FloatArray(16384)
        private var len = 0
        /** Номер первого отсчёта буфера во входном потоке */
        private var base = 0L
        private var inputTotal = 0L
        private var outIndex = 0L
        private val outBuf = FloatArray(4096)

        fun push(x: FloatArray, n: Int, emit: (FloatArray, Int) -> Unit) {
            if (pass) { emit(x, n); return }
            ensure(len + n)
            System.arraycopy(x, 0, buf, len, n)
            len += n
            inputTotal += n
            drain(emit, Long.MAX_VALUE)
        }

        fun finish(emit: (FloatArray, Int) -> Unit) {
            if (pass) return
            val limit = ceil(inputTotal / step).toLong()
            // досчитываем хвост, дополнив тишиной
            ensure(len + half + 1)
            java.util.Arrays.fill(buf, len, len + half + 1, 0f)
            len += half + 1
            drain(emit, limit)
        }

        private fun ensure(size: Int) {
            if (size > buf.size) buf = buf.copyOf(maxOf(size, buf.size * 2))
        }

        private fun drain(emit: (FloatArray, Int) -> Unit, limit: Long) {
            var n = 0
            while (outIndex < limit) {
                val pos = outIndex * step
                val i = floor(pos).toLong()
                if (i + half >= base + len) break
                val ph = ((pos - i) * phases).roundToInt()
                val start = (i - half + 1 - base).toInt()
                val off = ph * taps
                var acc = 0f
                for (j in 0 until taps) {
                    val k = start + j
                    // до начала записи — тишина
                    if (k >= 0) acc += buf[k] * table[off + j]
                }
                outBuf[n++] = acc
                outIndex++
                if (n == outBuf.size) { emit(outBuf, n); n = 0 }
            }
            if (n > 0) emit(outBuf, n)
            // выбрасываем отсчёты, которые больше не понадобятся
            val need = floor(outIndex * step).toLong() - half + 1
            val drop = (need - base).coerceIn(0, len.toLong()).toInt()
            if (drop > 0) {
                System.arraycopy(buf, drop, buf, 0, len - drop)
                len -= drop
                base += drop
            }
        }
    }
}
