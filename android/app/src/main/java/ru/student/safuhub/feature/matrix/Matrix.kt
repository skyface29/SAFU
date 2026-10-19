package ru.student.safuhub.feature.matrix

import android.content.Context
import android.graphics.Rect
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.ui.draw.drawBehind
import ru.student.safuhub.ui.kit.BarIcon
import ru.student.safuhub.ui.kit.LocalNav
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import ru.student.safuhub.core.prefString
import ru.student.safuhub.feature.web.CustomTabs
import ru.student.safuhub.system.rememberCamera
import ru.student.safuhub.system.rememberMediaPicker
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalPushed
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.net.URLEncoder
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToLong

// MARK: - Матрицы по фото
// Сфоткал матрицу из задачника или с доски → числа распознаются прямо на телефоне (без интернета)
// → проверяешь, правишь → определитель, обратная, ранг и т. д. считаются сразу,
// а «Решение в Wolfram|Alpha» открывает сайт с этой же матрицей (там же собственные числа и шаги решения).

class Matrix(val a: List<DoubleArray>) {
    val rows: Int get() = a.size
    val cols: Int get() = a.firstOrNull()?.size ?: 0
    val isSquare: Boolean get() = rows == cols

    companion object {
        fun zeros(rows: Int, cols: Int) = Matrix(List(rows) { DoubleArray(cols) })
    }

    private fun copy() = Matrix(a.map { it.copyOf() })

    val transposed: Matrix get() = Matrix(List(cols) { j -> DoubleArray(rows) { i -> a[i][j] } })

    operator fun times(r: Matrix): Matrix? {
        if (cols != r.rows) return null
        return Matrix(List(rows) { i -> DoubleArray(r.cols) { j -> (0 until cols).sumOf { k -> a[i][k] * r.a[k][j] } } })
    }

    data class Reduced(val m: Matrix, val rank: Int, val det: Double)

    /** Ступенчатый вид (метод Гаусса — Жордана): матрица, ранг и определитель (для квадратной) */
    fun reduced(): Reduced {
        val m = copy()
        val rowsList = m.a.toMutableList()
        var det = 1.0
        var r = 0
        val eps = 1e-10
        for (c in 0 until cols) {
            if (r >= rows) break
            // строка с самым большим по модулю элементом — меньше ошибок округления
            var p = r
            for (i in r until rows) if (abs(rowsList[i][c]) > abs(rowsList[p][c])) p = i
            if (abs(rowsList[p][c]) <= eps) { det = 0.0; continue }
            if (p != r) { val t = rowsList[p]; rowsList[p] = rowsList[r]; rowsList[r] = t; det = -det }
            val pv = rowsList[r][c]
            det *= pv
            for (j in 0 until cols) rowsList[r][j] /= pv
            for (i in 0 until rows) {
                if (i == r) continue
                val f = rowsList[i][c]
                if (f != 0.0) for (j in 0 until cols) rowsList[i][j] -= f * rowsList[r][j]
            }
            r += 1
        }
        if (r < min(rows, cols) || !isSquare) det = if (isSquare) 0.0 else Double.NaN
        for (row in rowsList) for (j in row.indices) if (abs(row[j]) < eps) row[j] = 0.0
        return Reduced(Matrix(rowsList), r, det)
    }

    val inverse: Matrix?
        get() {
            if (!isSquare) return null
            val aug = Matrix(List(rows) { i -> DoubleArray(cols * 2) { j -> if (j < cols) a[i][j] else if (j - cols == i) 1.0 else 0.0 } })
            val r = aug.reduced()
            for (i in 0 until rows) if (abs(r.m.a[i][i] - 1) > 1e-8) return null
            return Matrix(r.m.a.map { it.copyOfRange(cols, cols * 2) })
        }

    /** Запись для Wolfram|Alpha: {{1,2},{3,4}} */
    val wolfram: String get() = "{" + a.joinToString(",") { row -> "{" + row.joinToString(",") { MatrixFmt.nice(it).replace("−", "-") } + "}" } + "}"

    val text: String get() = a.joinToString("\n") { row -> row.joinToString("\t") { MatrixFmt.nice(it) } }
}

