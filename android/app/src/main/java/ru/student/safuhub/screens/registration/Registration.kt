package ru.student.safuhub.screens.registration

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.HigherSchool
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.RuzDirectory
import ru.student.safuhub.data.RuzGroup
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.SubjectFolders
import ru.student.safuhub.data.TeacherMode
import ru.student.safuhub.feature.avatar.AvatarEditor
import ru.student.safuhub.feature.backup.BackupManager
import ru.student.safuhub.feature.commute.BusPalette
import ru.student.safuhub.feature.commute.BusRoute
import ru.student.safuhub.feature.commute.BusRouteStore
import ru.student.safuhub.feature.fx.Celebration
import ru.student.safuhub.feature.fx.CelebrationCenter
import ru.student.safuhub.feature.fx.Celebrations
import ru.student.safuhub.screens.commute.BusRouteEditorSheet
import ru.student.safuhub.screens.teacher.BetaBadge
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.system.rememberFilePicker
import ru.student.safuhub.ui.Sf
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.glass
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant
import kotlin.coroutines.resume
import kotlin.math.sin

// MARK: - Регистрация
// Первый запуск: имя → высшая школа → группа из РУЗ (по курсам, с поиском) → роль и дорога →
// приложение само загружает расписание, создаёт папки предметов, ставит уведомления и виджет.

private enum class Step { WELCOME, NAME, SCHOOL, GROUP, EXTRAS, SETUP }

private class SetupTask(val id: Int, val title: String) {
    enum class Phase { WAITING, RUNNING, DONE, WARN }
    var detail by mutableStateOf("")
    var state by mutableStateOf(Phase.WAITING)
}

