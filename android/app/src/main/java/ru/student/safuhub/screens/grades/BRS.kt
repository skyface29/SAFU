package ru.student.safuhub.screens.grades

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.Resource
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.eggs.GoldIcon
import ru.student.safuhub.feature.fx.Celebrations
import ru.student.safuhub.feature.grades.BRSFormat
import ru.student.safuhub.feature.grades.ControlType
import ru.student.safuhub.feature.grades.GradeEntry
import ru.student.safuhub.feature.grades.GradeSync
import ru.student.safuhub.feature.grades.GradesStore
import ru.student.safuhub.feature.grades.SubjectGrades
import ru.student.safuhub.feature.grades.statusColor
import ru.student.safuhub.feature.web.WebScreen
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.ProgressRing
import ru.student.safuhub.ui.design.staggerIn
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.BarIcon
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormColumn
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosSwitch
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.LocalPushed
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.kit.rememberBool
import ru.student.safuhub.ui.kit.swipeRow
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

// MARK: - Экран БРС

@Composable
fun BRSScreen() {
    val store = GradesStore
    val data = ScheduleStore.data
    val open = remember { mutableStateOf<SubjectGrades?>(null) }
    val syncing = remember { mutableStateOf(false) }
    val status = remember { mutableStateOf("") }
    val showReport = rememberBool()
    var autoSync by prefBool("brs.auto", true)
    val login = remember { mutableStateOf<Resource?>(null) }
    val sakaiUser = remember { mutableStateOf<String?>(null) }
    val lkOK = remember { mutableStateOf(GradeSync.lkLoggedIn) }
    val checkingLogin = remember { mutableStateOf(true) }

    val missing = ScheduleQuery.subjects(data).filter { s -> store.items.none { it.subject == s } }

    // синхронизация живёт дольше экрана — как задача в Swift, которая доделывается
    fun sync() {
        if (syncing.value) return
        syncing.value = true
        status.value = "Смотрю Sakai и Личный кабинет…"
        AppScope.launch {
            status.value = GradeSync.run(ScheduleQuery.subjects(ScheduleStore.data))
            lkOK.value = GradeSync.lkLoggedIn
            syncing.value = false
            Haptics.success()
            GoldIcon.checkUnlock()
        }
    }

    suspend fun checkLogin() {
        checkingLogin.value = true
        sakaiUser.value = GradeSync.sakaiUser()
        lkOK.value = GradeSync.lkLoggedIn
        checkingLogin.value = false
    }

    LaunchedEffect(Unit) {
        checkLogin()
        if (!autoSync || syncing.value) return@LaunchedEffect
        GradeSync.lastRun?.let { if (Instant.now().epochSecond - it.epochSecond < 3 * 3600) return@LaunchedEffect }
        sync()
    }
    // вернулся со входа — сразу проверяем и тянем баллы
    var wasLogin by remember { mutableStateOf(false) }
    LaunchedEffect(login.value) {
        if (login.value != null) wasLogin = true
        else if (wasLogin) {
            wasLogin = false
            AppScope.launch { checkLogin(); sync() }
        }
    }

    Screen("БРС", large = !LocalPushed.current, background = { AmbientBackground() }) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            LoginCard(sakaiUser.value, lkOK.value, checkingLogin.value) { login.value = it }
            SyncBar(syncing.value, status.value, autoSync, { autoSync = it }, { Haptics.tap(); sync() }) { showReport.value = true }
            Summary()
            if (store.items.isEmpty()) {
                EmptyState("star.leadinghalf.filled", "Добавь предметы",
                    "Нажми «Добавить все из расписания» — и вписывай баллы за лабы, тесты и посещения.")
            }
            store.items.forEachIndexed { i, g ->
                Pressable({ Haptics.tap(); open.value = g }, Modifier.fillMaxWidth().staggerIn(i)) { SubjectCard(g) }
            }
            if (missing.isNotEmpty()) {
                Glass(20.dp, Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton({
                            Haptics.success()
                            store.items = store.items + missing.map { SubjectGrades(subject = it) }
                        }, padding = PaddingValues(0.dp)) {
                            IconLabel("Добавить все из расписания (${missing.size})", "plus.circle.fill", style = ft(Ts.subheadline, FontWeight.SemiBold),
                                color = Brand.color)
                        }
                        IosMenu({
                            for (s in missing) item(s) { store.items = store.items + SubjectGrades(subject = s) }
                        }) {
                            IconLabel("Добавить один предмет", "plus", style = ft(Ts.subheadline), color = Brand.color, modifier = Modifier.padding(vertical = 2.dp))
                        }
                    }
                }
            }
            Text("Баллы подтягиваются сами из Sakai (журнал оценок курсов) и Личного кабинета. Что не нашлось — можно вписать руками. Пороги оценок у каждого предмета можно поменять.",
                style = ft(Ts.caption), color = Ios.secondaryLabel)
        }
    }

    SheetItem(open) { g -> NavigationStack { BRSSubjectScreen(g.id) } }
    SheetBinding(showReport) { NavigationStack { SyncReportScreen() } }
    SheetItem(login, full = true) { r -> WebScreen(r) }
}

