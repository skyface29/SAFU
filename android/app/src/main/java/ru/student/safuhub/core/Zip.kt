package ru.student.safuhub.core

import java.io.ByteArrayOutputStream

// MARK: - ZIP без сжатия (метод «stored») — этого достаточно для .docx

object ZipWriter {
    /** Простой построитель байтов (little-endian) */
    private class Bytes {
        val out = ByteArrayOutputStream()
        fun u16(v: Int) { out.write(v and 0xFF); out.write((v shr 8) and 0xFF) }
        fun u32(v: Long) { for (i in 0 until 4) out.write(((v shr (8 * i)) and 0xFF).toInt()) }
        fun raw(d: ByteArray) = out.write(d)
    }

    fun make(files: List<Pair<String, ByteArray>>): ByteArray {
        val out = Bytes()
        val central = Bytes()
        var offset = 0L
        for ((name, data) in files) {
            val nameData = name.toByteArray(Charsets.UTF_8)
            val crc = CRC32.checksum(data)
            val size = data.size.toLong()

            val local = Bytes()
            local.u32(0x04034b50)
            local.u16(20); local.u16(0); local.u16(0); local.u16(0); local.u16(0x21)
            local.u32(crc); local.u32(size); local.u32(size)
            local.u16(nameData.size); local.u16(0)
            local.raw(nameData)
            local.raw(data)

            central.u32(0x02014b50)
            central.u16(20); central.u16(20); central.u16(0); central.u16(0); central.u16(0); central.u16(0x21)
            central.u32(crc); central.u32(size); central.u32(size)
            central.u16(nameData.size); central.u16(0); central.u16(0); central.u16(0); central.u16(0)
            central.u32(0); central.u32(offset)
            central.raw(nameData)

            val bytes = local.out.toByteArray()
            out.raw(bytes)
            offset += bytes.size
        }
        val cd = central.out.toByteArray()
        out.raw(cd)
        out.u32(0x06054b50)
        out.u16(0); out.u16(0)
        out.u16(files.size); out.u16(files.size)
        out.u32(cd.size.toLong()); out.u32(offset); out.u16(0)
        return out.out.toByteArray()
    }
}

object CRC32 {
    private val table = LongArray(256) { i ->
        var c = i.toLong()
        repeat(8) { c = if (c and 1L != 0L) 0xEDB88320L xor (c ushr 1) else c ushr 1 }
        c
    }

    fun checksum(data: ByteArray): Long = update(0xFFFFFFFFL, data, 0, data.size) xor 0xFFFFFFFFL

    /**
     * Продолжить подсчёт по следующему куску (для больших файлов, которые читаются частями).
     * Начальное значение — 0xFFFFFFFF, в конце — xor 0xFFFFFFFF
     */
    fun update(crc: Long, buf: ByteArray, from: Int, count: Int): Long {
        var c = crc
        for (i in from until from + count) c = table[((c xor buf[i].toLong()) and 0xFF).toInt()] xor (c ushr 8)
        return c and 0xFFFFFFFFL
    }
}
