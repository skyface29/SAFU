package ru.student.safuhub.feature.web

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.CookieManager
import kotlinx.serialization.Serializable
import org.json.JSONObject
import ru.student.safuhub.App
import ru.student.safuhub.core.AppJson
import ru.student.safuhub.core.Defaults
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// MARK: - Защищённое хранилище (как связка ключей): пароли и вход шифруются ключом Android Keystore

object SecureStore {
    private const val alias = "ru.student.safuhub.secure"
    private val lock = Any()
    private var cache: MutableMap<String, String>? = null
    private val file: File get() = File(App.ctx.filesDir, "secure.json")

    private fun key(): SecretKey? = try {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.secretKey ?: run {
            val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            gen.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
            gen.generateKey()
        }
    } catch (_: Throwable) { null }

    private fun encrypt(plain: ByteArray): String? {
        val k = key() ?: return null
        return try {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.ENCRYPT_MODE, k)
            val out = c.iv + c.doFinal(plain)
            Base64.encodeToString(out, Base64.NO_WRAP)
        } catch (_: Throwable) { null }
    }

    private fun decrypt(s: String): ByteArray? {
        val k = key() ?: return null
        return try {
            val raw = Base64.decode(s, Base64.NO_WRAP)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, k, GCMParameterSpec(128, raw, 0, 12))
            c.doFinal(raw, 12, raw.size - 12)
        } catch (_: Throwable) { null }
    }

    private fun load(): MutableMap<String, String> {
        cache?.let { return it }
        val m = HashMap<String, String>()
        try {
            if (file.exists()) {
                val o = JSONObject(file.readText())
                for (k in o.keys()) m[k] = o.getString(k)
            }
        } catch (_: Throwable) {}
        cache = m
        return m
    }

    private fun persist(m: Map<String, String>) {
        try {
            val o = JSONObject()
            for ((k, v) in m) o.put(k, v)
            val tmp = File(file.parentFile, "secure.tmp")
            tmp.writeText(o.toString())
            tmp.renameTo(file)
        } catch (_: Throwable) {}
    }

    fun set(key: String, data: ByteArray) = synchronized(lock) {
        val enc = encrypt(data) ?: return@synchronized
        val m = load()
        m[key] = enc
        persist(m)
    }

    fun get(key: String): ByteArray? = synchronized(lock) { load()[key]?.let { decrypt(it) } }

    fun delete(key: String) = synchronized(lock) {
        val m = load()
        if (m.remove(key) != null) persist(m)
    }

    fun accounts(): List<String> = synchronized(lock) { load().keys.toList() }

    /** Для резервной копии: расшифрованные значения */
    fun exportAll(): Map<String, ByteArray> = synchronized(lock) { load().mapNotNull { (k, v) -> decrypt(v)?.let { k to it } }.toMap() }
}

// MARK: - Сохранённые логины сайтов

@Serializable
data class SiteCredential(val host: String, val user: String, val pass: String) {
    val id: String get() = host
}

object CredentialStore {
    private const val prefix = "cred:"

    val enabled: Boolean get() = Defaults.boolOrNull("web.savePasswords") ?: true
    val autoLogin: Boolean get() = Defaults.boolOrNull("web.autoLogin") ?: true

    fun get(host: String): SiteCredential? {
        val d = SecureStore.get(prefix + host.lowercase()) ?: return null
        return try { AppJson.decodeFromString(SiteCredential.serializer(), String(d)) } catch (_: Throwable) { null }
    }

    fun save(c: SiteCredential) {
        val x = c.copy(host = c.host.lowercase())
        SecureStore.set(prefix + x.host, AppJson.encodeToString(SiteCredential.serializer(), x).toByteArray())
    }

    fun delete(host: String) = SecureStore.delete(prefix + host.lowercase())

    fun all(): List<SiteCredential> = SecureStore.accounts().filter { it.startsWith(prefix) }
        .mapNotNull { get(it.removePrefix(prefix)) }.sortedBy { it.host }

    fun deleteAll() { for (c in all()) delete(c.host) }
}

// MARK: - Сохранение входа между перезапусками

object SessionKeeper {
    private const val key = "cookies"
    private const val hostsKey = "web.cookieHosts"
    @Volatile private var restored = false

    /** Сайты, на которые заходили во встроенном браузере */
    fun remember(host: String?) {
        val h = host?.lowercase() ?: return
        val list = Defaults.stringArray(hostsKey) ?: emptyList()
        if (!list.contains(h)) Defaults.set(hostsKey, (list + h).takeLast(40))
    }

    fun save() {
        val cm = try { CookieManager.getInstance() } catch (_: Throwable) { return }
        val o = JSONObject()
        for (h in Defaults.stringArray(hostsKey) ?: emptyList()) {
            val c = try { cm.getCookie("https://$h") } catch (_: Throwable) { null }
            if (!c.isNullOrEmpty()) o.put(h, c)
        }
        cm.flush()
        SecureStore.set(key, o.toString().toByteArray())
    }

    /** Возвращаем сохранённый вход (один раз за запуск приложения) */
    fun restore() {
        if (restored) return
        restored = true
        val d = SecureStore.get(key) ?: return
        val cm = try { CookieManager.getInstance() } catch (_: Throwable) { return }
        try {
            val o = JSONObject(String(d))
            for (h in o.keys()) {
                val have = cm.getCookie("https://$h").orEmpty()
                for (pair in o.getString(h).split(";").map { it.trim() }.filter { it.contains("=") }) {
                    val name = pair.substringBefore("=")
                    if (have.split(";").any { it.trim().substringBefore("=") == name }) continue
                    cm.setCookie("https://$h", "$pair; Path=/; Max-Age=${30 * 86_400}; Secure")
                }
            }
            cm.flush()
        } catch (_: Throwable) {}
    }

    /** Выйти со всех сайтов */
    fun clearAll(done: () -> Unit = {}) {
        SecureStore.delete(key)
        restored = true
        Defaults.remove(hostsKey)
        try {
            CookieManager.getInstance().removeAllCookies { done() }
            android.webkit.WebStorage.getInstance().deleteAllData()
        } catch (_: Throwable) { done() }
    }
}
