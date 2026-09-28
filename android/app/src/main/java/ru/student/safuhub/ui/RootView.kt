package ru.student.safuhub.ui

import android.app.Activity
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import ru.student.safuhub.App
import ru.student.safuhub.background.BackgroundRefresh
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.ScheduleQuery
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.board.BoardBatchScreen
import ru.student.safuhub.feature.board.BoardBatchesListScreen
import ru.student.safuhub.feature.board.BoardPhoto
import ru.student.safuhub.feature.board.BoardRouter
import ru.student.safuhub.feature.board.LessonPhotos
import ru.student.safuhub.feature.eggs.Oracle
import ru.student.safuhub.feature.fx.CelebrationOverlay
import ru.student.safuhub.feature.fx.Celebrations
import ru.student.safuhub.feature.grades.GradeSync
import ru.student.safuhub.feature.lock.AppLock
import ru.student.safuhub.feature.lock.AppLockLayer
import ru.student.safuhub.feature.mail.MailRouter
import ru.student.safuhub.feature.mail.MailWatch
import ru.student.safuhub.feature.sakai.SakaiSync
import ru.student.safuhub.screens.appearance.AppearanceSheet
import ru.student.safuhub.screens.attendance.AttendanceScreen
import ru.student.safuhub.screens.developer.Developer
import ru.student.safuhub.screens.developer.DeveloperScreen
import ru.student.safuhub.screens.files.FilesTab
import ru.student.safuhub.screens.home.HomeScreen
import ru.student.safuhub.screens.profile.ProfileScreen
import ru.student.safuhub.screens.registration.RegistrationScreen
import ru.student.safuhub.screens.schedule.ScheduleScreen
import ru.student.safuhub.screens.subjects.SubjectsScreen
import ru.student.safuhub.screens.tasks.TasksScreen
import ru.student.safuhub.system.NotifyHooks
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.system.rememberCamera
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.gradientTint
import ru.student.safuhub.ui.kit.DoneSheet
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.LocalSheets
import ru.student.safuhub.ui.kit.Nav
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetBinding
import ru.student.safuhub.ui.kit.SheetHost
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.SheetsLayer
import ru.student.safuhub.ui.kit.packChrome
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.ThemePack
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

/** Ссылки safu:// и нажатия на уведомления, пришедшие в активити */
object DeepLinks {
    val pending = mutableStateOf<String?>(null)
    val notification = mutableStateOf<Map<String, String>?>(null)
}

/** Переключить вкладку из любого места (как запись в memory.tabID) */
object TabRouter {
    fun select(tab: AppTab) = Defaults.set("memory.tabID", tab.raw)
}

/** Высота нижней панели — экраны добавляют отступ снизу */
val LocalTabBarPadding = staticCompositionLocalOf { 0.dp }

