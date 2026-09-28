package ru.student.safuhub.feature.eggs

import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.RU
import ru.student.safuhub.feature.fx.Celebration
import ru.student.safuhub.feature.fx.CelebrationCenter
import ru.student.safuhub.feature.grades.ControlType
import ru.student.safuhub.feature.grades.GradesStore
import ru.student.safuhub.ui.theme.AccentTheme
import ru.student.safuhub.ui.theme.AppFont
import ru.student.safuhub.ui.theme.BackdropStyle
import java.security.MessageDigest

// MARK: - Пасхалки

enum class Egg(val raw: String, val title: String, val hint: String, val icon: String) {
    NUKE("nuke", "Ядерный гриб", "Автор любит, когда его трогают. Много раз. Последствия на твоей совести.", "atom"),
    HACKER("hacker", "Режим хакера", "Версия приложения тоже любит внимание.", "terminal.fill"),
    ORACLE("oracle", "Шар предсказаний", "Сомневаешься перед парой? Встряхни всё как следует.", "sparkles"),
    GAME("game", "Трасса 150", "Мелкий шрифт тоже кто-то читает. Там, где ждут автобус. И не торопись.", "gamecontroller.fill"),
    ARRIVED("arrived", "Успел на пару", "Доедь до Архангельска и не попади в яму.", "flag.checkered"),
    GOLD("gold", "Золотая сессия", "Закрой все предметы в БРС на «5». Награда блестит.", "trophy.fill"),
}

object Eggs {
    private const val key = "eggs.found"

    val all: Set<String> get() = (Defaults.stringArray(key) ?: emptyList()).toSet()
    fun has(e: Egg) = e.raw in all

    /** true — найдена впервые */
    fun mark(e: Egg): Boolean {
        val f = all.toMutableSet()
        if (!f.add(e.raw)) return false
        Defaults.set(key, f.toList())
        return true
    }
}

// MARK: - Секретные иконки

object GoldIcon {
    val unlocked: Boolean get() = Defaults.bool("icon.gold")

    /** Все предметы с баллами или итогом — на «5» (зачёты — сданы), и хотя бы один экзамен */
    fun allExcellent(): Boolean {
        val list = GradesStore.items.filter { it.entries.isNotEmpty() || it.result.isNotEmpty() }
        if (list.size < 2 || list.none { it.controlType != ControlType.CREDIT }) return false
        return list.all { g ->
            if (g.controlType == ControlType.CREDIT) g.result == "зачёт" || (g.result.isEmpty() && g.total >= g.pass)
            else g.result == "5" || (g.result.isEmpty() && g.forecast == "5")
        }
    }

    fun checkUnlock() {
        if (unlocked || !allExcellent()) return
        Defaults.set("icon.gold", true)
        Eggs.mark(Egg.GOLD)
        CelebrationCenter.fire(Celebration("Сессия на «5» 🏆", "Открыта золотая иконка — выбери её в разделе «Иконка»",
            Celebration.Style.Emoji(listOf("🏆", "🥇", "⭐️", "✨")), force = true))
    }
}

/**
 * Эксклюзивные иконки (Бриллиант, Зачётка, Сталь, Значок, Билет) — только по секретному коду.
 * В приложении хранится лишь SHA-256 от кода: по исходникам его не узнать.
 */
object VipIcons {
    val unlocked: Boolean get() = Defaults.bool("icon.vip")

    private const val salt = "safu.vip.7f3c1e"
    private const val hash = "4809e54cafe945a66ead1bf231dc97c462cde6280fee898cc911ee5b1e2be533"

    /** Регистр, пробелы, дефисы/тире и «ё» не важны */
    private fun normalize(s: String): String {
        var t = s.lowercase(RU).replace("ё", "е")
        for (ch in listOf(" ", "-", "–", "—", "\n", "\t")) t = t.replace(ch, "")
        return t
    }

    fun check(code: String): Boolean {
        val digest = MessageDigest.getInstance("SHA-256").digest((salt + normalize(code)).toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) } == hash
    }

    /** true — код верный, иконки открыты */
    fun tryUnlock(code: String): Boolean {
        if (!check(code)) return false
        Defaults.set("icon.vip", true)
        return true
    }
}

// MARK: - Встряхнуть телефон → шар предсказаний

object Oracle {
    val answers = listOf(
        "Сегодня спросят именно тебя. Шучу. Или нет",
        "Препод опоздает на 15 минут",
        "Автобус придёт вовремя. Редкий день — цени",
        "Лабу примут с первого раза",
        "Сегодня лучше сесть на первую парту",
        "Автомат близко. Не расслабляйся",
        "Звёзды советуют открыть конспект",
        "Пара отменится… в параллельной вселенной",
        "Кофе перед парой обязателен",
        "Всё получится. Шар уверен на 146%",
        "Сегодня день, чтобы сдать долг",
        "Спроси старосту — он знает",
        "Лучше выйти на один автобус раньше",
        "Ответ туманен. Встряхни ещё раз",
    )

    fun fire() {
        val first = Eggs.mark(Egg.ORACLE)
        CelebrationCenter.fire(Celebration("🔮 " + answers.random(),
            if (first) "Пасхалка найдена! Встряхивай, когда сомневаешься" else "Шар предсказаний · встряхни ещё",
            Celebration.Style.Emoji(listOf("🔮", "✨", "⭐️")), force = true))
    }
}

// MARK: - Режим хакера: матрица

object HackerMode {
    fun toggle() {
        val on = !Defaults.bool("egg.hackerOn")
        Defaults.set("egg.hackerOn", on)
        if (on) {
            Eggs.mark(Egg.HACKER)
            Defaults.set("egg.prevBg", Defaults.string("bg.style") ?: "")
            Defaults.set("egg.prevTheme", Defaults.string("theme") ?: "")
            Defaults.set("bg.style", BackdropStyle.MATRIX.raw)
            Defaults.set("theme", AccentTheme.LIME.raw)
            Defaults.set("ui.font", AppFont.MONO.raw)
            Defaults.set("ui.scheme", 2)
            Defaults.set("theme.seasonal", false)
            CelebrationCenter.fire(Celebration("> access granted_", "Режим хакера включён. Повтори, чтобы выйти",
                Celebration.Style.Emoji(listOf("💻", "🔐", "🟩", "0️⃣", "1️⃣")), force = true))
        } else {
            Defaults.set("bg.style", Defaults.string("egg.prevBg") ?: BackdropStyle.GLOW.raw)
            Defaults.set("theme", Defaults.string("egg.prevTheme") ?: AccentTheme.BLUE.raw)
            Defaults.set("ui.font", AppFont.ROUNDED.raw)
            Defaults.set("ui.scheme", 0)
            CelebrationCenter.fire(Celebration("> logout_", "Обычный режим", Celebration.Style.Confetti, force = true))
        }
    }
}
