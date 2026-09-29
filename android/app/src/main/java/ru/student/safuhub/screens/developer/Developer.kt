package ru.student.safuhub.screens.developer

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.withTimeoutOrNull
import ru.student.safuhub.App
import ru.student.safuhub.feature.eggs.Egg
import ru.student.safuhub.feature.eggs.Eggs
import ru.student.safuhub.feature.eggs.HackerMode
import ru.student.safuhub.feature.eggs.VipIcons
import ru.student.safuhub.feature.fx.Celebration
import ru.student.safuhub.feature.fx.CelebrationCenter
import ru.student.safuhub.feature.nuke.Nuke
import ru.student.safuhub.system.findActivity
import ru.student.safuhub.ui.design.AmbientBackground
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.glass
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.Divider
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import ru.student.safuhub.ui.theme.rgb

// MARK: - Разработчик и «О приложении»

object Developer {
    const val telegram = "skf29"
    const val name = "@skf29"
    const val role = "Студент САФУ"
    const val telegramURL = "https://t.me/$telegram"

    val version: String
        get() {
            val v = App.version.ifEmpty { "—" }
            val b = try {
                val info = App.ctx.packageManager.getPackageInfo(App.ctx.packageName, 0)
                if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode.toString() else @Suppress("DEPRECATION") info.versionCode.toString()
            } catch (_: Throwable) { "" }
            return if (b.isEmpty()) v else "$v ($b)"
        }
}

