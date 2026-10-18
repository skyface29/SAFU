package ru.student.safuhub.feature.grades

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.AppleDate
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import java.time.Instant
import java.util.Locale
import kotlin.math.min

// MARK: - БРС: балльно-рейтинговая система
// Баллы по каждому предмету, прогноз оценки, сколько не хватает до зачёта / 4 / 5 / автомата.
// Хранится под старым ключом grades.v1 — прежние оценки не пропадут.

@Serializable
data class GradeEntry(
    val id: String = newId(),
    val title: String = "Работа",
    val points: Double = 0.0,
    /** 0 — без максимума */
    val outOf: Double = 0.0,
    val date: AppleDate = Instant.now(),
    /** "" — вписано вручную, иначе откуда подтянуто (Sakai / ЛК) */
    val source: String = "",
) {
    /** Итоговый балл из Личного кабинета — он уже включает всё остальное */
    val isTotal: Boolean get() = source == "ЛК" && title == "Итог"
}

enum class ControlType(val raw: Int, val title: String) {
    CREDIT(0, "Зачёт"), EXAM(1, "Экзамен"), GRADED(2, "Дифзачёт");

    companion object {
        fun of(raw: Int) = entries.firstOrNull { it.raw == raw } ?: EXAM
    }
}

@Serializable
data class SubjectGrades(
    val id: String = newId(),
    val subject: String = "",
    val entries: List<GradeEntry> = emptyList(),
    /** зачёт / «3» */
    val pass: Double = 61.0,
    /** «4» */
    val good: Double = 76.0,
    /** «5» */
    val excellent: Double = 91.0,
    /** автомат */
    val auto: Double = 85.0,
    val max: Double = 100.0,
    /** ControlType.raw */
    val control: Int = 1,
    /** итог после сессии */
    val result: String = "",
) {
    val controlType: ControlType get() = ControlType.of(control)

    val total: Double
        get() {
            entries.filter { it.isTotal }.maxOfOrNull { it.points }?.let { return it }
            return entries.sumOf { it.points }
        }

    val isAuto: Boolean get() = entries.any { it.source.isNotEmpty() }
    val ratio: Double get() = if (max > 0) min(1.0, total / max) else 0.0

    /** Прогноз по текущим баллам */
    val forecast: String
        get() {
            val t = total
            return when (controlType) {
                ControlType.CREDIT -> if (t >= pass) "зачёт" else "пока не зачёт"
                else -> when {
                    t >= excellent -> "5"
                    t >= good -> "4"
                    t >= pass -> "3"
                    else -> "—"
                }
            }
        }

    /** Что делать дальше — одной строкой */
    val nextStep: String
        get() {
            val t = total
            fun f(v: Double) = BRSFormat.num(v)
            if (result.isNotEmpty()) return "Итог: $result"
            if (t >= max) return "Максимум набран 🔥"
            if (controlType == ControlType.CREDIT) {
                if (t >= auto) return "Автомат есть 🎉"
                if (t >= pass) return "Зачёт есть · до автомата ${f(auto - t)}"
                return "До зачёта ${f(pass - t)}"
            }
            if (t >= excellent) return "Идёшь на «5» 🎉"
            if (t >= good) return "Сейчас «4» · до «5» ${f(excellent - t)}"
            if (t >= pass) return "Сейчас «3» · до «4» ${f(good - t)}"
            return "До «3» не хватает ${f(pass - t)}"
        }
}

/** Цвет состояния предмета */
@Composable
fun SubjectGrades.statusColor(): Color {
    val t = total
    if (t >= auto || t >= excellent) return Ios.green
    if (t >= pass) return Brand.color
    if (ratio >= 0.4) return Ios.orange
    return Ios.red
}

object BRSFormat {
    fun num(v: Double): String = if (v == Math.rint(v) && !v.isInfinite()) v.toLong().toString() else String.format(Locale.US, "%.1f", v)
}

object GradesStore {
    private const val key = "grades.v1"
    private val state = mutableStateOf<List<SubjectGrades>?>(null)

    var items: List<SubjectGrades>
        get() = state.value ?: (Defaults.decode<List<SubjectGrades>>(key) ?: emptyList()).also { state.value = it }
        set(v) {
            state.value = v
            Defaults.encode(key, v)
        }

    fun index(subject: String): Int? = items.indexOfFirst { it.subject == subject }.takeIf { it >= 0 }

    fun update(id: String, f: (SubjectGrades) -> SubjectGrades) {
        items = items.map { if (it.id == id) f(it) else it }
    }

    val average: Double
        get() {
            val list = items.filter { it.entries.isNotEmpty() }
            if (list.isEmpty()) return 0.0
            return list.sumOf { it.total } / list.size
        }
}