object MatrixFmt {
    /** Красиво: целые — целыми, «почти дроби» — дробью (0.3333… → 1/3) */
    fun nice(x: Double): String {
        if (!x.isFinite()) return "—"
        if (abs(x - Math.rint(x)) < 1e-9) return minus(Math.rint(x).roundToLong().toString())
        for (d in 2..1000) {
            val n = x * d
            if (abs(n - Math.rint(n)) < 1e-7 * d) return minus("${Math.rint(n).roundToLong()}/$d")
        }
        return minus(plain(x))
    }

    /** Настоящий знак минус «−» вместо дефиса — как в учебнике */
    private fun minus(s: String) = if (s.startsWith("-")) "−" + s.drop(1) else s

    /** Число в скобках, если оно отрицательное: «(−2)» */
    fun paren(x: Double): String = nice(x).let { if (x < 0) "($it)" else it }

    fun plain(x: Double): String {
        if (!x.isFinite()) return "0"
        if (abs(x - Math.rint(x)) < 1e-9) return Math.rint(x).roundToLong().toString()
        var s = String.format(Locale.US, "%.6f", x)
        while (s.endsWith("0")) s = s.dropLast(1)
        if (s.endsWith(".")) s = s.dropLast(1)
        return s
    }

    private val number = Regex("^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)$")

    /** Разбор ввода: «-3», «2,5», «1/3», «−7», «+4» */
    fun parse(s: String): Double? {
        val t = s.trim().replace("−", "-").replace("–", "-").replace("—", "-").replace(",", ".").replace(" ", "").removePrefix("+")
        if (t.isEmpty()) return 0.0
        val slash = t.indexOf('/')
        if (slash >= 0) {
            val n = t.substring(0, slash).takeIf { number.matches(it) }?.toDoubleOrNull() ?: return null
            val d = t.substring(slash + 1).takeIf { number.matches(it) }?.toDoubleOrNull() ?: return null
            return if (d != 0.0) n / d else null
        }
        return if (number.matches(t)) t.toDoubleOrNull() else null
    }
}

// MARK: - Решение по шагам (как iPhone 19.8)

/** Один шаг решения: что сделали и что получилось; [bar] — столбец, перед которым черта (расширенная матрица) */
data class MatrixStep(val title: String, val lines: List<String> = emptyList(), val matrix: Matrix? = null, val bar: Int? = null)

/** Расписывает решение, как его пишут в тетради: перестановки строк, вычитание строк, деление на ведущий элемент */
object MatrixSolver {
    private const val EPS = 1e-9

    private fun copy(m: Matrix) = Matrix(m.a.map { it.copyOf() })
    private fun swap(m: Matrix, i: Int, j: Int): Matrix = Matrix(m.a.toMutableList().also { val t = it[i]; it[i] = it[j]; it[j] = t })

    /** Ведущий элемент столбца: лучше ±1 (так проще считать руками), иначе первый ненулевой */
    private fun pivotRow(m: Matrix, c: Int, r: Int): Int? {
        if (r >= m.rows) return null
        var first: Int? = null
        for (i in r until m.rows) {
            if (abs(m.a[i][c]) <= EPS) continue
            if (abs(abs(m.a[i][c]) - 1) < EPS) return i
            if (first == null) first = i
        }
        return first
    }

    private fun clean(m: Matrix) { for (row in m.a) for (j in row.indices) if (abs(row[j]) < 1e-10) row[j] = 0.0 }

    /** «стр. 2 − 3·стр. 1» (вычитаем f раз строку src) */
    private fun rowOp(dst: Int, f: Double, src: Int): String {
        val k = abs(f)
        val coef = if (abs(k - 1) < EPS) "" else MatrixFmt.nice(k) + "·"
        return "стр. ${dst + 1} ${if (f > 0) "−" else "+"} ${coef}стр. ${src + 1}"
    }

    private fun subtract(m: Matrix, i: Int, f: Double, r: Int) { for (j in 0 until m.cols) m.a[i][j] -= f * m.a[r][j] }