@Composable
fun RegistrationScreen(canClose: Boolean, onDone: () -> Unit) {
    val ctx = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val schedule = ScheduleStore

    var step by remember { mutableStateOf(Step.WELCOME) }
    var forward by remember { mutableStateOf(true) }
    // имя
    var first by remember { mutableStateOf("") }
    var last by remember { mutableStateOf("") }
    var middle by remember { mutableStateOf("") }
    var showMore by remember { mutableStateOf(false) }
    // учёба
    var school by remember { mutableStateOf<HigherSchool?>(null) }
    var groups by remember { mutableStateOf<List<RuzGroup>>(emptyList()) }
    var loadingGroups by remember { mutableStateOf(false) }
    var groupsError by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var course by remember { mutableStateOf<Int?>(null) }
    var picked by remember { mutableStateOf<RuzGroup?>(null) }
    var manual by remember { mutableStateOf("") }
    var manualMode by remember { mutableStateOf(false) }
    // роль и дорога
    var role by remember { mutableStateOf(0) }
    /** Преподаватель: вместо группы — поиск своих пар по всем группам школы */
    var teacher by remember { mutableStateOf(false) }
    var teacherQuery by remember { mutableStateOf("") }
    var farAway by remember { mutableStateOf(false) }
    // настройка
    val tasks = remember { mutableStateListOf<SetupTask>() }
    var finished by remember { mutableStateOf(false) }
    // восстановление из копии прямо с приветствия (новый телефон)
    var restoring by remember { mutableStateOf<String?>(null) }

    val groupNumber = (if (manualMode) manual else picked?.number ?: "").trim()
    val canContinue = when (step) {
        Step.WELCOME -> true
        Step.NAME -> first.isNotBlank() && (!teacher || last.isNotBlank())
        Step.SCHOOL -> school != null
        Step.GROUP -> if (teacher) TeacherMode.parse(teacherQuery).surname.length >= 2 else groupNumber.length >= 4
        Step.EXTRAS -> true
        Step.SETUP -> finished
    }

    /** «Иванов И.И.» из введённых фамилии, имени и отчества */
    val suggestedQuery = run {
        val l = last.trim()
        val ini = listOf(first, middle).mapNotNull { it.trim().firstOrNull() }.joinToString("") { "$it." }
        if (ini.isEmpty()) l else "$l $ini"
    }

    // повторная регистрация — подставляем то, что уже знаем
    LaunchedEffect(Unit) {
        val d = Defaults
        first = d.string("user.first") ?: (d.string("user.name")?.split(" ")?.firstOrNull() ?: "")
        last = d.string("user.last") ?: ""
        middle = d.string("user.middle") ?: ""
        teacher = d.string(TeacherMode.kindKey) == "teacher"
        teacherQuery = d.string(TeacherMode.queryKey) ?: ""
        role = d.int("user.role")
        farAway = d.boolOrNull("commute.enabled") ?: false
        if (schedule.data.usesRuz) {
            school = HigherSchool.by(schedule.data.ruzInstitution)
            manual = schedule.data.ruzGroupNumber
        }
    }

    fun loadGroups(force: Boolean = false) {
        val s = school ?: return
        if (!force && groups.isNotEmpty()) return
        loadingGroups = true
        groupsError = null
        scope.launch {
            try {
                val list = RuzDirectory.groups(s.id, force)
                groups = list
                if (list.isEmpty()) groupsError = "Не получилось прочитать список групп из РУЗ. Можно ввести номер группы вручную."
                else if (picked == null && manual.isNotEmpty()) list.firstOrNull { it.number == manual }?.let { picked = it }
            } catch (_: Throwable) {
                groupsError = "Нет связи с РУЗ. Проверь интернет — или введи номер группы вручную."
            }
            loadingGroups = false
        }
    }

    fun saveProfile() {
        val d = Defaults
        val f = first.trim()
        val l = last.trim()
        val m = middle.trim()
        d.set("user.name", listOf(f, l).filter { it.isNotEmpty() }.joinToString(" "))
        d.set("user.first", f)
        d.set("user.last", l)
        d.set("user.middle", m)
        d.set("group", if (teacher) "" else groupNumber)
        d.set(TeacherMode.kindKey, if (teacher) "teacher" else "student")
        if (teacher) {
            d.set(TeacherMode.queryKey, teacherQuery.trim())
            role = 3
        } else if (role == 3) role = 0
        d.set("user.role", role)
        d.set("commute.enabled", if (teacher) false else farAway)
        // для титульника: полное ФИО и высшая школа
        val fio = listOf(l, f, m).filter { it.isNotEmpty() }.joinToString(" ")
        if (fio.isNotEmpty() && !teacher) d.set("report.student", fio)
        school?.let { d.set("report.school", it.full) }
    }

    fun setTask(id: Int, state: SetupTask.Phase, detail: String = "") {
        val t = tasks.firstOrNull { it.id == id } ?: return
        t.state = state
        if (detail.isNotEmpty()) t.detail = detail
    }

    fun runSetup() {
        finished = false
        tasks.clear()
        tasks.addAll(listOf(
            SetupTask(0, "Профиль"),
            SetupTask(1, if (teacher) "Ваши пары по всем группам САФУ" else "Расписание группы $groupNumber из РУЗ"),
            SetupTask(2, "Папки предметов"),
            SetupTask(3, "Уведомления о парах и заменах"),
            SetupTask(4, "Виджет и экран блокировки"),
        ))
        AppScope.launch {
            // 1. профиль
            setTask(0, SetupTask.Phase.RUNNING)
            saveProfile()
            delay(250)
            setTask(0, SetupTask.Phase.DONE, listOf(first, last).filter { it.isNotEmpty() }.joinToString(" ") + (school?.let { " · ${it.short}" } ?: ""))

            // 2. расписание
            setTask(1, SetupTask.Phase.RUNNING)
            schedule.data = schedule.data.copy(teacherPrefs = emptyMap())   // подгруппы каждый выберет сам на странице предмета
            val inst = school?.id ?: 3
            if (teacher) {
                schedule.connectTeacher(inst)
                // показываем, сколько групп уже просмотрено
                val ticker = launch {
                    while (isActive) {
                        schedule.teacherProgress?.let { setTask(1, SetupTask.Phase.RUNNING, "Просмотрено групп: ${(it * 100).toInt()}%") }
                        delay(400)
                    }
                }
                schedule.sync(force = true)
                ticker.cancel()
            } else {
                schedule.connectRuz(groupNumber, inst, if (manualMode) "" else picked?.id ?: "")
                schedule.sync(force = true)
            }
            val count = schedule.data.ruzEvents.size
            if (count > 0) setTask(1, SetupTask.Phase.DONE, "Загружено пар: $count")
            else setTask(1, SetupTask.Phase.WARN, schedule.syncMessage ?: "Пока пусто — попробую ещё раз позже, при открытии приложения")

            // 3. папки предметов
            setTask(2, SetupTask.Phase.RUNNING)
            val subjects = ScheduleQuery.subjects(schedule.data)
            withContext(Dispatchers.IO) { SubjectFolders.ensureAll(subjects) }
            setTask(2, if (subjects.isEmpty()) SetupTask.Phase.WARN else SetupTask.Phase.DONE,
                if (subjects.isEmpty()) "Появятся вместе с расписанием" else "Предметов: ${subjects.size} — для файлов, фото доски и заметок")

            // 4. уведомления
            setTask(3, SetupTask.Phase.RUNNING)
            val granted = suspendCancellableCoroutine { c -> Permissions.requestNotifications { ok -> if (c.isActive) c.resume(ok) } }
            schedule.refreshSideEffects()
            Celebrations.scheduleNotifications(schedule.data)
            setTask(3, if (granted) SetupTask.Phase.DONE else SetupTask.Phase.WARN,
                if (granted) "Напомню о парах, заменах и отменах" else "Выключены — можно включить в настройках телефона")

            // 5. виджет
            setTask(4, SetupTask.Phase.RUNNING)
            ru.student.safuhub.widget.Widgets.updateAll()
            delay(300)
            setTask(4, SetupTask.Phase.DONE, "Пара с таймером — на экране блокировки и в шторке")

            Haptics.success()
            finished = true
            CelebrationCenter.fire(Celebration("Всё готово! 🎉", "Добро пожаловать в САФУ", Celebration.Style.Fireworks(big = false), force = true))
        }
    }

    fun go(delta: Int) {
        focusManager.clearFocus()
        var next = Step.entries.getOrNull(step.ordinal + delta) ?: return
        // преподавателю шаг «Роль и дорога» не нужен: ни старосты, ни автобусов
        if (teacher && next == Step.EXTRAS) Step.entries.getOrNull(next.ordinal + delta)?.let { next = it }
        forward = delta > 0
        step = next
        if (next == Step.GROUP) {
            if (teacher) { if (teacherQuery.isEmpty()) teacherQuery = suggestedQuery } else loadGroups()
        }
        if (next == Step.SETUP) runSetup()
    }

    fun restoreFrom(uri: android.net.Uri) {
        restoring = "Восстанавливаю…"
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val f = BackupManager.copyToTemp(uri) ?: error("Не удалось открыть файл")
                    try { BackupManager.restore(f) { n -> scope.launch { restoring = "Восстанавливаю… файлов: $n" } } } finally { f.delete() }
                }
            }
            restoring = null
            result.onSuccess { n ->
                schedule.forceReload()
                schedule.refreshSideEffects()
                Haptics.success()
                Dialogs.alert("Копия восстановлена", "Вернулись настройки, расписание и файлы ($n). Приложение перезапустится, чтобы всё применить.",
                    AlertAction("Отлично", AlertAction.Role.BOLD) {
                        onDone()
                        BackupManager.restartApp(ctx)
                    })
            }.onFailure { e -> Dialogs.alert("Не получилось восстановить", e.message ?: "") }
        }
    }

    val picker = rememberFilePicker(multiple = false) { uris -> uris.firstOrNull()?.let { restoreFrom(it) } }

    // назад — к прошлому шагу; закрыть можно, только если зашли из профиля
    BackHandler {
        when {
            step != Step.WELCOME && step != Step.SETUP -> go(-1)
            canClose && step != Step.SETUP -> onDone()
        }
    }

    Box(Modifier.fillMaxSize().background(Ios.background)) {
        AmbientBackground()
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            // верх: назад, прогресс, закрыть
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (step != Step.WELCOME && step != Step.SETUP) CircleButton("chevron.left") { go(-1) } else Spacer(Modifier.size(38.dp))
                val alpha by animateFloatAsState(if (step == Step.WELCOME) 0f else 1f, label = "progress")
                Row(Modifier.weight(1f).graphicsLayer { this.alpha = alpha }, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    for (i in 1 until Step.entries.size) {
                        Box(Modifier.weight(1f).height(5.dp).clip(CircleShape)
                            .let { if (i <= step.ordinal) it.background(Brand.gradient) else it.background(Ios.label.copy(alpha = 0.12f)) })
                    }
                }
                if (canClose && step != Step.SETUP) CircleButton("xmark") { onDone() } else Spacer(Modifier.size(38.dp))
            }

            AnimatedContent(step, Modifier.weight(1f).fillMaxWidth(), transitionSpec = {
                val dir = if (forward) 1 else -1
                (slideInHorizontally(spring(dampingRatio = 0.88f, stiffness = 300f)) { it * dir } + fadeIn()) togetherWith
                    (slideOutHorizontally(spring(dampingRatio = 0.88f, stiffness = 300f)) { -it * dir } + fadeOut())
            }, label = "step") { s ->
                when (s) {
                    Step.WELCOME -> WelcomePage(teacher, { Haptics.tap(); teacher = it }) { picker.open() }
                    Step.NAME -> NamePage(teacher, first, { first = it }, last, { last = it }, middle, { middle = it }, showMore) { showMore = true }
                    Step.SCHOOL -> SchoolPage(teacher, school) { s2 ->
                        Haptics.tap()
                        if (school != s2) { picked = null; groups = emptyList(); course = null; query = "" }
                        school = s2
                    }
                    Step.GROUP -> if (teacher) TeacherPage(school, teacherQuery) { teacherQuery = it }
                    else GroupPage(school, groups, loadingGroups, groupsError, query, { query = it }, course, { course = it }, picked, { picked = it },
                        manual, { manual = it }, manualMode, { manualMode = it }) { loadGroups(force = true) }
                    Step.EXTRAS -> ExtrasPage(teacher, role, { role = it; Defaults.set("user.role", it) }, farAway) { v ->
                        farAway = v
                        Defaults.set("commute.enabled", v)
                    }
                    Step.SETUP -> SetupPage(teacher, first, groupNumber, finished, tasks)
                }
            }

            // низ: большая кнопка
            val btnAlpha = if (step == Step.SETUP && !finished) 0f else 1f
            Pressable({
                Haptics.tap()
                if (step == Step.SETUP) {
                    // салют и «Добро пожаловать» не должны остаться висеть на главной
                    CelebrationCenter.current.value = null
                    onDone()
                } else go(1)
            }, Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 12.dp).graphicsLayer { alpha = btnAlpha },
                enabled = canContinue && btnAlpha > 0f) {
                Box(Modifier.fillMaxWidth().graphicsLayer { alpha = if (canContinue) 1f else 0.4f }.clip(RoundedCornerShape(20.dp)).background(Brand.gradient)
                    .padding(vertical = 17.dp), contentAlignment = Alignment.Center) {
                    Text(when (step) {
                        Step.WELCOME -> "Начать"
                        Step.EXTRAS -> "Настроить всё"
                        Step.SETUP -> "Поехали 🚀"
                        else -> "Дальше"
                    }, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Color.White)
                }
            }
        }
        restoring?.let { text ->
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                Glass(20.dp) {
                    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Spinner(28.dp)
                        Text(text, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                    }
                }
            }
        }
    }
}

