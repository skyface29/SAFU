package ru.student.safuhub.feature.tour

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.AppScope
import ru.student.safuhub.data.TeacherMode
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.glass
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// MARK: - Мини-инструкция после первой регистрации (как iPhone 19.8)
// Четыре коротких экрана: где что лежит и два главных жеста. Показывается один раз, её всегда можно пропустить.

object TourRouter {
    val show = mutableStateOf(false)
    private const val KEY = "tour.v1.shown"

    /** После первой регистрации — один раз, когда окно регистрации уже закрылось */
    fun requestOnce() {
        if (Defaults.bool(KEY)) return
        Defaults.set(KEY, true)
        AppScope.launch { delay(700); show.value = true }
    }
}

private data class TourPage(val icon: String, val title: String, val text: String, val hint: String)

private fun pages(): List<TourPage> = buildList {
    add(TourPage("clock.fill", "Пара — сразу на главной", "Какая пара сейчас, где аудитория и сколько до конца.",
        "Листай карточку пары влево и вправо"))
    add(TourPage("rectangle.stack.fill", "Сайты в одно касание", "Sakai, почта и РУЗ — в панели внизу, под большим пальцем.",
        "Сайт можно свернуть — он останется плашкой внизу, но не закроется"))
    if (!TeacherMode.isOn) add(TourPage("book.closed.fill", "Домашка сама считает сроки",
        "Записал ДЗ с пары — срок встанет к следующей очной практике по расписанию.", "Кнопка «ДЗ» — прямо в карточке пары"))
    add(TourPage("slider.horizontal.3", "Всё под себя", "Погоду, автобус и другие блоки добавишь в «Настроить главную».",
        "Зажми любой блок и перетащи"))
}

@Composable
fun OnboardingTour(onDone: () -> Unit) {
    val list = pages()
    val pager = rememberPagerState { list.size }
    val scope = rememberCoroutineScope()
    val last = pager.currentPage >= list.size - 1
    fun finish() { Haptics.success(); onDone() }

    Box(Modifier.fillMaxSize().background(Ios.background)) {
        AmbientBackground(Modifier.fillMaxSize())
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp)) {
                Spacer(Modifier.weight(1f))
                TextButton({ finish() }, modifier = Modifier.alpha(if (last) 0f else 1f), enabled = !last) {
                    Text("Пропустить", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.secondaryLabel)
                }
            }
            HorizontalPager(pager, Modifier.weight(1f)) { i -> PageView(list[i]) }
            Row(Modifier.fillMaxWidth().padding(bottom = 22.dp), horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally)) {
                for (i in list.indices) {
                    val w by animateDpAsState(if (i == pager.currentPage) 22.dp else 7.dp, spring(0.8f, 400f), label = "dot")
                    Box(Modifier.size(w, 7.dp).clip(CircleShape).then(
                        if (i == pager.currentPage) Modifier.background(Brand.gradient) else Modifier.background(Ios.secondaryLabel.copy(alpha = 0.35f))))
                }
            }
            Pressable({
                Haptics.tap()
                if (!last) scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } else finish()
            }, Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 20.dp)) {
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Brand.gradient).padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center) {
                    Text(if (last) "Начать" else "Дальше", style = ft(Ts.headline, FontWeight.SemiBold), color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun PageView(p: TourPage) {
    Column(Modifier.fillMaxSize().padding(horizontal = 32.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(22.dp, Alignment.CenterVertically)) {
        Box(Modifier.size(128.dp).shadow(28.dp, CircleShape, ambientColor = Brand.color, spotColor = Brand.color)
            .clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
            SfIcon(p.icon, size = 56.dp, tint = Color.White)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(p.title, style = ft(Ts.title2, FontWeight.Bold, Design.ROUNDED), color = Ios.label, textAlign = TextAlign.Center)
            Text(p.text, style = ft(Ts.body), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
        }
        Box(Modifier.glass(18.dp).padding(horizontal = 16.dp, vertical = 11.dp)) {
            IconLabel(p.hint, "hand.tap.fill", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
        }
        Spacer(Modifier.height(10.dp))
    }
}