    /** Определитель: приводим к треугольному виду, потом перемножаем диагональ */
    fun determinant(m0: Matrix): List<MatrixStep> {
        var m = copy(m0)
        val n = m.rows
        val steps = mutableListOf(MatrixStep("Исходная матрица", matrix = copy(m)))
        val a = m0.a
        fun p(x: Double) = MatrixFmt.paren(x)
        if (n == 2) {
            val d = a[0][0] * a[1][1] - a[0][1] * a[1][0]
            steps += MatrixStep("Формула для 2×2", listOf(
                "det A = a₁₁·a₂₂ − a₁₂·a₂₁",
                "= ${p(a[0][0])}·${p(a[1][1])} − ${p(a[0][1])}·${p(a[1][0])}",
                "= ${MatrixFmt.nice(d)}"))
            return steps
        }
        if (n == 3) {
            val plus = listOf(a[0][0] * a[1][1] * a[2][2], a[0][1] * a[1][2] * a[2][0], a[0][2] * a[1][0] * a[2][1])
            val minus = listOf(a[0][2] * a[1][1] * a[2][0], a[0][0] * a[1][2] * a[2][1], a[0][1] * a[1][0] * a[2][2])
            val d = plus.sum() - minus.sum()
            steps += MatrixStep("Правило треугольников (Саррюса)", listOf(
                "det A = a₁₁a₂₂a₃₃ + a₁₂a₂₃a₃₁ + a₁₃a₂₁a₃₂ − a₁₃a₂₂a₃₁ − a₁₁a₂₃a₃₂ − a₁₂a₂₁a₃₃",
                "= ${p(a[0][0])}·${p(a[1][1])}·${p(a[2][2])} + ${p(a[0][1])}·${p(a[1][2])}·${p(a[2][0])} + ${p(a[0][2])}·${p(a[1][0])}·${p(a[2][1])}",
                "  − ${p(a[0][2])}·${p(a[1][1])}·${p(a[2][0])} − ${p(a[0][0])}·${p(a[1][2])}·${p(a[2][1])} − ${p(a[0][1])}·${p(a[1][0])}·${p(a[2][2])}",
                "= ${MatrixFmt.nice(plus[0])} + ${p(plus[1])} + ${p(plus[2])} − ${p(minus[0])} − ${p(minus[1])} − ${p(minus[2])}",
                "= ${MatrixFmt.nice(d)}"))
            steps += MatrixStep("Проверка методом Гаусса")
        }
        var sign = 1.0
        for (c in 0 until n) {
            val pr = pivotRow(m, c, c)
            if (pr == null) {
                steps += MatrixStep("Столбец ${c + 1}", listOf("На диагонали и ниже — одни нули, значит det A = 0"))
                return steps
            }
            val lines = mutableListOf<String>()
            if (pr != c) {
                m = swap(m, pr, c)
                sign = -sign
                lines += "Меняем местами строки ${c + 1} и ${pr + 1} — знак определителя меняется"
            }
            for (i in c + 1 until n) {
                if (abs(m.a[i][c]) <= EPS) continue
                val f = m.a[i][c] / m.a[c][c]
                subtract(m, i, f, c)
                m.a[i][c] = 0.0
                lines += "стр. ${i + 1} → " + rowOp(i, f, c)
            }
            clean(m)
            if (lines.isNotEmpty()) steps += MatrixStep("Нули под диагональю в столбце ${c + 1}", lines, copy(m))
        }
        var d = sign
        val factors = (0 until n).map { d *= m.a[it][it]; MatrixFmt.paren(m.a[it][it]) }
        steps += MatrixStep("Матрица треугольная", listOf(
            "Определитель — произведение чисел на диагонали" + if (sign < 0) ", со знаком «−»: строки менялись нечётное число раз" else "",
            "det A = ${if (sign < 0) "−" else ""}${factors.joinToString(" · ")} = ${MatrixFmt.nice(d)}"))
        return steps
    }

    class GJ(val m: Matrix, val pivots: List<Int>)

    /** Метод Гаусса — Жордана: в каждом столбце ведущая единица, над и под ней нули */
    fun gaussJordan(m0: Matrix, columns: Int, bar: Int?, steps: MutableList<MatrixStep>): GJ {
        var m = copy(m0)
        var r = 0
        val pivots = mutableListOf<Int>()
        for (c in 0 until min(columns, m.cols)) {
            if (r >= m.rows) break
            val pr = pivotRow(m, c, r) ?: continue
            val lines = mutableListOf<String>()
            if (pr != r) {
                m = swap(m, pr, r)
                lines += "Меняем местами строки ${r + 1} и ${pr + 1}"
            }
            val pv = m.a[r][c]
            if (abs(pv - 1) > EPS) {
                for (j in 0 until m.cols) m.a[r][j] /= pv
                lines += if (abs(pv + 1) < EPS) "стр. ${r + 1} · (−1)" else "стр. ${r + 1} : ${MatrixFmt.paren(pv)}"
            }
            for (i in 0 until m.rows) {
                if (i == r || abs(m.a[i][c]) <= EPS) continue
                val f = m.a[i][c]
                subtract(m, i, f, r)
                m.a[i][c] = 0.0
                lines += "стр. ${i + 1} → " + rowOp(i, f, r)
            }
            clean(m)
            pivots += c
            if (lines.isNotEmpty()) steps += MatrixStep("Столбец ${c + 1}: ведущий элемент в строке ${r + 1}", lines, copy(m), bar)
            r += 1
        }
        return GJ(m, pivots)
    }

