package ru.student.safuhub.feature.lectures

import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.newId
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.FileService
import ru.student.safuhub.feature.web.SecureStore
import java.io.File
import java.time.Instant

// MARK: - Лекции: запись → расшифровка → конспект
// 1. Запись идёт и при заблокированном экране; «⭐ Важно» отмечает моменты, которые подчеркнул преподаватель.
// 2. Речь распознаёт Vosk прямо на телефоне (см. LectureASR).
// 3. Конспект пишет ИИ на выбор (см. LectureAI): GigaChat или Claude — либо простой конспект без ИИ.
// Всё сохраняется: запись в «Файлы › Лекции», текст и конспект — в приложении. Конспект можно переписать.

/** Фраза расшифровки: время начала и конца в секундах */
@Serializable
data class SpeechSegment(val start: Double = 0.0, val end: Double = 0.0, val text: String = "")

@Serializable
data class LectureSummary(
    val title: String = "",
    val summary: String = "",
    val keyPoints: List<String> = emptyList(),
    val sections: List<Section> = emptyList(),
    val terms: List<Term> = emptyList(),
    val formulas: List<String> = emptyList(),
    val questions: List<String> = emptyList(),
    val tasks: List<String> = emptyList(),
) {
    @Serializable
    data class Section(val heading: String = "", val points: List<String> = emptyList())

    @Serializable
    data class Term(val term: String = "", val definition: String = "")

    /** Конспект текстом (для редактирования и «поделиться») */
    val markdown: String
        get() {
            val s = StringBuilder("# $title\n\n$summary\n")
            fun list(items: List<String>) = items.joinToString("\n") { "- $it" } + "\n"
            if (keyPoints.isNotEmpty()) s.append("\n## Главное\n").append(list(keyPoints))
            for (sec in sections) s.append("\n## ${sec.heading}\n").append(list(sec.points))
            if (terms.isNotEmpty()) s.append("\n## Термины\n").append(terms.joinToString("\n") { "- **${it.term}** — ${it.definition}" }).append("\n")
            if (formulas.isNotEmpty()) s.append("\n## Формулы\n").append(list(formulas))
            if (questions.isNotEmpty()) s.append("\n## Могут спросить\n").append(list(questions))
            if (tasks.isNotEmpty()) s.append("\n## Задания и сроки\n").append(list(tasks))
            return s.toString()
        }
}

@Serializable
data class Lecture(
    val id: String = newId(),
    val title: String = "Лекция",
    val subject: String = "",
    val date: AppleDate = Instant.now(),
    val duration: Double = 0.0,
    val audioName: String = "",
    val marks: List<Double> = emptyList(),
    val segments: List<SpeechSegment> = emptyList(),
    val summary: LectureSummary? = null,
    val summaryByAI: Boolean = false,
    /** Какой ИИ написал конспект (LectureAI.raw) */
    val engine: String? = null,
    /** Конспект, переписанный руками (если есть — показывается вместо автоматического) */
    val editedNotes: String? = null,
) {
    val audioFile: File get() = File(LectureStore.folder, audioName)
    val transcript: String get() = segments.joinToString(" ") { it.text }
    val hasNotes: Boolean get() = summary != null || !editedNotes.isNullOrEmpty()

    /** Подпись над конспектом */
    val engineBadge: String
        get() = if (!summaryByAI) "без ИИ" else LectureAI.of(engine)?.badge ?: "Claude"

    /** Фраза рядом с отметкой «⭐ Важно» */
    fun isImportant(seg: SpeechSegment) = marks.any { m -> seg.end >= m - 5 && seg.start <= m + 40 }
}

// MARK: - Хранилище

object LectureStore {
    private val state = mutableStateOf<List<Lecture>>(emptyList())
    private var loaded = false
    private val io = Dispatchers.IO.limitedParallelism(1)

    /** Записи лежат в «Файлы › Лекции» — их видно и в файлах приложения */
    val folder: File get() = File(FileService.root, "Лекции").apply { mkdirs() }

    private val file: File get() = File(FileService.support, "lectures.json")

    var lectures: List<Lecture>
        get() { load(); return state.value }
        private set(v) { state.value = v; save(v) }

    private fun load() {
        if (loaded) return
        loaded = true
        try {
            if (file.exists()) state.value = AppJson.decodeFromString<List<Lecture>>(file.readText())
        } catch (_: Throwable) {}
    }

