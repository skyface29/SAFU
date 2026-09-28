package ru.student.safuhub.ui

import ru.student.safuhub.data.TeacherMode

// MARK: - Нижняя панель (вкладки)

enum class AppTab(val raw: String, val title: String, val icon: String) {
    HOME("home", "Главная", "house.fill"),
    SCHEDULE("schedule", "Пары", "calendar"),
    TASKS("tasks", "Задачи", "checklist"),
    FILES("files", "Файлы", "folder.fill"),
    SUBJECTS("subjects", "Предметы", "books.vertical.fill"),
    ATTENDANCE("attendance", "Посещаемость", "person.crop.circle.badge.checkmark"),
    DEVELOPER("developer", "Автор", "chevron.left.forwardslash.chevron.right"),
    PROFILE("profile", "Профиль", "person.crop.circle.fill");

    companion object {
        const val defaultRaw = "home,schedule,tasks,files,profile"

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
    }
}

// MARK: - Главный экран (блоки)

enum class HomeSection(val raw: String, val title: String, val icon: String) {
    NOW("now", "Сейчас / следующая пара", "clock.fill"),
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
        const val defaultRaw = "now,weather,commute,board,quick,subjects,tools,recents,sites"

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
    }
}
