package co.edu.cue.nuclear.cliente.data.sesion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TokenQrTest {

    @Test
    fun esValido_aceptaTokensConElFormatoDelBackend() {
        assertTrue(TokenQr.esValido("demo-activa-001"))
        assertTrue(TokenQr.esValido("ABCDEFGH"))
        assertTrue(TokenQr.esValido("a_b-c_d-12345678"))
        assertTrue(TokenQr.esValido("x".repeat(64)))
    }

    @Test
    fun esValido_rechazaFormatosInvalidos() {
        assertFalse(TokenQr.esValido(null))
        assertFalse(TokenQr.esValido(""))
        assertFalse(TokenQr.esValido("corto"))
        assertFalse(TokenQr.esValido("x".repeat(65)))
        assertFalse(TokenQr.esValido("../../etc/passwd"))
        assertFalse(TokenQr.esValido("con espacios 123"))
        assertFalse(TokenQr.esValido("token-ñandú-123"))
    }

    @Test
    fun desdeUrl_extraeElTokenDeUnaUrlHttps() {
        assertEquals("demo-activa-001", TokenQr.desdeUrl("https://nuclear.example.com/s/demo-activa-001"))
        assertEquals("demo-activa-001", TokenQr.desdeUrl("https://nuclear.example.com/s/demo-activa-001/"))
        assertEquals("demo-activa-001", TokenQr.desdeUrl("https://nuclear.example.com/s/demo-activa-001?utm=qr"))
    }

    @Test
    fun desdeUrl_rechazaEsquemasQueNoSonHttps() {
        assertNull(TokenQr.desdeUrl("http://nuclear.example.com/s/demo-activa-001"))
        assertNull(TokenQr.desdeUrl("nuclear://s/demo-activa-001"))
    }

    @Test
    fun desdeUrl_rechazaRutasQueNoSonDeAcceso() {
        assertNull(TokenQr.desdeUrl(null))
        assertNull(TokenQr.desdeUrl("https://nuclear.example.com/"))
        assertNull(TokenQr.desdeUrl("https://nuclear.example.com/s/"))
        assertNull(TokenQr.desdeUrl("https://nuclear.example.com/otra/demo-activa-001"))
        assertNull(TokenQr.desdeUrl("esto no es una url"))
    }

    @Test
    fun desdeUrl_noValidaElFormatoDelToken_loHaceEsValido() {
        // Un token mal formado se extrae para poder mostrar "QR inválido" en lugar de ignorar el enlace.
        assertEquals("x", TokenQr.desdeUrl("https://nuclear.example.com/s/x"))
        assertFalse(TokenQr.esValido(TokenQr.desdeUrl("https://nuclear.example.com/s/x")))
    }
}
