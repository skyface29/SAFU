package ru.student.safuhub.screens.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.Academic
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.LessonSlot
import ru.student.safuhub.data.Resource
import ru.student.safuhub.data.ResourceStore
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.TaskStore
import ru.student.safuhub.data.TeacherMode
import ru.student.safuhub.data.hostOf
import ru.student.safuhub.feature.avatar.AvatarView
import ru.student.safuhub.feature.board.BoardBatch
import ru.student.safuhub.feature.board.BoardBatchScreen
import ru.student.safuhub.feature.board.BoardBatchesListScreen
import ru.student.safuhub.feature.board.BoardHomeCard
import ru.student.safuhub.feature.board.BoardPhoto
import ru.student.safuhub.feature.board.LessonPhotos
import ru.student.safuhub.feature.commute.CommuteSettings
import ru.student.safuhub.feature.features.Maps
import ru.student.safuhub.feature.mail.MailRouter
import ru.student.safuhub.feature.mail.MailWatch
import ru.student.safuhub.feature.place.PairPlaceSheet
import ru.student.safuhub.feature.session.SessionCard
import ru.student.safuhub.feature.session.SessionMode
import ru.student.safuhub.feature.weather.WeatherHomeCard
import ru.student.safuhub.feature.web.CredentialStore
import ru.student.safuhub.feature.web.WebLauncher
import ru.student.safuhub.screens.commute.CommuteCard
import ru.student.safuhub.screens.profile.ProfileScreen
import ru.student.safuhub.screens.schedule.NowCard
import ru.student.safuhub.screens.subjects.SubjectSheet
import ru.student.safuhub.screens.subjects.SubjectsStrip
import ru.student.safuhub.screens.teacher.TeacherHomeCard
import ru.student.safuhub.screens.tools.Tool
import ru.student.safuhub.screens.tools.ToolSheet
import ru.student.safuhub.screens.tools.ToolsGrid
import ru.student.safuhub.system.rememberCamera
import ru.student.safuhub.ui.AppTab
import ru.student.safuhub.ui.HomeSection
import ru.student.safuhub.ui.design.CircleIconButton
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.Pill
import ru.student.safuhub.ui.design.ScreenHeader
import ru.student.safuhub.ui.design.SectionTitle
import ru.student.safuhub.ui.design.dragReorder
import ru.student.safuhub.ui.design.rememberDragReorder
import ru.student.safuhub.ui.design.scrollFX
import ru.student.safuhub.ui.design.staggerIn
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.ScrollPage
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.StrictLook
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

