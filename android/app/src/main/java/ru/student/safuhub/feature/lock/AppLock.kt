package ru.student.safuhub.feature.lock

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.system.Biometric
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.iosShadow
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// MARK: - Вход в приложение по отпечатку / лицу / коду

object AppLock {
    const val key = "lock.app"

    var locked by mutableStateOf(false)
        private set
    var busy by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)

    val enabled: Boolean get() = Defaults.bool(key)

    fun lock() {
        if (!enabled || locked) return
        locked = true
        failed = false
    }

    fun unlock() { locked = false }

    /** Спросить биометрию; без настроенной защиты на телефоне — пускаем сразу */
    fun authenticate(auto: Boolean = false) {
        if (!locked || busy || (auto && failed)) return
        if (!Biometric.canAuthenticate) { unlock(); return }
        busy = true
        Biometric.authenticate("Вход в САФУ") { ok ->
            busy = false
            if (ok) { Haptics.success(); unlock() } else failed = true
        }
    }

    /** Включение из настроек — только после успешной проверки */
    fun confirm(done: (Boolean) -> Unit) {
        if (!Biometric.canAuthenticate) { done(false); return }
        Biometric.authenticate("Включить вход по ${Biometric.biometryName}", done = done)
    }
}

/** Экран блокировки поверх всего */
@Composable
fun AppLockLayer() {
    AnimatedVisibility(AppLock.locked, enter = fadeIn(tween(0)), exit = fadeOut(tween(350)) + scaleOut(tween(350), 1.08f)) {
        var appear by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { appear = true }
        val tr = rememberInfiniteTransition(label = "lock")
        val pulse by tr.animateFloat(0.9f, 1.15f, infiniteRepeatable(tween(2400), RepeatMode.Reverse), label = "pulse")
        val brand = Brand.color
        Box(Modifier.fillMaxSize().background(if (Ios.dark) Color(0xF01C1C1E) else Color(0xF0F2F2F7))
            .clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.Center) {
            Box(Modifier.fillMaxSize().graphicsLayer { scaleX = pulse; scaleY = pulse; alpha = 0.6f + (pulse - 0.9f) * 1.6f }
                .background(Brush.radialGradient(listOf(brand.copy(alpha = 0.35f), Color.Transparent), radius = 1100f)))
            Column(Modifier.padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(22.dp)) {
                Box(Modifier.size(104.dp).iosShadow(brand.copy(alpha = 0.5f), 24.dp, y = 8.dp, shape = CircleShape).clip(CircleShape).background(Brand.gradient)
                    .graphicsLayer { val s = if (appear) 1f else 0.6f; scaleX = s; scaleY = s }, contentAlignment = Alignment.Center) {
                    SfIcon("faceid", size = 50.dp, tint = Color.White)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("САФУ заблокировано", style = ft(Ts.title2, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                    Text(if (AppLock.failed) "Не получилось. Попробуй ещё раз" else "Оценки, пароли и файлы под защитой",
                        style = ft(Ts.subheadline), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
                }
                Pressable({ Haptics.tap(); AppLock.authenticate() }) {
                    Row(Modifier.clip(CircleShape).background(Brand.gradient).padding(horizontal = 26.dp, vertical = 15.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SfIcon("lock.open.fill", size = 18.dp, tint = Color.White)
                        Text("Войти по ${Biometric.biometryName}", style = ft(Ts.headline, FontWeight.SemiBold), color = Color.White)
                    }
                }
            }
        }
    }
}

/** Закрытое содержимое (файлы, пароли): открывается по биометрии */
@Composable
fun LockGate(always: Boolean = false, title: String = "Файлы защищены", reason: String = "Доступ к твоим файлам",
             content: @Composable () -> Unit) {
    val enabled = Defaults.bool("lockFiles")
    var unlocked by remember { mutableStateOf(false) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) unlocked = false }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    fun authenticate() {
        if (!Biometric.canAuthenticate) { unlocked = true; return }
        Biometric.authenticate(reason) { ok -> if (ok) { Haptics.success(); unlocked = true } }
    }
    if (!(enabled || always) || unlocked) {
        content()
    } else {
        LaunchedEffect(Unit) { authenticate() }
        Box(Modifier.fillMaxSize()) {
            AmbientBackground()
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
                SfGradientIcon("lock.fill", size = 50.dp)
                Text(title, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                Pressable({ authenticate() }) {
                    Glass(24.dp, interactive = true) {
                        Row(Modifier.padding(horizontal = 22.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SfIcon("faceid", size = 18.dp, tint = Ios.label)
                            Text("Разблокировать", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                        }
                    }
                }
            }
        }
    }
}
