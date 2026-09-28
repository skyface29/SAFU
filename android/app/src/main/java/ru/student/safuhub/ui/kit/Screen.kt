package ru.student.safuhub.ui.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.ui.design.viewport
import ru.student.safuhub.ui.theme.AppFonts
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.ThemePack
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb

/** Экран вложен в стек (есть кнопка «Назад») */
val LocalPushed = compositionLocalOf { false }

/** Кнопка «Готово» справа на корневом экране листа (как ToolbarItem(.confirmationAction)) */
val LocalDoneAction = compositionLocalOf<Pair<String, () -> Unit>?> { null }

/** Лист со своим стеком и кнопкой «Готово» */
@Composable
fun DoneSheet(title: String = "Готово", content: @Composable () -> Unit) {
    NavigationStack {
        val dismiss = LocalDismiss.current
        CompositionLocalProvider(LocalDoneAction provides (title to dismiss)) { content() }
    }
}

/** Верхняя панель как в iOS: заголовок по центру, кнопки слева и справа */
@Composable
fun NavBar(
    title: String,
    leading: (@Composable RowScope.() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    titleAlpha: Float = 1f,
    background: Color? = null,
    showBack: Boolean = LocalNav.current?.canPop == true && LocalPushed.current,
) {
    val inSheet = LocalInSheet.current
    val pack = ThemePack.current
    val chrome = packChrome(pack)
    val bg = chrome?.bar ?: background
    Column(Modifier.fillMaxWidth().let { if (bg != null) it.background(bg) else it }) {
        if (!inSheet) Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Box(Modifier.fillMaxWidth().height(if (inSheet) 52.dp else 44.dp)) {
            Row(Modifier.align(Alignment.CenterStart).padding(start = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (showBack) BackButton()
                leading?.invoke(this)
            }
            Text(
                title,
                modifier = Modifier.align(Alignment.Center).widthIn(max = 230.dp).graphicsLayer { alpha = titleAlpha },
                style = ft(Ts.headline, FontWeight.SemiBold).let { s -> AppFonts.titleFamily(pack)?.let { s.copy(fontFamily = it) } ?: s },
                color = chrome?.title ?: Ios.label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
            Row(Modifier.align(Alignment.CenterEnd).padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                trailing?.invoke(this)
                val done = LocalDoneAction.current
                if (done != null && !LocalPushed.current) BarButton(done.first, bold = true) { done.second() }
            }
        }
    }
}

/** Оформление панелей для тем iOS 6 и Machinarium */
data class PackChrome(val bar: Color, val title: Color, val tabBar: Color, val tabNormal: Color, val tabSelected: Color)

fun packChrome(pack: ThemePack): PackChrome? = when (pack) {
    ThemePack.IOS6 -> PackChrome(rgb(0.53, 0.62, 0.74), Color.White, rgb(0.07, 0.07, 0.07), rgb(0.55, 0.55, 0.55), rgb(0.45, 0.72, 1.0))
    ThemePack.MACHINARIUM -> PackChrome(rgb(0.53, 0.53, 0.42), rgb(0.13, 0.12, 0.08), rgb(0.19, 0.19, 0.145), rgb(0.60, 0.60, 0.48), rgb(0.86, 0.58, 0.28))
    else -> null
}

@Composable
fun BackButton() {
    val dismiss = LocalDismiss.current
    TextButton(onClick = dismiss) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SfIcon("chevron.backward", size = 26.dp, tint = barTint())
            Text("Назад", style = ft(Ts.body), color = barTint())
        }
    }
}

/** Цвет кнопок на верхней панели */
@Composable
fun barTint(): Color = when (ThemePack.current) {
    ThemePack.IOS6 -> Color.White
    ThemePack.MACHINARIUM -> rgb(0.13, 0.12, 0.08)
    else -> Brand.color
}

/** Кнопка «Готово» (жирная) или обычная текстовая на панели */
@Composable
fun BarButton(text: String, bold: Boolean = false, enabled: Boolean = true, color: Color? = null, onClick: () -> Unit) {
    TextButton(onClick = onClick, enabled = enabled) {
        Text(text, style = ft(Ts.body, if (bold) FontWeight.SemiBold else FontWeight.Normal),
            color = if (enabled) (color ?: barTint()) else Ios.tertiaryLabel)
    }
}

@Composable
fun BarIcon(icon: String, enabled: Boolean = true, onClick: () -> Unit) {
    TextButton(onClick = onClick, enabled = enabled) {
        SfIcon(icon, size = 22.dp, tint = if (enabled) barTint() else Ios.tertiaryLabel)
    }
}

/**
 * Экран с панелью сверху. large — большой заголовок, который прячется в панель при прокрутке.
 * scroll = false — содержимое само управляет прокруткой (списки).
 */
@Composable
fun Screen(
    title: String,
    large: Boolean = false,
    leading: (@Composable RowScope.() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    background: (@Composable () -> Unit)? = { Box(Modifier.fillMaxSize().background(Ios.groupedBackground)) },
    scroll: Boolean = true,
    scrollState: ScrollState = rememberScrollState(),
    contentPadding: PaddingValues = PaddingValues(0.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        background?.invoke()
        Column(Modifier.fillMaxSize()) {
            val titleAlpha by animateFloatAsState(if (!large || scrollState.value > 60) 1f else 0f, label = "title")
            NavBar(title, leading, trailing, titleAlpha = if (scroll) titleAlpha else 1f)
            val body = Modifier.fillMaxWidth().weight(1f).imePadding()
            if (scroll) {
                val vp = ru.student.safuhub.ui.design.rememberViewport()
                CompositionLocalProvider(ru.student.safuhub.ui.design.LocalViewport provides vp) {
                    Column(body.then(Modifier.viewport(vp)).verticalScroll(scrollState).padding(contentPadding)) {
                        if (large) LargeTitle(title)
                        content()
                        Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
                        Spacer(Modifier.height(24.dp))
                    }
                }
            } else {
                Column(body.padding(contentPadding)) { content() }
            }
        }
    }
}

/**
 * Страница без панели сверху (главная, расписание): живой фон, прокрутка, отступы.
 */
@Composable
fun ScrollPage(
    scrollState: ScrollState = rememberScrollState(),
    horizontal: Dp = 20.dp,
    spacing: Dp = 24.dp,
    top: Dp = 12.dp,
    background: (@Composable () -> Unit)? = { ru.student.safuhub.ui.design.AmbientBackground() },
    onRefresh: (suspend () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        background?.invoke()
        val vp = ru.student.safuhub.ui.design.rememberViewport()
        val body = @Composable {
            CompositionLocalProvider(ru.student.safuhub.ui.design.LocalViewport provides vp) {
                Column(
                    Modifier.fillMaxSize().then(Modifier.viewport(vp)).verticalScroll(scrollState)
                        .padding(horizontal = horizontal),
                    verticalArrangement = Arrangement.spacedBy(spacing),
                ) {
                    TopInset()
                    Spacer(Modifier.height((top.value - spacing.value).coerceAtLeast(0f).dp))
                    content()
                    Spacer(Modifier.height(16.dp))
                }
            }
        }
        if (onRefresh != null) {
            var refreshing by remember { mutableStateOf(false) }
            val scope = rememberCoroutineScope()
            androidx.compose.material3.pulltorefresh.PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { scope.launch { refreshing = true; try { onRefresh() } finally { refreshing = false } } },
                modifier = Modifier.fillMaxSize(),
            ) { body() }
        } else body()
    }
}

@Composable
fun LargeTitle(title: String) {
    val pack = ThemePack.current
    Text(
        title,
        style = ft(Ts.largeTitle, FontWeight.Bold).let { s -> AppFonts.titleFamily(pack)?.let { s.copy(fontFamily = it) } ?: s },
        color = Ios.label,
        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 2.dp, bottom = 8.dp),
        maxLines = 2,
    )
}

/** Пустое место снизу под системную панель жестов */
@Composable
fun BottomInset(extra: Dp = 0.dp) {
    Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
    if (extra > 0.dp) Spacer(Modifier.height(extra))
}

@Composable
fun TopInset() = Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))

/** Пометить содержимое как вложенный экран (для кнопки «Назад») */
@Composable
fun Pushed(content: @Composable () -> Unit) = CompositionLocalProvider(LocalPushed provides true) { content() }

@Composable
fun isDark() = LocalDark.current