@Composable
fun HomeScreen() {
    val ctx = LocalContext.current
    ResourceStore.load()
    TaskStore.load()
    var tab by prefString("memory.tabID", "home")
    var homeOrder by prefString("home.order", HomeSection.defaultRaw)
    val columnsCount by prefInt("home.columns", 2)
    val tabsRaw by prefString("tabs.order", AppTab.defaultRaw)
    val compact by prefBool("ui.compact", false)
    val userName by prefString("user.name", "")
    val columns = columnsCount.coerceIn(2, 3)
    val data = ScheduleStore.data

    val editing = remember { mutableStateOf<Resource?>(null) }
    val activeTool = remember { mutableStateOf<Tool?>(null) }
    val openSubject = remember { mutableStateOf<String?>(null) }
    val place = remember { mutableStateOf<LessonSlot?>(null) }
    val boardOpen = remember { mutableStateOf<BoardBatch?>(null) }
    val showBoards = remember { mutableStateOf(false) }
    val showHomeEditor = remember { mutableStateOf(false) }
    val showProfile = remember { mutableStateOf(false) }
    var appeared by remember { mutableStateOf(false) }

    SheetItem(editing) { r -> EditResourceSheet(r) { ResourceStore.upsert(it) } }
    SheetItem(activeTool) { t -> ToolSheet(t) }
    SheetItem(openSubject) { s -> SubjectSheet(s) }
    SheetItem(place) { s -> PairPlaceSheet(s) }
    SheetItem(boardOpen) { b -> DoneSheet { BoardBatchScreen(b) } }
    SheetBinding(showBoards) { DoneSheet { BoardBatchesListScreen(null) } }
    SheetBinding(showProfile) { ProfileScreen() }
    SheetBinding(showHomeEditor) { DoneSheet { HomeEditor() } }

    var photoFor by remember { mutableStateOf<String?>(null) }
    val camera = rememberCamera { file ->
        val subject = photoFor
        photoFor = null
        if (file != null && subject != null && BoardPhoto.save(file, subject) != null) {
            Haptics.success()
            Dialogs.showToast("Фото сохранено в «$subject»", "camera.fill")
        }
        file?.delete()
    }
    fun photo(subject: String) { photoFor = subject; camera.open() }

    fun open(r: Resource) {
        Haptics.tap()
        ResourceStore.markOpened(r)
        // в режиме «как в браузере» приложение не может само вставить пароль — кладём его в буфер на минуту
        val host = hostOf(r.url)
        if (host != null && WebLauncher.isPlain(host) && CredentialStore.enabled) {
            CredentialStore.get(host)?.let { c ->
                Share.copy(c.pass, sensitive = true)
                AppScope.launch { delay(60_000); if (Share.pasteText() == c.pass) Share.clearClipboard() }
                Dialogs.showToast("Пароль скопирован на минуту — нажми на поле и «Вставить»", "key.fill")
            }
        }
        WebLauncher.open(ctx, r)
    }

    // нажали на уведомление о письме
    LaunchedEffect(MailRouter.pending) {
        if (!MailRouter.pending) return@LaunchedEffect
        MailRouter.pending = false
        val mail = ResourceStore.items.firstOrNull { hostOf(it.url) == MailWatch.webHost }
            ?: Resource(title = "Почта", subtitle = "Samoware", url = "https://" + MailWatch.webHost, icon = "envelope.fill", category = "Почта и документы")
        delay(300)
        open(mail)
    }

    LaunchedEffect(Unit) {
        appeared = true
        StrictLook.applyOnce()
        migrateHome()
    }

    fun openTile(t: HomeTile) {
        when (t.type) {
            HomeTile.Kind.LINK -> open(Resource(title = t.title, subtitle = "", url = t.value, icon = t.icon, category = "Мои плитки"))
            HomeTile.Kind.TOOL -> Tool.of(t.value)?.let { activeTool.value = it }
            HomeTile.Kind.SUBJECT -> openSubject.value = t.value
            HomeTile.Kind.TAB -> tab = t.value
            HomeTile.Kind.CAMERA -> LessonPhotos.currentSlot(ScheduleStore.data)?.let { photo(it.lesson.subject) } ?: run { showBoards.value = true }
            HomeTile.Kind.BOARDS -> showBoards.value = true
            HomeTile.Kind.NOTE -> {}
        }
    }

    // в режиме сессии блок «Сессия» поднимается наверх
    val sections = HomeSection.parse(homeOrder).toMutableList().also { list ->
        if (ScheduleStore.isConfigured && SessionMode.isActive(data)) {
            list.remove(HomeSection.SESSION)
            list.add(0, HomeSection.SESSION)
        }
    }
    val drag = rememberDragReorder<HomeSection>()
    fun moveSection(moved: HomeSection, target: HomeSection) {
        val list = HomeSection.parse(homeOrder).toMutableList()
        val from = list.indexOf(moved)
        val to = list.indexOf(target)
        if (moved == target || from < 0 || to < 0) return
        list.removeAt(from)
        list.add(to, moved)
        homeOrder = HomeSection.join(list)
        Haptics.success()
    }

    val first = userName.split(" ").firstOrNull { it.isNotEmpty() } ?: ""
    val greeting = if (first.isEmpty()) Fmt.greeting else "${Fmt.greeting}, $first"

    ScrollPage(horizontal = if (compact) 14.dp else 20.dp, spacing = if (compact) 14.dp else 24.dp, top = if (compact) 6.dp else 12.dp) {
        val headerAlpha by animateFloatAsState(if (appeared) 1f else 0f, label = "h")
        ScreenHeader(Fmt.today(), greeting, Modifier.graphicsLayer { alpha = headerAlpha; translationY = (1 - headerAlpha) * -10 * density }) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                AddMenu(onAdd = { editing.value = Resource(title = "", subtitle = "", url = "https://", icon = "link", category = "Мои ссылки") },
                    onEditor = { showHomeEditor.value = true })
                Pressable({
                    Haptics.tap()
                    if (AppTab.parse(tabsRaw).contains(AppTab.PROFILE)) tab = AppTab.PROFILE.raw else showProfile.value = true
                }) { AvatarView(40.dp) }
            }
        }

        sections.filter { blockVisible(it) }.forEachIndexed { i, sec ->
            val draggable = sec !in listOf(HomeSection.SITES, HomeSection.TILES, HomeSection.QUICK, HomeSection.RECENTS)
            Box(Modifier.staggerIn(minOf(i, 8)).scrollFX().dragReorder(drag, sec, draggable) { a, b -> moveSection(a, b) }
                .let { if (drag.target == sec && drag.dragging != null) it.graphicsLayer { alpha = 0.6f } else it }) {
                Column(Modifier.animateContentSize()) {
                    HomeBlock(sec, columns, onTab = { tab = it.raw }, onPhoto = { photo(it) }, onPlace = { place.value = it },
                        onBoard = { boardOpen.value = it }, onTool = { activeTool.value = it }, onSubject = { openSubject.value = it },
                        onTile = { openTile(it) }, onOpen = { open(it) }, onEdit = { editing.value = it },
                        onHideCommute = {
                            Haptics.tap()
                            homeOrder = HomeSection.join(HomeSection.parse(homeOrder).filter { it != HomeSection.COMMUTE })
                        })
                }
            }
        }

        if (HomeSection.parse(homeOrder).isEmpty()) {
            Text("Главная пустая. Добавь блоки кнопкой ниже.", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Pressable({ Haptics.tap(); showHomeEditor.value = true }, Modifier.fillMaxWidth()) {
                Glass(16.dp, Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.Center) {
                        IconLabel("Настроить главную", "slider.horizontal.3", style = ft(Ts.subheadline, FontWeight.SemiBold), iconColor = Brand.color)
                    }
                }
            }
            Text("Удержи блок и перетащи, чтобы поменять порядок", style = ft(Ts.caption2), color = Ios.tertiaryLabel,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(24.dp))
    }
}


