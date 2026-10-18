package ru.student.safuhub.ui

import ru.student.safuhub.core.Defaults
import ru.student.safuhub.data.TeacherMode

// MARK: - Нижняя панель (вкладки)

enum class AppTab(val raw: String, val title: String, val icon: String) {
    HOME("home", "Главная", "house.fill"),
    SCHEDULE("schedule", "Пары", "calendar"),
    HOMEWORK("homework", "ДЗ", "book.closed.fill"),
    TASKS("tasks", "Задачи", "checklist"),
    FILES("files", "Файлы", "folder.fill"),
    SUBJECTS("subjects", "Предметы", "books.vertical.fill"),
    ATTENDANCE("attendance", "Посещаемость", "person.crop.circle.badge.checkmark"),
    DEVELOPER("developer", "Автор", "chevron.left.forwardslash.chevron.right"),
    PROFILE("profile", "Профиль", "person.crop.circle.fill");

    companion object {
        const val defaultRaw = "home,schedule,homework,files,profile"

        fun of(raw: String?) = entries.firstOrNull { it.raw == raw }

        /** Порядок вкладок из настроек. Профиль всегда есть — иначе не попасть в настройки. */
        fun parse(raw: String): List<AppTab> {
            val list = mutableListOf<AppTab>()
            for (part in raw.split(",")) {
                val t = of(part) ?: continue
                if (!list.contains(t)) list.add(t)
            }
            if (!list.contains(PROFILE)) list.add(PROFILE)
            return list
        }

        fun join(list: List<AppTab>) = list.joinToString(",") { it.raw }

        /** Раздел ДЗ — один раз добавляем в панель тем, у кого уже настроены вкладки */
        fun addHomeworkOnce() {
            if (Defaults.bool("tabs.homeworkAdded")) return
            Defaults.set("tabs.homeworkAdded", true)
            val raw = Defaults.string("tabs.order") ?: return
            val list = parse(raw).toMutableList()
            if (list.contains(HOMEWORK)) return
            val i = list.indexOf(SCHEDULE)
            if (i >= 0) list.add(i + 1, HOMEWORK) else list.add(minOf(1, list.size), HOMEWORK)
            // «Задачи» в панели больше не нужны — их место заняла «Домашка» (задачи остаются в инструментах)
            if (list.size > 5) list.remove(TASKS)
            Defaults.set("tabs.order", join(list))
        }
    }
}

// MARK: - Главный экран (блоки)

enum class HomeSection(val raw: String, val title: String, val icon: String) {
    NOW("now", "Сейчас / следующая пара", "clock.fill"),
    HOMEWORK("homework", "Домашка", "book.closed.fill"),
    COMMUTE("commute", "Дорога (мой автобус)", "bus.fill"),
    SESSION("session", "Отсчёт до сессии", "graduationcap.fill"),
    QUICK("quick", "Быстрые кнопки", "circle.grid.2x2.fill"),
    SUBJECTS("subjects", "Предметы", "books.vertical.fill"),
    TOOLS("tools", "Инструменты", "wrench.and.screwdriver.fill"),
    RECENTS("recents", "Недавние сайты", "clock.arrow.circlepath"),
    SITES("sites", "Все сайты", "globe"),
    TODAY("today", "Неделя и дедлайны", "calendar.badge.clock"),
    BOARD("board", "Фото доски", "camera.viewfinder"),
    TILES("tiles", "Мои плитки", "square.grid.3x2.fill"),
    WEATHER("weather", "Погода и что надеть", "cloud.sun.fill"),
    TEACHER("teacher", "Преподавателю", "person.crop.rectangle.stack.fill");

    /** Блок «Преподавателю» студенту не показываем вообще */
    val available: Boolean get() = this != TEACHER || TeacherMode.isOn

    companion object {
        /** Погода и автобус новичкам не показываем — их добавляют сами в «Настроить главную» */
        const val defaultRaw = "now,homework,quick,tools,sites"

        fun of(raw: String?) = entries.firstOrNull { it.raw == raw }

        fun parse(raw: String): List<HomeSection> {
            val list = mutableListOf<HomeSection>()
            for (part in raw.split(",")) {
                val s = of(part) ?: continue
                if (!list.contains(s) && s.available) list.add(s)
            }
            return list
        }

        fun join(list: List<HomeSection>) = list.joinToString(",") { it.raw }

        /** Показать или убрать блок «Домашка» на главной */
        fun setHomework(on: Boolean) {
            val list = (Defaults.string("home.order") ?: defaultRaw).split(",").filter { it.isNotEmpty() && it != "homework" }.toMutableList()
            if (on) { val i = list.indexOf("now"); if (i >= 0) list.add(i + 1, "homework") else list.add(0, "homework") }
            Defaults.set("home.order", list.joinToString(","))
        }

        /** Блок «Домашка» — один раз ставим на главную сразу под карточкой пары */
        fun addHomeworkOnce() {
            if (Defaults.bool("home.homeworkAdded")) return
            Defaults.set("home.homeworkAdded", true)
            val raw = Defaults.string("home.order") ?: return
            if (raw.split(",").contains("homework")) return
            setHomework(true)
        }

        /** Разгрузка главной (один раз): убираем блоки, которые повторяют другие места приложения */
        fun leanOnce() {
            if (Defaults.bool("home.lean.v1")) return
            Defaults.set("home.lean.v1", true)
            val raw = Defaults.string("home.order") ?: return
            val drop = setOf("recents", "subjects", "board")
            val list = raw.split(",").filter { it.isNotEmpty() && it !in drop }.toMutableList()
            // сайты — в самый низ: это справочник, а не то, что нужно каждое утро
            if (list.remove("sites")) list.add("sites")
            Defaults.set("home.order", (list.ifEmpty { defaultRaw.split(",") }).joinToString(","))
        }
    }
}
