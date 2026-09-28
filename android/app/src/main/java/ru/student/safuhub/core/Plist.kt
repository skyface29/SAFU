package ru.student.safuhub.core

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.time.Instant

// MARK: - Двоичный plist (bplist00), как у настроек iPhone
// Нужен для резервной копии: data.plist внутри .safubackup читается и на iPhone, и на Android.

object Plist {
    // MARK: запись

    private class PArray(val refs: IntArray)
    private class PDict(val keys: IntArray, val values: IntArray)

    fun write(root: Any): ByteArray {
        val objects = ArrayList<Any>()

        fun flatten(raw: Any): Int {
            // неизвестные типы — строкой
            val o: Any = when (raw) {
                is Boolean, is Number, is Instant, is ByteArray, is String, is Map<*, *>, is List<*>, is Set<*> -> raw
                else -> raw.toString()
            }
            val idx = objects.size
            objects.add(o)
            when (o) {
                is Map<*, *> -> {
                    val entries = o.entries.filter { it.key != null && it.value != null }
                    val keys = IntArray(entries.size)
                    val values = IntArray(entries.size)
                    entries.forEachIndexed { i, e -> keys[i] = flatten(e.key.toString()) }
                    entries.forEachIndexed { i, e -> values[i] = flatten(e.value!!) }
                    objects[idx] = PDict(keys, values)
                }
                is List<*> -> {
                    val items = o.filterNotNull()
                    val refs = IntArray(items.size)
                    items.forEachIndexed { i, e -> refs[i] = flatten(e) }
                    objects[idx] = PArray(refs)
                }
                is Set<*> -> {
                    val items = o.filterNotNull()
                    val refs = IntArray(items.size)
                    items.forEachIndexed { i, e -> refs[i] = flatten(e) }
                    objects[idx] = PArray(refs)
                }
            }
            return idx
        }
        flatten(root)

        val refSize = when {
            objects.size < 0x100 -> 1
            objects.size < 0x10000 -> 2
            else -> 4
        }
        val out = ByteArrayOutputStream()
        out.write("bplist00".toByteArray(Charsets.US_ASCII))
        val offsets = LongArray(objects.size)

        fun be(v: Long, n: Int) { for (i in n - 1 downTo 0) out.write(((v shr (8 * i)) and 0xFF).toInt()) }
        fun intObj(v: Long) {
            when {
                v in 0..0xFF -> { out.write(0x10); be(v, 1) }
                v in 0..0xFFFF -> { out.write(0x11); be(v, 2) }
                v in 0..0xFFFFFFFFL -> { out.write(0x12); be(v, 4) }
                else -> { out.write(0x13); be(v, 8) }
            }
        }
        fun marker(type: Int, count: Int) {
            if (count < 15) out.write(type or count) else { out.write(type or 0x0F); intObj(count.toLong()) }
        }

        objects.forEachIndexed { i, o ->
            offsets[i] = out.size().toLong()
            when (o) {
                is Boolean -> out.write(if (o) 0x09 else 0x08)
                is Int -> intObj(o.toLong())
                is Long -> intObj(o)
                is Short -> intObj(o.toLong())
                is Byte -> intObj(o.toLong())
                is Float -> { out.write(0x23); be(java.lang.Double.doubleToRawLongBits(o.toDouble()), 8) }
                is Double -> { out.write(0x23); be(java.lang.Double.doubleToRawLongBits(o), 8) }
                is Number -> { out.write(0x23); be(java.lang.Double.doubleToRawLongBits(o.toDouble()), 8) }
                is Instant -> { out.write(0x33); be(java.lang.Double.doubleToRawLongBits(o.toAppleSeconds()), 8) }
                is ByteArray -> { marker(0x40, o.size); out.write(o) }
                is String -> {
                    if (o.all { it.code < 0x80 }) {
                        marker(0x50, o.length)
                        out.write(o.toByteArray(Charsets.US_ASCII))
                    } else {
                        marker(0x60, o.length)
                        out.write(o.toByteArray(Charsets.UTF_16BE))
                    }
                }
                is PArray -> { marker(0xA0, o.refs.size); o.refs.forEach { be(it.toLong(), refSize) } }
                is PDict -> {
                    marker(0xD0, o.keys.size)
                    o.keys.forEach { be(it.toLong(), refSize) }
                    o.values.forEach { be(it.toLong(), refSize) }
                }
            }
        }
        val tableOffset = out.size().toLong()
        val offSize = when {
            tableOffset < 0x100 -> 1
            tableOffset < 0x10000 -> 2
            tableOffset < 0x100000000L -> 4
            else -> 8
        }
        offsets.forEach { be(it, offSize) }
        repeat(6) { out.write(0) }
        out.write(offSize)
        out.write(refSize)
        be(objects.size.toLong(), 8)
        be(0, 8)
        be(tableOffset, 8)
        return out.toByteArray()
    }

