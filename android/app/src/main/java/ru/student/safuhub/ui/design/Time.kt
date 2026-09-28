package ru.student.safuhub.ui.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.time.Instant

/** Текущее время, которое обновляется раз в period секунд (как TimelineView(.periodic)) */
@Composable
fun rememberNow(periodSeconds: Long = 30): Instant {
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(periodSeconds) {
        while (true) {
            val ms = System.currentTimeMillis()
            delay(periodSeconds * 1000 - ms % (periodSeconds * 1000) + 5)
            now = Instant.now()
        }
    }
    return now
}

/** Тонкая полоска прогресса (ProgressView(value:)) */
@Composable
fun ProgressBar(value: Float, color: Color, modifier: Modifier = Modifier, height: Dp = 4.dp, track: Color = color.copy(alpha = 0.18f)) {
    val v by animateFloatAsState(value.coerceIn(0f, 1f), tween(600), label = "pb")
    BoxWithConstraints(modifier.fillMaxWidth().height(height).clip(CircleShape).background(track)) {
        Box(Modifier.width(maxWidth * v).fillMaxHeight().clip(CircleShape).background(color))
    }
}

/** Кольцо прогресса */
@Composable
fun ProgressRing(progress: Float, color: Color, modifier: Modifier, lineWidth: Dp = 6.dp, brush: Brush? = null) {
    val p by animateFloatAsState(progress.coerceIn(0f, 1f), tween(800), label = "ring")
    Canvas(modifier) {
        val w = lineWidth.toPx()
        val s = Size(size.width - w, size.height - w)
        val o = Offset(w / 2, w / 2)
        drawArc(color.copy(alpha = 0.18f), 0f, 360f, false, o, s, style = Stroke(w))
        if (brush != null) drawArc(brush, -90f, 360f * p, false, o, s, style = Stroke(w, cap = StrokeCap.Round))
        else drawArc(color, -90f, 360f * p, false, o, s, style = Stroke(w, cap = StrokeCap.Round))
    }
}
