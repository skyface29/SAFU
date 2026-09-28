package ru.student.safuhub.data

import ru.student.safuhub.core.RU

/** Адреса из РУЗ: коды корпусов вида «А-НСД17/1405» превращаем в нормальный адрес и аудиторию */
object AddressFormat {
    /** Известные сокращения улиц в кодах корпусов САФУ */
    val streets: Map<String, String> = mapOf(
        "НСД" to "наб. Северной Двины",
        "ЛОМ" to "просп. Ломоносова",
        "Л" to "просп. Ломоносова",
        "СБ" to "ул. Смольный Буян",
        "УР" to "ул. Урицкого",
        "УРИ" to "ул. Урицкого",
        "СЕВ" to "ул. Северодвинская",
        "ГАГ" to "ул. Гагарина",
        "ТИМ" to "ул. Тимме"
    )

    /** Учебные корпуса по номеру (код «АУК-10» = учебный корпус № 10) */
    val corpusAddresses: Map<String, String> = mapOf(
        "3" to "наб. Северной Двины, д. 17",
        "6" to "просп. Ломоносова, д. 4",
        "10" to "просп. Ломоносова, д. 2"
    )

    /** «в.з./д.о.», «дистанционно» и т.п. — пара не в корпусе */
    fun isRemote(raw: String): Boolean {
        val l = raw.lowercase(RU).replace(" ", "")
        return l.contains("д.о") || l.contains("в.з") || l.contains("дистанц") || l.contains("онлайн") ||
            l.contains("online") || l.contains("эиос") || l.contains("вебинар")
    }

    private val codeRegex = Regex("^(?:([А-Я])\\s*-\\s*)?([А-ЯЁ]{1,5})\\s*-?\\s*(\\d{1,3}[А-ЯЁ]?)(?:\\s*[/\\-]\\s*([0-9А-ЯЁA-Z.\\-]+))?$")

    data class Code(val building: String, val street: String, val house: String, val room: String)

    /** Разбор кода: «А-НСД17/1405», «А-НСД17-1405», «НСД 17/1405» */
    fun parseCode(raw: String): Code? {
        val t = raw.trim().uppercase(RU).replace("A", "А")
        val m = codeRegex.find(t) ?: return null
        fun g(i: Int) = m.groups[i]?.value ?: ""
        var city = g(1)
        var street = g(2)
        val house = g(3)
        val room = g(4)
        // «АУК» = «А» (Архангельск) + «УК» (учебный корпус); то же для «АНСД» и т.п.
        if (city.isEmpty() && street.length > 1 && street.startsWith("А")) {
            val rest = street.drop(1)
            if (rest == "УК" || streets[rest] != null) {
                city = "А"
                street = rest
            }
        }
        val building = (if (city.isEmpty()) "" else "$city-") + street + house
        return Code(building, street, house, room)
    }

    /** Адрес по коду без аудитории */
    fun addressText(c: Code): String {
        if (c.street == "УК") {
            corpusAddresses[c.house]?.let { return "учебный корпус № ${c.house}, $it" }
            return "учебный корпус № ${c.house}"
        }
        streets[c.street]?.let { return "$it, д. ${c.house}" }
        return "корпус ${c.street}-${c.house}"
    }

    /** Нормальные аудитория и адрес для показа (и для карт) */
    fun decode(room: String, address: String, buildings: List<Building>): Pair<String, String> {
        if (isRemote(address)) return room to address
        val c = parseCode(address) ?: return room to address
        val finalRoom = room.ifEmpty { c.room }
        buildings.firstOrNull { it.name.uppercase(RU) == c.building || it.name.uppercase(RU) == c.street + c.house }?.let {
            return finalRoom to it.address
        }
        return finalRoom to addressText(c)
    }

    /** Текст адреса для экрана */
    fun full(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return ""
        if (isRemote(trimmed)) return "Дистанционно / вне здания"
        parseCode(trimmed)?.let { return addressText(it) }
        return trimmed
    }
}
