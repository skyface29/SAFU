package ru.student.safuhub.feature.lectures

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.capitalizedFirstLetter
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Ошибка с понятным текстом для экрана */
class LectureError(message: String) : Exception(message)

/** Запрос OkHttp, который отменяется вместе с корутиной */
internal suspend fun Call.await(): Response = suspendCancellableCoroutine { c ->
    c.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) { if (c.isActive) c.resumeWithException(e) }
        override fun onResponse(call: Call, response: Response) { if (c.isActive) c.resume(response) else response.close() }
    })
}

internal val jsonType = "application/json".toMediaType()

// MARK: - Конспект

object LectureSummarizer {
    private fun mmss(t: Double): String {
        val s = t.toInt()
        return "%d:%02d".format(s / 60, s % 60)
    }

    /** Расшифровка для модели: метки времени и [ВАЖНО] рядом с отметками студента */
    fun transcriptForAI(l: Lecture): String {
        val out = StringBuilder()
        var nextStamp = 0.0
        for (seg in l.segments) {
            if (seg.start >= nextStamp) {
                out.append("\n[").append(mmss(seg.start)).append("] ")
                nextStamp = seg.start + 120
            }
            if (l.isImportant(seg)) out.append("[ВАЖНО] ")
            out.append(seg.text).append(' ')
        }
        return out.toString().trim()
    }

    private val schema: JSONObject
        get() {
            fun str() = JSONObject().put("type", "string")
            fun strs() = JSONObject().put("type", "array").put("items", str())
            fun obj(vararg fields: String) = JSONObject()
                .put("type", "object").put("additionalProperties", false)
                .put("required", JSONArray(fields.toList()))
            return obj("title", "summary", "keyPoints", "sections", "terms", "formulas", "questions", "tasks")
                .put("properties", JSONObject()
                    .put("title", str())
                    .put("summary", str())
                    .put("keyPoints", strs())
                    .put("sections", JSONObject().put("type", "array").put("items",
                        obj("heading", "points").put("properties", JSONObject().put("heading", str()).put("points", strs()))))
                    .put("terms", JSONObject().put("type", "array").put("items",
                        obj("term", "definition").put("properties", JSONObject().put("term", str()).put("definition", str()))))
                    .put("formulas", strs())
                    .put("questions", strs())
                    .put("tasks", strs()))
        }

    private val http by lazy {
        OkHttpClient.Builder().connectTimeout(30, TimeUnit.SECONDS).readTimeout(600, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS).build()
    }

    /** Конспект от Claude (claude-opus-5). Запрос через Messages API, ответ — строго по JSON-схеме. */
    suspend fun claude(l: Lecture, style: LectureStyle, apiKey: String): LectureSummary {
        val system = """
            Ты делаешь конспект университетской лекции для студента САФУ по автоматической расшифровке речи.
            В расшифровке бывают ошибки распознавания — по смыслу исправляй искажённые термины, фамилии и формулы.
            Фрагменты с пометкой [ВАЖНО] студент отметил во время лекции: их обязательно отрази в конспекте.
            Ничего не выдумывай: только то, что было в лекции. Пиши по-русски, ясно и по делу.
            Поля: title — тема лекции; summary — 3–5 предложений о чём лекция; keyPoints — главные мысли;
            sections — разделы лекции с пунктами; terms — определения; formulas — формулы в текстовом виде;
            questions — что вероятно спросят на зачёте/экзамене; tasks — задания, сроки, что подготовить (если звучали).
            Пустые списки — нормально, если такого в лекции не было.
        """.trimIndent()
        val user = "Предмет: ${l.subject.ifEmpty { "не указан" }}\n" +
            "Длительность: ${(l.duration / 60).toInt()} мин\n" +
            "${style.instruction}\n\n<расшифровка>\n${transcriptForAI(l)}\n</расшифровка>"
        val body = JSONObject()
            .put("model", "claude-opus-5")
            .put("max_tokens", 16000)
            .put("fallbacks", "default")
            .put("system", system)
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", user)))
            .put("output_config", JSONObject().put("format", JSONObject().put("type", "json_schema").put("schema", schema)))
        val req = Request.Builder().url("https://api.anthropic.com/v1/messages")
            .post(body.toString().toRequestBody(jsonType))
            .header("x-api-key", apiKey)
            .header("anthropic-version", "2023-06-01")
            .header("anthropic-beta", "server-side-fallback-2026-07-01")
            .build()
        val (code, text) = http.newCall(req).await().use { it.code to (it.body?.string() ?: "") }
        val obj = try { JSONObject(text) } catch (_: Throwable) { null }
        if (code != 200 || obj == null) {
            val msg = obj?.optJSONObject("error")?.optString("message")?.takeIf { it.isNotEmpty() } ?: text
            throw LectureError("Claude API ответил $code: ${msg.take(200)}")
        }
        // сначала смотрим, чем закончился ответ, и только потом читаем содержимое
        when (obj.optString("stop_reason")) {
            "refusal" -> throw LectureError("Claude отказался делать конспект по этой записи")
            "max_tokens" -> throw LectureError("Конспект не поместился — попробуй стиль «Шпаргалка»")
        }
        val blocks = obj.optJSONArray("content") ?: JSONArray()
        val answer = StringBuilder()
        for (i in 0 until blocks.length()) {
            val b = blocks.optJSONObject(i) ?: continue
            if (b.optString("type") == "text") answer.append(b.optString("text"))
        }
        return try { AppJson.decodeFromString<LectureSummary>(answer.toString()) } catch (_: Throwable) {
            throw LectureError("Не удалось разобрать ответ ИИ")
        }
    }