    /** Обратная матрица: [A | E] → [E | A⁻¹] */
    fun inverse(a: Matrix): List<MatrixStep> {
        val n = a.rows
        val aug = Matrix(List(n) { i -> DoubleArray(2 * n) { j -> if (j < n) a.a[i][j] else if (j - n == i) 1.0 else 0.0 } })
        val steps = mutableListOf(MatrixStep("Приписываем справа единичную матрицу: [A | E]", matrix = aug, bar = n))
        val res = gaussJordan(aug, n, n, steps)
        steps += if (res.pivots.size < n)
            MatrixStep("Слева не получилась единичная матрица", listOf("Ранг меньше $n: det A = 0, обратной матрицы нет"))
        else MatrixStep("Слева — E, справа — обратная матрица", listOf("A⁻¹ ="), Matrix(res.m.a.map { it.copyOfRange(n, 2 * n) }))
        return steps
    }

    /** Ранг: сколько ненулевых строк осталось в ступенчатом виде */
    fun rank(a: Matrix): List<MatrixStep> {
        val steps = mutableListOf(MatrixStep("Исходная матрица", matrix = a))
        val res = gaussJordan(a, a.cols, null, steps)
        steps += MatrixStep("Ступенчатый вид", listOf("Ненулевых строк: ${res.pivots.size}", "rang A = ${res.pivots.size}"))
        return steps
    }

    class SystemResult(val steps: List<MatrixStep>, val answer: List<String>)

    /** Система уравнений: последний столбец — правые части */
    fun system(a: Matrix): SystemResult {
        val vars = a.cols - 1
        val steps = mutableListOf(MatrixStep("Расширенная матрица системы (A | b)", matrix = a, bar = vars))
        val res = gaussJordan(a, vars, vars, steps)
        val m = res.m
        // строка «0 = b» с b ≠ 0 — противоречие
        for (i in 0 until m.rows) {
            val zeros = (0 until vars).all { abs(m.a[i][it]) < 1e-9 }
            if (zeros && abs(m.a[i][vars]) > 1e-9) {
                val answer = listOf("Строка ${i + 1}: 0 = ${MatrixFmt.nice(m.a[i][vars])} — противоречие", "Система несовместна: решений нет")
                steps += MatrixStep("Ответ", answer)
                return SystemResult(steps, answer)
            }
        }
        val answer = mutableListOf<String>()
        val free = (0 until vars).filter { it !in res.pivots }
        res.pivots.forEachIndexed { row, c ->
            val sb = StringBuilder("x${sub(c + 1)} = ${MatrixFmt.nice(m.a[row][vars])}")
            for (f in free) {
                if (abs(m.a[row][f]) <= 1e-9) continue
                val k = -m.a[row][f]
                val coef = if (abs(abs(k) - 1) < 1e-9) "" else MatrixFmt.nice(abs(k)) + "·"
                sb.append(" ${if (k > 0) "+" else "−"} ${coef}x${sub(f + 1)}")
            }
            answer += sb.toString()
        }
        answer += if (free.isEmpty()) "Решение единственное"
        else free.joinToString(", ") { "x${sub(it + 1)}" } + " — свободные (любые числа): решений бесконечно много"
        steps += MatrixStep("Ответ", answer)
        return SystemResult(steps, answer)
    }

    /** x₁, x₂… — индексы мелкими цифрами */
    fun sub(n: Int): String = n.toString().map { "₀₁₂₃₄₅₆₇₈₉"[it - '0'] }.joinToString("")

    /** Всё решение текстом — отправить в чат или вставить в отчёт */
    fun plainText(title: String, steps: List<MatrixStep>): String = buildString {
        append(title)
        steps.forEachIndexed { i, s ->
            append("\n\n${i + 1}. ${s.title}")
            for (l in s.lines) append("\n").append(l)
            s.matrix?.let { append("\n").append(it.text) }
        }
    }
}

