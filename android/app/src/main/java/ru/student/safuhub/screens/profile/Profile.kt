package ru.student.safuhub.screens.profile

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.widget.FrameLayout
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import ru.student.safuhub.R
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.appleSecondsToInstant
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.core.prefDouble
import ru.student.safuhub.core.prefInt
import ru.student.safuhub.core.prefString
import ru.student.safuhub.data.ResourceStore
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.data.TeacherMode
import ru.student.safuhub.feature.avatar.AvatarEditor
import ru.student.safuhub.feature.backup.BackupScreen
import ru.student.safuhub.feature.eggs.GoldIcon
import ru.student.safuhub.feature.eggs.VipIcons
import ru.student.safuhub.feature.features.FeaturesScreen
import ru.student.safuhub.feature.lock.AppLock
import ru.student.safuhub.feature.lock.LockGate
import ru.student.safuhub.feature.mail.MailNotifyScreen
import ru.student.safuhub.feature.notes.NotesScreen
import ru.student.safuhub.feature.notes.notesPreview
import ru.student.safuhub.feature.web.CredentialStore
import ru.student.safuhub.feature.web.SessionKeeper
import ru.student.safuhub.feature.web.SiteCredential
import ru.student.safuhub.screens.commute.CommuteSettingsScreen
import ru.student.safuhub.screens.developer.Developer
import ru.student.safuhub.screens.developer.DeveloperScreen
import ru.student.safuhub.screens.home.HomeEditor
import ru.student.safuhub.screens.home.TabsEditor
import ru.student.safuhub.system.Biometric
import ru.student.safuhub.system.LiveLayout
import ru.student.safuhub.system.LiveLesson
import ru.student.safuhub.system.LiveState
import ru.student.safuhub.system.LiveTheme
import ru.student.safuhub.system.Permissions
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.DateMode
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormColumn
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosTextField
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.Segmented
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.TextButton
import ru.student.safuhub.ui.kit.swipeRow
import ru.student.safuhub.ui.theme.AccentTheme
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb
import ru.student.safuhub.widget.WidgetWallpaperScreen
import ru.student.safuhub.widget.Widgets
import java.time.Instant