@Composable
fun RootView() {
    val sheets = remember { SheetHost() }
    val ctx = LocalContext.current
    val activity = ctx as? Activity
    var tab by prefString("memory.tabID", "home")
    val tabsRaw by prefString("tabs.order", AppTab.defaultRaw)
    var onboarded by prefBool("onboarded", false)
    var onboardingAgain by prefBool("onboarding.again", false)
    var appearanceOpen by prefBool("ui.appearanceOpen", false)
    val privacyShield by prefBool("privacy.shield", true)
    var showSplash by remember { mutableStateOf(true) }
    var registering by remember { mutableStateOf(false) }
    var active by remember { mutableStateOf(true) }
    var lastActiveRefresh by remember { mutableStateOf(Instant.now()) }
    val showBoards = remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val tabs = AppTab.parse(tabsRaw)
    val navs = remember { HashMap<AppTab, Nav>() }
    val holder = rememberSaveableStateHolder()

    // шторка приватности: на Android 13+ система сама прячет снимок в списке приложений
    LaunchedEffect(privacyShield) {
        if (Build.VERSION.SDK_INT >= 33) activity?.setRecentsScreenshotEnabled(!privacyShield)
    }

    // жизненный цикл: блокировка, обновление при возвращении
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> {
                    active = true
                    NotifyHooks.foreground = true
                    AppLock.authenticate(auto = true)
                    Celebrations.checkOnOpen(ScheduleStore.data)
                    if (Instant.now().epochSecond - lastActiveRefresh.epochSecond > 120) {
                        lastActiveRefresh = Instant.now()
                        ScheduleStore.reloadFromDisk()
                        AppScope.launch {
                            ScheduleStore.sync()
                            ScheduleStore.refreshSideEffects()
                            SakaiSync.autoImport()
                        }
                    }
                }
                Lifecycle.Event.ON_PAUSE -> { active = false; NotifyHooks.foreground = false }
                Lifecycle.Event.ON_STOP -> {
                    BackgroundRefresh.schedule(App.ctx)
                    AppLock.lock()
                    Defaults.flush()
                }
                else -> {}
            }
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }

    // первый запуск: регистрация, заставка, блокировка
    LaunchedEffect(Unit) {
        if (!onboarded && !ScheduleStore.isConfigured) registering = true
        if (tabs.none { it.raw == tab }) tab = tabs.firstOrNull()?.raw ?: "home"
        AppLock.lock()
        NotifyHooks.onForegroundFxEnd = { AppScope.launch { Celebrations.checkOnOpen(ScheduleStore.data) } }
        launch { delay(400); AppLock.authenticate(auto = true) }
        delay(900)
        showSplash = false
    }

    // сначала даём нарисоваться первому экрану — остальное потом
    LaunchedEffect(Unit) {
        delay(350)
        ru.student.safuhub.widget.Widgets.updateAll(App.ctx)
        ru.student.safuhub.feature.board.LessonPhotosPDF.cleanTemp()
        Permissions.requestNotifications()
        Celebrations.checkOnOpen(ScheduleStore.data)
        ScheduleStore.sync()
        ScheduleStore.refreshSideEffects()
        Celebrations.scheduleNotifications(ScheduleStore.data)
        SakaiSync.autoImport()
        delay(4000)
        GradeSync.autoRun(ScheduleQuery.subjects(ScheduleStore.data))
    }

    // салют в конце последней пары
    val finish = Celebrations.nextFinish(ScheduleStore.data)
    LaunchedEffect(finish, active) {
        if (!active || finish == null) return@LaunchedEffect
        val wait = finish.toEpochMilli() - System.currentTimeMillis() + 1000
        if (wait > 0) delay(wait)
        Celebrations.checkOnOpen(ScheduleStore.data)
    }

    // почта: пока приложение открыто — проверяем каждую минуту
    LaunchedEffect(active) {
        if (!active) return@LaunchedEffect
        while (isActive) {
            MailWatch.checkIfEnabled()
            delay(60_000)
        }
    }

    // ссылки safu://
    val link = DeepLinks.pending.value
    LaunchedEffect(link) {
        val url = link ?: return@LaunchedEffect
        DeepLinks.pending.value = null
        val uri = android.net.Uri.parse(url)
        val target = (uri.host ?: uri.schemeSpecificPart?.replace("/", "") ?: "").lowercase()
        when {
            target == "board" -> {
                if (LessonPhotos.currentSlot(ScheduleStore.data) != null) BoardRouter.camera = true else showBoards.value = true
            }
            target == "boards" -> showBoards.value = true
            else -> {
                val dest = when {
                    target.startsWith("schedule") -> AppTab.SCHEDULE
                    target.startsWith("tasks") -> AppTab.TASKS
                    target.startsWith("files") -> AppTab.FILES
                    target.startsWith("home") -> AppTab.HOME
                    else -> null
                }
                if (dest != null) {
                    tab = if (tabs.contains(dest)) dest.raw else (tabs.firstOrNull()?.raw ?: "home")
                    Haptics.tap()
                }
            }
        }
    }

    // нажали на уведомление
    val info = DeepLinks.notification.value
    LaunchedEffect(info) {
        val map = info ?: return@LaunchedEffect
        DeepLinks.notification.value = null
        if (map.containsKey(MailRouter.key)) {
            tab = AppTab.HOME.raw
            MailRouter.pending = true
        }
        val subject = map[BoardRouter.subjectKey]
        if (subject != null) {
            val start = map[BoardRouter.startKey]?.toDoubleOrNull()?.let { Instant.ofEpochMilli((it * 1000).toLong()) }
            BoardRouter.target = BoardRouter.Target(subject, start)
        }
    }

    val camera = rememberCamera { file ->
        BoardRouter.camera = false
        val slot = LessonPhotos.currentSlot(ScheduleStore.data)
        if (file != null && slot != null && BoardPhoto.save(file, slot.lesson.subject) != null) Haptics.success()
        file?.delete()
    }
    LaunchedEffect(BoardRouter.camera) {
        if (BoardRouter.camera) {
            camera.open()
            BoardRouter.camera = false
        }
    }

    CompositionLocalProvider(LocalSheets provides sheets) {
        val appearance = remember { mutableStateOf(false) }
        LaunchedEffect(appearanceOpen) { appearance.value = appearanceOpen }
        LaunchedEffect(appearance.value) { if (!appearance.value && appearanceOpen) appearanceOpen = false }
        SheetBinding(appearance) { AppearanceSheet() }

        val boardTarget = remember { mutableStateOf<BoardRouter.Target?>(null) }
        LaunchedEffect(BoardRouter.target) { boardTarget.value = BoardRouter.target }
        LaunchedEffect(boardTarget.value) { if (boardTarget.value == null) BoardRouter.target = null }
        SheetItem(boardTarget) { t -> DoneSheet { BoardBatchScreen(LessonPhotos.batchFor(t, ScheduleStore.data)) } }
        SheetBinding(showBoards) { DoneSheet { BoardBatchesListScreen(null) } }
        SheetItem(ru.student.safuhub.feature.web.WebLauncher.opened, full = true) { r -> ru.student.safuhub.feature.web.WebScreen(r) }
        val registration = remember { mutableStateOf(false) }
        val regWanted = !showSplash && (registering || onboardingAgain)
        LaunchedEffect(regWanted) { registration.value = regWanted }
        LaunchedEffect(registration.value) {
            if (!registration.value && regWanted) { registering = false; onboardingAgain = false }
        }
        SheetBinding(registration, full = true) {
            RegistrationScreen(canClose = onboardingAgain && !registering) {
                onboarded = true
                registering = false
                onboardingAgain = false
            }
        }

        Box(Modifier.fillMaxSize().background(Ios.background)) {
            key(ThemePack.current, Brand.theme) {
                TabsHost(tabs, tab, navs, holder) { t ->
                    if (t.raw == tab) {
                        // повторное нажатие на вкладку — к началу
                        navs[t]?.popToRoot()
                    } else {
                        Haptics.tap()
                        tab = t.raw
                    }
                }
            }
            SheetsLayer(sheets)
            ru.student.safuhub.feature.nuke.NukeLayer()
            CelebrationOverlay()
            AnimatedVisibility(showSplash, enter = fadeIn(tween(0)), exit = fadeOut(tween(500))) { SplashView() }
            if (privacyShield && !active && !showSplash && Build.VERSION.SDK_INT < 33) PrivacyShield()
            AppLockLayer()
            Dialogs.Layer()
        }
    }
}

