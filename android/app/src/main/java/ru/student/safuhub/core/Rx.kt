package ru.student.safuhub.core

/** Помощники для регулярок (как NSRegularExpression) */
fun String.rx(pattern: String, ignoreCase: Boolean = false): List<MatchResult> = try {
    val opts = if (ignoreCase) setOf(RegexOption.IGNORE_CASE) else emptySet()
    Regex(pattern, opts).findAll(this).toList()
} catch (_: Throwable) { emptyList() }

/** Группа совпадения или пустая строка */
fun MatchResult.g(i: Int): String = groups[i]?.value ?: ""

val String.squeezed: String get() = replace(Regex("\\s+"), " ").trim()

fun String.replacingRx(pattern: String, with: String, ignoreCase: Boolean = false): String = try {
    val opts = if (ignoreCase) setOf(RegexOption.IGNORE_CASE) else emptySet()
    Regex(pattern, opts).replace(this, Regex.escapeReplacement(with))
} catch (_: Throwable) { this }

fun String.containsCI(q: String): Boolean = lowercase(RU).contains(q.lowercase(RU))

fun String.trimSet(chars: String): String = trim { it in chars }
