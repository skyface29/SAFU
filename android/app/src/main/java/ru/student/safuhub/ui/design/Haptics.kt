package ru.student.safuhub.ui.design

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import ru.student.safuhub.App
import ru.student.safuhub.core.Defaults

/** Вибрация (как UIImpactFeedbackGenerator) */
object Haptics {
    private val enabled: Boolean get() = Defaults.boolOrNull("haptics") ?: true

    private val vibrator: Vibrator? by lazy {
        try {
            if (Build.VERSION.SDK_INT >= 31) (App.ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            else @Suppress("DEPRECATION") App.ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        } catch (_: Throwable) { null }
    }

    fun tap() {
        if (!enabled) return
        try {
            if (Build.VERSION.SDK_INT >= 29) vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
            else vibrator?.vibrate(VibrationEffect.createOneShot(8, 60))
        } catch (_: Throwable) {}
    }

    fun success() {
        if (!enabled) return
        try {
            if (Build.VERSION.SDK_INT >= 29) vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_DOUBLE_CLICK))
            else vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 12, 60, 14), -1))
        } catch (_: Throwable) {}
    }

    /** Короткий жёсткий «хлопок» (UIImpactFeedbackGenerator(style: .rigid)) */
    fun rigid() {
        if (!enabled) return
        try {
            if (Build.VERSION.SDK_INT >= 29) vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
            else vibrator?.vibrate(VibrationEffect.createOneShot(14, 200))
        } catch (_: Throwable) {}
    }

    fun heavy() {
        if (!enabled) return
        try {
            if (Build.VERSION.SDK_INT >= 29) vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
            else vibrator?.vibrate(VibrationEffect.createOneShot(30, 255))
        } catch (_: Throwable) {}
    }
}