// MARK: входы

@Composable
private fun LoginCard(sakaiUser: String?, lkOK: Boolean, checking: Boolean, onLogin: (Resource) -> Unit) {
    val allIn = sakaiUser != null && lkOK
    Glass(22.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (allIn) "Входы в порядке" else "Сначала войди — баллы подтянутся сами", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED),
                    color = Ios.label, modifier = Modifier.weight(1f))
                if (checking) Spinner(16.dp)
            }
            LoginRow("graduationcap.fill", "Sakai", sakaiUser != null,
                sakaiUser?.let { "вход выполнен · $it" } ?: "нет входа — журнал оценок курсов не виден",
                Resource(title = "Sakai", subtitle = "Курсы и задания", url = "https://sakai.narfu.ru", icon = "graduationcap.fill", category = "Учёба"), onLogin)
            LoginRow("person.text.rectangle.fill", "Личный кабинет", lkOK,
                if (lkOK) "вход выполнен" else "нет входа (или ещё не проверялся) — итоговые баллы не видны",
                Resource(title = "Личный кабинет", subtitle = "Зачётная книжка", url = "https://lk.narfu.ru", icon = "person.text.rectangle.fill",
                    category = "Университет"), onLogin)
            if (!allIn) {
                Column(Modifier.padding(top = 2.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Step(1, "Нажми «Войти» у сайта")
                    Step(2, "Логин — почта САФУ, пароль — от учётной записи САФУ")
                    Step(3, "Когда откроется твоя страница, закрой сайт крестиком ✕ слева вверху")
                    Step(4, "Готово: баллы подтянутся сами, вход запомнится")
                }
            }
        }
    }
}

@Composable
private fun LoginRow(icon: String, title: String, ok: Boolean, detail: String, resource: Resource, onLogin: (Resource) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(45.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Brand.gradient), contentAlignment = Alignment.Center) {
                SfIcon(icon, size = 18.dp, tint = Color.White)
            }
            Box(Modifier.align(Alignment.BottomEnd).size(17.dp).clip(CircleShape).background(if (ok) Ios.green else Ios.orange),
                contentAlignment = Alignment.Center) {
                SfIcon(if (ok) "checkmark" else "exclamationmark", size = 11.dp, tint = Color.White)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = ft(Ts.subheadline, FontWeight.Bold), color = Ios.label)
            Text(detail, style = ft(Ts.caption), color = if (ok) Ios.green else Ios.secondaryLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Pressable({ Haptics.tap(); onLogin(resource) }) {
            Text(if (ok) "Открыть" else "Войти", style = ft(Ts.caption, FontWeight.Bold), color = if (ok) Brand.color else Color.White,
                modifier = Modifier.clip(CircleShape)
                    .let { if (ok) it.background(Brand.color.copy(alpha = 0.14f)) else it.background(Brand.gradient) }
                    .padding(horizontal = 14.dp, vertical = 8.dp))
        }
    }
}

