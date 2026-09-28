package ru.student.safuhub.feature.matrix

import android.content.Context
import android.graphics.Rect
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
    val wolfram: String get() = "{" + a.joinToString(",") { row -> "{" + row.joinToString(",") { MatrixFmt.nice(it) } + "}" } + "}"

    val text: String get() = a.joinToString("\n") { row -> row.joinToString("\t") { MatrixFmt.nice(it) } }
}

object MatrixFmt {
    /** Красиво: целые — целыми, «почти дроби» — дробью (0.3333… → 1/3) */
    fun nice(x: Double): String {
        if (!x.isFinite()) return "—"
        if (abs(x - Math.rint(x)) < 1e-9) return Math.rint(x).roundToLong().toString()
        for (d in 2..1000) {
            val n = x * d
            if (abs(n - Math.rint(n)) < 1e-7 * d) return "${Math.rint(n).roundToLong()}/$d"
        }
        return plain(x)
    }

    fun plain(x: Double): String {
        if (!x.isFinite()) return "0"
        if (abs(x - Math.rint(x)) < 1e-9) return Math.rint(x).roundToLong().toString()
        var s = String.format(Locale.US, "%.6f", x)
        while (s.endsWith("0")) s = s.dropLast(1)
        if (s.endsWith(".")) s = s.dropLast(1)
        return s
    }

    private val number = Regex("^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)$")

    /** Разбор ввода: «-3», «2,5», «1/3», «−7» */
    fun parse(s: String): Double? {
        val t = s.trim().replace("−", "-").replace("–", "-").replace("—", "-").replace(",", ".")
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
    RREF("Ступенчатый вид", "row reduce"), TRANSPOSE("Транспонировать", "transpose"), SQUARE("A²", "square"),
}

@Composable
fun MatrixScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
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

        FormSection("Матрица") {
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
            }
        }

        FormSection("Посчитать") {
            picker("Действие", Op.entries.map { it to it.title }, op, { op = it })
            raw { Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) { Result(matrix, op) { load(it) } } }
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
        Op.RREF -> MatrixResult(m.reduced().m, onLoad)
        Op.TRANSPOSE -> MatrixResult(m.transposed, onLoad)
        Op.SQUARE -> (m * m)?.let { MatrixResult(it, onLoad) } ?: Hint("A² есть только у квадратной матрицы")
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
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            for (j in 0 until m.cols) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (i in 0 until m.rows) Text(MatrixFmt.nice(m.a[i][j]), style = ft(Ts.body, FontWeight.SemiBold, mono = true), color = Ios.label)
                }
            }
        }
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
