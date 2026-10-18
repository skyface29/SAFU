package ru.student.safuhub.ui.kit

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import java.util.concurrent.atomic.AtomicLong

private val ids = AtomicLong(1)

/** Экран в стеке навигации */
class Route(val content: @Composable () -> Unit) {
    val id: Long = ids.getAndIncrement()
    val visible = mutableStateOf(false)
    var leaving = false
}

/** Стек экранов (NavigationStack) */
@Stable
class Nav {
    val stack: SnapshotStateList<Route> = mutableStateListOf()
    fun push(content: @Composable () -> Unit) { stack.add(Route(content)) }
    fun pop() { stack.lastOrNull { !it.leaving }?.let { close(it) } }
    fun close(r: Route) { r.leaving = true; r.visible.value = false }
    fun popToRoot() { stack.forEach { close(it) } }
    val canPop: Boolean get() = stack.any { !it.leaving }
}

val LocalNav = compositionLocalOf<Nav?> { null }

/** Закрыть текущий лист/экран (как @Environment(\.dismiss)) */
val LocalDismiss = compositionLocalOf<() -> Unit> { {} }

@Composable
fun rememberNav() = remember { Nav() }

/** NavigationStack: корень + экраны поверх, с анимацией сдвига и кнопкой «Назад» */
@Composable
fun NavigationStack(nav: Nav = rememberNav(), root: @Composable () -> Unit) {
    val holder = rememberSaveableStateHolder()
    CompositionLocalProvider(LocalNav provides nav) {
        Box(Modifier.fillMaxSize()) {
            // корень остаётся в композиции — сохраняет прокрутку и состояние
            CompositionLocalProvider(LocalPushed provides false) {
                holder.SaveableStateProvider("root") { root() }
            }
            BackHandler(enabled = nav.canPop) { nav.pop() }
            for (route in nav.stack) {
                key(route.id) {
                    LaunchedEffect(Unit) { route.visible.value = true }
                    val visible by route.visible
                    LaunchedEffect(visible) {
                        if (!visible && route.leaving) {
                            delay(300)
                            nav.stack.remove(route)
                        }
                    }
                    AnimatedVisibility(
                        visible = visible,
                        enter = slideInHorizontally(tween(320)) { it } + fadeIn(tween(160)),
                        exit = slideOutHorizontally(tween(280)) { it } + fadeOut(tween(260)),
                    ) {
                        CompositionLocalProvider(LocalDismiss provides { nav.close(route) }, LocalPushed provides true) {
                            Box(Modifier.fillMaxSize().background(Ios.background)
                                .clickable(remember { MutableInteractionSource() }, null) {}) {
                                holder.SaveableStateProvider(route.id) { route.content() }
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Листы (sheet / fullScreenCover)

class SheetEntry(val full: Boolean, val onDismiss: (() -> Unit)?, val content: @Composable () -> Unit) {
    val id: Long = ids.getAndIncrement()
    val shown = mutableStateOf(false)
    var closing = false
}

/** Хост листов поверх всего приложения */
@Stable
class SheetHost {
    val entries: SnapshotStateList<SheetEntry> = mutableStateListOf()

    fun present(full: Boolean = false, onDismiss: (() -> Unit)? = null, content: @Composable () -> Unit): SheetEntry {
        val e = SheetEntry(full, onDismiss, content)
        entries.add(e)
        return e
    }

    fun dismiss(e: SheetEntry) {
        if (e.closing) return
        e.closing = true
        e.shown.value = false
    }

    fun dismissTop() { entries.lastOrNull { !it.closing }?.let { dismiss(it) } }

    fun dismissAll() { entries.forEach { dismiss(it) } }

    internal fun remove(e: SheetEntry) {
        if (entries.remove(e)) e.onDismiss?.invoke()
    }
}

val LocalSheets = compositionLocalOf { SheetHost() }

/** Рисует все открытые листы */
@Composable
fun SheetsLayer(host: SheetHost) {
    for (e in host.entries) {
        key(e.id) { SheetFrame(host, e) }
    }
}

@Composable
private fun SheetFrame(host: SheetHost, e: SheetEntry) {
    LaunchedEffect(Unit) { e.shown.value = true }
    val shown by e.shown
    LaunchedEffect(shown) {
        if (!shown && e.closing) {
            delay(300)
            host.remove(e)
        }
    }
    val dismiss = { host.dismiss(e) }
    // до содержимого: внутренние обработчики «Назад» (стек внутри листа) главнее
    BackHandler(enabled = shown) { dismiss() }
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(shown, enter = fadeIn(tween(250)), exit = fadeOut(tween(250))) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = if (e.full) 0f else 0.35f))
                .clickable(remember { MutableInteractionSource() }, null) { if (!e.full) dismiss() })
        }
        AnimatedVisibility(
            shown,
            enter = slideInVertically(tween(340)) { it },
            exit = slideOutVertically(tween(280)) { it },
        ) {
            CompositionLocalProvider(LocalDismiss provides dismiss, LocalNav provides null) {
                if (e.full) {
                    Box(Modifier.fillMaxSize().background(Ios.background)
                        .clickable(remember { MutableInteractionSource() }, null) {}) { e.content() }
                } else {
                    val dark = LocalDark.current
                    Box(Modifier.fillMaxSize().statusBarsPadding().padding(top = 10.dp)
                        .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                        .background(if (dark) Ios.secondaryBackground else Ios.background)
                        .clickable(remember { MutableInteractionSource() }, null) {}) {
                        CompositionLocalProvider(LocalInSheet provides true) { e.content() }
                    }
                }
            }
        }
    }
}

/** Внутри листа (не на весь экран): отступ под строку состояния уже учтён */
val LocalInSheet = compositionLocalOf { false }

/** Лист, привязанный к флагу (как .sheet(isPresented:)) */
@Composable
fun SheetBinding(state: MutableState<Boolean>, full: Boolean = false, content: @Composable () -> Unit) {
    val host = LocalSheets.current
    val entry = remember { mutableStateOf<SheetEntry?>(null) }
    val on = state.value
    LaunchedEffect(on) {
        if (on && entry.value == null) {
            entry.value = host.present(full, onDismiss = { state.value = false; entry.value = null }, content = content)
        } else if (!on) {
            entry.value?.let { host.dismiss(it) }
        }
    }
}

/** Лист по значению (как .sheet(item:)) */
@Composable
fun <T : Any> SheetItem(item: MutableState<T?>, full: Boolean = false, content: @Composable (T) -> Unit) {
    val host = LocalSheets.current
    val entry = remember { mutableStateOf<SheetEntry?>(null) }
    val current = item.value
    LaunchedEffect(current) {
        if (current != null) {
            entry.value?.let { old -> old.closing = true; host.entries.remove(old) }
            val e = host.present(full, onDismiss = {
                if (item.value === current) item.value = null
                entry.value = null
            }) { content(current) }
            entry.value = e
        } else {
            entry.value?.let { host.dismiss(it) }
        }
    }
}