@Composable
private fun Step(n: Int, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(18.dp).clip(CircleShape).background(Brand.color), contentAlignment = Alignment.Center) {
            Text("$n", style = ft(Ts.caption2, FontWeight.ExtraBold), color = Color.White)
        }
        Text(text, style = ft(Ts.caption), color = Ios.secondaryLabel, modifier = Modifier.padding(top = 1.dp))
    }
}

@Composable
private fun SyncBar(syncing: Boolean, status: String, auto: Boolean, onAuto: (Boolean) -> Unit, onSync: () -> Unit, onReport: () -> Unit) {
    Glass(22.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                    if (syncing) Spinner(18.dp, Color.White)
                    else SfIcon("arrow.triangle.2.circlepath", size = 18.dp, tint = Color.White)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(if (syncing) "Подтягиваю баллы…" else "Баллы с сайтов", style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                    Text(status.ifEmpty { GradeSync.lastRun?.let { "обновлено ${Fmt.relative(it)}" } ?: "ещё не обновлялось" },
                        style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Pressable(onSync, Modifier.alpha(if (syncing) 0.5f else 1f), enabled = !syncing) {
                    Text("Обновить", style = ft(Ts.caption, FontWeight.Bold), color = Color.White,
                        modifier = Modifier.clip(CircleShape).background(Brand.gradient).padding(horizontal = 12.dp, vertical = 7.dp))
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Сами при открытии", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label)
                Spacer(Modifier.width(8.dp))
                IosSwitch(auto, onAuto)
                Spacer(Modifier.weight(1f))
                if (GradeSync.report.isNotEmpty()) {
                    TextButton(onReport) { Text("Что нашлось", style = ft(Ts.caption, FontWeight.SemiBold), color = Brand.color) }
                }
            }
        }
    }
}

@Composable
private fun Summary() {
    val items = GradesStore.items
    val withPoints = items.filter { it.entries.isNotEmpty() }
    val good = items.count { it.total >= it.pass }
    val risk = withPoints.count { it.total < it.pass * 0.5 }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Tile(BRSFormat.num(Math.rint(GradesStore.average)), "средний балл", null, Modifier.weight(1f))
        Tile("$good/${items.size}", "с зачётом", null, Modifier.weight(1f))
        Tile("$risk", "в зоне риска", if (risk > 0) Ios.orange else null, Modifier.weight(1f))
    }
}

@Composable
private fun Tile(v: String, t: String, color: Color?, modifier: Modifier) {
    Glass(18.dp, modifier) {
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val style = ft(24f, FontWeight.ExtraBold, Design.ROUNDED)
            Text(v, style = if (color != null) style else style.copy(brush = Brand.gradient), color = color ?: Color.Unspecified, maxLines = 1)
            Text(t, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.secondaryLabel, maxLines = 1)
        }
    }
}