/** Вкладки внизу как TabView: больше пяти — появляется «Ещё» */
@Composable
private fun TabsHost(tabs: List<AppTab>, selectedRaw: String, navs: HashMap<AppTab, Nav>,
                     holder: androidx.compose.runtime.saveable.SaveableStateHolder, onSelect: (AppTab) -> Unit) {
    val overflow = tabs.size > 5
    val barTabs = if (overflow) tabs.take(4) else tabs
    val moreTabs = if (overflow) tabs.drop(4) else emptyList()
    var moreOpen by remember { mutableStateOf(false) }
    val selected = tabs.firstOrNull { it.raw == selectedRaw } ?: tabs.first()
    val showingMore = overflow && (moreOpen || selected in moreTabs)
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
            CompositionLocalProvider(LocalTabBarPadding provides 0.dp) {
                if (showingMore && moreOpen && selected !in moreTabs) {
                    holder.SaveableStateProvider("more") {
                        MoreList(moreTabs) { t -> moreOpen = false; onSelect(t) }
                    }
                } else {
                    val t = selected
                    holder.SaveableStateProvider(t.raw) {
                        val nav = navs.getOrPut(t) { Nav() }
                        NavigationStack(nav) { TabContent(t) }
                    }
                }
            }
        }
        TabBar(barTabs, if (showingMore) null else selected, overflow, showingMore,
            onSelect = { moreOpen = false; onSelect(it) },
            onMore = {
                Haptics.tap()
                if (selected in moreTabs) { navs[selected]?.popToRoot(); moreOpen = true } else moreOpen = true
            })
    }
}