@Composable
private fun CircleButton(icon: String, onClick: () -> Unit) {
    Pressable(onClick) {
        Box(Modifier.size(38.dp).glass(19.dp), contentAlignment = Alignment.Center) { SfIcon(icon, size = 17.dp, tint = Ios.label) }
    }
}

/** Плавное появление: снизу вверх, с задержкой — элементы выезжают по очереди */
private fun Modifier.appearIn(delayMs: Int, scale: Float = 0.97f): Modifier = composed {
    val k = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(delayMs.toLong())
        k.animateTo(1f, spring(dampingRatio = 0.78f, stiffness = 120f))
    }
    graphicsLayer {
        val v = k.value
        alpha = v.coerceIn(0f, 1f)
        translationY = (1 - v) * 18 * density
        val s = scale + (1 - scale) * v
        scaleX = s
        scaleY = s
    }
}

@Composable
private fun Header(title: String, text: String) {
    Column(Modifier.fillMaxWidth().appearIn(0), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = ft(32f, FontWeight.ExtraBold, Design.ROUNDED).copy(brush = Brush.verticalGradient(listOf(Ios.label, Ios.label.copy(alpha = 0.75f)))))
        Text(text, style = ft(Ts.subheadline), color = Ios.secondaryLabel)
    }
}

// MARK: приветствие