@Composable
fun ProfileScreen() {
    val ctx = LocalContext.current
    val nav = LocalNav.current
    var userName by prefString("user.name", "")
    var role by prefInt("user.role", 0)
    var group by prefString("group", "")
    val lastBackup by prefDouble("backup.last", 0.0)
    var webLight by prefBool("web.light", true)
    var savePasswords by prefBool("web.savePasswords", true)
    var autoLogin by prefBool("web.autoLogin", true)
    var notifyPairs by prefBool("notify.pairs", true)
    var notifyMinutes by prefInt("notify.pairMinutes", 10)
    var notifyChanges by prefBool("notify.changes", true)
    var digest by prefBool("notify.digest", true)
    var liveEnabled by prefBool("live.enabled", true)
    var liveAlways by prefBool("live.always", true)
    var lockFiles by prefBool("lockFiles", false)
    var lockApp by prefBool(AppLock.key, false)
    var privacyShield by prefBool("privacy.shield", true)
    var memoryCleared by remember { mutableStateOf(false) }
    var widgetLink by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    val schedule = ScheduleStore

    val backupOld = lastBackup == 0.0 || Instant.now().epochSecond - appleSecondsToInstant(lastBackup).epochSecond > 7 * 86_400
    val roleTitle = when (role) {
        1 -> "Староста"
        2 -> "Зам. старосты"
        3 -> "Преподаватель САФУ"
        else -> "Студент САФУ"
    }
    val bio = Biometric.biometryName

    Screen("Профиль", large = true, background = { AmbientBackground() }) {
        FormColumn {
            FormSection {
                raw {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        // нажми, чтобы поставить своё фото
                        AvatarEditor(64.dp)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            IosTextField(userName, { userName = it }, "Твоё имя", Modifier.fillMaxWidth(), style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED),
                                words = true)
                            Text(roleTitle + if (group.isEmpty()) "" else " · группа $group", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                        }
                    }
                }
            }

            FormSection(footer = if (role == 3) "Бета. " + TeacherMode.betaNote else if (role == 0) "Старосте и заму откроется «Посещаемость»: отметки ребят на каждой паре."
            else "«Посещаемость» — в инструментах на главной и в карточке любой пары.") {
                button(if (TeacherMode.isOn) "Сменить школу или фамилию — пройти настройку заново" else "Сменить группу или школу — пройти настройку заново",
                    "arrow.triangle.2.circlepath") {
                    Haptics.tap()
                    Defaults.set("onboarding.again", true)
                }
                if (TeacherMode.isOn) info("Как вы записаны в РУЗ", TeacherMode.query)
                else picker("Роль в группе", listOf(0 to "Студент", 1 to "Староста", 2 to "Зам. старосты"), role, { role = it })
            }

            FormSection {
                row(inset = 54.dp, onClick = { Haptics.tap(); nav?.push { FeaturesScreen() } }) {
                    SfGradientIcon("switch.2", Modifier.width(26.dp), size = 21.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text("Функции", style = ft(Ts.body, FontWeight.SemiBold), color = Ios.label)
                        Text("Утро, автобус, группа, маршруты, ярлыки", style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                    SfIcon("chevron.right", size = 20.dp, tint = Ios.tertiaryLabel)
                }
            }

            FormSection("Оформление") {
                row(onClick = { Haptics.tap(); Defaults.set("ui.appearanceOpen", true) }) {
                    Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(Brand.gradient), contentAlignment = Alignment.Center) {
                        SfIcon("paintpalette.fill", size = 18.dp, tint = Color.White)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text("Оформление", style = ft(Ts.body, FontWeight.SemiBold), color = Ios.label)
                        Text("Стили, цвет, фон, карточки, шрифт, иконка", style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                    val dark = LocalDark.current
                    Row(horizontalArrangement = Arrangement.spacedBy((-6).dp)) {
                        for (th in listOf(AccentTheme.CYBER, AccentTheme.AURORA, AccentTheme.GOLD)) {
                            Box(Modifier.size(18.dp).clip(CircleShape)
                                .background(Brush.linearGradient(listOf(th.colorDyn.of(dark), th.secondaryDyn.of(dark))))
                                .border(1.5.dp, Ios.background, CircleShape))
                        }
                    }
                    Spacer(Modifier.width(6.dp))
                    SfIcon("chevron.right", size = 14.dp, tint = Ios.tertiaryLabel)
                }
            }

            FormSection("Настроить интерфейс", footer = "Меняй порядок блоков и вкладок, убирай ненужное и добавляй своё.") {
                link("Главный экран", "rectangle.3.group") { nav?.push { HomeEditor() } }
                link("Нижняя панель", "dock.rectangle") { nav?.push { TabsEditor() } }
                link("Дорога и автобусы", "bus.fill") { nav?.push { CommuteSettingsScreen() } }
                row(inset = 54.dp, onClick = { Haptics.tap(); nav?.push { BackupScreen() } }) {
                    ru.student.safuhub.ui.kit.RowIcon("externaldrive.badge.checkmark", null)
                    Text("Резервная копия", style = ft(Ts.body), color = Ios.label, modifier = Modifier.weight(1f))
                    if (backupOld) Text("давно не было", style = ft(Ts.caption2, FontWeight.Bold), color = Ios.orange)
                    Spacer(Modifier.width(4.dp))
                    SfIcon("chevron.right", size = 20.dp, tint = Ios.tertiaryLabel)
                }
            }

            FormSection("Сайты", footer = "Sakai и другие сайты вуза в тёмной теме показывают тёмный текст на тёмном фоне. Эта настройка это исправляет.") {
                toggle("Сайты всегда светлые", webLight, { webLight = it })
            }

            FormSection("Учёба") {
                link("Уведомления о письмах", "envelope.badge.fill") { nav?.push { MailNotifyScreen() } }
                row {
                    Text("Группа", style = ft(Ts.body), color = Ios.label)
                    Spacer(Modifier.width(12.dp))
                    IosTextField(group, { group = it }, "номер", Modifier.weight(1f), keyboard = KeyboardType.Number, textAlign = TextAlign.End,
                        color = Ios.secondaryLabel)
                }
                date("Начало семестра", schedule.data.semesterStart, { schedule.data = schedule.data.copy(semesterStart = it) }, DateMode.DATE)
                if (schedule.archivedWeeks > 0) {
                    button("Очистить архив расписания (${schedule.archivedWeeks} нед.)", "archivebox") {
                        schedule.clearHistory()
                        Haptics.success()
                    }
                }
                if (schedule.hasLessons) {
                    button("Удалить всё расписание", "calendar.badge.minus", destructive = true) {
                        Dialogs.actionSheet("Удалить все пары?", null,
                            AlertAction("Удалить", AlertAction.Role.DESTRUCTIVE) { schedule.clearAll() },
                            AlertAction("Отменить", AlertAction.Role.CANCEL))
                    }
                }
            }

            FormSection("Виджет") {
                row { InfoRow("square.grid.2x2", "Удержи пустое место на рабочем столе → «Виджеты» → САФУ. Есть маленький, средний и большой виджеты.") }
                row { InfoRow("paintpalette.fill", "Стили: в списке виджетов САФУ — «Пары · Сияние», «Графит», «Бордо», «Хвоя», «Закат», «Светлый», «Прозрачный». Каждый стиль — отдельный виджет.") }
                link("Прозрачный виджет (фон из обоев)", "circle.dashed") { nav?.push { WidgetWallpaperScreen() } }
                row { InfoRow("antenna.radiowaves.left.and.right", "Виджет берёт группу и пары прямо из приложения и обновляется сам. Кнопка ↻ на виджете — обновить из РУЗ.") }
                button("Проверить связь с виджетом", "checkmark.shield") {
                    Widgets.updateAll(ctx)
                    val r = widgetSelfTest(ctx)
                    widgetLink = r
                    if (r.first) Haptics.success()
                }
                widgetLink?.let { (ok, text) ->
                    row {
                        IconLabel(text, if (ok) "checkmark.circle.fill" else "exclamationmark.triangle.fill", style = ft(Ts.caption),
                            color = if (ok) Ios.green else Ios.orange)
                    }
                }
                button("Обновить виджет сейчас", "arrow.clockwise") {
                    Haptics.success()
                    Widgets.updateAll(ctx)
                }
            }

            FormSection("Безопасность", footer = "Вход по $bio — приложение спрашивает его при запуске и после каждого сворачивания. Вкладка «Файлы» может отдельно открываться только после $bio или кода телефона. В списке открытых приложений вместо оценок, паролей и файлов будет заставка. Пароли и ключи хранятся зашифрованными ключом этого телефона и не попадают в резервные копии.") {
                toggle("Вход по $bio", lockApp, { on ->
                    if (on) {
                        // включаем только после успешной проверки — чтобы не запереть себя
                        AppLock.confirm { ok ->
                            lockApp = ok
                            if (ok) Haptics.success()
                        }
                    } else lockApp = false
                }, icon = "faceid")
                toggle("Файлы по $bio", lockFiles, { lockFiles = it }, icon = "faceid")
                toggle("Прятать экран в переключателе", privacyShield, { privacyShield = it }, icon = "eye.slash.fill")
            }

            FormSection("Уведомления и экран блокировки", footer = "Пара висит закреплённым уведомлением с таймером, аудиторией и адресом — видно на экране блокировки и в шторке. Обновляется само: начало и конец пары, раз в пару минут во время пары.") {
                toggle("Пара на экране блокировки", liveEnabled, { liveEnabled = it; schedule.refreshSideEffects() }, icon = "platter.filled.bottom.iphone")
                if (liveEnabled) {
                    toggle("Висеть всегда", liveAlways, { liveAlways = it; schedule.refreshSideEffects() }, icon = "pin.fill",
                        subtitle = "Даже без пар — следующая пара и день недели")
                    link("Вид пары на экране блокировки", "paintpalette.fill") { nav?.push { LiveStyleScreen() } }
                }
                toggle("Напоминать о парах", notifyPairs, {
                    notifyPairs = it
                    Permissions.requestNotifications()
                    schedule.refreshSideEffects()
                }, icon = "bell.badge.fill")
                if (notifyPairs) segmented(listOf(5 to "5", 10 to "10", 15 to "15", 30 to "30"), notifyMinutes, {
                    notifyMinutes = it
                    schedule.refreshSideEffects()
                })
                toggle("Сообщать об изменениях в РУЗ", notifyChanges, { notifyChanges = it }, icon = "exclamationmark.arrow.triangle.2.circlepath")
                toggle("Итоги недели по воскресеньям", digest, { digest = it; schedule.refreshSideEffects() }, icon = "calendar.badge.clock")
            }

            FormSection("Пароли и вход", footer = "Вход на сайты сохраняется даже после перезапуска приложения, пароль на сайте подставляется сам. Список сохранённых паролей открывается только по $bio или коду телефона. Пароли зашифрованы ключом этого телефона.") {
                toggle("Запоминать пароли", savePasswords, { savePasswords = it }, icon = "key.fill")
                toggle("Входить автоматически", autoLogin, { autoLogin = it }, icon = "bolt.fill", enabled = savePasswords)
                link("Сохранённые пароли", "lock.rectangle.stack") {
                    // открываются только по отпечатку или коду телефона
                    nav?.push { LockGate(always = true, title = "Пароли защищены", reason = "Доступ к сохранённым паролям") { PasswordsScreen() } }
                }
            }

            FormSection("Полезно знать") {
                row { InfoRow("calendar", "Расписание подтягивается из РУЗ автоматически, вкладка «Пары».") }
                row { InfoRow("key.fill", "Вход в почту и Sakai: адрес почты САФУ и пароль от учётной записи.") }
                row { InfoRow("person.badge.key.fill", "Первокурсникам сначала нужно активировать учётную запись.") }
            }

            FormSection {
                row(onClick = { Haptics.tap(); nav?.push { DeveloperScreen() } }) {
                    Box(Modifier.size(38.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                        SfIcon("chevron.left.forwardslash.chevron.right", size = 15.dp, tint = Color.White)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text("Разработчик и о приложении", style = ft(Ts.body, FontWeight.SemiBold), color = Ios.label)
                        Text("${Developer.name} · версия ${Developer.version}", style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1,
                            overflow = TextOverflow.Ellipsis)
                    }
                    SfIcon("chevron.right", size = 20.dp, tint = Ios.tertiaryLabel)
                }
            }

            FormSection("Заметки") { notesPreview { nav?.push { NotesScreen() } } }

            FormSection("Память", footer = "Приложение запоминает недавние сайты, последнюю открытую страницу в каждом и вкладку, на которой ты был.") {
                button(if (memoryCleared) "Память очищена" else "Очистить недавние и сохранённые страницы",
                    if (memoryCleared) "checkmark.circle.fill" else "clock.arrow.circlepath") {
                    ResourceStore.clearMemory()
                    Haptics.success()
                    memoryCleared = true
                }
            }

            FormSection {
                info("Версия", ru.student.safuhub.App.version.ifEmpty { "—" })
            }
        }
    }
}

/** Виджеты на рабочем столе читают данные приложения напрямую — проверяем, что они есть и обновились */
private fun widgetSelfTest(ctx: Context): Pair<Boolean, String> {
    val mgr = AppWidgetManager.getInstance(ctx)
    val count = try {
        mgr.installedProviders
            .filter { it.provider.packageName == ctx.packageName }
            .sumOf { mgr.getAppWidgetIds(it.provider).size }
    } catch (_: Throwable) { 0 }
    return if (count > 0) true to "Связь есть: виджетов на рабочем столе — $count. Группа и пары берутся прямо из приложения."
    else false to "Виджетов САФУ на рабочем столе пока нет. Добавь: удержи пустое место → «Виджеты» → САФУ."
}

@Composable
fun InfoRow(icon: String, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SfIcon(icon, size = 20.dp, tint = Brand.color, modifier = Modifier.width(24.dp))
        Text(text, style = ft(Ts.body), color = Ios.label)
    }
}

// MARK: - Пароли

@Composable
fun PasswordsScreen() {
    val ctx = LocalContext.current
    var list by remember { mutableStateOf(CredentialStore.all()) }
    var shown by remember { mutableStateOf(setOf<String>()) }
    Screen("Пароли") {
        FormColumn {
            FormSection(footer = "👁 — показать пароль, ⧉ — скопировать (буфер очистится через минуту). Смахни влево, чтобы удалить.") {
                if (list.isEmpty()) row {
                    Text("Пока нет. Войди на сайт внутри приложения, и оно предложит сохранить пароль.", style = ft(Ts.body), color = Ios.secondaryLabel)
                }
                for (c in list) swipeRow({ CredentialStore.delete(c.host); list = CredentialStore.all() }) { PasswordRow(c, c.host in shown, {
                    shown = if (c.host in shown) shown - c.host else shown + c.host
                }) { copyPassword(ctx, c.pass) } }
            }
            FormSection {
                button("Выйти со всех сайтов и удалить пароли", "rectangle.portrait.and.arrow.right", destructive = true) {
                    Dialogs.actionSheet("Выйти со всех сайтов и удалить сохранённые пароли?", null,
                        AlertAction("Выйти и удалить", AlertAction.Role.DESTRUCTIVE) {
                            CredentialStore.deleteAll()
                            SessionKeeper.clearAll { list = emptyList() }
                            list = emptyList()
                            Haptics.success()
                        },
                        AlertAction("Отменить", AlertAction.Role.CANCEL))
                }
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.PasswordRow(c: SiteCredential, visible: Boolean, onToggle: () -> Unit, onCopy: () -> Unit) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(c.host, style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
        Text(c.user.ifEmpty { "—" }, style = ft(Ts.subheadline), color = Ios.secondaryLabel)
        if (visible) SelectionContainer { Text(c.pass, style = ft(Ts.subheadline, mono = true), color = Ios.label) }
    }
    TextButton(onToggle) { SfIcon(if (visible) "eye.slash" else "eye", size = 20.dp, tint = Brand.color) }
    TextButton(onCopy) { SfIcon("doc.on.doc", size = 20.dp, tint = Brand.color) }
}

/** Пароль в буфере живёт минуту и помечен как секретный (не показывается во всплывающем превью) */
private fun copyPassword(ctx: Context, pass: String) {
    Share.copy(pass, sensitive = true)
    Haptics.success()
    val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
        try {
            val cur = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.text?.toString()
            if (cur == pass) {
                if (android.os.Build.VERSION.SDK_INT >= 28) cm.clearPrimaryClip() else cm.setPrimaryClip(android.content.ClipData.newPlainText("", ""))
            }
        } catch (_: Throwable) {}
    }, 60_000)
}

// MARK: - Иконка приложения (переключаются ярлыки-«псевдонимы» в манифесте)

object AppIcons {
    data class Icon(val id: String, val title: String, val preview: Int, val secret: Boolean = false)

    val gold = Icon("gold", "Золото", R.drawable.icon_preview_gold, secret = true)
    val exclusive = listOf(
        Icon("developer", "Бриллиант", R.drawable.icon_preview_developer, true),
        Icon("leather", "Зачётка", R.drawable.icon_preview_leather, true),
        Icon("steel", "Сталь", R.drawable.icon_preview_steel, true),
        Icon("pin", "Значок", R.drawable.icon_preview_pin, true),
        Icon("ticket", "Билет 150", R.drawable.icon_preview_ticket, true),
    )
    val colors = listOf(
        Icon("classic", "Классика", R.drawable.icon_preview_classic),
        Icon("night", "Ночь", R.drawable.icon_preview_night),
        Icon("ice", "Лёд", R.drawable.icon_preview_ice),
        Icon("mint", "Мята", R.drawable.icon_preview_mint),
        Icon("violet", "Фиолет", R.drawable.icon_preview_violet),
        Icon("sunset", "Закат", R.drawable.icon_preview_sunset),
        Icon("mono", "Минимал", R.drawable.icon_preview_mono),
    )
    val themed = listOf(
        Icon("ios6", "iOS 6", R.drawable.icon_preview_ios6),
        Icon("machinarium", "Machinarium", R.drawable.icon_preview_machinarium),
    )
    val designs = listOf(
        Icon("aurora", "Сияние", R.drawable.icon_preview_aurora),
        Icon("shield", "Защита", R.drawable.icon_preview_shield),
        Icon("letter", "Буква С", R.drawable.icon_preview_letter),
        Icon("cap", "Выпускник", R.drawable.icon_preview_cap),
        Icon("glass", "Стекло", R.drawable.icon_preview_glass),
        Icon("pixel", "Пиксель", R.drawable.icon_preview_pixel),
        Icon("neon", "Неон", R.drawable.icon_preview_neon),
    )
    private val all: List<Icon> get() = listOf(gold) + exclusive + colors + themed + designs

    private fun component(ctx: Context, id: String) = ComponentName(ctx.packageName, "ru.student.safuhub.Icon_$id")

    val current: String get() = Defaults.string("app.icon") ?: "classic"

    /** Сменить иконку: включаем нужный ярлык, остальные выключаем */
    fun set(ctx: Context, id: String): Boolean = try {
        val pm = ctx.packageManager
        pm.setComponentEnabledSetting(component(ctx, id), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        for (i in all) if (i.id != id) {
            pm.setComponentEnabledSetting(component(ctx, i.id), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        }
        Defaults.set("app.icon", id)
        true
    } catch (_: Throwable) { false }
}

@Composable
fun AppIconPickerScreen() {
    val ctx = LocalContext.current
    var current by remember { mutableStateOf(AppIcons.current) }
    var failed by remember { mutableStateOf(false) }

    fun pick(i: AppIcons.Icon) {
        if (current == i.id) return
        if (AppIcons.set(ctx, i.id)) {
            current = i.id
            failed = false
            Haptics.success()
        } else failed = true
    }

    Screen("Иконка", background = { AmbientBackground() }) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
            if (VipIcons.unlocked) IconGroup("Эксклюзив", AppIcons.exclusive, current, ::pick)
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Секретные", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                Row { if (GoldIcon.unlocked) IconCell(AppIcons.gold, current == AppIcons.gold.id) { pick(AppIcons.gold) } else LockedCell(AppIcons.gold) }
                if (!GoldIcon.unlocked) Text("Золото открывается, когда все предметы в БРС на «5».", style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
            IconGroup("Темы", AppIcons.themed, current, ::pick)
            IconGroup("Дизайны", AppIcons.designs, current, ::pick)
            IconGroup("Цвета", AppIcons.colors, current, ::pick)
            Text("Иконка на рабочем столе поменяется через несколько секунд. Некоторые лаунчеры переносят её в конец списка приложений.",
                style = ft(Ts.caption), color = Ios.secondaryLabel)
            if (failed) Text("Android не дал сменить иконку. Попробуй ещё раз или перезапусти приложение.", style = ft(Ts.caption), color = Ios.orange)
        }
    }
}

@Composable
private fun IconGroup(title: String, list: List<AppIcons.Icon>, current: String, onPick: (AppIcons.Icon) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            // как LazyVGrid(.adaptive(minimum: 76), spacing: 14)
            val cols = maxOf(1, ((maxWidth.value + 14) / 90).toInt())
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                for (row in list.chunked(cols)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        for (i in row) Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { IconCell(i, current == i.id) { onPick(i) } }
                        repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun IconCell(icon: AppIcons.Icon, selected: Boolean, onClick: () -> Unit) {
    Pressable(onClick) {
        Column(Modifier.padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Box {
                Box(Modifier.scale(if (selected) 1.04f else 1f)
                    .shadow(if (icon.secret) 10.dp else 6.dp, RoundedCornerShape(16.dp),
                        ambientColor = if (icon.secret) rgb(1.0, 0.8, 0.3).copy(alpha = 0.6f) else Color.Black.copy(alpha = 0.25f),
                        spotColor = if (icon.secret) rgb(1.0, 0.8, 0.3).copy(alpha = 0.6f) else Color.Black.copy(alpha = 0.25f))
                    .size(66.dp).clip(RoundedCornerShape(16.dp))) {
                    Image(painterResource(icon.preview), icon.title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    if (icon.secret) IconShine()
                }
                if (selected) {
                    Box(Modifier.size(76.dp).offset((-5).dp, (-5).dp).border(3.dp, Brand.color, RoundedCornerShape(19.dp)))
                    Box(Modifier.align(Alignment.BottomEnd).offset(8.dp, 8.dp).size(22.dp).clip(CircleShape).background(Brand.color),
                        contentAlignment = Alignment.Center) { SfIcon("checkmark", size = 13.dp, tint = Color.White) }
                }
            }
            Text(icon.title, style = ft(Ts.caption2, if (selected) FontWeight.Bold else FontWeight.Medium), color = if (selected) Brand.color else Ios.secondaryLabel,
                maxLines = 1)
        }
    }
}

@Composable
private fun LockedCell(icon: AppIcons.Icon) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Box(Modifier.size(66.dp).clip(RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
            Image(painterResource(icon.preview), null, Modifier.fillMaxSize().blur(7.dp), contentScale = ContentScale.Crop)
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))
            SfIcon("lock.fill", size = 22.dp, tint = Color.White)
        }
        Text("???", style = ft(Ts.caption2, FontWeight.Medium), color = Ios.secondaryLabel)
    }
}

/** Блик, пробегающий по секретным иконкам */
@Composable
fun IconShine() {
    val t = rememberInfiniteTransition(label = "shine")
    val move by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, delayMillis = 300), RepeatMode.Restart), label = "shine")
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val w = maxWidth
        val h = maxHeight
        Box(Modifier.width(w * 0.45f).height(h * 1.6f)
            .offset(x = -w * 0.9f + (w * 2.2f) * move, y = -h * 0.3f)
            .graphicsLayer { rotationZ = 22f }
            .background(Brush.horizontalGradient(listOf(Color.Transparent, Color.White.copy(alpha = 0.6f), Color.Transparent))))
    }
}