// MARK: - Распознавание матрицы на фото

object MatrixOCR {
    private class Token(val value: Double, val x: Double, val y: Double, val h: Double)

    private val pattern = Regex("[-−–—]?\\s?\\d+(?:[.,]\\d+)?(?:/\\d+)?")

    suspend fun recognize(ctx: Context, uri: Uri): Matrix? {
        val image = try { InputImage.fromFilePath(ctx, uri) } catch (_: Throwable) { return null }
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val text = try {
            suspendCancellableCoroutine<com.google.mlkit.vision.text.Text?> { c ->
                recognizer.process(image)
                    .addOnSuccessListener { if (c.isActive) c.resume(it) }
                    .addOnFailureListener { if (c.isActive) c.resume(null) }
            }
        } finally {
            recognizer.close()
        } ?: return null

        val tokens = mutableListOf<Token>()
        for (block in text.textBlocks) for (line in block.lines) {
            // строка = слова со своими рамками; «− 3» может быть двумя словами
            val parts = line.elements.mapNotNull { e -> e.boundingBox?.let { e.text to it } }
            if (parts.isEmpty()) continue
            val sb = StringBuilder()
            val owner = mutableListOf<Int>()
            parts.forEachIndexed { i, (t, _) ->
                if (i > 0) { sb.append(' '); owner.add(-1) }
                sb.append(t)
                repeat(t.length) { owner.add(i) }
            }
            val s = sb.toString()
            for (m in pattern.findAll(s)) {
                val raw = m.value.replace(" ", "")
                val v = MatrixFmt.parse(raw) ?: continue
                val idx = (m.range.first..m.range.last).map { owner.getOrElse(it) { -1 } }.filter { it >= 0 }.toSet()
                if (idx.isEmpty()) continue
                val box = Rect(parts[idx.first()].second)
                for (i in idx) box.union(parts[i].second)
                tokens.add(Token(v, box.exactCenterX().toDouble(), box.exactCenterY().toDouble(), maxOf(box.height().toDouble(), 1.0)))
            }
        }
        if (tokens.isEmpty()) return null

        // строки: близкие по высоте числа (y растёт сверху вниз)
        val hs = tokens.map { it.h }.sorted()
        val gap = hs[hs.size / 2] * 0.6
        var rows = mutableListOf<MutableList<Token>>()
        for (t in tokens.sortedBy { it.y }) {
            val last = rows.lastOrNull()
            if (last != null && abs(last.first().y - t.y) < gap) last.add(t) else rows.add(mutableListOf(t))
        }
        rows = rows.map { r -> r.sortedBy { it.x }.toMutableList() }.toMutableList()

        // сколько столбцов: самое частое число чисел в строке
        val counts = rows.groupingBy { it.size }.eachCount()
        val n = counts.entries.maxWithOrNull(compareBy<Map.Entry<Int, Int>> { it.value }.thenBy { it.key })?.key ?: return null
        // случайные надписи (номер задачи, «A =») отбрасываем
        rows = rows.filter { it.size * 2 >= n && it.size <= n + 1 }.toMutableList()
        if (rows.isEmpty() || n <= 0) return null

        // центры столбцов — по «полным» строкам; числа неполных строк ставим в ближайший столбец
        val full = rows.filter { it.size == n }
        val centers = (0 until n).map { j -> full.sumOf { it[j].x } / maxOf(full.size, 1) }
        val result = mutableListOf<DoubleArray>()
        for (row in rows.take(10)) {
            if (row.size == n) { result.add(row.map { it.value }.toDoubleArray()); continue }
            val line = DoubleArray(n)
            for (t in row.take(n)) {
                val j = centers.indices.minByOrNull { abs(centers[it] - t.x) } ?: 0
                line[j] = t.value
            }
            result.add(line)
        }
        val m = Matrix(result.map { it.copyOf(minOf(it.size, 10)) })
        return if (m.rows > 0 && m.cols > 0) m else null
    }
}

// MARK: - Экран

private enum class Op(val title: String, val wolfram: String) {
    DET("Определитель", "determinant"), INVERSE("Обратная", "inverse"), RANK("Ранг", "rank"),
    SOLVE("Система уравнений", "row reduce"),
    RREF("Ступенчатый вид", "row reduce"), TRANSPOSE("Транспонировать", "transpose"), SQUARE("A²", "square"),
}