@Composable
private fun SubjectCard(g: SubjectGrades) {
    val c = g.statusColor()
    Glass(22.dp, Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.size(54.dp), contentAlignment = Alignment.Center) {
                ProgressRing(maxOf(0.001f, g.ratio.toFloat()), c, Modifier.fillMaxSize(), lineWidth = 5.dp)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(BRSFormat.num(g.total), style = ft(15f, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
                    Text(if (g.forecast == "—") g.controlType.title.lowercase().take(3) + "." else g.forecast,
                        style = ft(9f, FontWeight.Bold), color = Ios.secondaryLabel, maxLines = 1, modifier = Modifier.offset(y = (-2).dp))
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(g.subject, style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = Ios.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(g.nextStep, style = ft(Ts.caption, FontWeight.SemiBold), color = c)
                Text("${g.controlType.title} · ${g.entries.size} ${if (g.entries.size == 1) "запись" else "записей"}", style = ft(Ts.caption2),
                    color = Ios.secondaryLabel)
            }
            SfIcon("chevron.right", size = 14.dp, tint = Ios.tertiaryLabel)
        }
    }
}

// MARK: - Предмет

@Composable
fun BRSSubjectScreen(id: String) {
    val dismiss = LocalDismiss.current
    val store = GradesStore
    val g = store.items.firstOrNull { it.id == id }
    if (g == null) {
        Screen("БРС", trailing = { BarButton("Готово", bold = true) { dismiss() } }) {
            Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                Text("Предмет удалён", style = ft(Ts.body), color = Ios.secondaryLabel)
            }
        }
        return
    }
    val c = g.statusColor()

    fun add(title: String) {
        Dialogs.promptFields("Баллы", fields = listOf(
            "За что (лаба 1, тест…)" to KeyboardType.Text,
            "Сколько баллов" to KeyboardType.Decimal,
            "Из скольки (можно пусто)" to KeyboardType.Decimal,
        ), initial = listOf(title), button = "Добавить") { v ->
            val p = v[1].replace(",", ".").trim().toDoubleOrNull() ?: 0.0
            val m = v[2].replace(",", ".").trim().toDoubleOrNull() ?: 0.0
            if (store.items.any { it.id == id }) {
                store.update(id) { it.copy(entries = it.entries + GradeEntry(title = v[0].ifEmpty { "Работа" }, points = p, outOf = m, date = Instant.now())) }
                Haptics.success()
            }
        }
    }

    Screen(g.subject, trailing = { BarButton("Готово", bold = true) { dismiss() } }) {
        FormColumn {
            FormSection {
                raw {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp),
                            modifier = Modifier.padding(vertical = 6.dp)) {
                            Box(Modifier.size(96.dp), contentAlignment = Alignment.Center) {
                                ProgressRing(maxOf(0.001f, g.ratio.toFloat()), c, Modifier.fillMaxSize(), lineWidth = 9.dp)
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(BRSFormat.num(g.total), style = ft(26f, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
                                    Text("из ${BRSFormat.num(g.max)}", style = ft(Ts.caption2), color = Ios.secondaryLabel)
                                }
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(if (g.controlType == ControlType.CREDIT) "Прогноз: ${g.forecast}" else "Прогноз: «${g.forecast}»",
                                    style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                                Text(g.nextStep, style = ft(Ts.subheadline, FontWeight.SemiBold), color = c)
                                if (g.total < g.auto) Text("До автомата: ${BRSFormat.num(g.auto - g.total)}", style = ft(Ts.caption), color = Ios.secondaryLabel)
                            }
                        }
                        ThresholdsBar(g, c)
                    }
                }
            }

            FormSection("Баллы", footer = "Смахни запись влево, чтобы удалить. Быстрые кнопки подставляют название.") {
                for (e in g.entries.sortedByDescending { it.date }) {
                    swipeRow({ store.update(id) { s -> s.copy(entries = s.entries.filter { it.id != e.id }) } }) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text(e.title, style = ft(Ts.body), color = Ios.label)
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (e.source.isNotEmpty()) IconLabel(e.source, "arrow.down.circle.fill", style = ft(Ts.caption2, FontWeight.Bold),
                                    color = Brand.color, spacing = 3.dp)
                                Text(Fmt.format(e.date, "d MMM"), style = ft(Ts.caption2), color = Ios.secondaryLabel)
                            }
                        }
                        Text(if (e.outOf > 0) "${BRSFormat.num(e.points)}/${BRSFormat.num(e.outOf)}" else "+${BRSFormat.num(e.points)}",
                            style = ft(Ts.body, FontWeight.Bold, mono = true), color = Brand.color)
                    }
                }
                button("Добавить баллы", "plus.circle.fill") { add("") }
                raw {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (t in listOf("Посещение", "Лаба", "Тест", "Доклад")) {
                            Pressable({ add(t) }) {
                                Text(t, style = ft(Ts.caption, FontWeight.Medium), color = Brand.color,
                                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Brand.color.copy(alpha = 0.14f))
                                        .padding(horizontal = 12.dp, vertical = 7.dp))
                            }
                        }
                    }
                }
            }

            FormSection("Пороги", footer = "Спроси у преподавателя его шкалу и поправь цифры — прогноз станет точным.") {
                picker("Форма контроля", ControlType.entries.map { it.raw to it.title }, g.control, { v -> store.update(id) { it.copy(control = v) } })
                stepper("Максимум: ${BRSFormat.num(g.max)}", g.max.toInt(), { v -> store.update(id) { it.copy(max = v.toDouble()) } }, 10..200, 5)
                stepper(if (g.controlType == ControlType.CREDIT) "Зачёт от ${BRSFormat.num(g.pass)}" else "«3» от ${BRSFormat.num(g.pass)}",
                    g.pass.toInt(), { v -> store.update(id) { it.copy(pass = v.toDouble()) } }, 0..g.max.toInt())
                if (g.controlType != ControlType.CREDIT) {
                    stepper("«4» от ${BRSFormat.num(g.good)}", g.good.toInt(), { v -> store.update(id) { it.copy(good = v.toDouble()) } }, 0..g.max.toInt())
                    stepper("«5» от ${BRSFormat.num(g.excellent)}", g.excellent.toInt(), { v -> store.update(id) { it.copy(excellent = v.toDouble()) } },
                        0..g.max.toInt())
                }
                stepper("Автомат от ${BRSFormat.num(g.auto)}", g.auto.toInt(), { v -> store.update(id) { it.copy(auto = v.toDouble()) } }, 0..g.max.toInt())
            }

            FormSection("Сессия") {
                picker("Итог", listOf("" to "Ещё не сдавал", "зачёт" to "Зачёт", "5" to "5", "4" to "4", "3" to "3", "пересдача" to "Пересдача"),
                    g.result, { r ->
                        store.update(id) { it.copy(result = r) }
                        if (r.isNotEmpty() && r != "пересдача") Celebrations.examPassed(g.subject, r)
                        GoldIcon.checkUnlock()
                    })
                button("Убрать предмет из БРС", destructive = true) {
                    dismiss()
                    AppScope.launch {
                        delay(300)
                        store.items = store.items.filter { it.id != id }
                    }
                }
            }
        }
    }
}

