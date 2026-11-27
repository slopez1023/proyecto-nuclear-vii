package co.edu.cue.nuclear.cliente.data.sesion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CodigoAccesoTest {
    @Test
    fun esValido_aceptaCerosInicialesYExactamenteSeisDigitos() {
        assertTrue(CodigoAcceso.esValido("004281"))
        assertTrue(CodigoAcceso.esValido("000000"))
        assertTrue(CodigoAcceso.esValido("999999"))
    }

    @Test
    fun esValido_rechazaLongitudDistintaOCaracteresNoNumericos() {
        assertFalse(CodigoAcceso.esValido(null))
        assertFalse(CodigoAcceso.esValido(""))
        assertFalse(CodigoAcceso.esValido("12345"))
        assertFalse(CodigoAcceso.esValido("1234567"))
        assertFalse(CodigoAcceso.esValido("12345a"))
        assertFalse(CodigoAcceso.esValido(" 12345"))
    }

    @Test
    fun normalizar_filtraNoDigitosYRecortaASeisConservandoCeros() {
        assertEquals("004281", CodigoAcceso.normalizar("00-42a8199"))
        assertEquals("000", CodigoAcceso.normalizar("a0b0c0d"))
    }
}
