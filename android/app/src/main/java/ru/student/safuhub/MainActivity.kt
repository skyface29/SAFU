package ru.student.safuhub

import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.FragmentActivity
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.feature.eggs.Oracle
import ru.student.safuhub.system.Biometric
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.ui.DeepLinks
import ru.student.safuhub.ui.RootView
import ru.student.safuhub.ui.theme.SafuTheme
import java.lang.ref.WeakReference
import kotlin.math.sqrt

class MainActivity : FragmentActivity(), SensorEventListener {
    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        Permissions.onResult(it)
    }
    private var sensors: SensorManager? = null
    private var lastShake = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        Defaults.init(this)
        Permissions.launcher = permissionLauncher
        Biometric.activity = WeakReference(this)
        sensors = getSystemService(SENSOR_SERVICE) as? SensorManager
        if (savedInstanceState == null) handle(intent)
        setContent { SafuTheme { RootView() } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    /** safu://… и нажатия на уведомления */
    private fun handle(intent: Intent?) {
        intent ?: return
        val data = intent.data
        if (data != null && data.scheme == "safu") {
            DeepLinks.pending.value = data.toString()
            return
        }
        // «Открыть с помощью» резервную копию
        if (intent.action == Intent.ACTION_VIEW && data != null && (data.scheme == "content" || data.scheme == "file")) {
            DeepLinks.backup.value = data
            return
        }
        // «Поделиться» файлами
        if (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) {
            val uris = mutableListOf<android.net.Uri>()
            @Suppress("DEPRECATION")
            if (intent.action == Intent.ACTION_SEND) (intent.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM))?.let { uris.add(it) }
            else intent.getParcelableArrayListExtra<android.net.Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
            val backup = uris.firstOrNull { it.lastPathSegment?.endsWith(".safubackup") == true }
            if (backup != null) DeepLinks.backup.value = backup
            else if (uris.isNotEmpty()) DeepLinks.shared.value = uris
            return
        }
        if (intent.action == "ru.student.safuhub.OPEN_NOTIFICATION") {
            val extras = intent.extras ?: return
            DeepLinks.notification.value = extras.keySet().mapNotNull { k -> extras.getString(k)?.let { k to it } }.toMap()
        }
        intent.getStringExtra("shortcut")?.let { DeepLinks.pending.value = "safu://$it" }
    }

    override fun onResume() {
        super.onResume()
        Biometric.activity = WeakReference(this)
        sensors?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sensors?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }

    override fun onPause() {
        super.onPause()
        sensors?.unregisterListener(this)
        Defaults.flush()
    }

    // встряхнуть телефон → шар предсказаний
    override fun onSensorChanged(e: SensorEvent) {
        val (x, y, z) = Triple(e.values[0], e.values[1], e.values[2])
        val g = sqrt(x * x + y * y + z * z) / SensorManager.GRAVITY_EARTH
        if (g > 2.7f) {
            val now = System.currentTimeMillis()
            if (now - lastShake > 1500) {
                lastShake = now
                Oracle.fire()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
