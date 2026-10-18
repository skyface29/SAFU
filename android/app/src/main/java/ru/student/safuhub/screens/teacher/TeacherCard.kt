package ru.student.safuhub.screens.teacher

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Cal
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.TeacherMode
import ru.student.safuhub.screens.tools.Tool
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.SpinningIcon
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

/** Плашка «БЕТА» */
@Composable
fun BetaBadge() {
    Text("БЕТА", style = ft(9f, FontWeight.ExtraBold, Design.ROUNDED).copy(letterSpacing = androidx.compose.ui.unit.TextUnit(0.6f, androidx.compose.ui.unit.TextUnitType.Sp)),
        color = Color.White, modifier = Modifier.clip(CircleShape)
            .background(Brush.verticalGradient(listOf(Ios.orange, Ios.orange.copy(alpha = 0.8f)))).padding(horizontal = 6.dp, vertical = 2.dp))
}

/** Карточка преподавателя на главной */
@Composable
fun TeacherHomeCard(data: ScheduleData, onTool: (Tool) -> Unit, onRefresh: () -> Unit, syncing: Boolean) {
    val today = ScheduleQuery.slots(data, days = 1).filter { Cal.isToday(it.start) }
    val week = ScheduleQuery.slots(data, days = 7).size
    val groups = TeacherMode.myGroups(data)
    Glass(24.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                IconLabel("ПРЕПОДАВАТЕЛЬ", "person.crop.rectangle.stack.fill", style = ft(Ts.caption, FontWeight.ExtraBold), color = Brand.color, spacing = 5.dp)
                BetaBadge()
                Spacer(Modifier.weight(1f))
                androidx.compose.foundation.layout.Box(Modifier.clickable { onRefresh() }) { SpinningIcon(syncing, 14.dp, Ios.secondaryLabel) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Stat("${today.size}", "сегодня", Modifier.weight(1f))
                Stat("$week", "за 7 дней", Modifier.weight(1f))
                Stat("${groups.size}", "групп", Modifier.weight(1f))
            }
            if (groups.isNotEmpty()) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (g in groups) {
                        Text(g, style = ft(Ts.caption, FontWeight.SemiBold, mono = true), color = Ios.label,
                            modifier = Modifier.clip(CircleShape).background(Brand.color.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 6.dp))
                    }
                }
            }
            Text("В разработке: пары из РУЗ могут быть неполными", style = ft(Ts.caption2), color = Ios.secondaryLabel)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Action("Посещаемость", "person.crop.circle.badge.checkmark", Modifier.weight(1f)) { onTool(Tool.ATTENDANCE) }
                Action("Рассылка", "megaphone.fill", Modifier.weight(1f)) { onTool(Tool.BROADCAST) }
            }
        }
    }
}

@Composable
private fun Stat(value: String, title: String, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(value, style = ft(Ts.title2, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
        Text(title, style = ft(Ts.caption), color = Ios.secondaryLabel)
    }
}

@Composable
private fun Action(title: String, icon: String, modifier: Modifier, run: () -> Unit) {
    Pressable({ Haptics.tap(); run() }, modifier) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Ios.label.copy(alpha = 0.06f)).padding(vertical = 11.dp),
            horizontalArrangement = Arrangement.Center) {
            IconLabel(title, icon, style = ft(Ts.subheadline, FontWeight.SemiBold), iconColor = Brand.color, spacing = 6.dp)
        }
    }
}
