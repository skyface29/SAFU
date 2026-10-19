package ru.student.safuhub.feature.pcsync

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import ru.student.safuhub.ui.design.Haptics
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

/** Профиль → «Синхронизация с компьютером» */
@Composable
fun PCSyncScreen() {
    PCSync.load()
    val scope = rememberCoroutineScope()
    val p = PCSync.pairing
    var manual by remember { mutableStateOf("") }
    var sendFiles by ru.student.safuhub.core.prefBool(PCFiles.ON_KEY, true)
    LaunchedEffect(p == null) { if (p == null && !PCSync.searched) PCSync.searchNearby() }

    FormScreen("Синхронизация с компьютером") {
        PCSync.pairStep?.let { step -> PairPanel(step); return@FormScreen }

        if (p != null) {
            FormSection(footer = "ДЗ, задачи и заметки — общие с Арктикой на компьютере: отметил ДЗ сделанным на компьютере — через пару секунд оно сделано на телефоне, и наоборот. По домашнему Wi‑Fi, напрямую и с шифрованием AES‑256, без облаков. Поменял одно и то же в двух местах — побеждает поздняя правка, по каждому полю отдельно.") {
                raw {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(Brand.gradient), contentAlignment = Alignment.Center) {
                            SfIcon("desktopcomputer", size = 22.dp, tint = androidx.compose.ui.graphics.Color.White)
                        }
                        Column(Modifier.weight(1f)) {
                            Text(p.name, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                            val status = when {
                                PCSync.syncing -> "Синхронизирую…"
                                PCSync.problem != null -> "Нет связи"
                                PCSync.lastSync != null -> "Синхронизировано ${PCSync.ago(PCSync.lastSync!!)}"
                                else -> "Жду компьютер…"
                            }
                            Text(status, style = ft(Ts.footnote), color = if (PCSync.problem != null) Ios.orange else Ios.secondaryLabel)
                        }
                        if (PCSync.syncing) Spinner()
                    }
                }
                PCSync.problem?.let { msg -> raw { Text(msg, style = ft(Ts.footnote), color = Ios.orange, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) } }
                button("Синхронизировать сейчас", "arrow.triangle.2.circlepath") { scope.launch { PCSync.syncNow() } }
            }
            FormSection(footer = "Идут только новые файлы: что уже есть на компьютере, второй раз не отправляется. Фото к ДЗ на компьютере прикрепляются к тому же заданию.") {
                toggle("Файлы — на компьютер сами", sendFiles, { sendFiles = it; if (it) PCFiles.pushSoon(force = true) },
                    subtitle = "Файлы предметов, фото доски, записи лекций и фото к ДЗ")
                if (sendFiles) {
                    val line = PCFiles.line
                    val last = PCFiles.lastSent
                    if (line != null) row {
                        if (PCFiles.busy) { Spinner(); Spacer(Modifier.width(10.dp)) }
                        Text(line, style = ft(Ts.footnote), color = Ios.secondaryLabel)
                    } else if (last != null) row {
                        Text("Все файлы на компьютере · проверено ${PCSync.ago(last)}", style = ft(Ts.footnote), color = Ios.secondaryLabel)
                    }
                    button("Отправить файлы сейчас", "arrow.up.doc", enabled = !PCFiles.busy) { Haptics.tap(); PCFiles.pushSoon(force = true) }
                }
            }
            FormSection {
                info("Адрес компьютера", p.hosts.firstOrNull()?.let { "$it:${p.port}" } ?: "—")
                button("Отвязать компьютер", "xmark.circle", destructive = true) {
                    Dialogs.confirm("Отвязать компьютер?", "Данные на телефоне и компьютере останутся, просто перестанут сводиться.", "Отвязать") { PCSync.unpair() }
                }
            }
            return@FormScreen
        }

        FormSection("Компьютеры рядом", footer = "Открой Арктику на компьютере в той же сети Wi‑Fi. Нажми на компьютер — на обоих экранах появится один и тот же код, на компьютере нажми «Разрешить».") {
            if (PCSync.searching) row {
                Spinner()
                Text("  Ищу Арктику в этой сети…", style = ft(Ts.body), color = Ios.secondaryLabel)
            }
            for (f in PCSync.nearby) link(f.pc, "desktopcomputer", subtitle = "${f.host}${if (f.pair != null) " · уже связан с другим устройством" else ""}") { PCSync.pairWith(f) }
            if (!PCSync.searching && PCSync.searched && PCSync.nearby.isEmpty()) row {
                Text(if (LanDiscovery.hasLan) "В этой сети Арктика на компьютере не нашлась." else "Телефон не подключён к Wi‑Fi.",
                    style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            }
            if (!PCSync.searching) button("Искать снова", "magnifyingglass") { scope.launch { PCSync.searchNearby() } }
        }
        FormSection("Ввести адрес вручную", footer = "Адрес написан на компьютере: «Синхронизация» → «Этот компьютер в сети», например 192.168.1.5. Можно вставить и ссылку arktika://sync из QR-кода.") {
            field("192.168.1.5", manual, { manual = it }, keyboard = androidx.compose.ui.text.input.KeyboardType.Uri, capitalize = false)
            button("Подключиться", "link", enabled = manual.isNotBlank()) {
                val link = SyncLink.parse(manual)
                if (link != null) PCSync.pair(link) else PCSync.connectManually(manual)
            }
            button("Вставить ссылку из буфера", "doc.on.clipboard") {
                val t = Share.pasteText()
                val link = t?.let { SyncLink.parse(it) }
                if (link != null) PCSync.pair(link) else Dialogs.alert("В буфере нет ссылки", "Скопируй на компьютере ссылку arktika://sync под QR-кодом синхронизации.")
            }
        }
    }
}