    /** Конспект моделью с небольшим контекстом (GigaChat): лекция пересказывается кусками */
    suspend fun chat(l: Lecture, style: LectureStyle, chunkWords: Int, finalWords: Int,
                     complete: suspend (system: String, user: String) -> String): LectureSummary {
        val (parsed, raw) = LectureMapReduce.run(l, style, chunkWords, finalWords, complete)
        if (parsed != null) return parsed
        val text = raw.trim()
        if (text.isEmpty()) throw LectureError("Не удалось разобрать ответ ИИ")
        // модель ответила текстом, а не JSON — показываем как есть
        return LectureSummary(title = l.subject.ifEmpty { l.title }, summary = text)
    }

    // MARK: конспект без ИИ

    private val stop = setOf("это", "как", "что", "так", "вот", "для", "при", "его", "она", "они", "мы", "вы",
        "или", "если", "то", "там", "тут", "уже", "еще", "ещё", "был", "была", "было",
        "будет", "есть", "нет", "все", "всё", "тоже", "также", "когда", "где", "чтобы",
        "потому", "можно", "нужно", "очень", "этот", "эта", "эти", "этого", "того",
        "который", "которая", "которые", "только", "просто", "значит", "вообще", "ну")

    private val nonLetters = Regex("[^\\p{L}]+")
    private val sentenceEnd = Regex("[.!?…]")

    private fun words(s: String): List<String> = s.lowercase().split(nonLetters).filter { it.length > 3 && it !in stop }

    private fun sentences(text: String): List<String> =
        text.split(sentenceEnd).map { it.trim() }.filter { it.split(" ").count { w -> w.isNotEmpty() } >= 6 }

    /** Простой конспект прямо на телефоне: ключевые фразы, определения, задания */
    fun local(l: Lecture): LectureSummary {
        val text = l.transcript
        val sentences = sentences(text)
        val freq = HashMap<String, Int>()
        for (w in words(text)) freq[w] = (freq[w] ?: 0) + 1
        val top = freq.entries.sortedByDescending { it.value }.take(12).map { it.key }
        fun score(s: String): Double {
            val ws = words(s)
            return ws.sumOf { (freq[it] ?: 0).toDouble() } / maxOf(8, ws.size)
        }
        val best = sentences.mapIndexed { i, s -> Triple(i, s, score(s)) }
            .sortedByDescending { it.third }.take(8).sortedBy { it.first }.map { it.second }
        // по ходу лекции: каждые 10 минут — 2–3 самые содержательные фразы
        val timeline = mutableListOf<LectureSummary.Section>()
        val blocks = l.segments.groupBy { (it.start / 600).toInt() }
        for (k in blocks.keys.sorted()) {
            val part = blocks[k].orEmpty().joinToString(" ") { it.text }
            val ss = sentences(part).filter { it !in best }
            val pick = ss.map { it to score(it) }.sortedByDescending { it.second }.take(if (blocks.size > 6) 2 else 3).map { it.first }
            val ordered = ss.filter { it in pick }
            if (ordered.isNotEmpty()) {
                timeline.add(LectureSummary.Section("${mmss(k * 600.0)}–${mmss((k + 1) * 600.0)}",
                    ordered.map { it.capitalizedFirstLetter() + "." }))
            }
        }
        // отмеченные «важно» — отдельно
        val marked = l.segments.filter { l.isImportant(it) }.map { it.text }
        val terms = sentences.mapNotNull { s ->
            for (sep in listOf(" — это ", " - это ", " это ", " называется ", " называют ")) {
                val i = s.indexOf(sep)
                if (i in 0 until 40) {
                    val term = s.substring(0, i).trim()
                    val def = s.substring(i + sep.length).trim()
                    if (term.split(" ").count { it.isNotEmpty() } <= 4 && def.length > 10) {
                        return@mapNotNull LectureSummary.Term(term.capitalizedFirstLetter(), def)
                    }
                }
            }
            null
        }
        val taskWords = listOf("домашн", "задани", "сдать", "к следующ", "дедлайн", "срок", "подготов", "контрольн", "лабораторн")
        val tasks = sentences.filter { s -> taskWords.any { s.lowercase().contains(it) } }.take(6)
        val sections = (if (marked.isEmpty()) emptyList() else listOf(LectureSummary.Section("Отмечено как важное", marked.take(10)))) +
            timeline +
            // ключевые слова — отдельным разделом
            (if (top.isEmpty()) emptyList() else listOf(LectureSummary.Section("Ключевые слова", listOf(top.joinToString(", ")))))
        return LectureSummary(
            title = l.subject.ifEmpty { l.title },
            summary = best.take(2).joinToString(". ") + if (best.isEmpty()) "" else ".",
            keyPoints = best,
            sections = sections,
            terms = terms.take(10),
            tasks = tasks,
        )
    }
}