private fun steps(op: Op, m: Matrix): List<MatrixStep>? = when (op) {
    Op.DET -> if (m.isSquare) MatrixSolver.determinant(m) else null
    Op.INVERSE -> if (m.isSquare) MatrixSolver.inverse(m) else null
    Op.RANK, Op.RREF -> MatrixSolver.rank(m)
    Op.SOLVE -> if (m.cols >= 2) MatrixSolver.system(m).steps else null
    else -> null
}

@Composable
fun MatrixScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val nav = LocalNav.current
    var saved by prefString("matrix.last", "")
    var rows by remember { mutableIntStateOf(3) }
    var cols by remember { mutableIntStateOf(3) }
    var cells by remember { mutableStateOf(List(3) { List(3) { "" } }) }
    var op by remember { mutableStateOf(Op.DET) }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }

    fun cell(i: Int, j: Int) = cells.getOrNull(i)?.getOrNull(j) ?: ""
    val matrix: Matrix? = run {
        val out = mutableListOf<DoubleArray>()
        for (i in 0 until rows) {
            val line = DoubleArray(cols)
            for (j in 0 until cols) line[j] = MatrixFmt.parse(cell(i, j)) ?: return@run null
            out.add(line)
        }
        Matrix(out)
    }

    fun load(m: Matrix) {
        val r = min(m.rows, 8)
        val c = min(m.cols, 8)
        rows = r
        cols = c
        cells = List(r) { i -> List(c) { j -> MatrixFmt.nice(m.a[i][j]) } }
    }

    fun resize(clear: Boolean = false) {
        cells = List(rows) { i -> List(cols) { j -> if (!clear) cell(i, j) else "" } }
    }

    /** Матрица из буфера: строки — с новой строки, числа — через пробел, табуляцию или «;» */
    fun paste() {
        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
        val text = cm?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(ctx)?.toString() ?: return
        val lines = text.lines().map { l -> l.split(' ', '\t', ';').filter { it.isNotBlank() }.mapNotNull { MatrixFmt.parse(it) } }.filter { it.isNotEmpty() }
        val c = lines.maxOfOrNull { it.size } ?: return
        load(Matrix(lines.map { (it + List(c - it.size) { 0.0 }).toDoubleArray() }))
        Haptics.success()
    }

    fun recognize(uri: Uri, cleanup: () -> Unit = {}) {
        busy = true
        note = null
        scope.launch {
            val m = MatrixOCR.recognize(ctx, uri)
            cleanup()
            busy = false
            if (m != null) {
                load(m)
                Haptics.success()
                note = "Распознал ${m.rows}×${m.cols}. Сверь с фото и поправь, если что-то не так."
            } else note = "Не нашёл чисел на фото. Сфоткай ближе и ровнее или введи вручную."
        }
    }

    fun openWolfram(command: String) {
        val m = matrix ?: return
        val q = if (command.isEmpty()) m.wolfram else "$command ${m.wolfram}"
        // «+», «{» и «,» в запросе нужно экранировать явно
        CustomTabs.open(ctx, "https://www.wolframalpha.com/input?i=" + URLEncoder.encode(q, "UTF-8").replace("+", "%20"))
    }

    // последняя матрица: {{1,2},{3,4}}
    LaunchedEffect(Unit) {
        if (saved.length < 4) return@LaunchedEffect
        val body = saved.drop(2).dropLast(2)
        val parsed = body.split("},{").map { r -> r.split(",").mapNotNull { MatrixFmt.parse(it) } }
        val c = parsed.firstOrNull()?.size ?: 0
        if (c > 0 && parsed.all { it.size == c }) load(Matrix(parsed.map { it.toDoubleArray() }))
    }
    LaunchedEffect(cells) { matrix?.let { saved = it.wolfram } }

    val camera = rememberCamera { f -> if (f != null) recognize(Uri.fromFile(f)) { f.delete() } }
    val picker = rememberMediaPicker(multiple = false) { uris -> uris.firstOrNull()?.let { recognize(it) } }

    FormScreen("Матрицы", large = !LocalPushed.current) {
        FormSection(footer = "Снимай одну матрицу крупно и ровно. Числа распознаются на телефоне, фото никуда не отправляется. Проверь ячейки — камера может ошибиться.") {
            raw {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Pressable({ camera.open() }, Modifier.weight(1f), enabled = !busy) {
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Brand.color).padding(vertical = 9.dp),
                            contentAlignment = Alignment.Center) {
                            IconLabel("Сфоткать", "camera.fill", style = ft(Ts.body, FontWeight.SemiBold), color = Color.White)
                        }
                    }
                    Pressable({ picker.images() }, Modifier.weight(1f), enabled = !busy) {
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Brand.color.copy(alpha = 0.14f)).padding(vertical = 9.dp),
                            contentAlignment = Alignment.Center) {
                            IconLabel("Из фото", "photo", style = ft(Ts.body, FontWeight.SemiBold), color = Brand.color)
                        }
                    }
                }
            }
            if (busy) row {
                Spinner(18.dp)
                Spacer(Modifier.width(8.dp))
                Text("Распознаю числа…", style = ft(Ts.body), color = Ios.secondaryLabel)
            }
            note?.let { n -> row { Text(n, style = ft(Ts.footnote), color = Ios.secondaryLabel) } }
        }

        FormSection("Матрица", footer = "Можно писать 3, −2, 1,5 или 1/3. Для системы уравнений последний столбец — правые части.") {
            // размер сетки меняем сразу вместе с ячейками
            stepper("Строк: $rows", rows, { rows = it; resize() }, 1..8)
            stepper("Столбцов: $cols", cols, { cols = it; resize() }, 1..8)
            raw {
                val w = if (cols > 5) 44.dp else 56.dp
                Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (i in 0 until rows) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            for (j in 0 until cols) {
                                val bad = MatrixFmt.parse(cell(i, j)) == null
                                Box(Modifier.size(w, 40.dp).clip(RoundedCornerShape(9.dp))
                                    .background(if (bad) Ios.red.copy(alpha = 0.18f) else Ios.label.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
                                    IosTextField(cell(i, j), { v ->
                                        cells = cells.mapIndexed { ri, r -> if (ri == i) r.mapIndexed { cj, x -> if (cj == j) v else x } else r }
                                    }, "0", Modifier.fillMaxWidth().padding(horizontal = 4.dp), style = ft(Ts.body, mono = true),
                                        capitalize = false, textAlign = TextAlign.Center)
                                }
                            }
                        }
                    }
                }
            }
            row {
                TextButton({ resize(clear = true) }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Text("Очистить", style = ft(Ts.subheadline), color = Ios.red)
                }
                Spacer(Modifier.weight(1f))
                TextButton({ matrix?.let { Share.copy(it.text); Haptics.success() } }, enabled = matrix != null,
                    padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    IconLabel("Копировать", "doc.on.doc", style = ft(Ts.subheadline), color = Brand.color)
                }
                Spacer(Modifier.weight(1f))
                TextButton({ paste() }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    IconLabel("Вставить", "doc.on.clipboard", style = ft(Ts.subheadline), color = Brand.color)
                }
            }
        }

        FormSection("Посчитать") {
            picker("Действие", Op.entries.map { it to it.title }, op, { op = it })
            raw { Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) { Result(matrix, op) { load(it) } } }
            val m = matrix
            if (m != null && steps(op, m) != null) link("Решение по шагам", "list.number") {
                val title = op.title
                val s = steps(op, m) ?: return@link
                if (nav != null) nav.push { MatrixStepsScreen(title, s) }
                else Share.text(ctx, MatrixSolver.plainText(title, s), title)
            }
        }

        FormSection("Wolfram|Alpha", footer = "Откроется сайт wolframalpha.com с этой матрицей. Подробные шаги решения там платные, ответ — бесплатно.") {
            button("${op.title} — решение в Wolfram|Alpha", "function", enabled = matrix != null) { openWolfram(op.wolfram) }
            button("Собственные числа и векторы", "sparkle", enabled = matrix != null) { openWolfram("eigenvalues") }
            button("Всё о матрице", "square.grid.3x3", enabled = matrix != null) { openWolfram("") }
        }
    }
}

