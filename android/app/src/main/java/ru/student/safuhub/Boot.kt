package ru.student.safuhub

import android.content.Context

/** Всё, что нужно сделать при запуске процесса */
object Boot {
    fun onAppCreate(ctx: Context) {
        ru.student.safuhub.ui.theme.FirstLook.applyIfNew()
    }
}
