package ru.student.safuhub

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.LooperMode
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.HWStep
import ru.student.safuhub.data.Homework
import ru.student.safuhub.data.HomeworkStore
import ru.student.safuhub.feature.pcsync.PCSync
import ru.student.safuhub.feature.pcsync.SyncLink
import java.io.File
import java.time.Instant

/**
 * Живая проверка синхронизации с настоящей Арктикой для Windows в этой же сети.
 * Запускается, только если задана ссылка связки: -Darktika.syncLink=<файл с {url}>
 */
@RunWith(RobolectricTestRunner::class)
@LooperMode(LooperMode.Mode.PAUSED)
class PCSyncLiveTest {
    @Test
    fun syncWithWindows() {
        val file = System.getProperty("arktika.syncLink")?.let(::File)
        assumeTrue("нет ссылки связки", file != null && file.exists())
        val url = Regex("arktika://sync[^\"]+").find(file!!.readText())!!.value.replace("\\u0026", "&")
        // для теста — адрес компьютера в его же сети подставляет Windows; разрешаем и сам компьютер
        val link = SyncLink.parse(url)
        assertNotNull("ссылка не разобралась: $url", link)
        Defaults.init(App.ctx)
        HomeworkStore.load()
        val h = Homework.new("Математический анализ", "решить номер 5,6 стр 45", Instant.now().plusSeconds(86_400))
            .copy(steps = listOf(HWStep(text = "первый пункт")))
        HomeworkStore.upsert(h)
        PCSync.pair(link!!)
        // связка сама запускает первый обмен — ждём, пока он закончится
        val until = System.currentTimeMillis() + 30_000
        while (System.currentTimeMillis() < until && (PCSync.syncing || PCSync.lastSync == null && PCSync.problem == null)) {
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()
            Thread.sleep(100)
        }
        if (PCSync.lastSync == null) runBlocking { PCSync.syncNow() }
        println("sync: syncing=${PCSync.syncing} last=${PCSync.lastSync} problem=${PCSync.problem} error=${PCSync.lastError}")
        assertNull("ошибка синхронизации: ${PCSync.problem}", PCSync.problem)
        assertNotNull(PCSync.lastSync)
        // ДЗ осталось у нас (и уехало на компьютер — это проверяет скрипт со стороны Windows)
        assertEquals(h.text.trim(), HomeworkStore.item(h.id)?.text)
        // и обратно: ДЗ, записанные на компьютере, пришли на телефон
        println("homework on phone after sync: ${HomeworkStore.items.size}")
        org.junit.Assert.assertTrue("с компьютера ничего не пришло", HomeworkStore.items.size > 1)
        File(file.path + ".android.json").writeText("""{"id":"${h.id}","synced":true}""")
    }
}