@Composable
private fun PairPanel(step: PCSync.PairStep) {
    Glass(22.dp, Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            when (step) {
                is PCSync.PairStep.Connecting -> {
                    Spinner(28.dp)
                    Text("Связываюсь с «${step.pc}»…", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                }
                is PCSync.PairStep.Code -> {
                    Text("Сверь код с экраном «${step.pc}»", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, textAlign = TextAlign.Center)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        for (ch in step.code) Box(Modifier.size(54.dp, 68.dp).clip(RoundedCornerShape(16.dp)).background(Brand.color.copy(alpha = 0.12f)),
                            contentAlignment = Alignment.Center) {
                            Text(ch.toString(), style = ft(38f, FontWeight.Bold), color = Brand.color)
                        }
                    }
                    Text("Если на компьютере тот же код — нажми там «Разрешить». Окно появится само.", style = ft(Ts.footnote),
                        color = Ios.secondaryLabel, textAlign = TextAlign.Center)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Spinner(16.dp)
                        Text("  Жду ответ компьютера…", style = ft(Ts.footnote), color = Ios.secondaryLabel)
                    }
                }
                is PCSync.PairStep.Failed -> {
                    SfIcon("exclamationmark.triangle.fill", size = 30.dp, tint = Ios.orange)
                    Text(step.message, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, textAlign = TextAlign.Center)
                }
            }
            TextButton({ PCSync.cancelPairing() }) {
                Text(if (step is PCSync.PairStep.Failed) "Понятно" else "Отмена", style = ft(Ts.body, FontWeight.SemiBold), color = Brand.color)
            }
        }
    }
}

/** Маленькая пометка на главной: компьютер на связи / был недавно / не связан. Нажал — экран синхронизации (как iPhone 19.6) */
@Composable
fun PCLinkChip(modifier: Modifier = Modifier, open: () -> Unit) {
    PCSync.load()
    // «на связи» гаснет само через полминуты — перерисовываемся раз в 10 секунд
    var now by remember { mutableStateOf(java.time.Instant.now()) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(10_000); now = java.time.Instant.now() } }
    val p = PCSync.pairing
    val last = PCSync.lastSync
    val online = p != null && last != null && PCSync.problem == null && java.time.Duration.between(last, now).seconds < 30
    val text = when {
        p == null -> "Компьютер не связан"
        online -> "${p.name} · на связи"
        last != null -> "${p.name} · ${PCSync.ago(last)}"
        else -> "${p.name} · жду компьютер"
    }
    val dot = when {
        p == null -> Ios.secondaryLabel.copy(alpha = 0.6f)
        online -> Ios.green
        else -> Ios.orange
    }
    ru.student.safuhub.ui.kit.Pressable({ Haptics.tap(); open() }, modifier) {
        Row(Modifier.clip(CircleShape).background(Ios.label.copy(alpha = 0.06f)).padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.size(14.dp), contentAlignment = Alignment.Center) {
                if (online) Box(Modifier.size(if (PCSync.syncing) 14.dp else 12.dp).clip(CircleShape).background(Ios.green.copy(alpha = 0.35f)))
                Box(Modifier.size(7.dp).clip(CircleShape).background(dot))
            }
            SfIcon("laptopcomputer", size = 13.dp, tint = if (online) Ios.label else Ios.secondaryLabel)
            Text(text, style = ft(Ts.caption, FontWeight.SemiBold), color = if (online) Ios.label else Ios.secondaryLabel, maxLines = 1)
        }
    }
}

/** Связан с компьютером — маленькая плашка: когда ДЗ последний раз сверялись */
@Composable
fun SyncBadge(modifier: Modifier = Modifier) {
    PCSync.load()
    val p = PCSync.pairing ?: return
    val ok = PCSync.problem == null && PCSync.lastSync != null
    Row(modifier.clip(CircleShape).background(Ios.label.copy(alpha = 0.06f)).padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(if (ok) Ios.green else Ios.orange))
        SfIcon("desktopcomputer", size = 12.dp, tint = Ios.secondaryLabel)
        Text(if (ok) "${p.name} · ${PCSync.ago(PCSync.lastSync!!)}" else "${p.name} · нет связи", style = ft(Ts.caption, FontWeight.SemiBold),
            color = Ios.secondaryLabel, maxLines = 1)
        if (PCSync.syncing) Spinner(10.dp)
    }
}