@Composable
private fun Result(m: Matrix?, op: Op, onLoad: (Matrix) -> Unit) {
    if (m == null) {
        Hint("В красных ячейках не число. Можно писать 3, -2, 1,5 или 1/3")
        return
    }
    when (op) {
        Op.DET -> if (m.isSquare) Value("det A = ${MatrixFmt.nice(m.reduced().det)}") else Hint("Определитель есть только у квадратной матрицы")
        Op.RANK -> Value("rang A = ${m.reduced().rank}")
        Op.INVERSE -> when {
            !m.isSquare -> Hint("Обратная есть только у квадратной матрицы")
            else -> m.inverse?.let { MatrixResult(it, onLoad) } ?: Hint("Определитель равен 0 — обратной матрицы нет")
        }
        Op.SOLVE -> if (m.cols < 2) Hint("Нужно хотя бы два столбца: коэффициенты и правые части") else SelectionContainer {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                for (line in MatrixSolver.system(m).answer) Text(line, style = ft(Ts.body, FontWeight.SemiBold, mono = true), color = Ios.label)
            }
        }
        Op.RREF -> MatrixResult(m.reduced().m, onLoad)
        Op.TRANSPOSE -> MatrixResult(m.transposed, onLoad)
        Op.SQUARE -> (m * m)?.let { MatrixResult(it, onLoad) } ?: Hint("A² есть только у квадратной матрицы")
    }
}