@Composable
private fun WelcomePage(teacher: Boolean, onKind: (Boolean) -> Unit, onRestore: () -> Unit) {
    val inf = rememberInfiniteTransition(label = "welcome")
    val glow by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(3000), RepeatMode.Reverse), label = "glow")
    val spin by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(6000, easing = LinearEasing)), label = "spin")
    val wave by inf.animateFloat(-8f, 18f, infiniteRepeatable(tween(500), RepeatMode.Reverse), label = "wave")
    Box(Modifier.fillMaxSize()) {
        WelcomeFlakes()
        Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(26.dp)) {
            Spacer(Modifier.weight(1f))
            Box(Modifier.size(240.dp).appearIn(50, 0.6f), contentAlignment = Alignment.Center) {
                val brand = Brand.color
                val brand2 = Brand.color2
                // мягкое свечение
                Canvas(Modifier.fillMaxSize().graphicsLayer { val s = 0.9f + 0.2f * glow; scaleX = s; scaleY = s }) {
                    drawCircle(Brush.radialGradient(listOf(brand.copy(alpha = 0.5f), Color.Transparent), center, 120.dp.toPx()), 120.dp.toPx())
                }
                // вращающееся кольцо
                Canvas(Modifier.size(146.dp)) {
                    rotate(spin) {
                        drawArc(Brush.sweepGradient(listOf(brand, brand2, Color.Transparent, brand)), 0f, 360f * 0.72f, false,
                            style = Stroke(4.dp.toPx(), cap = StrokeCap.Round))
                    }
                }
                Box(Modifier.size(116.dp).shadow(26.dp, CircleShape, ambientColor = brand.copy(alpha = 0.55f), spotColor = brand.copy(alpha = 0.55f))
                    .clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                    SfIcon("snowflake", size = 60.dp, tint = Color.White, modifier = Modifier.graphicsLayer { rotationZ = -30f + 60f * glow })
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.appearIn(250), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Привет!", style = ft(42f, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
                    Text("👋", style = ft(42f), modifier = Modifier.graphicsLayer {
                        rotationZ = wave
                        transformOrigin = androidx.compose.ui.graphics.TransformOrigin(1f, 1f)
                    })
                }
                Text("Твои пары, файлы и оценки САФУ —\nв одном красивом месте", style = ft(Ts.body, design = Design.ROUNDED), color = Ios.secondaryLabel,
                    textAlign = TextAlign.Center, modifier = Modifier.appearIn(400))
            }
            // кто пользуется: студент или преподаватель
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KindCard(teacher == false, false, "Я студент", "graduationcap.fill", "Группа, пары, файлы, оценки", Modifier.weight(1f).appearIn(550, 0.85f)) { onKind(false) }
                KindCard(teacher, true, "Я преподаватель", "person.crop.rectangle.stack.fill", "Свои пары во всех группах",
                    Modifier.weight(1f).appearIn(680, 0.85f)) { onKind(true) }
            }
            Spacer(Modifier.weight(1f))
            TextButton(onRestore, Modifier.appearIn(950)) {
                IconLabel("У меня есть резервная копия", "arrow.uturn.backward.circle", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
            }
        }
    }
}