/** Одноразовые переносы порядка блоков (как в iOS-версии) */
private fun migrateHome() {
    val d = Defaults
    var order = d.string("home.order") ?: HomeSection.defaultRaw
    fun save(list: List<HomeSection>) { order = HomeSection.join(list); d.set("home.order", order) }
    // преподавателю — его рабочие сайты (один раз)
    if (TeacherMode.isOn && !d.bool("resources.teacher.added")) {
        val have = ResourceStore.items.map { it.url.lowercase() }.toSet()
        val extra = Resource.teacherDefaults.filter { it.url.lowercase() !in have }
        if (extra.isNotEmpty()) ResourceStore.replaceItems(extra + ResourceStore.items)
        d.set("resources.teacher.added", true)
    }
    // студенту — ничего преподавательского
    if (!TeacherMode.isOn) {
        val staff = Resource.teacherDefaults.map { it.url.lowercase() }.toSet()
        val isStaff = { r: Resource -> r.category == "Преподавателю" && r.url.lowercase() in staff }
        if (ResourceStore.items.any(isStaff)) ResourceStore.replaceItems(ResourceStore.items.filterNot(isStaff))
        val clean = HomeSection.join(HomeSection.parse(order))
        if (clean != order && clean.isNotEmpty()) { order = clean; d.set("home.order", order) }
        d.remove("resources.teacher.added")
        d.remove("home.teacher.added")
        if (d.int("user.role") == 3) d.set("user.role", 0)
    }
    // преподавателю — своя карточка сразу после «пары сейчас» (один раз)
    if (TeacherMode.isOn && !d.bool("home.teacher.added")) {
        val list = HomeSection.parse(order).toMutableList()
        if (!list.contains(HomeSection.TEACHER)) {
            list.add(minOf(list.indexOf(HomeSection.NOW) + 1, list.size), HomeSection.TEACHER)
            save(list)
        }
        d.set("home.teacher.added", true)
    }
    // 9.9 убирал «Недавние» и «Предметы» — возвращаем на место
    if (d.bool("home.slim.99") && !d.bool("home.slim.undo")) {
        val list = HomeSection.parse(order).toMutableList()
        for ((sec, after) in listOf(HomeSection.SUBJECTS to HomeSection.QUICK, HomeSection.RECENTS to HomeSection.TOOLS)) {
            if (list.contains(sec)) continue
            val i = list.indexOf(after).let { if (it >= 0) it + 1 else list.size }
            list.add(minOf(i, list.size), sec)
        }
        save(list)
        d.set("home.slim.undo", true)
    }
    for ((flag, sec, anchor) in listOf(
        Triple("home.commute.added", HomeSection.COMMUTE, listOf(HomeSection.NOW)),
        Triple("home.weather.added", HomeSection.WEATHER, listOf(HomeSection.NOW)),
        Triple("home.board.added", HomeSection.BOARD, listOf(HomeSection.COMMUTE, HomeSection.NOW)),
    )) {
        if (d.bool(flag)) continue
        val list = HomeSection.parse(order).toMutableList()
        if (!list.contains(sec)) {
            val idx = anchor.map { list.indexOf(it) }.firstOrNull { it >= 0 } ?: -1
            list.add(minOf(idx + 1, list.size), sec)
            save(list)
        }
        d.set(flag, true)
    }
}

