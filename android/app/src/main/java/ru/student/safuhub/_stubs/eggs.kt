@file:Suppress("unused", "UNUSED_PARAMETER")
package ru.student.safuhub.feature.eggs
object Oracle { fun fire() {} }
enum class Egg { GAME, ORACLE, HACKER }
object Eggs { fun mark(e: Egg): Boolean = false }