    private fun save(list: List<Lecture>) {
        AppScope.launch(io) {
            try {
                val tmp = File(file.parentFile, "lectures.json.tmp")
                tmp.writeText(AppJson.encodeToString(list))
                tmp.renameTo(file)
            } catch (_: Throwable) {}
        }
    }

    fun lecture(id: String): Lecture? = lectures.firstOrNull { it.id == id }

    fun update(id: String, change: (Lecture) -> Lecture) {
        val list = lectures
        if (list.none { it.id == id }) return
        lectures = list.map { if (it.id == id) change(it) else it }
    }

    fun add(l: Lecture) { lectures = listOf(l) + lectures }

    fun delete(id: String) {
        LectureProcessor.cancel(id)
        lecture(id)?.let { if (it.audioName.isNotEmpty()) it.audioFile.delete() }
        lectures = lectures.filter { it.id != id }
    }
}

// MARK: - Ключи ИИ (хранятся в защищённом хранилище Android)

/** Ключ в защищённом хранилище; значение держим в памяти, чтобы экраны не расшифровывали его каждый раз */
open class StoredSecret(private val key: String) {
    private val rev = mutableIntStateOf(0)
    @Volatile private var cached: String? = null
    @Volatile private var loaded = false

    val value: String?
        get() {
            rev.intValue
            if (!loaded) {
                cached = SecureStore.get(key)?.let { String(it, Charsets.UTF_8) }?.takeIf { it.isNotEmpty() }
                loaded = true
            }
            return cached
        }

    /** true — ключ поменялся */
    open fun set(s: String): Boolean {
        val t = s.trim()
        if (t == (value ?: "")) return false
        if (t.isEmpty()) SecureStore.delete(key) else SecureStore.set(key, t.toByteArray(Charsets.UTF_8))
        cached = t.ifEmpty { null }
        loaded = true
        rev.intValue++
        return true
    }
}

object ClaudeKey : StoredSecret("claude.apiKey")

object GigaKey : StoredSecret("gigachat.key") {
    override fun set(s: String): Boolean {
        val changed = super.set(s)
        if (changed) GigaChat.resetToken()
        return changed
    }
}

// MARK: - Стиль конспекта

enum class LectureStyle(val title: String, val instruction: String) {
    NORMAL("Обычный", "Сделай сбалансированный конспект: суть, структура, главное."),
    SHORT("Шпаргалка", "Сделай очень сжатую шпаргалку: только самое главное, коротко, без воды."),
    DETAILED("Подробный", "Сделай подробный конспект: сохрани все важные мысли, примеры и пояснения по разделам."),
}

// MARK: - Кто пишет конспект
// GigaChat (Сбер) — бесплатный пакет для физлиц, работает в России без VPN.
// Claude — если есть свой ключ. Без ИИ — простой конспект на телефоне.
// «ИИ Apple» бывает только на iPhone: лекции оттуда сохраняют подпись, а выбор на Android — «Авто».

enum class LectureAI(val raw: String, val title: String) {
    AUTO("auto", "Авто"),
    GIGACHAT("gigachat", "GigaChat"),
    APPLE("apple", "ИИ Apple"),
    CLAUDE("claude", "Claude"),
    LOCAL("local", "Без ИИ");

    val badge: String
        get() = when (this) {
            GIGACHAT -> "GigaChat"
            APPLE -> "ИИ Apple"
            CLAUDE -> "Claude"
            else -> "без ИИ"
        }

    companion object {
        fun of(raw: String?): LectureAI? = entries.firstOrNull { it.raw == raw }

        /** Что можно выбрать на Android */
        val choices = listOf(AUTO, GIGACHAT, CLAUDE, LOCAL)

        var selected: LectureAI
            get() = of(Defaults.string("lecture.ai")).let { if (it == null || it == APPLE) AUTO else it }
            set(v) = Defaults.set("lecture.ai", v.raw)

        /** Что реально будет работать сейчас */
        fun resolved(): LectureAI = when (selected) {
            AUTO -> when {
                GigaKey.value != null -> GIGACHAT
                ClaudeKey.value != null -> CLAUDE
                else -> LOCAL
            }
            GIGACHAT -> if (GigaKey.value != null) GIGACHAT else LOCAL
            CLAUDE -> if (ClaudeKey.value != null) CLAUDE else LOCAL
            APPLE, LOCAL -> LOCAL
        }
    }
}
