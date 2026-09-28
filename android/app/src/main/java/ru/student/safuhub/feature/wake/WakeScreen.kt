package ru.student.safuhub.feature.wake

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Cal
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.capitalizedFirstLetter
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.commute.BusRoutes
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.LocalPushed
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// MARK: - Экран «Подъём»

@Composable
fun WakeScreen() {
    val data = ScheduleStore.data
    var enabled by prefBool("wake.on", false)
    var prep by prefInt("wake.prep", 40)
    var cold by prefBool("wake.cold", true)
    var cycles by prefInt("wake.cycles", 5)
    var bedtime by prefBool("wake.bed", true)
    var realAlarm by prefBool("wake.alarm", true)
    val plans = WakePlanner.upcoming(data)

    fun resync() {
        Haptics.tap()
        Permissions.requestNotifications()
        WakePlanner.schedule(ScheduleStore.data)
    }

    val sleepText = (cycles * 90).let { m -> if (m % 60 == 0) "${m / 60} ч" else "${m / 60} ч ${m % 60} мин" }

    FormScreen("Подъём", large = !LocalPushed.current) {
        FormSection(footer = "Будильник ставится сам под первую пару: учитывает автобус, дорогу до остановки, сборы и мороз. Вечером подскажет, когда лечь, чтобы проснуться в конце цикла сна.") {
            toggle("Умный подъём", enabled, { enabled = it; resync() }, icon = "alarm.fill")
        }

        val p = plans.firstOrNull()
        if (p != null) {
            val header = when {
                Cal.isToday(p.pair.start) -> "Сегодня"
                Cal.isTomorrow(p.pair.start) -> "Завтра"
                else -> Fmt.format(p.pair.start, "EEEE, d MMMM")
            }
            FormSection(header) {
                raw {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
                        Step("moon.zzz.fill", "Лечь", p.bed, "$cycles циклов сна")
                        Step("alarm.fill", "Подъём", p.wake, if (p.cold) "мороз — на 10 минут раньше" else "сборы $prep мин", big = true)
                        if (!p.remote) Step("figure.walk", "Выйти из дома", p.leave, null)
                        p.bus?.let { b -> Step("bus.fill", "Автобус ${BusRoutes.active.number}", b.departure, null) }
                        Step("graduationcap.fill", p.pair.lesson.subject, p.pair.start,
                            if (p.remote) "дистанционно" else if (p.pair.lesson.room.isEmpty()) null else "ауд. ${p.pair.lesson.room}", last = true)
                    }
                }
            }
        } else {
            FormSection {
                row { Text("На неделю вперёд пар нет — будильник не нужен 😎", style = ft(Ts.body), color = Ios.secondaryLabel) }
            }
        }

        FormSection("Настройки") {
            stepper("Сборы: $prep мин", prep, { prep = it; resync() }, 10..120, 5)
            stepper("Сон: $cycles циклов · $sleepText", cycles, { cycles = it; resync() }, 3..7)
            toggle("В мороз будить на 10 минут раньше", cold, { cold = it; resync() })
            toggle("Напоминать, когда ложиться", bedtime, { bedtime = it; resync() })
            if (WakePlanner.alarmKitAvailable) toggle("Настоящий будильник", realAlarm, { realAlarm = it; resync() })
        }

        if (plans.size > 1) {
            FormSection("Неделя") {
                for (w in plans) row {
                    Text(Fmt.format(w.pair.start, "EE, d MMM").capitalizedFirstLetter(), style = ft(Ts.subheadline), color = Ios.label,
                        modifier = Modifier.width(88.dp))
                    Text(WakePlanner.hm(w.wake), style = ft(Ts.subheadline, FontWeight.Bold, mono = true), color = Ios.label)
                    if (w.cold) Text(" ❄️", style = ft(Ts.subheadline))
                    Text(w.pair.lesson.subject, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(start = 8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                }
            }
        }
    }
}

@Composable
private fun Step(icon: String, title: String, time: Instant, note: String?, big: Boolean = false, last: Boolean = false) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.width(34.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(if (big) 34.dp else 28.dp).clip(CircleShape)
                .let { if (big) it.background(Brand.gradient) else it.background(Brand.color.copy(alpha = 0.55f)) },
                contentAlignment = Alignment.Center) {
                SfIcon(icon, size = if (big) 17.dp else 14.dp, tint = Color.White)
            }
            if (!last) Box(Modifier.width(2.dp).height(18.dp).background(Brand.color.copy(alpha = 0.25f)))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = if (big) ft(Ts.headline, FontWeight.SemiBold) else ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                val ts = if (big) ft(Ts.title2, FontWeight.ExtraBold, Design.ROUNDED, mono = true).copy(brush = Brand.gradient)
                else ft(Ts.subheadline, FontWeight.Bold, mono = true)
                Text(WakePlanner.hm(time), style = ts, color = if (big) Color.Unspecified else Ios.label)
            }
            if (note != null) Text(note, style = ft(Ts.caption), color = Ios.secondaryLabel)
        }
    }
}