// MARK: - Вид пары на экране блокировки (закреплённое уведомление)

@Composable
fun LiveStyleScreen() {
    var theme by prefString("live.theme", LiveTheme.NIGHT.raw)
    var layout by prefString("live.layout", LiveLayout.FULL.raw)
    var island by prefString("live.island", "timer")
    val schedule = ScheduleStore
    val ctx = LocalContext.current

    Screen("Вид пары") {
        FormColumn {
            FormSection("Так будет в уведомлении") {
                raw {
                    // «обои» под превью, чтобы было видно прозрачность
                    Box(Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(28.dp))
                        .background(Brush.verticalGradient(listOf(rgb(0.20, 0.28, 0.40), rgb(0.40, 0.45, 0.55)))).padding(10.dp)) {
                        androidx.compose.runtime.key(theme, layout) {
                            AndroidView({ c -> FrameLayout(c) }, Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp))) { frame ->
                                frame.removeAllViews()
                                try {
                                    val v = LiveLesson.previewViews(ctx, LiveState.sample(theme, layout)).apply(ctx, frame)
                                    frame.addView(v)
                                } catch (_: Throwable) {}
                            }
                        }
                    }
                }
            }
            FormSection("Размер") {
                segmented(LiveLayout.entries.map { it.raw to it.title }, layout, { layout = it; schedule.refreshSideEffects() })
            }
            FormSection("Таймер", footer = "Таймер идёт в строке уведомления — до начала пары или до её конца. «Только значок» — без таймера. Выключить всё — «Пара на экране блокировки» в Профиле.") {
                segmented(listOf("timer" to "Значок и таймер", "icon" to "Только значок"), island, { island = it; schedule.refreshSideEffects() })
            }
            FormSection("Тема", footer = "«Прозрачная» почти не видна на фоне обоев, «Стекло» подстраивается под светлую и тёмную тему телефона.") {
                raw {
                    BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                        val cols = maxOf(1, ((maxWidth.value + 10) / 106).toInt())
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            for (row in LiveTheme.entries.chunked(cols)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    for (t in row) {
                                        Pressable({ Haptics.tap(); theme = t.raw; schedule.refreshSideEffects() }, Modifier.weight(1f)) {
                                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Swatch(t, Modifier.fillMaxWidth().height(44.dp).border(if (theme == t.raw) 2.5.dp else 1.dp,
                                                    if (theme == t.raw) Brand.color else Ios.label.copy(alpha = 0.1f), RoundedCornerShape(12.dp)))
                                                Text(t.title, style = ft(Ts.caption2, FontWeight.SemiBold), color = Ios.label, maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis)
                                            }
                                        }
                                    }
                                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Swatch(t: LiveTheme, modifier: Modifier) {
    val dark = LocalDark.current
    Box(modifier.clip(RoundedCornerShape(12.dp)).background(Brush.verticalGradient(listOf(rgb(0.20, 0.28, 0.40), rgb(0.40, 0.45, 0.55)))),
        contentAlignment = Alignment.Center) {
        val tint = t.tint
        when {
            t == LiveTheme.CLEAR -> Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.06f)))
            tint != null -> Box(Modifier.fillMaxSize().background(tint))
            else -> Box(Modifier.fillMaxSize().background(if (dark) Color.Black.copy(alpha = 0.45f) else Color.White.copy(alpha = 0.55f)))
        }
        t.gradient("Лекция")?.let { (colors, diagonal) ->
            Box(Modifier.fillMaxSize().background(if (diagonal) Brush.linearGradient(colors) else Brush.horizontalGradient(colors)))
        }
        Text("10:10", style = ft(13f, FontWeight.Bold, Design.ROUNDED), color = if (t.adaptiveText) Color.White else t.accent)
    }
}