    // MARK: чтение

    class Invalid : Exception("Не удалось прочитать настройки из копии")

    fun read(bytes: ByteArray): Any? {
        if (bytes.size < 40 || String(bytes, 0, 8, Charsets.US_ASCII) != "bplist00") throw Invalid()
        val t = bytes.size - 32
        val offSize = bytes[t + 6].toInt() and 0xFF
        val refSize = bytes[t + 7].toInt() and 0xFF
        val numObjects = beLong(bytes, t + 8, 8).toInt()
        val top = beLong(bytes, t + 16, 8).toInt()
        val tableOffset = beLong(bytes, t + 24, 8).toInt()
        if (numObjects <= 0 || tableOffset <= 0 || tableOffset >= bytes.size) throw Invalid()
        val offsets = IntArray(numObjects) { beLong(bytes, tableOffset + it * offSize, offSize).toInt() }

        fun lengthAt(pos: Int, low: Int): Pair<Int, Int> {
            if (low != 0x0F) return low to pos + 1
            val m = bytes[pos + 1].toInt() and 0xFF
            val n = 1 shl (m and 0x0F)
            return beLong(bytes, pos + 2, n).toInt() to pos + 2 + n
        }

        fun obj(i: Int, depth: Int): Any? {
            if (depth > 64 || i !in offsets.indices) return null
            val pos = offsets[i]
            val m = bytes[pos].toInt() and 0xFF
            val type = m and 0xF0
            val low = m and 0x0F
            return when (type) {
                0x00 -> when (m) { 0x08 -> false; 0x09 -> true; else -> null }
                0x10 -> {
                    val n = 1 shl low
                    val v = if (n <= 8) beLong(bytes, pos + 1, n) else beLong(bytes, pos + 1 + n - 8, 8)
                    // 1, 2 и 4 байта — без знака, 8 — со знаком
                    val value = if (n == 8) v else v and (if (n == 4) 0xFFFFFFFFL else -1L)
                    if (value in Int.MIN_VALUE..Int.MAX_VALUE) value.toInt() else value
                }
                0x20 -> {
                    val n = 1 shl low
                    if (n == 4) java.lang.Float.intBitsToFloat(beLong(bytes, pos + 1, 4).toInt()).toDouble()
                    else java.lang.Double.longBitsToDouble(beLong(bytes, pos + 1, 8))
                }
                0x30 -> appleSecondsToInstant(java.lang.Double.longBitsToDouble(beLong(bytes, pos + 1, 8)))
                0x40 -> { val (n, start) = lengthAt(pos, low); bytes.copyOfRange(start, start + n) }
                0x50 -> { val (n, start) = lengthAt(pos, low); String(bytes, start, n, Charsets.US_ASCII) }
                0x60 -> { val (n, start) = lengthAt(pos, low); String(bytes, start, n * 2, Charsets.UTF_16BE) }
                0x70 -> { val (n, start) = lengthAt(pos, low); String(bytes, start, n, Charsets.UTF_8) }
                0x80 -> beLong(bytes, pos + 1, low + 1)
                0xA0, 0xC0 -> {
                    val (n, start) = lengthAt(pos, low)
                    (0 until n).mapNotNull { obj(beLong(bytes, start + it * refSize, refSize).toInt(), depth + 1) }
                }
                0xD0 -> {
                    val (n, start) = lengthAt(pos, low)
                    val out = LinkedHashMap<String, Any>()
                    for (k in 0 until n) {
                        val key = obj(beLong(bytes, start + k * refSize, refSize).toInt(), depth + 1)?.toString() ?: continue
                        val value = obj(beLong(bytes, start + (n + k) * refSize, refSize).toInt(), depth + 1) ?: continue
                        out[key] = value
                    }
                    out
                }
                else -> null
            }
        }
        return obj(top, 0)
    }

    private fun beLong(b: ByteArray, pos: Int, n: Int): Long {
        if (n == 8) return ByteBuffer.wrap(b, pos, 8).long
        var v = 0L
        for (i in 0 until n) v = (v shl 8) or (b[pos + i].toLong() and 0xFF)
        return v
    }
}