@Composable
private fun AddMenu(onAdd: () -> Unit, onEditor: () -> Unit) {
    IosMenu(items = {
        item("Добавить ссылку", "plus") { onAdd() }
        item("Настроить главную и плитки", "slider.horizontal.3") { onEditor() }
        if (ResourceStore.recents.isNotEmpty()) item("Очистить недавние", "clock.arrow.circlepath") { ResourceStore.clearMemory() }
        item("Сбросить ссылки", "arrow.counterclockwise", destructive = true) {
            Dialogs.actionSheet("Вернуть стандартный список и очистить память?", null,
                AlertAction("Сбросить", AlertAction.Role.DESTRUCTIVE) { ResourceStore.resetToDefaults() },
                AlertAction("Отменить", AlertAction.Role.CANCEL))
        }
    }) { CircleIconButton("plus") }
}

@Composable
private fun HomeBlock(
    sec: HomeSection, columns: Int,
    onTab: (AppTab) -> Unit, onPhoto: (String) -> Unit, onPlace: (LessonSlot) -> Unit, onBoard: (BoardBatch) -> Unit,
    onTool: (Tool) -> Unit, onSubject: (String) -> Unit, onTile: (HomeTile) -> Unit, onOpen: (Resource) -> Unit,
    onEdit: (Resource) -> Unit, onHideCommute: () -> Unit,
) {
    val ctx = LocalContext.current
    val data = ScheduleStore.data
    val configured = ScheduleStore.isConfigured
    when (sec) {
        HomeSection.NOW -> if (configured) {
            NowCard(data, onOpen = { onTab(AppTab.SCHEDULE) },
                onMap = { address -> Maps.smartURL(address)?.let { Share.url(ctx, it) } },
                onPhoto = { slot -> onPhoto(slot.lesson.subject) },
                onPlace = { slot -> onPlace(slot) })
        } else SchedulePrompt { onTab(AppTab.SCHEDULE) }
        HomeSection.TODAY -> TodayCard()
        HomeSection.SESSION -> if (configured && !TeacherMode.isOn) SessionCard(data)
        HomeSection.COMMUTE -> if (CommuteSettings.enabled && configured && !TeacherMode.isOn) CommuteCard(data, onHideCommute)
        HomeSection.QUICK -> if (ResourceStore.quick.isNotEmpty()) QuickActions(onOpen)
        HomeSection.SUBJECTS -> SubjectsStrip { onSubject(it) }
        HomeSection.TOOLS -> ToolsGrid { onTool(it) }
        HomeSection.RECENTS -> if (ResourceStore.recents.isNotEmpty()) RecentsSection(onOpen)
        HomeSection.SITES -> SitesSection(columns, onOpen, onEdit)
        HomeSection.BOARD -> if (configured) BoardHomeCard(data, onCamera = { onPhoto(it) }, onOpen = { onBoard(it) })
        HomeSection.TILES -> HomeTilesGrid(columns) { onTile(it) }
        HomeSection.WEATHER -> WeatherHomeCard(data)
        HomeSection.TEACHER -> if (TeacherMode.isOn) {
            TeacherHomeCard(data, onTool = onTool, onRefresh = { AppScope.launch { ScheduleStore.sync(force = true) } }, syncing = ScheduleStore.syncing)
        }
    }
}

