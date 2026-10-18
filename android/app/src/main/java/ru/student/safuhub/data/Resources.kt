package ru.student.safuhub.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import ru.student.safuhub.core.Defaults
import ru.student.safuhub.core.RU
import ru.student.safuhub.core.decode
import ru.student.safuhub.core.encode
import ru.student.safuhub.core.newId
import java.net.URI

@Serializable
data class Resource(
    val id: String = newId(),
    val title: String = "",
    val subtitle: String = "",
    val url: String = "",
    val icon: String = "link",
    val category: String = "Мои ссылки",
    val pinned: Boolean = false,
) {
    val isValid: Boolean
        get() {
            if (title.trim().isEmpty()) return false
            val u = try { URI(url.trim()) } catch (_: Throwable) { return false }
            val scheme = u.scheme?.lowercase() ?: return false
            return (scheme == "http" || scheme == "https") && !u.host.isNullOrEmpty()
        }

    val host: String? get() = try { URI(url).host } catch (_: Throwable) { null }

    companion object {
        val defaults: List<Resource>
            get() = listOf(
                Resource(title = "Sakai", subtitle = "Курсы и задания", url = "https://sakai.narfu.ru", icon = "graduationcap.fill", category = "Учёба"),
                Resource(title = "РУЗ", subtitle = "Расписание", url = "https://ruz.narfu.ru", icon = "clock.fill", category = "Учёба"),
                Resource(title = "Почта", subtitle = "Samoware", url = "https://edu.narfu.ru", icon = "envelope.fill", category = "Почта и документы"),
                Resource(title = "Р7-Офис", subtitle = "Документы", url = "https://office.edu.narfu.ru", icon = "doc.text.fill", category = "Почта и документы"),
                Resource(title = "САФУ", subtitle = "narfu.ru", url = "https://narfu.ru", icon = "building.columns.fill", category = "Университет"),
                Resource(title = "Студенту", subtitle = "Справочник", url = "https://narfu.ru/forstudent/", icon = "book.fill", category = "Университет"),
                Resource(title = "ВШИТАС", subtitle = "Высшая школа", url = "https://narfu.ru/hsitas/", icon = "cpu", category = "Университет"),
                Resource(title = "Личный кабинет", subtitle = "Зачётная книжка", url = "https://lk.narfu.ru", icon = "person.text.rectangle.fill", category = "Университет"),
                Resource(title = "Вход на сайт", subtitle = "narfu.ru", url = "https://narfu.ru/user/authorization.php", icon = "person.crop.circle.fill", category = "Университет"),
            )

        /** Рабочие сайты преподавателя САФУ */
        val teacherDefaults: List<Resource>
            get() = listOf(
                Resource(title = "Антиплагиат.ВУЗ", subtitle = "Проверка ВКР и работ", url = "https://narfu.antiplagiat.ru", icon = "checkmark.shield.fill", category = "Преподавателю"),
                Resource(title = "МООК САФУ", subtitle = "Онлайн-курсы Open edX", url = "https://edx2.narfu.ru", icon = "play.rectangle.fill", category = "Преподавателю"),
                Resource(title = "Сотруднику", subtitle = "Сервисы и документы", url = "https://narfu.ru/forstaff/", icon = "briefcase.fill", category = "Преподавателю"),
                Resource(title = "Инструкции ИТ", subtitle = "Учётные записи, почта, Sakai", url = "https://narfu.ru/university/structure/upravleniya/it/manuals/", icon = "wrench.and.screwdriver.fill", category = "Преподавателю"),
                Resource(title = "Библиотека", subtitle = "Интеллектуальный центр", url = "https://library.narfu.ru", icon = "books.vertical.fill", category = "Преподавателю"),
            )
    }
}

fun hostOf(url: String): String? = try { URI(url.trim()).host?.lowercase() } catch (_: Throwable) { null }

object ResourceStore {
    private const val itemsKey = "resources.v1"
    private const val recentsKey = "memory.recents"
    private const val lastURLsKey = "memory.lastURLs"

    var items: List<Resource> by mutableStateOf(emptyList())
        private set
    var recentIDs: List<String> by mutableStateOf(emptyList())
        private set
    /** Счётчик открытий в текущей сессии — для анимации иконок */
    val openTicks = mutableStateMapOf<String, Int>()
    private var lastURLs: Map<String, String> = emptyMap()
    private var loaded = false

    fun load() {
        if (loaded) return
        loaded = true
        val decoded = Defaults.decode<List<Resource>>(itemsKey)
        var list = if (!decoded.isNullOrEmpty()) decoded else Resource.defaults
        recentIDs = Defaults.stringArray(recentsKey) ?: emptyList()
        lastURLs = (Defaults.dictionary(lastURLsKey) ?: emptyMap()).mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap()
        // Модеус больше не нужен: расписание берётся из РУЗ
        list = list.filterNot { it.url.contains("modeus") }
        // Новый личный кабинет (зачётка) добавляем и тем, у кого список уже сохранён
        if (list.none { it.url.contains("lk.narfu.ru") }) {
            list = list + Resource(title = "Личный кабинет", subtitle = "Зачётная книжка", url = "https://lk.narfu.ru",
                icon = "person.text.rectangle.fill", category = "Университет")
        }
        replaceItems(list)
    }