data class ChangelogEntry(val version: String, val items: List<String>) {
    companion object {
        val all: List<ChangelogEntry> = listOf(
            ChangelogEntry("12.5 · Android", listOf(
                "САФУ теперь и на Android: расписание из РУЗ, главная, задачи, файлы, БРС, сессия, дорога и автобусы, виджеты — всё как на iPhone",
                "Live Activity на Android — закреплённое уведомление с обратным отсчётом до конца пары и до автобуса",
                "Вход по отпечатку пальца или разблокировке телефона — вместо Face ID",
                "Лекции: запись с кнопками «⭐ Важно» и «Пауза» прямо в уведомлении, речь распознаёт Vosk на телефоне, конспект — GigaChat, Claude или без ИИ",
                "Резервная копия .safubackup открывается и на iPhone, и на Android — можно переезжать в обе стороны",
            )),
            ChangelogEntry("12.5", listOf(
                "Автобус: дистанционные пары («ауд. Дистанционное обучение») больше не держат тебя в городе — «домой» показывает ближайшие автобусы, а не «автобусов больше нет»",
                "Dynamic Island: до пары всегда обратный отсчёт, с часами — «5:28:48», а не время начала",
            )),
            ChangelogEntry("12.4", listOf(
                "Уведомления о новых письмах в почте САФУ: от кого и тема. Включи в Профиль → Учёба → «Уведомления о письмах»",
                "Цифра непрочитанных писем на иконке приложения, нажатие на уведомление сразу открывает почту",
                "Почта и другие сайты прокручиваются плавнее: живой фон главной больше не работает под открытым сайтом",
            )),
            ChangelogEntry("12.3", listOf(
                "Файлы предмета можно удалять: смахни файл влево → «Удалить» или удержи палец на файле. Закрепы этого файла убираются сами",
                "Там же — «Поделиться» файлом",
            )),
            ChangelogEntry("12.2", listOf(
                "Почта: кнопка «Закрыть» снова закрывает почту — раньше из неё было не выйти",
                "Та же починка для всех ссылок, которые открываются встроенным Safari: закрепы предмета, Wolfram|Alpha, карты",
                "Карточка пары на главной: «Дальше» после последней пары больше не уводит назад, выбранная пара не «уезжает» со временем",
                "Матрицы: не вылетает при добавлении строки или столбца, в Wolfram|Alpha уходят точные дроби",
            )),
            ChangelogEntry("12.1", listOf(
                "Студенту больше ничего не показывается из режима преподавателя: ни блока «Преподавателю», ни сайтов для сотрудников, ни «Всех преподавателей САФУ»",
                "«Преподаватели» у студента — только те, кто ведёт пары у тебя, и их ближайшие пары из твоего расписания",
            )),
            ChangelogEntry("12.0", listOf(
                "Новый инструмент «Матрицы»: сфоткай матрицу — числа распознаются прямо на телефоне, поправь если надо",
                "Определитель, обратная, ранг, ступенчатый вид, транспонирование и A² считаются сразу, ответ дробями (1/3, а не 0,333)",
                "Кнопка «Решение в Wolfram|Alpha» открывает сайт с этой матрицей: там же собственные числа и векторы",
            )),
            ChangelogEntry("11.9", listOf(
                "Файлы предмета и закреплённые файлы снова открываются — свой просмотр с кнопкой «Поделиться»",
                "Карточку пары на главной можно листать свайпом: влево — следующие пары, вправо — прошедшие, и кнопка «К текущей»",
            )),
            ChangelogEntry("11.8", listOf(
                "Почта открывается настоящим Safari внутри приложения — подсказки адресов, нормальный текст, всё как в Safari",
                "При открытии почты сохранённый пароль копируется на минуту — нажми на поле и «Вставить» (или автозаполнение iPhone)",
                "Телефон нагрелся — живой фон замирает, чтобы не тормозило",
                "Исправлено: файлы с телефона и из папки предмета снова закрепляются в «Под рукой»",
            )),
            ChangelogEntry("11.7", listOf(
                "Новые студенты сразу получают тёмно-синее оформление — как в первых версиях приложения",
            )),
            ChangelogEntry("11.6", listOf(
                "«Под рукой»: закрепи к предмету ссылки и файлы (курс в Sakai, методичка, таблица) — они в одно касание на экране предмета и в карточке «Сейчас»",
                "В карточке «Сейчас» — кнопка «Файлы предмета»: учебники и методички открываются сразу, прямо на паре",
                "Live Activity больше не зависает на «0:00»: началась пара — сама переключается на отсчёт до конца, закончилась — на следующую",
                "Dynamic Island во время пары — аккуратный обратный отсчёт до конца",
            )),
            ChangelogEntry("11.5", listOf(
                "Почта: при первом открытии страница сама обновляется один раз — текст сразу нормальный и подсказки адресов работают",
            )),
            ChangelogEntry("11.4", listOf(
                "Исправлено «Ваш браузер не поддерживается» в почте: приложение представляется Safari твоей версии iOS",
                "Пароли подставляются и в режиме «Как в Safari»",
                "Кнопка «Вставить пароль» появляется сама внизу страницы, когда сайт просит войти",
            )),
            ChangelogEntry("11.3", listOf(
                "Почта Samoware открывается «как в Safari» — чтобы работали подсказки адресов преподавателей",
                "Во встроенном браузере: ••• → «Как в Safari», если на сайте что-то не работает (и обратно)",
            )),
            ChangelogEntry("11.2", listOf(
                "Прозрачный виджет, как в Widgetsmith: Профиль → Виджет → «Прозрачный виджет» — скриншот пустого экрана, рамка на место виджета, и виджет «Пары · Прозрачный» показывает твои обои",
            )),
            ChangelogEntry("11.1", listOf(
                "Большая оптимизация: строки списков (файлы, пары) рисуются без живого стекла — прокрутка плавная",
                "В длинных списках прокрутка мягкая, объёмный наклон остался на главной",
                "Живой фон перерисовывается реже (24 кадра вместо 30) — меньше нагрузки и расхода батареи",
                "Убран виджет «Пары · свой стиль» (не работал). Готовые стили — в галерее виджетов",
            )),
            ChangelogEntry("10.9", listOf(
                "Dynamic Island стал компактным: до часа — таймер «12:34», дольше — просто время, без длинных «пн 8:20»",
                "Профиль → Оформление Live Activity → Dynamic Island: «Значок и таймер» или «Только значок»",
                "Быстрее вход: тяжёлая работа при запуске перенесена в фон и не мешает первому экрану",
                "Подсказка в Профиле → Виджет, где найти стили виджета",
            )),
            ChangelogEntry("10.8", listOf(
                "Почта: подсказки адресов (преподаватели) снова видны — сайт получает светлую схему, текст во всплывающих списках больше не белый на белом",
                "Новые виджеты: Сияние, Графит, Бордо, Хвоя, Закат, Светлый и Прозрачный — в галерее виджетов САФУ",
                "Основной виджет «Пары САФУ» не изменён",
            )),
            ChangelogEntry("10.7", listOf(
                "Почта и другие сайты: набранный текст больше не сливается с фоном (белое на белом)",
                "Список файлов листается плавнее: значки папок рисуются одним слоем",
            )),
            ChangelogEntry("10.6", listOf(
                "Сайты внутри приложения: кнопки «назад» и «вперёд» работают и на сайтах-приложениях (почта Samoware, Sakai)",
            )),
            ChangelogEntry("10.5", listOf(
                "Режим преподавателя помечен «Бета»: он в разработке, пары из РУЗ могут быть неполными",
                "Оформление → Интерфейс: стиль прокрутки (объём, мягко, без), компактная главная, размер текста в приложении",
                "Быстрее: виджет не создаёт форматы дат на каждую запись, экран преподавателя не пересчитывает пары при каждой отрисовке",
                "В режиме энергосбережения объёмная прокрутка сама становится мягкой",
            )),
            ChangelogEntry("10.4", listOf(
                "Пары преподавателя ищутся во всех школах и филиалах САФУ, а не только в одной — раньше терялась большая часть пар",
                "Своя школа загружается первой и показывается сразу, остальные школы и филиалы догружаются следом",
                "Modeus убран: сервис не работает, расписание — из РУЗ",
            )),
            ChangelogEntry("10.2", listOf(
                "Преподаватели переделаны: полное расписание любого преподавателя по всем группам школы — где он сейчас, по дням, с группами и аудиториями",
                "Расписание всей школы загружается один раз (около минуты) и хранится на телефоне — дальше поиск мгновенный",
                "«Преподаватели»: поиск по всем преподавателям школы, а не только по тем, кто ведёт у твоей группы",
                "Режим преподавателя: надёжнее сбор пар (повтор при сбое РУЗ), без автобусов, сессии, БРС и титульников",
                "Сайты преподавателя: Антиплагиат.ВУЗ, МООК САФУ, «Сотруднику», инструкции ИТ, библиотека",
            )),
            ChangelogEntry("10.1", listOf(
                "Вход по Face ID: включается и выключается в Профиле → Безопасность. Замок закрывает всё, даже открытые окна",
                "Для преподавателей: при регистрации «Я преподаватель» — ваши пары из РУЗ по всем группам школы, с номерами групп",
                "Карточка преподавателя на главной: пары сегодня и за неделю, ваши группы, посещаемость и рассылка",
                "Папки, файлы и любые карточки нажимаются целиком, а не только по названию",
                "Новая прокрутка: карточки наклоняются в объёме и плавно встают на место, списки выезжают волной",
            )),
            ChangelogEntry("10.0", listOf(
                "Виджет возвращён на схему 8.8 — ту, что точно показывалась. Старый виджет удали и добавь заново",
                "Виджет сам узнаёт группу: из приложения (если подпись даёт общие данные) или из Live Activity пары",
                "Сборка подписывает приложение и виджет с общей группой — AltStore, SideStore и другие включат обмен данными",
                "Вернулся прежний дизайн, а блоки главной теперь выезжают по очереди и мягко всплывают при прокрутке",
                "Ядерный гриб: экран разлетается осколками с раскалёнными краями, лучи вспышки, сотни искр со шлейфами",
                "Конфетти и салют больше не тормозят приложение: анимация останавливается, как только закончилась",
            )),
            ChangelogEntry("9.9", listOf(
                "Удержи любой блок или плитку на главной и перетащи — порядок меняется",
                "Погода: раскрой — прогноз на сутки листается влево-вправо",
            )),
            ChangelogEntry("9.8", listOf(
                "Погода — одна строка: температура, ветер и что надеть. Нажми — прогноз по часам",
                "Пустой виджет показывает, почему не получил данные от приложения",
            )),
            ChangelogEntry("9.7", listOf(
                "Виджет получает группу и пары от приложения через общую связку ключей — без заполнения",
                "Профиль → Виджет → «Проверить связь с виджетом»: сразу видно, работает ли автоподтягивание на твоей подписи",
                "Погода стала компактной: одна строка с температурой и ветром и сразу «что надеть», подробности — по нажатию",
            )),
            ChangelogEntry("9.6", listOf(
                "Виджет: номер группы, школа и оформление снова задаются в самом виджете (удержи → «Изменить виджет») — это работает без общих данных с приложением",
                "Погода на главной: сейчас, ощущается, ветер, прогноз по часам, погода после пар и что надеть. Город — по геолокации: Архангельск или Северодвинск",
            )),
            ChangelogEntry("9.5", listOf(
                "Виджет вернулся на проверенную схему из 8.8 (которая точно работала) — без «Изменить виджет»",
                "Группу и пары виджет получает от приложения сам; оформление и преподаватель — в Профиле → Виджет",
                "Кнопка «Обновить виджет сейчас» в Профиле",
            )),
            ChangelogEntry("9.4", listOf(
                "Виджет починен по-настоящему: приложение само передаёт ему группу и пары на 3 недели вперёд — без настройки и даже без связи с РУЗ",
                "Раньше виджет не видел данные приложения вообще (общие данные не работают после переподписи) — теперь есть свой «мост»",
            )),
            ChangelogEntry("9.3", listOf(
                "Виджет загружается надёжнее: больше времени на медленный РУЗ, найденная группа запоминается, после сбоя не «засыпает» на час",
                "В настройке виджета можно выбрать высшую школу — первая загрузка быстрее",
                "«Добро пожаловать» после регистрации теперь исчезает само",
            )),
            ChangelogEntry("9.2", listOf(
                "Новое приветствие: падающие снежинки, светящаяся эмблема с вращающимся кольцом, всё появляется плавно по очереди",
                "Регистрация красивее: анимации выбора, заголовки и карточки выезжают, в конце — салют",
                "Шаг «Роль и дорога»: свой автобус из списка, добавить свой маршрут или вставить код от одногруппника — никакого навязанного номера",
            )),
            ChangelogEntry("9.1", listOf(
                "Приветствие проще и красивее: 4 коротких шага — имя, школа, группа, и всё настроится само",
                "Резервная копия теперь включает фото доски по парам, лекции и аватар, собирается по частям — без вылетов даже на гигабайтах фото",
                "Восстановить копию можно прямо с первого экрана — удобно при переезде на новый телефон",
                "Виджет починен: номер группы и оформление задаются прямо в нём (удержи виджет → «Изменить виджет»), 7 тем и переключатель преподавателя",
                "Служебная папка модели распознавания речи больше не видна во вкладке «Файлы»",
            )),
            ChangelogEntry("9.0", listOf(
                "Новая регистрация: имя и ФИО, аватар, высшая школа, группа из списка РУЗ по курсам с поиском, роль, дорога",
                "После регистрации всё подтягивается само: расписание, папки предметов, уведомления, виджет, ФИО и школа для титульника",
                "Сменить группу или школу — Профиль → «Пройти настройку заново»",
                "Виджет берёт группу из приложения, а не из настроек по умолчанию",
                "Убраны чужие имя и группа по умолчанию — у каждого студента своё",
            )),
            ChangelogEntry("8.8", listOf(
                "PDF с фото доски собирается в разы быстрее и в фоне — ничего не зависает, видно «Собираю PDF… 5 из 24»",
                "PDF готовится заранее, пока смотришь фото пары, и запоминается — повторная отправка мгновенная",
                "Фото читаются сразу уменьшенными: миниатюры, галерея и распознавание досок быстрее и едят меньше памяти",
                "Доски распознаются по одной — много фото подряд больше не перегружают память",
                "Миниатюры файлов больше не запрашиваются в 4 раза крупнее нужного и кэшируются",
                "Тени карточек рисуются только у подложки — прокрутка плавнее",
            )),
            ChangelogEntry("8.7", listOf(
                "Салют! В конце последней пары — фейерверк с конфетти, в конце недели — большой салют. Срабатывает ровно в момент окончания пар",
                "Если приложение закрыто — приходит уведомление «Пары всё!» или «Неделя закрыта!», нажал — и салют",
                "Сохранённые пароли открываются только по Face ID; внутри можно посмотреть и скопировать пароль (буфер очистится через минуту)",
            )),
            ChangelogEntry("8.6", listOf(
                "Свой аватар: нажми на кружок в Профиле — выбрать фото или сфоткаться. Аватар виден и на главной",
                "Фото доски: в карточке на главной видны все снимки, полоска сама доезжает до самых новых",
                "Миниатюры обновляются после выпрямления снимка",
            )),
            ChangelogEntry("8.5", listOf(
                "Живой фон анимируется только на верхнем экране: открыл лист поверх главной — фон главной замирает",
                "Листопад без размытия на весь экран каждый кадр — заметно меньше нагрузка на видеочип и батарею",
                "Расписание на недели вперёд и счётчики файлов больше не пересчитываются на каждой отрисовке",
                "При нехватке памяти и уходе в фон сбрасываются кэши, сетевой кэш ограничен",
                "Возврат в приложение (Пункт управления, шторка) больше не запускает полную синхронизацию каждый раз",
                "Шторка в переключателе приложений — размытый экран со снежинкой",
            )),
            ChangelogEntry("8.4", listOf(
                "Безопасность: пароль подставляется только своему сайту и только по HTTPS, скрипт автозаполнения изолирован от скриптов сайта",
                "Сайты больше не могут сами открыть другие приложения — только по твоему нажатию",
                "В переключателе приложений экран прячется за заставкой (можно выключить в Профиле)",
                "Быстрее: ключи и статус ИИ не читаются заново на каждой отрисовке, миниатюры фото кэшируются, временные файлы отправки чистятся",
            )),
            ChangelogEntry("8.3", listOf(
                "Кнопка камеры прямо на Live Activity и в Dynamic Island — фото доски идущей пары в один тап",
                "Фото доски открываются галереей: листай вбок, приближай щипком или двойным тапом, смахни вниз — закрыть",
                "Карточка «Фото доски» на главной свёрнута в одну строку с кнопкой камеры, разворачивается по нажатию",
                "Исправлено пустое окно при отправке PDF",
            )),
            ChangelogEntry("8.2", listOf(
                "Фото доски по парам: строго по времени съёмки, с номерами — и одной кнопкой PDF для группы (или фото по порядку)",
                "После пары приходит напоминание «отправь ребятам фото» — нажал, и сразу окно отправки",
                "Камера на доску везде: карточка «Фото доски» на главной, страница предмета, карточка пары, плитка, ссылка safu://board",
                "Главная настраивается полностью: свои плитки (сайт, инструмент, предмет, вкладка, камера, стикер), цвет, значок, размер, порядок",
                "Live Activity: секунды таймера больше не обрезаются, когда до конца пары больше часа",
            )),
            ChangelogEntry("8.1", listOf(
                "GigaChat: исправлено «Не удалось проверить защищённое соединение» — приложение подставляет промежуточный сертификат Минцифры (только для GigaChat, в систему ничего не ставится)",
                "Проверка подключения показывает точную причину ошибки",
            )),
            ChangelogEntry("8.0", listOf(
                "Лекции: кнопка «Проверить подключение» — видно, работает ли GigaChat, ИИ Apple и Claude, и что не так",
                "10 строгих цветов: тёмно-синий, САФУ, бордо, хвоя, петроль, сланец, олива, кофе, слива, чернила",
                "Конспекты от GigaChat и ИИ Apple разбираются надёжнее, новый ключ GigaChat применяется сразу",
            )),
            ChangelogEntry("7.9", listOf(
                "Конспекты лекций бесплатно и без VPN: GigaChat от Сбера, ИИ Apple прямо на телефоне или Claude — на выбор",
                "Конспект без ИИ стал лучше: разбивка лекции по 10 минут, важное и термины",
            )),
            ChangelogEntry("7.8", listOf(
                "Лекции: запись → текст (Whisper прямо на телефоне) → красивый конспект от Claude. ⭐ Важно — отметить главное",
                "Конспект сохраняется: читай, переписывай своими словами, отправляй в заметки",
            )),
            ChangelogEntry("7.7", listOf(
                "Доска → текст: фото доски само выпрямляется, текст распознаётся, по нему работает поиск",
                "Умный подъём: будильник под первую пару с учётом автобуса, сборов и мороза, «пора спать» по циклам сна",
            )),
            ChangelogEntry("7.6.2", listOf(
                "Исправлено: поиск свободных аудиторий мог подменить твоё расписание чужой группой. Память РУЗ очищена и загружена заново",
                "Machinarium: живая картина свалки — горы хлама в смоге, дирижабль, туман",
            )),
            ChangelogEntry("7.6", listOf(
                "Темы: Ясный, iOS 6 и Machinarium — меняют всё сразу, со своими иконками",
                "Заметки по-взрослому: много заметок, чек-листы, цвет, предмет, закрепление, поиск",
                "Свободные аудитории: полное название из РУЗ, твой корпус — первым",
                "БРС: оценки из Sakai читаются и со страницы журнала, подробный отчёт «Что нашлось»",
                "«Что нового» сворачивается — видна только последняя версия",
            )),
            ChangelogEntry("7.5", listOf(
                "БРС: вход в Sakai и Личный кабинет прямо на экране БРС, видно, где вход есть",
                "«Где пара»: тап по аудитории — корпус, этаж, своя подсказка «как найти», маршрут",
                "Свободные аудитории: где посидеть в окно, по расписанию всех групп школы",
                "Замены и отмены приходят уведомлением, даже когда приложение закрыто",
                "Погода к автобусу: мороз, снег, ветер — и совет, как одеться",
                "Секретные иконки. Одна — за сессию на «5»",
                "Приложение быстрее: меньше лишних вычислений при каждой отрисовке, быстрее запуск",
            )),
            ChangelogEntry("7.4", listOf(
                "Пасхалки перепрятаны. Ищи заново — одна теперь очень громкая",
                "Мини-игра стала круче: день и ночь, лоси, турбо, комбо и северное сияние",
                "Убран лишний пункт «Поддержка» из профиля",
            )),
            ChangelogEntry("7.3", listOf(
                "БРС подтягивается сама: журнал оценок Sakai и Личный кабинет",
                "Live Activity висит всегда: нет пар — показывает следующую с днём недели",
                "Фоновое обновление Live Activity",
                "Расписание картинкой — красиво отправить в чат группы",
                "Пасхалки и мини-игра. Найдёшь все?",
            )),
            ChangelogEntry("7.2", listOf(
                "БРС: баллы, прогноз оценки, сколько не хватает до «4», «5» и автомата",
                "Режим сессии: отсчёт, билеты «знаю / повторить», случайный билет, итоги",
                "Опросы группы: отправил в чат — отметил ответы — готовые итоги",
                "Фон и цвет по сезону: снег, цветение, лето, листопад",
                "Праздничные анимации: конец пар, конец недели, задачи, экзамены, праздники",
                "Статистика: «прошло из всех» по каждому предмету",
                "Приложение стало заметно быстрее: кеш расписания, фон на паузе вне экрана",
            )),
            ChangelogEntry("7.1", listOf(
                "Свои автобусы и обмен маршрутами с группой",
                "Крестик на Live Activity автобуса",
                "Оформление: стили, фоны, карточки, шрифты, листопад",
            )),
        )
    }
}

