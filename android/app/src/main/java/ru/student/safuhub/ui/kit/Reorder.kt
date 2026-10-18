package ru.student.safuhub.ui.kit

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import kotlin.math.roundToInt

/**
 * Список в режиме правки (как List с editMode = .active):
 * красный «−» слева убирает строку, ≡ справа — перетащить.
 */
@Composable
fun <T : Any> EditableSection(
    items: List<T>,
    key: (T) -> Any,
    onMove: (from: Int, to: Int) -> Unit,
    onDelete: ((Int) -> Unit)?,
    header: String? = null,
    footer: String? = null,
    canDelete: (T) -> Boolean = { true },
    onClick: ((T) -> Unit)? = null,
    trailing: (@Composable RowScope.(T) -> Unit)? = null,
    extra: (@Composable () -> Unit)? = null,
    row: @Composable RowScope.(T) -> Unit,
) {
    val dark = LocalDark.current
    var dragIndex by remember { mutableIntStateOf(-1) }
    var dragDy by remember { mutableFloatStateOf(0f) }
    var rowHeight by remember { mutableFloatStateOf(1f) }
    val current by rememberUpdatedState(items)
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 22.dp)) {
        if (header != null) Text(header.uppercase(), style = ft(Ts.footnote), color = Ios.secondaryLabel,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 7.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (dark) Ios.secondaryGrouped else Color.White)
            .animateContentSize()) {
            items.forEachIndexed { i, item ->
                key(key(item)) {
                    val dragging = dragIndex == i
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 54.dp).height(0.5.dp).background(Ios.separator))
                    Row(
                        Modifier.fillMaxWidth().defaultMinSize(minHeight = 44.dp)
                            .onSizeChanged { if (it.height > 0) rowHeight = it.height.toFloat() }
                            .zIndex(if (dragging) 1f else 0f)
                            .graphicsLayer { if (dragging) { translationY = dragDy; shadowElevation = 12f } }
                            .background(if (dragging) (if (dark) Ios.tertiaryGrouped else Color.White) else Color.Transparent)
                            .let { m -> if (onClick != null) m.clickable { onClick(item) } else m }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (onDelete != null) {
                            val can = canDelete(item)
                            Box(Modifier.size(22.dp).clip(androidx.compose.foundation.shape.CircleShape)
                                .background(if (can) Ios.red else Ios.tertiaryFill)
                                .clickable(remember { MutableInteractionSource() }, null, enabled = can) { Haptics.tap(); onDelete(i) },
                                contentAlignment = Alignment.Center) {
                                Box(Modifier.size(10.dp, 2.dp).background(Color.White))
                            }
                            Spacer(Modifier.width(12.dp))
                        }
                        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) { row(item) }
                        trailing?.invoke(this, item)
                        Spacer(Modifier.width(8.dp))
                        SfIcon("line.3.horizontal", size = 20.dp, tint = Ios.tertiaryLabel,
                            modifier = Modifier.pointerInput(Unit) {
                                detectDragGestures(
                                    onDragStart = { Haptics.tap(); dragIndex = current.indexOfFirst { key(it) == key(item) }; dragDy = 0f },
                                    onDrag = { c, d -> c.consume(); dragDy += d.y },
                                    onDragEnd = {
                                        val from = dragIndex
                                        val to = (from + (dragDy / rowHeight).roundToInt()).coerceIn(0, current.size - 1)
                                        dragIndex = -1; dragDy = 0f
                                        if (from >= 0 && to != from) { Haptics.tap(); onMove(from, to) }
                                    },
                                    onDragCancel = { dragIndex = -1; dragDy = 0f },
                                )
                            }.padding(4.dp))
                    }
                }
            }
            if (extra != null) {
                if (items.isNotEmpty()) Box(Modifier.fillMaxWidth().padding(start = 16.dp).height(0.5.dp).background(Ios.separator))
                extra()
            }
        }
        if (!footer.isNullOrEmpty()) Text(footer, style = ft(Ts.footnote), color = Ios.secondaryLabel,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 7.dp))
    }
}

fun <T> List<T>.moved(from: Int, to: Int): List<T> {
    if (from !in indices || to !in indices) return this
    val m = toMutableList()
    val x = m.removeAt(from)
    m.add(to, x)
    return m
}