// MARK: - Пересказ длинной лекции кусками (для моделей с небольшим контекстом)

object LectureMapReduce {
    private fun words(s: String): List<String> = s.split(' ', '\n').filter { it.isNotEmpty() }

    private fun chunks(text: String, size: Int): List<String> {
        val w = words(text)
        if (w.size <= size) return listOf(text)
        return w.chunked(size).map { it.joinToString(" ") }
    }

    private val chunkSystem = """
        Ты помогаешь студенту конспектировать лекцию по автоматической расшифровке речи (в ней бывают ошибки — исправляй по смыслу).
        Выпиши из фрагмента главное: ключевые мысли, определения, формулы, примеры, задания и сроки.
        Пометка [ВАЖНО] — это студент отметил как важное: сохрани обязательно. Пиши кратко, списком, по-русски. Ничего не выдумывай.
    """.trimIndent()

    private fun finalSystem(style: LectureStyle) = """
        Ты делаешь конспект университетской лекции для студента САФУ. ${style.instruction}
        Ничего не выдумывай — только то, что было в лекции. Пиши по-русски.
        Верни ТОЛЬКО JSON без пояснений и без markdown, строго такого вида:
        {"title":"тема","summary":"3–5 предложений о чём лекция","keyPoints":["главная мысль"],"sections":[{"heading":"раздел","points":["пункт"]}],"terms":[{"term":"термин","definition":"определение"}],"formulas":["формула"],"questions":["что могут спросить на экзамене"],"tasks":["задание или срок"]}
        Если чего-то в лекции не было — оставь пустой список.
    """.trimIndent()

    /** Возвращает готовый конспект, а если модель не выдала JSON — её текст как есть */
    suspend fun run(l: Lecture, style: LectureStyle, chunkWords: Int, finalWords: Int,
                    complete: suspend (String, String) -> String): Pair<LectureSummary?, String> {
        var notes = LectureSummarizer.transcriptForAI(l)
        // сжимаем, пока не влезет в одну финальную просьбу
        var round = 0
        while (words(notes).size > finalWords && round < 4) {
            val parts = chunks(notes, chunkWords)
            val out = ArrayList<String>()
            for ((i, p) in parts.withIndex()) out.add(complete(chunkSystem, "Фрагмент ${i + 1} из ${parts.size}:\n\n$p"))
            notes = out.joinToString("\n")
            round++
        }
        val subject = l.subject.ifEmpty { "не указан" }
        val answer = complete(finalSystem(style), "Предмет: $subject\n\nМатериал лекции:\n\n$notes")
        return parse(answer) to answer
    }

    /** Разбор без строгости: GigaChat иногда пропускает поля или оборачивает JSON в текст */
    fun parse(text: String): LectureSummary? {
        val a = text.indexOf('{')
        val b = text.lastIndexOf('}')
        if (a < 0 || b <= a) return null
        val o = try { JSONObject(text.substring(a, b + 1)) } catch (_: Throwable) { return null }
        fun str(v: Any?): String = (v as? String)?.trim() ?: ""
        fun list(v: Any?): List<String> {
            val arr = v as? JSONArray ?: return emptyList()
            return (0 until arr.length()).mapNotNull { i ->
                when (val item = arr.opt(i)) {
                    is String -> item
                    is JSONObject -> item.keys().asSequence().mapNotNull { k -> item.opt(k) as? String }.joinToString(" — ")
                    else -> null
                }
            }.map { it.trim() }.filter { it.isNotEmpty() }
        }
        fun objects(v: Any?): List<JSONObject> {
            val arr = v as? JSONArray ?: return emptyList()
            return (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
        }
        val sections = objects(o.opt("sections")).mapNotNull { d ->
            val pts = list(d.opt("points"))
            if (pts.isEmpty()) null else LectureSummary.Section(str(d.opt("heading")).ifEmpty { "Раздел" }, pts)
        }
        val terms = objects(o.opt("terms")).mapNotNull { d ->
            val t = str(d.opt("term"))
            if (t.isEmpty()) null else LectureSummary.Term(t, str(d.opt("definition")))
        }
        val s = LectureSummary(
            title = str(o.opt("title")).ifEmpty { "Лекция" },
            summary = str(o.opt("summary")),
            keyPoints = list(o.opt("keyPoints")),
            sections = sections,
            terms = terms,
            formulas = list(o.opt("formulas")),
            questions = list(o.opt("questions")),
            tasks = list(o.opt("tasks")),
        )
        if (s.summary.isEmpty() && s.keyPoints.isEmpty() && s.sections.isEmpty()) return null
        return s
    }
}