/** Пустые блоки не занимают места (как EmptyView в iOS) */
@Composable
private fun blockVisible(sec: HomeSection): Boolean {
    val configured = ScheduleStore.isConfigured
    return when (sec) {
        HomeSection.SESSION -> configured && !TeacherMode.isOn && ru.student.safuhub.feature.session.SessionCardVisible(ScheduleStore.data)
        HomeSection.COMMUTE -> CommuteSettings.enabled && configured && !TeacherMode.isOn
        HomeSection.QUICK -> ResourceStore.quick.isNotEmpty()
        HomeSection.RECENTS -> ResourceStore.recents.isNotEmpty()
        HomeSection.BOARD -> configured
        HomeSection.TEACHER -> TeacherMode.isOn
        HomeSection.SUBJECTS -> ru.student.safuhub.screens.subjects.SubjectsStripVisible()
        HomeSection.WEATHER -> ru.student.safuhub.feature.weather.WeatherCardVisible(ScheduleStore.data)
        else -> true
    }
}

// MARK: - сегодня

@Composable
private fun SchedulePrompt(onClick: () -> Unit) {
    Pressable(onClick, Modifier.fillMaxWidth()) {
        Glass(26.dp, Modifier.fillMaxWidth(), interactive = true) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Brand.gradient), contentAlignment = Alignment.Center) {
                    SfIcon("calendar.badge.clock", size = 24.dp, tint = Color.White)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("Какая сейчас пара?", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                    Text("Подключи расписание из РУЗ, и здесь будет текущая пара, аудитория и адрес", style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
                SfIcon("chevron.right", size = 14.dp, tint = Ios.secondaryLabel)
            }
        }
    }
}

@Composable
private fun TodayCard() {
    val w = Academic.week(ScheduleStore.data.semesterStart)
    val weekText = if (w == null) "Вне семестра" else "Неделя $w · ${if (w % 2 == 0) "чётная" else "нечётная"}"
    Glass(28.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Pill("calendar", weekText)
                Pill("checklist", "Задач: ${TaskStore.active.size}")
            }
            ru.student.safuhub.ui.kit.Divider(alpha = 0.5f)
            val next = TaskStore.nextOpen
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(Brand.color.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                    SfGradientIcon(if (next != null) "flag.fill" else "sparkles", size = 20.dp)
                }
                if (next != null) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Ближайший дедлайн", style = ft(Ts.caption), color = Ios.secondaryLabel)
                        Text(next.title, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(Fmt.relative(next.due), style = ft(Ts.subheadline, FontWeight.SemiBold),
                        color = if (next.due < Instant.now()) Ios.red else Brand.color)
                } else {
                    Text("Дедлайнов нет, можно выдохнуть", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                }
            }
        }
    }
}

// MARK: - быстрые кнопки