@Composable
private fun KindCard(on: Boolean, isTeacher: Boolean, title: String, icon: String, text: String, modifier: Modifier, onClick: () -> Unit) {
    val sc by animateFloatAsState(if (on) 1.03f else 0.98f, spring(dampingRatio = 0.78f, stiffness = 300f), label = "kind")
    Pressable(onClick, modifier) {
        Column(Modifier.fillMaxWidth().graphicsLayer { scaleX = sc; scaleY = sc }
            .shadow(if (on) 14.dp else 0.dp, RoundedCornerShape(20.dp), ambientColor = Brand.color.copy(alpha = 0.4f), spotColor = Brand.color.copy(alpha = 0.4f))
            .clip(RoundedCornerShape(20.dp)).let { if (on) it.background(Brand.gradient) else it.background(Ios.label.copy(alpha = 0.07f)) }
            .padding(vertical = 16.dp, horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SfIcon(icon, size = 26.dp, tint = if (on) Color.White else Ios.label)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = if (on) Color.White else Ios.label, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (isTeacher) BetaBadge()
            }
            Text(text, style = ft(Ts.caption2), color = if (on) Color.White.copy(alpha = 0.85f) else Ios.secondaryLabel, textAlign = TextAlign.Center, maxLines = 2)
        }
    }
}

/** Медленно падающие снежинки на приветствии */
@Composable
private fun WelcomeFlakes() {
    class Flake(val x: Double, val y: Double, val size: Double, val speed: Double, val drift: Double, val spin: Double)
    val flakes = remember {
        var seed = 7UL
        fun rnd(): Double {
            seed = seed * 6364136223846793005UL + 1442695040888963407UL
            return (seed shr 11).toDouble() / (1UL shl 53).toDouble()
        }
        List(26) { Flake(rnd(), rnd(), 8 + rnd() * 14, 0.02 + rnd() * 0.03, rnd() * 6.28, (rnd() - 0.5) * 1.2) }
    }
    val painter: Painter = rememberVectorPainter(Sf.icon("snowflake"))
    val brand = Brand.color
    var t by remember { mutableStateOf(0.0) }
    LaunchedEffect(Unit) {
        val start = System.nanoTime()
        while (true) {
            androidx.compose.runtime.withFrameNanos { n -> t = (n - start) / 1e9 }
        }
    }
    Canvas(Modifier.fillMaxSize()) {
        for (f in flakes) {
            val p = (f.y + t * f.speed) % 1.1 - 0.05
            val x = f.x * size.width + sin(t * 0.5 + f.drift) * 18 * density
            val y = p * size.height
            val s = (f.size * density).toFloat()
            translate(x.toFloat(), y.toFloat()) {
                rotate((Math.toDegrees(t * f.spin)).toFloat(), Offset.Zero) {
                    translate(-s / 2, -s / 2) {
                        with(painter) {
                            draw(Size(s, s), alpha = (0.18f + (f.size / 60).toFloat()).coerceAtMost(1f),
                                colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(brand))
                        }
                    }
                }
            }
        }
    }
}

// MARK: имя

@Composable
private fun NamePage(teacher: Boolean, first: String, onFirst: (String) -> Unit, last: String, onLast: (String) -> Unit,
                     middle: String, onMiddle: (String) -> Unit, showMore: Boolean, onShowMore: () -> Unit) {
    val firstFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { if (first.isEmpty()) try { firstFocus.requestFocus() } catch (_: Throwable) {} }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        Header(if (teacher) "Как вас зовут?" else "Как тебя зовут?",
            if (teacher) "По фамилии приложение найдёт ваши пары в РУЗ." else "Так приложение будет с тобой здороваться.")
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { AvatarEditor(96.dp) }
        NameField("Имя", first, onFirst, Modifier.focusRequester(firstFocus))
        AnimatedVisibility(showMore || last.isNotEmpty() || teacher) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                NameField("Фамилия", last, onLast)
                NameField("Отчество", middle, onMiddle)
            }
        }
        if (!(showMore || last.isNotEmpty() || teacher)) {
            TextButton(onShowMore, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                IconLabel("Фамилия и отчество — для титульников", "plus.circle", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
            }
        }
        Text("Всё хранится только на твоём телефоне.", style = ft(Ts.caption), color = Ios.secondaryLabel)
    }
}

@Composable
private fun NameField(title: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    IosTextField(value, onChange, title, modifier.fillMaxWidth().glass(18.dp).padding(horizontal = 18.dp, vertical = 15.dp),
        style = ft(Ts.title3, FontWeight.SemiBold, Design.ROUNDED), words = true)
}

// MARK: школа

