package ru.student.safuhub.feature.web

import android.content.Context
import android.content.MutableContextWrapper
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.newId
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.Resource
import ru.student.safuhub.data.ResourceStore
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.iosShadow
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// Сайты как мини-приложения в Telegram (как SiteTabs.swift на iPhone): развёрнутая карточка, плашка свёрнутых
// и список «Открыто: N». Свернул — страница остаётся загруженной: вернулся на то же место, вход не слетел.
// Вкладки переживают перезапуск: при запуске они свёрнуты, а страница грузится, только когда её развернут.

class SiteTab(val id: String, val resource: Resource) {
    /** Страница создаётся при первом разворачивании (после перезапуска вкладки «спят») */
    var model: WebModel? by mutableStateOf(null)
    var lastUsed: Long = System.currentTimeMillis()
    val title: String get() = model?.title?.takeIf { it.isNotBlank() } ?: resource.title
}

object SiteTabs {
    private const val savedKey = "sites.saved.v1"
    /** Сайтов держим не больше 4: каждый — отдельная страница в памяти; самые давние закрываются */
    private const val LIMIT = 4

    val tabs = mutableStateListOf<SiteTab>()
    var activeId by mutableStateOf<String?>(null)
        private set
    var stackOpen by mutableStateOf(false)
    private var restored = false
    private var host: MutableContextWrapper? = null

    val active: SiteTab? get() = tabs.firstOrNull { it.id == activeId }

    /** Контекст для страниц: активити (нужен для выпадающих списков на сайтах), переживает пересоздание экрана */
    fun attach(ctx: Context) {
        val h = host
        if (h == null) host = MutableContextWrapper(ctx) else if (h.baseContext !== ctx) h.baseContext = ctx
    }

    fun restore() {
        if (restored) return
        restored = true
        val list = runCatching { AppJson.decodeFromString(ListSerializer(Resource.serializer()), Defaults.string(savedKey) ?: "[]") }.getOrDefault(emptyList())
        for (r in list.take(LIMIT)) tabs += SiteTab(newId(), r)
    }

    private fun save() = Defaults.set(savedKey, AppJson.encodeToString(ListSerializer(Resource.serializer()), tabs.map { it.resource }))

    private fun ensureModel(t: SiteTab) {
        if (t.model != null) return
        val ctx = host ?: return
        val m = WebModel(ctx)
        m.homeURL = t.resource.url
        m.resource = t.resource
        t.model = m
        val start = ResourceStore.lastURL(t.resource) ?: t.resource.url
        AppScope.launch {
            withContext(Dispatchers.IO) { SessionKeeper.restore() }
            m.load(start)
        }
    }

    fun open(r: Resource) {
        restore()
        Haptics.tap()
        stackOpen = false
        val existing = tabs.firstOrNull { it.resource.id == r.id || it.resource.url == r.url }
        val t = existing ?: SiteTab(newId(), r).also { tabs += it }
        // больше 4 сайтов — самый давний закрывается
        while (tabs.size > LIMIT) tabs.filter { it.id != t.id }.minByOrNull { it.lastUsed }?.let { close(it.id) } ?: break
        t.lastUsed = System.currentTimeMillis()
        ensureModel(t)
        activeId = t.id
        save()
    }

    fun expand(id: String) {
        val t = tabs.firstOrNull { it.id == id } ?: return
        Haptics.tap()
        stackOpen = false
        t.lastUsed = System.currentTimeMillis()
        ensureModel(t)
        activeId = id
    }

    fun minimize() {
        active?.model?.let { m -> m.webView.url?.let { u -> m.resource?.let { r -> ResourceStore.saveLastURL(u, r) } } }
        SessionKeeper.save()
        activeId = null
    }

    fun close(id: String) {
        val t = tabs.firstOrNull { it.id == id } ?: return
        t.model?.let { m ->
            m.webView.url?.let { u -> ResourceStore.saveLastURL(u, t.resource) }
            SessionKeeper.save()
            // страница выгружается, когда карточка уже уехала
            AppScope.launch { kotlinx.coroutines.delay(400); m.destroy() }
        }
        tabs.remove(t)
        if (activeId == id) activeId = null
        if (tabs.isEmpty()) stackOpen = false
        save()
    }

    fun closeAll() { tabs.map { it.id }.forEach(::close) }
}