@Composable
private fun QuickActions(onOpen: (Resource) -> Unit) {
    val quick = ResourceStore.quick
    val drag = rememberDragReorder<String>()
    Row(Modifier.fillMaxWidth()) {
        for (r in quick) {
            Box(Modifier.weight(1f).dragReorder(drag, r.id) { a, b -> moveQuick(a, b) }) {
                Pressable({ onOpen(r) }, Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Glass(29.dp, Modifier.size(58.dp), interactive = true, contentAlignment = Alignment.Center) {
                            BouncyIcon(r, 22.dp)
                        }
                        Text(r.title, style = ft(Ts.caption, FontWeight.Medium), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

private fun moveQuick(dragged: String, target: String) {
    val ids = ResourceStore.quick.map { it.id }.toMutableList()
    val from = ids.indexOf(dragged)
    val to = ids.indexOf(target)
    if (dragged == target || from < 0 || to < 0) return
    ids.removeAt(from)
    ids.add(to, dragged)
    Defaults.set("quick.ids", ids.joinToString(","))
    Haptics.success()
}

/** Значок подпрыгивает при каждом открытии сайта */
@Composable
private fun BouncyIcon(r: Resource, size: androidx.compose.ui.unit.Dp) {
    val ticks = ResourceStore.openTicks[r.id] ?: 0
    val anim = remember { androidx.compose.animation.core.Animatable(1f) }
    LaunchedEffect(ticks) {
        if (ticks > 0) {
            anim.snapTo(1f)
            anim.animateTo(1.3f, spring(dampingRatio = 0.4f, stiffness = 900f))
            anim.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 500f))
        }
    }
    SfGradientIcon(r.icon, size = size, modifier = Modifier.graphicsLayer { scaleX = anim.value; scaleY = anim.value })
}

// MARK: - недавние (память)

@Composable
private fun RecentsSection(onOpen: (Resource) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("Недавние")
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            for (r in ResourceStore.recents) {
                Pressable({ onOpen(r) }) {
                    Glass(18.dp, interactive = true) {
                        Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SfIcon(r.icon, size = 16.dp, tint = Brand.color)
                            Text(r.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1)
                            if (ResourceStore.lastURL(r) != null) Box(Modifier.size(5.dp).clip(CircleShape).background(Brand.color))
                        }
                    }
                }
            }
        }
    }
}

// MARK: - сайты

@Composable
private fun SitesSection(columns: Int, onOpen: (Resource) -> Unit, onEdit: (Resource) -> Unit) {
    var query by remember { mutableStateOf("") }
    var collapsedRaw by prefString("home.collapsed", "")
    val collapsed = collapsedRaw.split("|").filter { it.isNotEmpty() }.toSet()
    fun toggle(category: String) {
        val set = collapsed.toMutableSet()
        if (!set.add(category)) set.remove(category)
        Haptics.tap()
        collapsedRaw = set.sorted().joinToString("|")
    }
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("Сайты")
            Spacer(Modifier.weight(1f))
            Text("${ResourceStore.items.size}", style = ft(Ts.caption, FontWeight.Bold), color = Ios.secondaryLabel,
                modifier = Modifier.clip(CircleShape).background(Ios.label.copy(alpha = 0.08f)).padding(horizontal = 8.dp, vertical = 3.dp))
        }
        Glass(16.dp, Modifier.fillMaxWidth()) {
            Row(Modifier.padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SfIcon("magnifyingglass", size = 18.dp, tint = Ios.secondaryLabel)
                IosTextField(query, { query = it }, "Поиск по сайтам", Modifier.weight(1f), capitalize = false)
                if (query.isNotEmpty()) SfIcon("xmark.circle.fill", size = 18.dp, tint = Ios.secondaryLabel,
                    modifier = Modifier.clickable(remember { MutableInteractionSource() }, null) { query = "" })
            }
        }
        if (query.isNotBlank()) {
            val results = ResourceStore.search(query)
            if (results.isEmpty()) {
                Text("Ничего не найдено", style = ft(Ts.subheadline), color = Ios.secondaryLabel, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp))
            } else CardGrid(results, columns, onOpen, onEdit)
        } else {
            if (ResourceStore.pinnedItems.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    IconLabel("Избранное", "pin.fill", style = ft(Ts.subheadline, FontWeight.Bold), color = Brand.color)
                    CardGrid(ResourceStore.pinnedItems, columns, onOpen, onEdit)
                }
            }
            for (category in ResourceStore.visibleCategories) {
                val isCollapsed = collapsed.contains(category)
                val list = ResourceStore.items(category)
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.fillMaxWidth().clickable(remember { MutableInteractionSource() }, null) { toggle(category) },
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(category, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                        Text("${list.size}", style = ft(Ts.caption, FontWeight.Bold), color = Ios.secondaryLabel)
                        Spacer(Modifier.weight(1f))
                        val rot by animateFloatAsState(if (isCollapsed) -90f else 0f, label = "rot")
                        SfIcon("chevron.down", size = 14.dp, tint = Ios.secondaryLabel, modifier = Modifier.graphicsLayer { rotationZ = rot })
                    }
                    AnimatedVisibility(!isCollapsed, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                        CardGrid(list, columns, onOpen, onEdit)
                    }
                }
            }
            Text("Удерживай плитку: закрепить, изменить или удалить", style = ft(Ts.caption), color = Ios.secondaryLabel,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun CardGrid(list: List<Resource>, columns: Int, onOpen: (Resource) -> Unit, onEdit: (Resource) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        for (row in list.chunked(columns)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (r in row) SiteCard(r, columns, Modifier.weight(1f), onOpen, onEdit)
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun SiteCard(r: Resource, columns: Int, modifier: Modifier, onOpen: (Resource) -> Unit, onEdit: (Resource) -> Unit) {
    val ctx = LocalContext.current
    val i = ResourceStore.index(r)
    ContextMenuBox(items = {
        item(if (r.pinned) "Открепить" else "Закрепить в избранном", if (r.pinned) "pin.slash" else "pin") { Haptics.tap(); ResourceStore.togglePin(r) }
        item("Открыть в браузере", "safari") { Share.url(ctx, r.url) }
        item("Изменить", "pencil") { onEdit(r) }
        item("Удалить", "trash", destructive = true) { ResourceStore.delete(r) }
    }, modifier = modifier.staggerIn(minOf(i + 3, 11)), onClick = { onOpen(r) }) {
        Glass(24.dp, Modifier.fillMaxWidth(), interactive = true) {
            Column(Modifier.fillMaxWidth().defaultMinSize(minHeight = if (columns < 3) 104.dp else 84.dp).padding(if (columns < 3) 16.dp else 13.dp)) {
                BouncyIcon(r, 24.dp)
                Spacer(Modifier.weight(1f).defaultMinSize(minHeight = 22.dp))
                Spacer(Modifier.height(22.dp))
                Text(r.title, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (columns < 3) Text(r.subtitle, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (r.pinned) SfIcon("pin.fill", size = 11.dp, tint = Brand.color, modifier = Modifier.align(Alignment.TopEnd).padding(10.dp))
        }
    }
}

// MARK: - редактор ссылки

private val resourceIcons = listOf("link", "globe", "book.fill", "doc.fill", "calendar", "envelope.fill",
    "graduationcap.fill", "person.fill", "folder.fill", "star.fill", "cpu", "building.columns.fill")

@Composable
fun EditResourceSheet(initial: Resource, onSave: (Resource) -> Unit) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        var r by remember { mutableStateOf(initial) }
        FormScreen("Ссылка",
            leading = { BarButton("Отмена") { dismiss() } },
            trailing = {
                BarButton("Сохранить", bold = true, enabled = r.isValid) {
                    var x = r.copy(url = r.url.trim())
                    if (x.category.isBlank()) x = x.copy(category = "Мои ссылки")
                    onSave(x)
                    dismiss()
                }
            }) {
            FormSection("Название") {
                field("Например, Библиотека", r.title, { r = r.copy(title = it) })
                field("Короткое описание", r.subtitle, { r = r.copy(subtitle = it) })
            }
            FormSection("Адрес") {
                field("https://", r.url, { r = r.copy(url = it) }, keyboard = KeyboardType.Uri, capitalize = false)
            }
            FormSection("Раздел") {
                field("Раздел", r.category, { r = r.copy(category = it) })
            }
            FormSection("Иконка") {
                raw {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        for (row in resourceIcons.chunked(6)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                for (name in row) {
                                    val sel = r.icon == name
                                    Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(if (sel) Brand.color else Color.Transparent)
                                        .clickable { r = r.copy(icon = name) }, contentAlignment = Alignment.Center) {
                                        SfIcon(name, size = 20.dp, tint = if (sel) Color.White else Brand.color)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
