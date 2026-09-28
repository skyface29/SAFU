@file:Suppress("unused", "UNUSED_PARAMETER")
package ru.student.safuhub.feature.board
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.LessonSlot
object BoardRouter {
    const val subjectKey = "board.subject"
    const val startKey = "board.start"
    data class Target(val subject: String, val start: java.time.Instant?)
    var target by mutableStateOf<Target?>(null)
    var camera by mutableStateOf(false)
}
class BoardBatch { val shots: List<java.io.File> = emptyList() }
object LessonPhotos { fun currentSlot(d: ScheduleData): LessonSlot? = null; fun batchFor(t: BoardRouter.Target, d: ScheduleData) = BoardBatch(); fun batch(slot: LessonSlot, d: ScheduleData): BoardBatch? = null }
object LessonPhotosPDF { fun cleanTemp() {} }
object BoardPhoto { fun save(f: java.io.File, subject: String): java.io.File? = null }
@Composable fun BoardBatchScreen(b: BoardBatch) { ru.student.safuhub.ui.kit.FormScreen("Доска") {} }
@Composable fun BoardBatchesListScreen(subject: String?) { ru.student.safuhub.ui.kit.FormScreen("Доска") {} }
@Composable fun BoardHomeCard(data: ScheduleData, onCamera: (String) -> Unit, onOpen: (BoardBatch) -> Unit) {}
@Composable fun BoardSearchScreen() { ru.student.safuhub.ui.kit.FormScreen("Доски") {} }
