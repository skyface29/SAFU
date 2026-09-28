package ru.student.safuhub.system

import android.content.pm.PackageManager
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import ru.student.safuhub.App
import java.lang.ref.WeakReference

/** Вход по отпечатку, лицу или коду телефона (как LocalAuthentication) */
object Biometric {
    internal var activity: WeakReference<FragmentActivity>? = null

    private val authenticators: Int
        get() = if (Build.VERSION.SDK_INT >= 30) BIOMETRIC_WEAK or DEVICE_CREDENTIAL else BIOMETRIC_WEAK

    /** Есть ли на телефоне защита (биометрия или код) */
    val canAuthenticate: Boolean
        get() {
            val bm = BiometricManager.from(App.ctx)
            if (bm.canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS) return true
            val km = App.ctx.getSystemService(android.app.KeyguardManager::class.java)
            return km?.isDeviceSecure == true
        }

    /** «отпечатку», «лицу» или «коду» — для подписей «Войти по …» */
    val biometryName: String
        get() {
            val pm = App.ctx.packageManager
            val bm = BiometricManager.from(App.ctx)
            val hasBio = bm.canAuthenticate(BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS
            return when {
                hasBio && pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT) -> "отпечатку"
                hasBio && Build.VERSION.SDK_INT >= 29 && pm.hasSystemFeature(PackageManager.FEATURE_FACE) -> "лицу"
                hasBio -> "биометрии"
                else -> "коду телефона"
            }
        }

    /** Проверить владельца; без настроенной защиты на телефоне — пускаем сразу */
    fun authenticate(title: String, subtitle: String? = null, done: (Boolean) -> Unit) {
        val act = activity?.get()
        if (act == null || act.isFinishing) { done(false); return }
        if (!canAuthenticate) { done(true); return }
        val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = done(true)
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                if (errorCode == BiometricPrompt.ERROR_NO_BIOMETRICS || errorCode == BiometricPrompt.ERROR_HW_NOT_PRESENT ||
                    errorCode == BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL) done(true) else done(false)
            }
        })
        val info = BiometricPrompt.PromptInfo.Builder().setTitle(title).apply {
            if (subtitle != null) setSubtitle(subtitle)
            if (Build.VERSION.SDK_INT >= 30) setAllowedAuthenticators(authenticators)
            else {
                @Suppress("DEPRECATION")
                setDeviceCredentialAllowed(true)
            }
        }.build()
        try { prompt.authenticate(info) } catch (_: Throwable) { done(false) }
    }
}