/** Шкала с метками порогов */
@Composable
private fun ThresholdsBar(g: SubjectGrades, color: Color) {
    val marks = if (g.controlType == ControlType.CREDIT) listOf("зач" to g.pass, "авт" to g.auto)
    else listOf("3" to g.pass, "4" to g.good, "5" to g.excellent)
    BoxWithConstraints(Modifier.fillMaxWidth().height(36.dp).padding(bottom = 4.dp)) {
        val w = maxWidth
        val mx = maxOf(g.max, 1.0)
        Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(Ios.label.copy(alpha = 0.08f)))
        Box(Modifier.width(maxOf(8.dp, w * g.ratio.toFloat())).height(8.dp).clip(CircleShape)
            .background(Brush.verticalGradient(listOf(color.copy(alpha = 0.85f), color))))
        for ((label, v) in marks) {
            Column(Modifier.offset(x = w * (v / mx).toFloat() - 1.dp, y = (-3).dp), horizontalAlignment = Alignment.Start) {
                Box(Modifier.width(1.5.dp).height(14.dp).background(Ios.label.copy(alpha = 0.5f)))
                Text(label, style = ft(9f, FontWeight.Bold), color = Ios.secondaryLabel, modifier = Modifier.offset(x = (-3).dp))
            }
        }
    }
}

// MARK: - Отчёт синхронизации

@Composable
fun SyncReportScreen() {
    val ctx = LocalContext.current
    val dismiss = LocalDismiss.current
    Box(Modifier.fillMaxSize()) {
        Screen("Что нашлось", leading = { BarButton("Закрыть") { dismiss() } },
            trailing = { BarIcon("square.and.arrow.up") { Share.text(ctx, GradeSync.report) } }) {
            SelectionContainer {
                Text(GradeSync.report, style = ft(Ts.caption, mono = true), color = Ios.label, modifier = Modifier.fillMaxWidth().padding(16.dp))
            }
            Spacer(Modifier.height(60.dp))
        }
        Text("Если баллы не подтянулись или встали не туда — отправь этот отчёт разработчику, он подстроит разбор под сайт.",
            style = ft(Ts.caption), color = Ios.secondaryLabel,
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Ios.groupedBackground.copy(alpha = 0.94f))
                .padding(12.dp).padding(bottom = 16.dp))
    }
}
