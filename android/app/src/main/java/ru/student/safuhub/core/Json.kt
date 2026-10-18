package ru.student.safuhub.core

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import java.time.Instant
import java.util.UUID

/** JSON как у JSONEncoder iOS: даты — секунды от 2001 года, чтобы копии с iPhone читались */
val AppJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
    allowSpecialFloatingPointValues = true
}

object AppleDateSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("AppleDate", PrimitiveKind.DOUBLE)
    override fun serialize(encoder: Encoder, value: Instant) = encoder.encodeDouble(value.toAppleSeconds())
    override fun deserialize(decoder: Decoder): Instant {
        if (decoder is JsonDecoder) {
            val el = decoder.decodeJsonElement()
            if (el is JsonPrimitive) {
                el.doubleOrNull?.let { return appleSecondsToInstant(it) }
                // ISO-строка (на всякий случай)
                runCatching { return Instant.parse(el.content) }
            }
            return Instant.now()
        }
        return appleSecondsToInstant(decoder.decodeDouble())
    }
}

typealias AppleDate = @kotlinx.serialization.Serializable(with = AppleDateSerializer::class) Instant

fun newId(): String = UUID.randomUUID().toString().uppercase()

inline fun <reified T> decodeOrNull(bytes: ByteArray?): T? {
    if (bytes == null) return null
    return try { AppJson.decodeFromString<T>(String(bytes, Charsets.UTF_8)) } catch (_: Throwable) { null }
}

inline fun <reified T> encodeBytes(value: T): ByteArray = AppJson.encodeToString(value).toByteArray(Charsets.UTF_8)

/** Прочитать Codable-данные из настроек */
inline fun <reified T> Defaults.decode(key: String): T? = decodeOrNull<T>(data(key))

/** Сохранить Codable-данные в настройки (как Data) */
inline fun <reified T> Defaults.encode(key: String, value: T) = set(key, encodeBytes(value))
