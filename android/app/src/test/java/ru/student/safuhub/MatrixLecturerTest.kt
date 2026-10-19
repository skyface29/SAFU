package ru.student.safuhub

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.student.safuhub.data.RuzLecturers
import ru.student.safuhub.feature.matrix.Matrix
import ru.student.safuhub.feature.matrix.MatrixFmt
import ru.student.safuhub.feature.matrix.MatrixSolver

/** Матрицы по шагам и страница преподавателя в РУЗ: то же, что на iPhone 19.8 */
class MatrixLecturerTest {
    private fun m(vararg rows: DoubleArray) = Matrix(rows.toList())
    private fun r(vararg x: Double) = x

    @Test
    fun determinantSteps() {
        val two = MatrixSolver.determinant(m(r(1.0, 2.0), r(3.0, 4.0)))
        assertEquals("= −2", two.last().lines.last())
        val three = MatrixSolver.determinant(m(r(2.0, -1.0, 0.0), r(1.0, 3.0, 2.0), r(0.0, 1.0, 4.0)))
        // правило Саррюса и проверка Гауссом дают одно и то же
        assertEquals("= 24", three[1].lines.last())
        assertTrue(three.last().lines.last().endsWith("= 24"))
        val four = MatrixSolver.determinant(m(r(0.0, 1.0, 0.0, 0.0), r(1.0, 0.0, 0.0, 0.0), r(0.0, 0.0, 2.0, 0.0), r(0.0, 0.0, 0.0, 3.0)))
        assertTrue(four.last().lines.last().endsWith("= −6"))
    }

    @Test
    fun inverseAndRank() {
        val inv = MatrixSolver.inverse(m(r(2.0, 1.0), r(1.0, 1.0)))
        val res = inv.last().matrix!!
        assertEquals("1\t−1\n−1\t2", res.text)
        val singular = MatrixSolver.inverse(m(r(1.0, 2.0), r(2.0, 4.0)))
        assertTrue(singular.last().lines.first().contains("обратной матрицы нет"))
        assertEquals("rang A = 1", MatrixSolver.rank(m(r(1.0, 2.0, 3.0), r(2.0, 4.0, 6.0))).last().lines.last())
    }

    @Test
    fun systems() {
        // x + y = 3, x − y = 1 → x = 2, y = 1
        val one = MatrixSolver.system(m(r(1.0, 1.0, 3.0), r(1.0, -1.0, 1.0))).answer
        assertEquals(listOf("x₁ = 2", "x₂ = 1", "Решение единственное"), one)
        val none = MatrixSolver.system(m(r(1.0, 1.0, 1.0), r(1.0, 1.0, 2.0))).answer
        assertTrue(none.last().contains("решений нет"))
        val many = MatrixSolver.system(m(r(1.0, 2.0, 3.0))).answer
        assertEquals("x₁ = 3 − 2·x₂", many[0])
        assertTrue(many.last().contains("бесконечно много"))
        assertEquals("₁₂", MatrixSolver.sub(12))
    }

    @Test
    fun formatting() {
        assertEquals("−1/3", MatrixFmt.nice(-1.0 / 3))
        assertEquals("(−2)", MatrixFmt.paren(-2.0))
        assertEquals(-7.0, MatrixFmt.parse("−7")!!, 0.0)
        assertEquals(4.0, MatrixFmt.parse("+4")!!, 0.0)
        assertEquals("{{1,-2}}", m(r(1.0, -2.0)).wolfram)
    }

    @Test
    fun lecturerPage() {
        val html = """<a href="?timetable&amp;lecturer=1234">Иванов И.И.</a> <a href="?timetable&lecturer=99">x</a>"""
        val links = RuzLecturers.links(html)
        assertEquals(1, links.size)
        assertEquals("1234", links[0].id)
        assertTrue(RuzLecturers.same("Иванов Иван Иванович", "Иванов И.И."))
        assertFalse(RuzLecturers.same("Иванов А.И.", "Иванов И.И."))
        val weeks = RuzLecturers.weekLinks("""<a href="?timetable&amp;lecturer=1234&amp;date=05.10.2026">""", "lecturer", "1234")
        assertEquals(1, weeks.size)
        assertEquals("https://ruz.narfu.ru/?timetable&lecturer=1234&date=05.10.2026", weeks[0].second)
    }
}
