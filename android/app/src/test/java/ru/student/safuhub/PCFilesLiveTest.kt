package ru.student.safuhub

import android.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import ru.student.safuhub.feature.pcsync.PCFiles
import ru.student.safuhub.feature.pcsync.SyncLink
import ru.student.safuhub.feature.pcsync.SyncPairing
import java.io.File
import kotlin.random.Random

/** Живая проверка: файлы уходят на настоящий сервер Арктики для Windows (windows/scripts/live-files.mjs).
 *  Без -Darktika.syncLink пропускается */
@RunWith(RobolectricTestRunner::class)
class PCFilesLiveTest {
    @Test
    fun filesReachWindows() {
        // «@путь» — ссылка в файле: cmd.exe режет «&» в аргументах gradlew.bat
        val raw = System.getProperty("arktika.syncLink")?.let { if (it.startsWith("@")) File(it.drop(1)).readText().trim() else it }
        assumeTrue(raw != null && raw.contains("127.0.0.1"))
        // SyncLink.parse не пускает 127.0.0.1 (только домашняя сеть) — разбираем сами
        val q = raw!!.substringAfter('?').split('&').associate { it.substringBefore('=') to it.substringAfter('=') }
        val key = SyncLink.b64url(q.getValue("k"))!!
        val p = SyncPairing(listOf("127.0.0.1"), q.getValue("p").toInt(), q.getValue("i"), Base64.encodeToString(key, Base64.NO_WRAP), "PC", 0.0)
        val dir = File(System.getProperty("java.io.tmpdir"), "arktika-files-" + System.nanoTime()).apply { mkdirs() }
        fun file(name: String, size: Int) = File(dir, name).apply { writeBytes(Random(size).nextBytes(size)) }
        val items = listOf(
            PCFiles.Item("Предметы/Матанализ/Доска 01.10 10-00-00.jpg", file("a.jpg", 1200), 1200, 1_700_000_000_000),
            PCFiles.Item("ДЗ с iPhone/0f8fad5b-d9cb-469f-a165-70867728950e/1.jpg", file("b.jpg", 900), 900, 1_700_000_000_000),
            // больше одного куска (4 МБ) — проверка докачки по частям
            PCFiles.Item("Лекции/Лекция 1.m4a", file("c.m4a", 9 * 1024 * 1024 + 17), 9L * 1024 * 1024 + 17, 1_700_000_000_000),
        )
        val progress = mutableListOf<Pair<Int, Int>>()
        assertEquals(3, PCFiles.send(items, p) { d, t -> progress += d to t })
        assertEquals(3 to 3, progress.last())
        // второй раз — всё уже на компьютере
        assertEquals(0, PCFiles.send(items, p) { _, _ -> })
        dir.deleteRecursively()
    }
}
