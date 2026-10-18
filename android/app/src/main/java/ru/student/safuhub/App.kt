package ru.student.safuhub

import android.app.Application
import android.content.Context

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        ctx = applicationContext
        ru.student.safuhub.core.Defaults.init(this)
        Boot.onAppCreate(this)
    }

    companion object {
        lateinit var ctx: Context
            private set

        /** Версия приложения (как CFBundleShortVersionString) */
        val version: String
            get() = try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "" } catch (_: Throwable) { "" }
    }
}
