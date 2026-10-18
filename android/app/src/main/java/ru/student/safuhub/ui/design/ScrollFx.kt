package ru.student.safuhub.ui.design

import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.zIndex
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.ui.theme.ScrollFXStyle
import kotlin.math.abs

/** Видимая область прокрутки — для эффекта «объёма» у краёв экрана */
@Stable
class Viewport {
    var top by mutableFloatStateOf(0f)
    var bottom by mutableFloatStateOf(Float.MAX_VALUE)
}

val LocalViewport = staticCompositionLocalOf<Viewport?> { null }

@Composable
fun rememberViewport() = remember { Viewport() }

/** Повесить на контейнер прокрутки */
fun Modifier.viewport(v: Viewport): Modifier = onGloballyPositioned { c ->
    val p = c.positionInWindow()
    v.top = p.y
    v.bottom = p.y + c.size.height
}

/**
 * Прокрутка «в объёме»: карточки у краёв экрана наклоняются, чуть уменьшаются и тают,
 * а к центру встают на место (как scrollTransition в iOS).
 */
fun Modifier.scrollFX(list: Boolean = false): Modifier = composed {
    val vp = LocalViewport.current ?: return@composed this
    val chosen = ScrollFXStyle.of(Defaults.int("ui.scrollFX"))
    val style = if (chosen == ScrollFXStyle.DEPTH && list) ScrollFXStyle.SOFT else chosen
    if (!Prefs.animations || style == ScrollFXStyle.OFF) return@composed this
    val phase = remember { mutableFloatStateOf(0f) }
    this
        .onGloballyPositioned { c ->
            val y = c.positionInWindow().y
            val h = c.size.height.toFloat().coerceAtLeast(1f)
            val b = y + h
            phase.floatValue = when {
                y < vp.top -> -((vp.top - y) / h).coerceIn(0f, 1f)
                b > vp.bottom -> ((b - vp.bottom) / h).coerceIn(0f, 1f)
                else -> 0f
            }
        }
        .graphicsLayer {
            val x = phase.floatValue
            val k = abs(x)
            if (style == ScrollFXStyle.SOFT) {
                alpha = 1f - k * 0.45f
                val s = 1f - k * 0.04f
                scaleX = s; scaleY = s
            } else {
                rotationX = -x * 22f
                transformOrigin = TransformOrigin(0.5f, if (x > 0) 0f else 1f)
                cameraDistance = 6f * density
                val s = 1f - k * 0.1f
                scaleX = s; scaleY = s
                translationY = x * 18f * density
                alpha = 1f - k * 0.55f
            }
        }
}

// MARK: - Перетаскивание блоков (удержать и тащить)

@Stable
class DragReorder<K : Any> {
    internal val bounds = mutableStateMapOf<K, Rect>()
    var dragging by mutableStateOf<K?>(null)
        internal set
    var offset by mutableStateOf(Offset.Zero)
        internal set
    var target by mutableStateOf<K?>(null)
        internal set
}

@Composable
fun <K : Any> rememberDragReorder() = remember { DragReorder<K>() }

/** Удержал блок — тащи вверх или вниз; отпустил над другим блоком — меняются местами */
fun <K : Any> Modifier.dragReorder(state: DragReorder<K>, key: K, enabled: Boolean = true, onMove: (K, K) -> Unit): Modifier = composed {
    val base = this
        .onGloballyPositioned { c ->
            val p = c.positionInWindow()
            state.bounds[key] = Rect(p.x, p.y, p.x + c.size.width, p.y + c.size.height)
        }
    if (!enabled) return@composed base
    val isDragged = state.dragging == key
    base
        .zIndex(if (isDragged) 10f else 0f)
        .graphicsLayer {
            if (isDragged) {
                translationY = state.offset.y
                translationX = state.offset.x * 0.15f
                scaleX = 1.03f; scaleY = 1.03f
                alpha = 0.92f
            }
        }
        .pointerInput(key) {
            detectDragGesturesAfterLongPress(
                onDragStart = {
                    Haptics.tap()
                    state.dragging = key
                    state.offset = Offset.Zero
                    state.target = null
                },
                onDrag = { change, amount ->
                    change.consume()
                    state.offset += amount
                    val me = state.bounds[key] ?: return@detectDragGesturesAfterLongPress
                    val centerY = me.center.y + state.offset.y
                    val over = state.bounds.entries.firstOrNull { (k, r) -> k != key && centerY in r.top..r.bottom }?.key
                    if (over != state.target) {
                        state.target = over
                        if (over != null) Haptics.tap()
                    }
                },
                onDragEnd = {
                    val t = state.target
                    state.dragging = null
                    state.offset = Offset.Zero
                    state.target = null
                    if (t != null) onMove(key, t)
                },
                onDragCancel = {
                    state.dragging = null
                    state.offset = Offset.Zero
                    state.target = null
                },
            )
        }
}