@Composable
fun DeveloperScreen() {
    val ctx = LocalContext.current
    var taps by remember { mutableIntStateOf(0) }
    var versionTaps by remember { mutableIntStateOf(0) }
    var spin by remember { mutableStateOf(false) }
    var allVersions by remember { mutableStateOf(false) }

    fun checkCode(code: String) {
        if (!VipIcons.tryUnlock(code)) {
            Dialogs.alert("Неверный код")
            return
        }
        Haptics.success()
        CelebrationCenter.fire(Celebration("Эксклюзив открыт 💎", "Бриллиант, Зачётка, Сталь, Значок и Билет — в разделе «Иконка»",
            Celebration.Style.Emoji(listOf("💎", "👑", "✨", "🔐")), force = true))
    }

    fun nukeDone() {
        val first = Eggs.mark(Egg.NUKE)
        CelebrationCenter.fire(Celebration(if (first) "Пасхалка найдена ☢️" else "Ты снова выжил ☢️",
            if (first) "Ядерный гриб. Разработчик просил не трогать" else "Приложение собрано обратно. Почти",
            Celebration.Style.Emoji(listOf("☢️", "💥", "🍄", "🔥")), force = true))
    }

    Screen("Разработчик", background = { AmbientBackground() }) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            // герой
            Glass(28.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    val rot by animateFloatAsState(if (spin) 360f else 0f, spring(dampingRatio = 0.7f, stiffness = 80f), label = "spin")
                    Box(Modifier.size(110.dp).graphicsLayer { rotationY = rot; cameraDistance = 12 * density }
                        .shadow(18.dp, CircleShape, ambientColor = Brand.color.copy(alpha = 0.45f), spotColor = Brand.color.copy(alpha = 0.45f))
                        .clip(CircleShape).background(Brand.gradient)
                        .clickable(remember { MutableInteractionSource() }, null) {
                            taps += 1
                            Haptics.tap()
                            spin = !spin
                            if (taps == 7) {
                                taps = 0
                                // снимок экрана — его и разнесёт; без анимации появления, чтобы взрывалось само приложение
                                Nuke.detonate(ctx.findActivity()) { nukeDone() }
                            }
                        }, contentAlignment = Alignment.Center) {
                        SfIcon("chevron.left.forwardslash.chevron.right", size = 40.dp, tint = Color.White)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        // секрет: держать ник 3 секунды → поле для кода
                        Text(Developer.name, style = ft(Ts.title2, FontWeight.ExtraBold, Design.ROUNDED), color = Ios.label,
                            modifier = Modifier.pointerInput(Unit) {
                                awaitEachGesture {
                                    awaitFirstDown()
                                    val released = withTimeoutOrNull(3000) { waitForUpOrCancellation() }
                                    if (released == null) {
                                        Haptics.tap()
                                        Dialogs.prompt("Код", placeholder = "Код", button = "Открыть", secure = true) { checkCode(it) }
                                    }
                                }
                            })
                        Text("Разработчик приложения", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Brand.color)
                        Text(Developer.role, style = ft(Ts.caption), color = Ios.secondaryLabel, textAlign = TextAlign.Center)
                    }
                }
            }

            // ссылки
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Pressable({ Share.url(ctx, Developer.telegramURL) }, Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                        .background(Brush.horizontalGradient(listOf(rgb(0.16, 0.62, 0.92), rgb(0.13, 0.50, 0.85)))).padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SfIcon("paperplane.fill", size = 17.dp, tint = Color.White)
                        Text("Написать в Telegram", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Color.White)
                        Spacer(Modifier.weight(1f))
                        Text("@${Developer.telegram}", style = ft(Ts.subheadline, FontWeight.Bold), color = Color.White)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SmallLink("ladybug.fill", "Нашёл баг", "Привет! Нашёл баг в САФУ ${Developer.version}: ", Modifier.weight(1f))
                    SmallLink("lightbulb.fill", "Есть идея", "Привет! Идея для САФУ: ", Modifier.weight(1f))
                }
            }

            EggsCard()

            // о приложении
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("О приложении", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                    Text("«САФУ» собирает в одном месте расписание из РУЗ, сайты университета, задачи, файлы по предметам, БРС, сессию и дорогу до универа. Без рекламы и лишних разрешений: пароли и данные хранятся только на телефоне.",
                        style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                    Divider()
                    InfoRow("Версия", Developer.version, Modifier.clickable(remember { MutableInteractionSource() }, null) {
                        versionTaps += 1
                        if (versionTaps >= 5) {
                            versionTaps = 0
                            HackerMode.toggle()
                                            }
                    })
                    InfoRow("Платформа", "Android 8+, Jetpack Compose")
                    InfoRow("Для кого", "Студенты САФУ")
                }
            }

            // что нового
            Glass(22.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(16.dp).animateContentSize(spring(dampingRatio = 0.85f, stiffness = 300f)),
                    verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Что нового", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label)
                    for (e in if (allVersions) ChangelogEntry.all else ChangelogEntry.all.take(1)) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Версия ${e.version}", style = ft(Ts.caption, FontWeight.ExtraBold), color = Brand.color)
                            for (i in e.items) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Box(Modifier.padding(top = 7.dp).size(5.dp).clip(CircleShape).background(Brand.color))
                                    Text(i, style = ft(Ts.subheadline), color = Ios.label)
                                }
                            }
                        }
                    }
                    if (ChangelogEntry.all.size > 1) {
                        Pressable({ Haptics.tap(); allVersions = !allVersions }, Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth().clip(CircleShape).background(Brand.color.copy(alpha = 0.10f)).padding(vertical = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                                Text(if (allVersions) "Скрыть прошлые версии" else "Прошлые версии (${ChangelogEntry.all.size - 1})",
                                    style = ft(Ts.caption, FontWeight.Bold), color = Brand.color)
                                val r by animateFloatAsState(if (allVersions) 180f else 0f, label = "chev")
                                SfIcon("chevron.down", size = 13.dp, tint = Brand.color, modifier = Modifier.graphicsLayer { rotationZ = r })
                            }
                        }
                    }
                }
            }

            Text("Сделано с ❤️ между Северодвинском и Архангельском", style = ft(Ts.caption), color = Ios.secondaryLabel,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        }
    }
}

