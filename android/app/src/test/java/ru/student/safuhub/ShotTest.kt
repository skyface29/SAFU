package ru.student.safuhub

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Снимки экранов для проверки вёрстки: ./gradlew :app:testDebugUnitTest -Droborazzi.test.record=true */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w393dp-h852dp-xxhdpi")
class ShotTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun root() {
        rule.mainClock.advanceTimeBy(3000)
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/shots/root.png")
    }
}