@Composable
private fun SchoolPage(teacher: Boolean, school: HigherSchool?, onPick: (HigherSchool) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Header(if (teacher) "Где вы преподаёте" else "Твоя высшая школа",
            if (teacher) "С неё начну поиск ваших пар, потом проверю остальные школы и филиалы." else "По ней подтянутся группы из РУЗ.")
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            HigherSchool.all.forEachIndexed { idx, s ->
                val on = school == s
                val sc by animateFloatAsState(if (on) 1.02f else 1f, label = "school")
                Pressable({ onPick(s) }, Modifier.fillMaxWidth().appearIn(50 + idx * 45)) {
                    Row(Modifier.fillMaxWidth().graphicsLayer { scaleX = sc; scaleY = sc }.glass(20.dp)
                        .border(2.dp, Brand.color.copy(alpha = if (on) 0.7f else 0f), RoundedCornerShape(20.dp)).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Box(Modifier.size(46.dp).clip(RoundedCornerShape(14.dp))
                            .let { if (on) it.background(Brand.gradient) else it.background(Ios.label.copy(alpha = 0.18f)) }, contentAlignment = Alignment.Center) {
                            SfIcon(s.icon, size = 22.dp, tint = Color.White)
                        }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(s.short, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                            Text(s.full, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 2)
                            Text(s.about, style = ft(Ts.caption2), color = Ios.tertiaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (on) SfGradientIcon("checkmark.circle.fill", size = 24.dp) else SfIcon("circle", size = 24.dp, tint = Ios.secondaryLabel.copy(alpha = 0.5f))
                    }
                }
            }
        }
    }
}

// MARK: группа