@Composable
private fun SmallLink(icon: String, title: String, text: String, modifier: Modifier) {
    val ctx = LocalContext.current
    Pressable({
        Share.copy(text)
        Haptics.success()
        Share.url(ctx, Developer.telegramURL)
    }, modifier) {
        Column(Modifier.fillMaxWidth().glass(18.dp).padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SfGradientIcon(icon, size = 22.dp)
            Text(title, style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.label)
        }
    }
}

@Composable
private fun EggsCard() {
    val found = Egg.entries.count { Eggs.has(it) }
    Glass(22.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Пасхалки", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), color = Ios.label, modifier = Modifier.weight(1f))
                Text("$found из ${Egg.entries.size}", style = ft(Ts.caption, FontWeight.ExtraBold), color = Brand.color)
            }
            for (e in Egg.entries) {
                val has = Eggs.has(e)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Ios.label.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
                        if (has) SfGradientIcon(e.icon, size = 17.dp) else SfIcon("questionmark", size = 17.dp, tint = Ios.secondaryLabel)
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text(if (has) e.title else "???", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                        Text(e.hint, style = ft(Ts.caption), color = Ios.secondaryLabel)
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoRow(a: String, b: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(a, style = ft(Ts.subheadline), color = Ios.secondaryLabel)
        Spacer(Modifier.weight(1f))
        Text(b, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
    }
}
