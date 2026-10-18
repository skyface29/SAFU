package ru.student.safuhub

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import ru.student.safuhub.data.HWPretty
import ru.student.safuhub.feature.pcsync.PCCrypto
import ru.student.safuhub.feature.pcsync.PCSync
import ru.student.safuhub.feature.pcsync.SyncLink
import ru.student.safuhub.feature.pcsync.X25519

/** Синхронизация с компьютером и оформление ДЗ: совместимость с Windows и iPhone */
@RunWith(RobolectricTestRunner::class)
class PCSyncTest {
    private fun unhex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    @Test
    fun x25519MatchesRfc7748() {
        // RFC 7748, раздел 5.2
        val k = unhex("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4")
        val u = unhex("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c")
        assertEquals("c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552", PCCrypto.hex(X25519.scalarMult(k, u)))
        // раздел 6.1: Алиса и Боб получают один секрет
        val a = unhex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a")
        val b = unhex("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb")
        val nine = ByteArray(32).also { it[0] = 9 }
        val aPub = X25519.scalarMult(a, nine)
        assertEquals("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a", PCCrypto.hex(aPub))
        val bPub = X25519.scalarMult(b, nine)
        assertEquals("4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742", PCCrypto.hex(X25519.shared(a, bPub)))
        assertArrayEquals(X25519.shared(a, bPub), X25519.shared(b, aPub))
    }

    @Test
    fun sealOpenRoundTrip() {
        val key = PCCrypto.randomBytes(32)
        val sealed = PCCrypto.seal("привет".toByteArray(), key, "POST /v2/sync")
        assertEquals(12 + 12 + 16, sealed.size)
        assertEquals("привет", String(PCCrypto.open(sealed, key, "POST /v2/sync")))
        assertTrue(runCatching { PCCrypto.open(sealed, key, "R POST /v2/sync") }.isFailure)
    }

    @Test
    fun hkdfMatchesRfc5869() {
        // RFC 5869, тест 1
        val okm = PCCrypto.hkdf(unhex("0b".repeat(22)), unhex("000102030405060708090a0b0c"), unhex("f0f1f2f3f4f5f6f7f8f9"), 42)
        assertEquals("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865", PCCrypto.hex(okm))
    }

    @Test
    fun sasCodeIsFourDigits() {
        val c = PCSync.sasCode(ByteArray(32) { 1 }, ByteArray(32) { 2 })
        assertEquals(4, c.length)
        assertTrue(c.all { it.isDigit() })
    }

    @Test
    fun parsesSyncLink() {
        val l = SyncLink.parse("arktika://sync?v=1&h=192.168.1.5,8.8.8.8&p=47823&i=abc&k=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=DESKTOP")
        assertNotNull(l)
        assertEquals(listOf("192.168.1.5"), l!!.hosts)
        assertEquals(32, l.key.size)
        assertEquals(null, SyncLink.parse("arktika://sync?h=8.8.8.8&p=1&i=a&k=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"))
    }

    @Test
    fun prettyHomework() {
        assertEquals("Решить № 5, 6 стр. 45, упр. 3–7", HWPretty.clean("решить номер 5,6 стр 45 , упр 3-7"))
        val b = HWPretty.blocks("1) прочитать § 5 2) упр. 3")
        assertEquals(listOf("1.", "2."), b.map { it.marker })
    }
}
