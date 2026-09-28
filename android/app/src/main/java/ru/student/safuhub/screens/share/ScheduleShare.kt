package ru.student.safuhub.screens.share

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.core.hm
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.ScheduleEngine
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.WeekKey
import ru.student.safuhub.screens.developer.Developer
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.KindStyle
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.LocalPushed
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.Segmented
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.Snapshots
import ru.student.safuhub.ui.kit.recordInto
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// MARK: - Расписание картинкой
// Красивая карточка на день или неделю — сразу в чат группы.

@Composable
fun ScheduleShareScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val data = ScheduleStore.data
    val group = Defaults.string("group") ?: ""
    /** 0 сегодня, 1 завтра, 2 неделя */
    var mode by remember { mutableIntStateOf(0) }
    val layer = rememberGraphicsLayer()

    val today = Cal.startOfDay(Instant.now())
    val days: List<Pair<Instant, List<LessonSlot>>> = when (mode) {
        0 -> listOf(today to ScheduleEngine.slots(today, data))
        1 -> Cal.addDays(today, 1).let { listOf(it to ScheduleEngine.slots(it, data)) }
        else -> {
            // эта неделя, а в выходные — следующая
            var monday = WeekKey.monday(today)
            if (ScheduleEngine.weekday(today) >= 6) monday = Cal.addDays(monday, 7)
            (0 until 6).map { i -> Cal.addDays(monday, i).let { it to ScheduleEngine.slots(it, data) } }
        }
    }
    val title = when (mode) {
        0 -> "Сегодня · " + Fmt.format(Instant.now(), "EEEE, d MMMM")
        1 -> "Завтра · " + Fmt.format(Instant.now().plusSeconds(86_400), "EEEE, d MMMM")
        else -> "Неделя · ${Fmt.format(days.first().first, "d MMM")} – ${Fmt.format(days.last().first, "d MMM")}"
    }

    Screen("Расписание картинкой", large = !LocalPushed.current, background = { AmbientBackground() }) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Segmented(listOf(0 to "Сегодня", 1 to "Завтра", 2 to "Неделя"), mode, { mode = it }, Modifier.fillMaxWidth())

            Box(Modifier.fillMaxWidth().shadow(14.dp, RoundedCornerShape(24.dp), ambientColor = Color.Black.copy(alpha = 0.15f),
                spotColor = Color.Black.copy(alpha = 0.15f)).clip(RoundedCornerShape(24.dp)).recordInto(layer)) {
                Card(group, title, mode, days)
            }

            Pressable({
                scope.launch {
                    Snapshots.png(layer, "Расписание.png")?.let { Share.files(ctx, listOf(it), "image/png") }
                }
            }, Modifier.fillMaxWidth()) {
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brand.gradient).padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center) {
                    IconLabel("Отправить картинкой", "square.and.arrow.up", style = ft(Ts.headline, FontWeight.SemiBold), color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun Card(group: String, title: String, mode: Int, days: List<Pair<Instant, List<LessonSlot>>>) {
    Column(
        Modifier.fillMaxWidth()
            .background(Brush.linearGradient(listOf(Brand.color, Brand.color2.copy(alpha = 0.9f), Brand.color.copy(alpha = 0.85f))))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("РАСПИСАНИЕ" + if (group.isEmpty()) "" else " · $group", style = ft(11f, FontWeight.ExtraBold), color = Color.White.copy(alpha = 0.75f))
                Text(title.capitalizedFirstLetter(), style = ft(20f, FontWeight.ExtraBold, Design.ROUNDED), color = Color.White)
            }
            SfIcon("snowflake", size = 28.dp, tint = Color.White.copy(alpha = 0.9f))
        }
        for ((day, slots) in days) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (mode == 2) Text(Fmt.format(day, "EEEE, d MMMM").capitalizedFirstLetter(), style = ft(13f, FontWeight.ExtraBold, Design.ROUNDED),
                    color = Color.White.copy(alpha = 0.85f))
                if (slots.isEmpty()) {
                    Text(if (mode == 2) "пар нет" else "Пар нет — отдыхаем 🎉", style = ft(if (mode == 2) 12f else 15f, FontWeight.SemiBold),
                        color = Color.White.copy(alpha = 0.8f), modifier = Modifier.padding(vertical = if (mode == 2) 0.dp else 10.dp))
                }
                for (s in slots) PairRow(s)
            }
        }
        Text("САФУ · by @${Developer.telegram}", style = ft(10f, FontWeight.SemiBold), color = Color.White.copy(alpha = 0.55f),
            textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun PairRow(s: LessonSlot) {
    val st = KindStyle.of(s.lesson.kind)
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.14f)).padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.width(44.dp)) {
            Text(hm(s.start), style = ft(14f, FontWeight.ExtraBold, Design.ROUNDED), color = Color.White)
            Text(hm(s.end), style = ft(11f, FontWeight.SemiBold), color = Color.White.copy(alpha = 0.7f))
        }
        Box(Modifier.width(3.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(st.color))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(s.lesson.subject, style = ft(14f, FontWeight.Bold), color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(listOf(st.label, if (s.lesson.room.isEmpty()) "" else "ауд. ${s.lesson.room}").filter { it.isNotEmpty() }.joinToString(" · "),
                style = ft(11f, FontWeight.SemiBold), color = Color.White.copy(alpha = 0.75f))
        }
    }
}