/** Матрица числами в скобках; [bar] — черта перед правой частью */
@Composable
fun MatrixGrid(m: Matrix, bar: Int? = null) {
    val line = Ios.label.copy(alpha = 0.7f)
    @Composable
    fun bracket(left: Boolean) {
        Box(Modifier.width(6.dp).fillMaxHeight().drawBehind {
            val w = 1.5.dp.toPx()
            val x = if (left) 0f else size.width - w
            drawRect(line, androidx.compose.ui.geometry.Offset(x, 0f), androidx.compose.ui.geometry.Size(w, size.height))
            drawRect(line, androidx.compose.ui.geometry.Offset(0f, 0f), androidx.compose.ui.geometry.Size(size.width, w))
            drawRect(line, androidx.compose.ui.geometry.Offset(0f, size.height - w), androidx.compose.ui.geometry.Size(size.width, w))
        })
    }
    Row(Modifier.horizontalScroll(rememberScrollState()).height(IntrinsicSize.Min).padding(vertical = 2.dp)) {
        bracket(true)
        Spacer(Modifier.width(8.dp))
        for (j in 0 until m.cols) {
            if (j > 0) Spacer(Modifier.width(if (bar == j) 0.dp else 14.dp))
            if (bar == j) {
                Spacer(Modifier.width(7.dp))
                Box(Modifier.width(1.2.dp).fillMaxHeight().background(Ios.secondaryLabel.copy(alpha = 0.7f)))
                Spacer(Modifier.width(7.dp))
            }
            Column(Modifier.padding(vertical = 4.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (i in 0 until m.rows) Text(MatrixFmt.nice(m.a[i][j]), style = ft(Ts.body, FontWeight.SemiBold, mono = true), color = Ios.label)
            }
        }
        Spacer(Modifier.width(8.dp))
        bracket(false)
    }
}

/** Решение по шагам — как в тетради */
@Composable
private fun MatrixStepsScreen(title: String, steps: List<MatrixStep>) {
    val ctx = LocalContext.current
    FormScreen(title, trailing = { BarIcon("square.and.arrow.up") { Share.text(ctx, MatrixSolver.plainText(title, steps), title) } }) {
        steps.forEachIndexed { i, s ->
            FormSection("${i + 1}. ${s.title}") {
                for (l in s.lines) row { SelectionContainer { Text(l, style = ft(Ts.subheadline, mono = true), color = Ios.label) } }
                s.matrix?.let { mx -> raw { Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) { MatrixGrid(mx, s.bar) } } }
                if (s.lines.isEmpty() && s.matrix == null) row { Text("Считаем по-другому — результат должен совпасть", style = ft(Ts.subheadline), color = Ios.secondaryLabel) }
            }
        }
    }
}

@Composable
private fun Value(s: String) {
    SelectionContainer { Text(s, style = ft(Ts.title3, FontWeight.Bold, mono = true), color = Ios.label) }
}

@Composable
private fun Hint(s: String) = Text(s, style = ft(Ts.subheadline), color = Ios.secondaryLabel)

@Composable
private fun MatrixResult(m: Matrix, onLoad: (Matrix) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MatrixGrid(m)
        Row {
            TextButton({ Share.copy(m.text); Haptics.success() }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                IconLabel("Копировать", "doc.on.doc", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color)
            }
            Spacer(Modifier.weight(1f))
            TextButton({ onLoad(m) }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                IconLabel("В матрицу", "arrow.up.doc", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color)
            }
        }
    }
}
