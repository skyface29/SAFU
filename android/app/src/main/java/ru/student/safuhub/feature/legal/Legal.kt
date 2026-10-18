package ru.student.safuhub.feature.legal

import android.webkit.CookieManager
import android.webkit.WebStorage
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.student.safuhub.App
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.feature.web.SecureStore
import ru.student.safuhub.system.Notify
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormScreen
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// Конфиденциальность, статус приложения и удаление данных (как Legal.swift на iPhone)

object AppInfo {
    const val name = "Арктика"
    const val storeName = "Арктика — пары и учёба"
}

object Legal {
    const val policyURL = "https://github.com/skyface29/SAFU/blob/main/PRIVACY.md"
    const val yandexMapsTermsURL = "https://yandex.ru/legal/maps_termsofuse"
    const val disclaimer = "«Арктика» — неофициальное приложение. Сделано студентом САФУ и не связано с Северным (Арктическим) федеральным университетом имени М. В. Ломоносова. Расписание берётся из открытого РУЗ САФУ; сайты университета открываются как в обычном браузере."

    /** Стереть всё, что приложение хранит на этом телефоне */
    suspend fun eraseEverything() = withContext(Dispatchers.IO) {
        val ctx = App.ctx
        // уведомления и будильники
        runCatching { Notify.remove(Notify.pendingIds()) }
        runCatching { NotificationManagerCompat.from(ctx).cancelAll() }
        // пароли и ключи
        runCatching { for (k in SecureStore.accounts()) SecureStore.delete(k) }
        // вход на сайты
        withContext(Dispatchers.Main) {
            runCatching { CookieManager.getInstance().removeAllCookies(null); CookieManager.getInstance().flush() }
            runCatching { WebStorage.getInstance().deleteAllData() }
        }
        // файлы: предметы, фото доски, лекции, ДЗ, кеш
        for (dir in listOfNotNull(ctx.filesDir, ctx.cacheDir, ctx.getExternalFilesDir(null))) {
            dir.listFiles()?.forEach { if (it.name != "defaults.json") it.deleteRecursively() }
        }
        // настройки — в самом конце
        Defaults.replaceAll(emptyMap())
    }
}

/** Профиль → «Конфиденциальность» */
@Composable
fun LegalScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var erasing by remember { mutableStateOf(false) }
    var erased by remember { mutableStateOf(false) }
    FormScreen("Конфиденциальность") {
        FormSection("О приложении") {
            row { InfoLine("info.circle.fill", Legal.disclaimer) }
            link("Условия использования сервиса Яндекс.Карты", "map.fill") { Share.url(ctx, Legal.yandexMapsTermsURL) }
        }
        FormSection("Конфиденциальность") {
            row { InfoLine("iphone", "Всё хранится только на этом телефоне: расписание, заметки, файлы, фото доски, лекции.") }
            row { InfoLine("key.fill", "Пароли от сайтов и ключи ИИ — в защищённом хранилище только этого телефона, зашифрованы ключом Android и никуда не переносятся.") }
            row { InfoLine("hand.raised.fill", "Нет рекламы, аналитики, трекеров и своих серверов. Разработчик не получает никаких твоих данных.") }
            row { InfoLine("network", "Приложение обращается к РУЗ САФУ, сайтам вуза, которые ты открываешь, почте САФУ (если включишь уведомления о письмах), погоде Open-Meteo и Яндекс Картам.") }
            row { InfoLine("desktopcomputer", "Синхронизация с компьютером идёт напрямую по твоему Wi‑Fi и шифруется AES‑256 — без облаков. Включается, только когда ты сам связал телефон с компьютером.") }
            row { InfoLine("waveform", "Речь лекций распознаётся на телефоне и никуда не отправляется. Модель распознавания один раз скачивается из интернета.") }
            row { InfoLine("sparkles", "ИИ-конспект лекций: текст расшифровки уходит в GigaChat или Claude только с твоего разрешения и только если ты сам вписал свой ключ. Аудио не отправляется.") }
            row { InfoLine("location.fill", "Геопозиция — чтобы понять город для автобуса и показать твою точку на карте. Приложение координаты не хранит и само никуда не отправляет.") }
            link("Политика конфиденциальности полностью", "doc.text.fill") { Share.url(ctx, Legal.policyURL) }
        }
        FormSection(footer = "Сотрёт расписание, файлы предметов, фото доски, лекции, заметки, задачи, ДЗ, сохранённые пароли, вход на сайты и все настройки. Отменить нельзя — сначала сделай резервную копию, если она нужна.") {
            if (erased) row { Text("Готово. Закрой приложение полностью и открой заново — начнёшь с чистого листа.", style = ft(Ts.footnote), color = Ios.secondaryLabel) }
            else button("Удалить все мои данные", "trash.fill", destructive = true, enabled = !erasing, trailing = { if (erasing) Spinner() }) {
                Dialogs.confirm("Удалить все данные приложения?", "Это нельзя отменить.", "Удалить всё") {
                    erasing = true
                    scope.launch {
                        Legal.eraseEverything()
                        erasing = false
                        erased = true
                        Haptics.success()
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoLine(icon: String, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        SfIcon(icon, size = 18.dp, tint = Brand.color)
        Spacer(Modifier.width(12.dp))
        Column { Text(text, style = ft(Ts.subheadline), color = Ios.label) }
    }
}
