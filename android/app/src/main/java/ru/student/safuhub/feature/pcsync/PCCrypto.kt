package ru.student.safuhub.feature.pcsync

import java.math.BigInteger
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Шифрование обмена с компьютером — байт в байт как windows/electron/transfer.ts и PCCrypto на iPhone:
 * AES-256-GCM, «одноразовое число (12) + шифротекст + метка (16)», к шифру привязан адрес запроса (AAD).
 */
object PCCrypto {
    private val random = SecureRandom()

    fun randomBytes(n: Int) = ByteArray(n).also { random.nextBytes(it) }

    fun seal(plain: ByteArray, key: ByteArray, aad: String): ByteArray {
        val nonce = randomBytes(12)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
        c.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return nonce + c.doFinal(plain)
    }

    fun open(sealed: ByteArray, key: ByteArray, aad: String): ByteArray {
        require(sealed.size >= 28) { "short" }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, sealed, 0, 12))
        c.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return c.doFinal(sealed, 12, sealed.size - 12)
    }

    fun sha256(vararg parts: ByteArray): ByteArray {
        val d = MessageDigest.getInstance("SHA-256")
        for (p in parts) d.update(p)
        return d.digest()
    }

    fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    /** HKDF-SHA256 (RFC 5869) */
    fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(if (salt.isEmpty()) ByteArray(32) else salt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)
        mac.init(SecretKeySpec(prk, "HmacSHA256"))
        val out = java.io.ByteArrayOutputStream()
        var t = ByteArray(0)
        var i = 1
        while (out.size() < length) {
            mac.update(t); mac.update(info); mac.update(i.toByte())
            t = mac.doFinal()
            out.write(t)
            i++
        }
        return out.toByteArray().copyOf(length)
    }
}

/**
 * X25519 (RFC 7748) — общий секрет для связки без QR-кода. Своя реализация: на Android до 13 её нет в системе.
 * Одна связка — одно умножение, так что простая лестница Монтгомери на BigInteger здесь в самый раз.
 */
object X25519 {
    private val P: BigInteger = BigInteger.ONE.shiftLeft(255).subtract(BigInteger.valueOf(19))
    private val A24: BigInteger = BigInteger.valueOf(121665)
    private val NINE = ByteArray(32).also { it[0] = 9 }

    class KeyPair(val privateKey: ByteArray, val publicKey: ByteArray)

    fun generate(): KeyPair {
        val k = PCCrypto.randomBytes(32)
        return KeyPair(k, scalarMult(k, NINE))
    }

    fun shared(privateKey: ByteArray, peerPublic: ByteArray): ByteArray {
        val s = scalarMult(privateKey, peerPublic)
        require(s.any { it != 0.toByte() }) { "weak key" }
        return s
    }

    /** Числа в X25519 — little-endian */
    private fun decodeLE(b: ByteArray): BigInteger = BigInteger(1, b.reversedArray())

    private fun encodeLE(x: BigInteger): ByteArray {
        val be = x.mod(P).toByteArray()
        val out = ByteArray(32)
        for (i in be.indices) { val j = be.size - 1 - i; if (i < 32) out[i] = be[j] }
        return out
    }

    private fun clampScalar(k: ByteArray): BigInteger {
        val c = k.copyOf(32)
        c[0] = (c[0].toInt() and 248).toByte()
        c[31] = (c[31].toInt() and 127).toByte()
        c[31] = (c[31].toInt() or 64).toByte()
        return decodeLE(c)
    }

    fun scalarMult(scalar: ByteArray, u: ByteArray): ByteArray {
        val k = clampScalar(scalar)
        val uu = u.copyOf(32)
        uu[31] = (uu[31].toInt() and 127).toByte()
        val x1 = decodeLE(uu).mod(P)
        var x2 = BigInteger.ONE
        var z2 = BigInteger.ZERO
        var x3 = x1
        var z3 = BigInteger.ONE
        var swap = 0
        for (t in 254 downTo 0) {
            val kt = if (k.testBit(t)) 1 else 0
            swap = swap xor kt
            if (swap == 1) { val tx = x2; x2 = x3; x3 = tx; val tz = z2; z2 = z3; z3 = tz }
            swap = kt
            val a = x2.add(z2).mod(P)
            val aa = a.multiply(a).mod(P)
            val b = x2.subtract(z2).mod(P)
            val bb = b.multiply(b).mod(P)
            val e = aa.subtract(bb).mod(P)
            val c = x3.add(z3).mod(P)
            val d = x3.subtract(z3).mod(P)
            val da = d.multiply(a).mod(P)
            val cb = c.multiply(b).mod(P)
            x3 = da.add(cb).mod(P).pow(2).mod(P)
            z3 = x1.multiply(da.subtract(cb).mod(P).pow(2)).mod(P)
            x2 = aa.multiply(bb).mod(P)
            z2 = e.multiply(aa.add(A24.multiply(e)).mod(P)).mod(P)
        }
        if (swap == 1) { val tx = x2; x2 = x3; x3 = tx; val tz = z2; z2 = z3; z3 = tz }
        return encodeLE(x2.multiply(z2.modPow(P.subtract(BigInteger.valueOf(2)), P)).mod(P))
    }
}