@Composable
private fun TabContent(t: AppTab) {
    when (t) {
        AppTab.HOME -> HomeScreen()
        AppTab.SCHEDULE -> ScheduleScreen()
        AppTab.TASKS -> TasksScreen()
        AppTab.FILES -> FilesTab()
        AppTab.SUBJECTS -> SubjectsScreen()
        AppTab.ATTENDANCE -> AttendanceScreen()
        AppTab.DEVELOPER -> DeveloperScreen()
        AppTab.PROFILE -> ProfileScreen()
    }
}

/** Экран «Ещё» со скрытыми вкладками */
@Composable
private fun MoreList(tabs: List<AppTab>, onSelect: (AppTab) -> Unit) {
    FormScreen("Ещё", large = true) {
        FormSection {
            for (t in tabs) link(t.title, t.icon) { onSelect(t) }
        }
    }
}

@Composable
private fun TabBar(tabs: List<AppTab>, selected: AppTab?, overflow: Boolean, moreSelected: Boolean,
                   onSelect: (AppTab) -> Unit, onMore: () -> Unit) {
    val pack = ThemePack.current
    val chrome = packChrome(pack)
    val dark = LocalDark.current
    val bg = chrome?.tabBar ?: (if (dark) Color(0xF0161618) else Color(0xF0F9F9F9))
    val normal = chrome?.tabNormal ?: Ios.gray
    val sel = chrome?.tabSelected ?: Brand.color
    Column(Modifier.fillMaxWidth().background(bg)) {
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(if (dark) Color(0x33FFFFFF) else Color(0x33000000)))
        Row(Modifier.fillMaxWidth().height(50.dp)) {
            for (t in tabs) {
                TabItem(t.title, t.icon, t == selected, normal, sel, Modifier.weight(1f)) { onSelect(t) }
            }
            if (overflow) TabItem("Ещё", "ellipsis", moreSelected, normal, sel, Modifier.weight(1f)) { onMore() }
        }
        Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
    }
}

@Composable
private fun TabItem(title: String, icon: String, selected: Boolean, normal: Color, sel: Color, modifier: Modifier, onClick: () -> Unit) {
    val scale by animateFloatAsState(if (selected) 1f else 0.94f, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMedium), label = "tab")
    Column(
        modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { onClick() }.padding(top = 5.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        SfIcon(icon, size = 25.dp, tint = if (selected) sel else normal, modifier = Modifier.graphicsLayer { scaleX = scale; scaleY = scale })
        Text(title, style = ft(10f, FontWeight.Medium), color = if (selected) sel else normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Шторка поверх приложения, когда оно не на экране */
@Composable
fun PrivacyShield() {
    Box(Modifier.fillMaxSize().background(if (LocalDark.current) Color(0xF2202022) else Color(0xF2F4F4F6))
        .clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SfIcon("snowflake", size = 52.dp, tint = Color.White, modifier = Modifier.gradientTint(Brand.gradient))
            Text("САФУ", style = ft(Ts.title3, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label)
        }
    }
}

@Composable
fun SplashView() {
    var pop by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { pop = true }
    val k by animateFloatAsState(if (pop) 1f else 0f, spring(dampingRatio = 0.6f, stiffness = 60f), label = "pop")
    Box(Modifier.fillMaxSize().background(Ios.background).clickable(remember { MutableInteractionSource() }, null) {},
        contentAlignment = Alignment.Center) {
        AmbientBackground()
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
            SfIcon("snowflake", size = 72.dp, tint = Color.White, modifier = Modifier.graphicsLayer {
                val s = 0.4f + 0.6f * k
                scaleX = s; scaleY = s; rotationZ = -120f * (1f - k)
            }.gradientTint(Brand.gradient))
            Text("САФУ", style = ft(36f, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label,
                modifier = Modifier.graphicsLayer { alpha = k.coerceIn(0f, 1f) }.offset(y = (12 * (1 - k)).dp))
            Text("всё для учёбы в одном месте", style = ft(Ts.subheadline), color = Ios.secondaryLabel,
                modifier = Modifier.graphicsLayer { alpha = k.coerceIn(0f, 1f) })
            Text("by @${Developer.telegram}", style = ft(Ts.caption2, FontWeight.Bold), color = Brand.color,
                modifier = Modifier.graphicsLayer { alpha = (k * 0.9f).coerceIn(0f, 1f) })
            Text("версия ${App.version}", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel,
                modifier = Modifier.graphicsLayer { alpha = k.coerceIn(0f, 1f) })
        }
    }
}