    fun replaceItems(list: List<Resource>) {
        items = list
        Defaults.encode(itemsKey, list)
    }

    val categories: List<String> get() = items.map { it.category }.distinct()

    fun items(category: String) = items.filter { it.category == category && !it.pinned }

    val pinnedItems: List<Resource> get() = items.filter { it.pinned }

    val visibleCategories: List<String> get() = categories.filter { items(it).isNotEmpty() }

    fun search(query: String): List<Resource> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        return items.filter {
            it.title.contains(q, true) || it.subtitle.contains(q, true) || it.category.contains(q, true) || it.url.contains(q, true)
        }
    }

    fun togglePin(r: Resource) {
        replaceItems(items.map { if (it.id == r.id) it.copy(pinned = !it.pinned) else it })
    }

    val recents: List<Resource> get() = recentIDs.mapNotNull { id -> items.firstOrNull { it.id == id } }

    /** Быстрые кнопки на главной */
    val quick: List<Resource>
        get() {
            val chosen = (Defaults.string("quick.ids") ?: "").split(",").filter { it.isNotEmpty() }
            if (chosen.isNotEmpty()) return chosen.mapNotNull { id -> items.firstOrNull { it.id.equals(id, true) } }
            return listOf("ruz.narfu", "edu.narfu", "sakai", "office.edu").mapNotNull { key -> items.firstOrNull { it.url.contains(key) } }
        }

    fun index(r: Resource) = items.indexOfFirst { it.id == r.id }.coerceAtLeast(0)

    // MARK: память

    fun markOpened(r: Resource) {
        val ids = listOf(r.id) + recentIDs.filter { it != r.id }
        recentIDs = ids.take(8)
        Defaults.set(recentsKey, recentIDs)
        openTicks[r.id] = (openTicks[r.id] ?: 0) + 1
    }

    fun lastURL(r: Resource): String? = lastURLs[r.id]

    /** Запоминаем страницу, только если к ней безопасно вернуться */
    fun saveLastURL(url: String, r: Resource) {
        val home = hostOf(r.url) ?: return
        val host = hostOf(url) ?: return
        if (!(host == home || host.endsWith(".$home") || home.endsWith(".$host"))) return
        val s = url.lowercase()
        val bad = listOf("login", "logout", "auth", "adfs", "saml", "token", "ticket", "sso", "signin",
            "session", "xlogin", "relogin", "error", "redirect")
        if (bad.any { s.contains(it) }) return
        lastURLs = lastURLs + (r.id to url)
        Defaults.set(lastURLsKey, lastURLs)
    }

    fun clearLastURL(r: Resource) {
        lastURLs = lastURLs - r.id
        Defaults.set(lastURLsKey, lastURLs)
    }

    fun clearMemory() {
        recentIDs = emptyList()
        Defaults.set(recentsKey, recentIDs)
        lastURLs = emptyMap()
        Defaults.set(lastURLsKey, lastURLs)
    }

    // MARK: редактирование

    fun upsert(r: Resource) {
        replaceItems(if (items.any { it.id == r.id }) items.map { if (it.id == r.id) r else it } else items + r)
    }

    fun delete(r: Resource) {
        replaceItems(items.filter { it.id != r.id })
        recentIDs = recentIDs.filter { it != r.id }
        Defaults.set(recentsKey, recentIDs)
    }

    fun resetToDefaults() {
        replaceItems(Resource.defaults)
        clearMemory()
    }

    /** Перечитать всё (после восстановления копии) */
    fun reload() { loaded = false; load() }
}

/** Сравнение «как в Finder»: числа по значению, без учёта регистра */
object NaturalOrder : Comparator<String> {
    override fun compare(a: String, b: String): Int {
        var i = 0
        var j = 0
        val x = a.lowercase(RU)
        val y = b.lowercase(RU)
        while (i < x.length && j < y.length) {
            val ca = x[i]
            val cb = y[j]
            if (ca.isDigit() && cb.isDigit()) {
                var ei = i; while (ei < x.length && x[ei].isDigit()) ei++
                var ej = j; while (ej < y.length && y[ej].isDigit()) ej++
                val na = x.substring(i, ei).trimStart('0')
                val nb = y.substring(j, ej).trimStart('0')
                if (na.length != nb.length) return na.length - nb.length
                val c = na.compareTo(nb)
                if (c != 0) return c
                i = ei; j = ej
            } else {
                if (ca != cb) {
                    val c = java.text.Collator.getInstance(RU).compare(ca.toString(), cb.toString())
                    if (c != 0) return c
                    return ca.compareTo(cb)
                }
                i++; j++
            }
        }
        return (x.length - i) - (y.length - j)
    }
}
