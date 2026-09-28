package ru.student.safuhub.ui.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import kotlin.math.roundToInt

/**
 * Смахнуть влево — «Удалить» (как .onDelete / swipeActions в списке iOS).
 * Короткий свайп открывает кнопку, длинный — сразу удаляет.
 */
@Composable
fun SwipeToDelete(
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    title: String = "Удалить",
    background: Color? = null,
    content: @Composable () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val offset = remember { Animatable(0f) }
    val buttonW = with(LocalDensity.current) { 88.dp.toPx() }
    var width by remember { mutableFloatStateOf(1f) }
    val delete by rememberUpdatedState(onDelete)
    val bg = background ?: if (LocalDark.current) Ios.secondaryGrouped else Color.White

    fun remove() = scope.launch {
        Haptics.tap()
        offset.animateTo(-width)
        delete()
        offset.snapTo(0f)
    }

    Box(modifier.fillMaxWidth().onSizeChanged { width = it.width.toFloat().coerceAtLeast(1f) }.clipToBounds()) {
        if (offset.value < 0f) {
            Row(Modifier.matchParentSize().background(Ios.red), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.End,
                verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.fillMaxHeight().width(with(LocalDensity.current) { (-offset.value).coerceAtLeast(buttonW).toDp() })
                    .clickable { remove() }, contentAlignment = Alignment.Center) {
                    Text(title, style = ft(Ts.body), color = Color.White, maxLines = 1, modifier = Modifier.padding(horizontal = 12.dp))
                }
            }
        }
        Box(
            Modifier.fillMaxWidth()
                .offset { IntOffset(offset.value.roundToInt(), 0) }
                .background(bg)
                .draggable(
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { d -> scope.launch { offset.snapTo((offset.value + d).coerceIn(-width, 0f)) } },
                    onDragStopped = {
                        when {
                            offset.value < -width * 0.6f -> remove()
                            offset.value < -buttonW / 2 -> offset.animateTo(-buttonW)
                            else -> offset.animateTo(0f)
                        }
                    },
                )
                .let { m -> if (offset.value < 0f) m.clickable { scope.launch { offset.animateTo(0f) } } else m },
        ) { content() }
    }
}

/** Строка формы, которую можно смахнуть для удаления */
fun SectionScope.swipeRow(onDelete: () -> Unit, inset: Dp = 16.dp, onClick: (() -> Unit)? = null, minHeight: Dp = 44.dp,
                          content: @Composable RowScope.() -> Unit) {
    raw(inset) {
        SwipeToDelete(onDelete) {
            val base = Modifier.fillMaxWidth().defaultMinSize(minHeight = minHeight)
            Row(
                (if (onClick != null) base.clickable { onClick() } else base).padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = content,
            )
        }
    }
}