@Composable
private fun GroupPage(
    school: HigherSchool?, groups: List<RuzGroup>, loading: Boolean, error: String?,
    query: String, onQuery: (String) -> Unit, course: Int?, onCourse: (Int?) -> Unit,
    picked: RuzGroup?, onPick: (RuzGroup) -> Unit, manual: String, onManual: (String) -> Unit,
    manualMode: Boolean, onManualMode: (Boolean) -> Unit, onRetry: () -> Unit,
) {
    val courses = groups.mapNotNull { it.course }.toSet().sorted()
    val q = query.trim().lowercase()
    val filtered = groups.filter { g -> (course == null || g.course == course) && (q.isEmpty() || g.number.contains(q) || g.title.lowercase().contains(q)) }
    val manualFocus = remember { FocusRequester() }
    LaunchedEffect(manualMode) { if (manualMode) try { manualFocus.requestFocus() } catch (_: Throwable) {} }

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.padding(start = 24.dp, end = 24.dp, top = 24.dp)) {
            Header("Твоя группа", school?.let { "${it.short}: выбери группу — расписание подтянется само." } ?: "")
        }
        when {
            manualMode -> Column(Modifier.padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                IosTextField(manual, onManual, "Например, 151621", Modifier.fillMaxWidth().focusRequester(manualFocus).glass(18.dp)
                    .padding(horizontal = 18.dp, vertical = 15.dp), style = ft(Ts.title2, FontWeight.Bold, Design.ROUNDED, mono = true), keyboard = KeyboardType.Number)
                Text("Номер группы — на студенческом или в РУЗ. Приложение найдёт её само, даже если она в другой высшей школе.",
                    style = ft(Ts.caption), color = Ios.secondaryLabel)
                if (groups.isNotEmpty()) TextButton({ onManualMode(false) }, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Text("← Вернуться к списку групп", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
                }
            }
            loading -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Spinner(34.dp)
                Spacer(Modifier.height(12.dp))
                Text("Загружаю группы из РУЗ…", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
            }
            error != null -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically)) {
                SfIcon("wifi.exclamationmark", size = 40.dp, tint = Ios.secondaryLabel)
                Text(error, style = ft(Ts.subheadline), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
                TextButton(onRetry) { Text("Попробовать ещё раз", style = ft(Ts.headline, FontWeight.SemiBold), color = Brand.color) }
                TextButton({ onManualMode(true) }) { Text("Ввести номер группы вручную", style = ft(Ts.subheadline), color = Brand.color) }
            }
            else -> {
                Row(Modifier.padding(horizontal = 24.dp).fillMaxWidth().glass(16.dp).padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SfIcon("magnifyingglass", size = 18.dp, tint = Ios.secondaryLabel)
                    IosTextField(query, onQuery, "Номер или направление", Modifier.weight(1f), capitalize = false)
                }
                if (courses.size > 1) {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 24.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Chip("Все", course == null) { onCourse(null) }
                        for (c in courses) Chip("$c курс", course == c) { onCourse(c) }
                    }
                }
                LazyColumn(Modifier.fillMaxWidth().weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(filtered, key = { it.id }) { g -> GroupRow(g, picked?.id == g.id) { Haptics.tap(); onPick(g) } }
                    if (filtered.isEmpty()) item {
                        Text(if (query.isEmpty()) "В РУЗ нет групп этой школы" else "Ничего не нашлось по «$query»", style = ft(Ts.subheadline),
                            color = Ios.secondaryLabel, modifier = Modifier.padding(top = 20.dp))
                    }
                    item {
                        TextButton({ onManual(query.filter { it.isDigit() }); onManualMode(true) }, Modifier.padding(vertical = 14.dp)) {
                            IconLabel("Нет в списке — ввести номер", "keyboard", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Chip(title: String, on: Boolean, action: () -> Unit) {
    Pressable({ Haptics.tap(); action() }) {
        Text(title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = if (on) Color.White else Ios.label,
            modifier = Modifier.clip(CircleShape).let { if (on) it.background(Brand.gradient) else it.background(Ios.label.copy(alpha = 0.08f)) }
                .padding(horizontal = 14.dp, vertical = 8.dp))
    }
}

@Composable
private fun GroupRow(g: RuzGroup, on: Boolean, onClick: () -> Unit) {
    Pressable(onClick, Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().glass(18.dp).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(g.number, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED, mono = true), color = if (on) Color.White else Ios.label,
                modifier = Modifier.clip(RoundedCornerShape(10.dp)).let { if (on) it.background(Brand.gradient) else it.background(Ios.label.copy(alpha = 0.08f)) }
                    .padding(horizontal = 10.dp, vertical = 6.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(g.title.ifEmpty { "Группа ${g.number}" }, style = ft(Ts.subheadline, FontWeight.Medium), color = Ios.label, maxLines = 2,
                    overflow = TextOverflow.Ellipsis)
                g.course?.let { Text("$it курс", style = ft(Ts.caption), color = Ios.secondaryLabel) }
            }
            if (on) SfGradientIcon("checkmark.circle.fill", size = 24.dp)
        }
    }
}

// MARK: преподаватель

@Composable
private fun TeacherPage(school: HigherSchool?, query: String, onQuery: (String) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Header("Как вы записаны в РУЗ", "Обычно «Фамилия И.О.». Найду все ваши пары во всех группах САФУ — сначала в ${school?.short ?: "вашей школе"}, потом в остальных школах и филиалах.")
        IosTextField(query, onQuery, "Иванов И.И.", Modifier.fillMaxWidth().appearIn(50).glass(18.dp).padding(horizontal = 18.dp, vertical = 15.dp),
            style = ft(Ts.title3, FontWeight.SemiBold, Design.ROUNDED), words = true)
        Column(Modifier.fillMaxWidth().appearIn(150).glass(22.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Feature("calendar.badge.clock", "Ваши пары с номерами групп — на главной, в «Парах» и на экране блокировки")
            Feature("person.crop.circle.badge.checkmark", "Посещаемость по каждой паре и рассылка группе")
            Feature("door.left.hand.open", "Свободные аудитории и где сейчас пара")
            Feature("bell.badge.fill", "Уведомления о заменах и переносах")
            Feature("folder.fill", "Папки по предметам: методички, отчёты, фото доски")
        }
        IconLabel(TeacherMode.betaNote, "hammer.fill", style = ft(Ts.caption), color = Ios.orange)
        Text("Если фамилия с инициалами не находится — оставьте только фамилию.", style = ft(Ts.caption), color = Ios.secondaryLabel)
    }
}

@Composable
private fun Feature(icon: String, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.width(26.dp), contentAlignment = Alignment.Center) { SfGradientIcon(icon, size = 19.dp) }
        Text(text, style = ft(Ts.subheadline, FontWeight.Medium), color = Ios.label)
    }
}

// MARK: роль и дорога

@Composable
private fun ExtrasPage(teacher: Boolean, role: Int, onRole: (Int) -> Unit, farAway: Boolean, onFar: (Boolean) -> Unit) {
    val editing = remember { mutableStateOf<BusRoute?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Header(if (teacher) "Дорога" else "Роль и дорога", "Можно поменять потом в Профиле.")
        if (!teacher) {
            Column(Modifier.appearIn(80), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Кто ты в группе", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RoleCard(role == 0, "Студент", "person.fill", Modifier.weight(1f)) { onRole(0) }
                    RoleCard(role == 1, "Староста", "star.fill", Modifier.weight(1f)) { onRole(1) }
                    RoleCard(role == 2, "Зам", "star.leadinghalf.filled", Modifier.weight(1f)) { onRole(2) }
                }
                Text(if (role == 0) "Всё для учёбы: пары, файлы, оценки." else "Откроется «Посещаемость»: отметки ребят на каждой паре и рассылка группе.",
                    style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
        }
        Column(Modifier.appearIn(160), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Как добираешься", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
            OptionRow(!farAway, "Живу рядом", "Хожу пешком или езжу по городу", "figure.walk") { onFar(false) }
            OptionRow(farAway, "Езжу на автобусе", "Выбери свой — подскажу, когда выезжать, чтобы успеть к паре", "bus.fill") { onFar(true) }
            AnimatedVisibility(farAway) { BusPicker { editing.value = it } }
        }
    }
    SheetItem(editing) { r ->
        BusRouteEditorSheet(r) { saved ->
            BusRouteStore.upsert(saved)
            BusRouteStore.activate(saved)
        }
    }
}

@Composable
private fun BusPicker(onNew: (BusRoute) -> Unit) {
    val store = BusRouteStore
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (r in store.routes) {
            val on = r.id == store.activeID
            Pressable({ Haptics.tap(); store.activate(r) }, Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().glass(18.dp).padding(10.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(50.dp, 40.dp).clip(RoundedCornerShape(11.dp))
                        .background(Brush.verticalGradient(listOf(r.color.copy(alpha = 0.85f), r.color))), contentAlignment = Alignment.Center) {
                        Text(r.number.ifEmpty { "?" }, style = ft(if (r.number.length > 3) 13f else 16f, FontWeight.ExtraBold, Design.ROUNDED),
                            color = Color.White, maxLines = 1)
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(r.routeText, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("в пути ${r.travelMinutes} мин", style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                    if (on) SfGradientIcon("checkmark.circle.fill", size = 24.dp) else SfIcon("circle", size = 24.dp, tint = Ios.secondaryLabel.copy(alpha = 0.5f))
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pressable({ onNew(BusRoute(colorHex = BusPalette.hexes.random())) }, Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth().glass(16.dp).padding(vertical = 11.dp), contentAlignment = Alignment.Center) {
                    IconLabel("Свой автобус", "plus.circle.fill", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, iconColor = Brand.color)
                }
            }
            Pressable({
                val text = Share.pasteText()
                val r = text?.let { BusRoute.fromShareCode(it) }
                if (r != null) {
                    store.upsert(r)
                    store.activate(r)
                    Haptics.success()
                    Dialogs.alert("Автобус", "${r.title} добавлен и выбран.")
                } else {
                    Dialogs.alert("Автобус", "В буфере нет кода автобуса. Попроси одногруппника нажать «Поделиться» в его автобусе и скопируй код.")
                }
            }, Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth().glass(16.dp).padding(vertical = 11.dp), contentAlignment = Alignment.Center) {
                    IconLabel("Код от друга", "doc.on.clipboard", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, iconColor = Brand.color)
                }
            }
        }
    }
}

@Composable
private fun RoleCard(on: Boolean, title: String, icon: String, modifier: Modifier, onClick: () -> Unit) {
    Pressable({ Haptics.tap(); onClick() }, modifier) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).let { if (on) it.background(Brand.gradient) else it.background(Ios.label.copy(alpha = 0.07f)) }
            .padding(vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SfIcon(icon, size = 22.dp, tint = if (on) Color.White else Ios.label)
            Text(title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = if (on) Color.White else Ios.label)
        }
    }
}

@Composable
private fun OptionRow(on: Boolean, title: String, text: String, icon: String, action: () -> Unit) {
    Pressable({ Haptics.tap(); action() }, Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().glass(20.dp).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).let { if (on) it.background(Brand.gradient) else it.background(Ios.label.copy(alpha = 0.08f)) },
                contentAlignment = Alignment.Center) {
                SfIcon(icon, size = 21.dp, tint = if (on) Color.White else Ios.label)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                Text(text, style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
            if (on) SfGradientIcon("checkmark.circle.fill", size = 24.dp) else SfIcon("circle", size = 24.dp, tint = Ios.secondaryLabel.copy(alpha = 0.5f))
        }
    }
}

// MARK: автонастройка

@Composable
private fun SetupPage(teacher: Boolean, first: String, groupNumber: String, finished: Boolean, tasks: List<SetupTask>) {
    val next: LessonSlot? = if (finished) ScheduleQuery.slots(ScheduleStore.data, days = 14).firstOrNull { it.end > Instant.now() } else null
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        Header(if (finished) "Готово, ${first.trim()}! 🎉" else "Настраиваю всё…",
            if (finished) (if (teacher) "Ваше расписание собрано из РУЗ." else "Приложение настроено под группу $groupNumber.")
            else (if (teacher) "Просматриваю расписания всех групп САФУ — несколько минут, ваша школа первой." else "Это займёт несколько секунд."))
        Column(Modifier.fillMaxWidth().glass(22.dp).padding(horizontal = 16.dp, vertical = 6.dp)) {
            for (t in tasks) {
                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.width(26.dp).height(24.dp), contentAlignment = Alignment.Center) {
                        when (t.state) {
                            SetupTask.Phase.WAITING -> SfIcon("circle", size = 22.dp, tint = Ios.tertiaryLabel)
                            SetupTask.Phase.RUNNING -> Spinner(18.dp)
                            SetupTask.Phase.DONE -> SfIcon("checkmark.circle.fill", size = 22.dp, tint = Ios.green)
                            SetupTask.Phase.WARN -> SfIcon("exclamationmark.circle.fill", size = 22.dp, tint = Ios.orange)
                        }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(t.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                        if (t.detail.isNotEmpty()) Text(t.detail, style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                }
            }
        }
        AnimatedVisibility(finished && next != null) {
            next?.let { n ->
                Column(Modifier.fillMaxWidth().glass(22.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    IconLabel("Ближайшая пара", "clock.fill", style = ft(Ts.caption, FontWeight.Bold), color = Brand.color)
                    Text(n.lesson.subject, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                    Text(Fmt.format(n.start, "EEEE, d MMMM, HH:mm") + if (n.lesson.room.isEmpty()) "" else " · ауд. ${n.lesson.room}",
                        style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                }
            }
        }
        if (finished) Text("Виджет: удержи пустое место на рабочем столе → «Виджеты» → САФУ. Пара на экране блокировки появится сама.",
            style = ft(Ts.caption), color = Ios.secondaryLabel)
    }
}