/** Слой сайтов поверх приложения: развёрнутый сайт, плашка свёрнутых и список вкладок */
@Composable
fun SiteTabsLayer(bottomPadding: androidx.compose.ui.unit.Dp) {
    val ctx = LocalContext.current
    LaunchedEffect(ctx) { SiteTabs.attach(ctx); SiteTabs.restore() }
    val active = SiteTabs.active
    val minimized = active == null && SiteTabs.tabs.isNotEmpty()

    Box(Modifier.fillMaxSize()) {
        // плашка свёрнутых: над нижней панелью
        AnimatedVisibility(minimized && !SiteTabs.stackOpen, Modifier.align(Alignment.BottomCenter).padding(bottom = bottomPadding + 10.dp),
            enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
            Pill()
        }
        // список вкладок
        AnimatedVisibility(SiteTabs.stackOpen, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
            Stack()
        }
        // развёрнутый сайт: вырастает снизу, сворачивается обратно в плашку
        for (t in SiteTabs.tabs) {
            val m = t.model ?: continue
            AnimatedVisibility(SiteTabs.activeId == t.id,
                enter = slideInVertically(tween(320)) { it / 3 } + scaleIn(tween(320), initialScale = 0.92f) + fadeIn(tween(200)),
                exit = slideOutVertically(tween(260)) { it / 2 } + scaleOut(tween(260), targetScale = 0.9f) + fadeOut(tween(220))) {
                WebScreen(t, m)
            }
        }
    }
    BackHandler(enabled = SiteTabs.stackOpen) { SiteTabs.stackOpen = false }
}

@Composable
private fun Pill() {
    val tabs = SiteTabs.tabs
    val last = tabs.maxByOrNull { it.lastUsed } ?: return
    Row(Modifier.widthIn(max = 360.dp).iosShadow(Color.Black.copy(alpha = 0.22f), 14.dp, y = 6.dp, shape = CircleShape)
        .clip(CircleShape).background(if (ru.student.safuhub.ui.theme.LocalDark.current) Color(0xF2222226) else Color(0xF7FFFFFF))
        .clickable { SiteTabs.expand(last.id) }.padding(start = 8.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row {
            tabs.takeLast(3).forEachIndexed { i, t ->
                Box(Modifier.offset(x = (-9 * i).dp).size(30.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                    SfIcon(t.resource.icon, size = 14.dp, tint = Color.White)
                }
            }
        }
        Column(Modifier.weight(1f, fill = false)) {
            Text(last.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (tabs.size > 1) Text("ещё ${tabs.size - 1}", style = ft(Ts.caption2), color = Ios.secondaryLabel)
        }
        if (tabs.size > 1) PillButton("square.on.square") { Haptics.tap(); SiteTabs.stackOpen = true }
        PillButton("xmark") { SiteTabs.close(last.id) }
    }
}

@Composable
private fun PillButton(icon: String, onClick: () -> Unit) {
    Box(Modifier.size(34.dp).clip(CircleShape).clickable { onClick() }, contentAlignment = Alignment.Center) {
        SfIcon(icon, size = 16.dp, tint = Ios.secondaryLabel)
    }
}

@Composable
private fun Stack() {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f))
        .clickable(remember { MutableInteractionSource() }, null) { SiteTabs.stackOpen = false }, contentAlignment = Alignment.Center) {
        Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Открыто: ${SiteTabs.tabs.size}", style = ft(Ts.title3, FontWeight.Bold), color = Color.White, modifier = Modifier.weight(1f))
                Text("Закрыть все", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Color.White,
                    modifier = Modifier.clip(CircleShape).clickable { SiteTabs.closeAll() }.padding(horizontal = 10.dp, vertical = 6.dp))
            }
            for (t in SiteTabs.tabs.sortedByDescending { it.lastUsed }) {
                Pressable({ SiteTabs.expand(t.id) }, Modifier.fillMaxWidth()) {
                    Glass(20.dp, Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.size(40.dp).clip(RoundedCornerShape(11.dp)).background(Brand.gradient), contentAlignment = Alignment.Center) {
                                SfIcon(t.resource.icon, size = 18.dp, tint = Color.White)
                            }
                            Column(Modifier.weight(1f)) {
                                Text(t.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(t.model?.url?.let { ru.student.safuhub.data.hostOf(it) } ?: t.resource.subtitle, style = ft(Ts.caption),
                                    color = Ios.secondaryLabel, maxLines = 1)
                            }
                            PillButton("xmark") { SiteTabs.close(t.id) }
                        }
                    }
                }
            }
            Text("Нажми на сайт, чтобы открыть его там же, где остановился", style = ft(Ts.caption), color = Color.White.copy(alpha = 0.7f),
                modifier = Modifier.align(Alignment.CenterHorizontally))
        }
    }
}
