package ru.student.safuhub

import android.content.Context

/** Всё, что нужно сделать при запуске процесса */
object Boot {
    fun onAppCreate(ctx: Context) {
        ru.student.safuhub.ui.theme.FirstLook.applyIfNew()
        ru.student.safuhub.ui.theme.StrictLook.applyOnce()
        ru.student.safuhub.data.ScheduleStore.load()
        ru.student.safuhub.data.TaskStore.load()
        ru.student.safuhub.data.ResourceStore.load()
        // маршрут и город читает главный экран, а первыми их трогают фоновые пересчёты уведомлений (LiveLesson,
        // CommutePlanner на Dispatchers.Default). Состояние, созданное в фоне во время отрисовки, Compose не видит
        // и падает: «Reading a state that was created after the snapshot was taken». Создаём заранее, здесь.
        ru.student.safuhub.feature.commute.BusRouteStore.load()
        ru.student.safuhub.feature.commute.CityLocator.cityNow
        ru.student.safuhub.system.Notify.createChannels(ctx)
        ru.student.safuhub.background.BackgroundRefresh.schedule(ctx)
    }
}
