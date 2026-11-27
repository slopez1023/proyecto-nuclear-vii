package co.edu.cue.nuclear.cliente.data.sesion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LecturaQrTest {
    @Test
    fun urlHttpsValidaConTokenValido_devuelveToken() {
        assertEquals(
            "demo-activa-001",
            LecturaQr.tokenDesdeLectura("  https://proyecto-nuclear-vii-production.up.railway.app/s/demo-activa-001  "),
        )
    }

    @Test
    fun httpEsRechazado() {
        assertNull(LecturaQr.tokenDesdeLectura("http://proyecto-nuclear-vii-production.up.railway.app/s/demo-activa-001"))
    }

    @Test
    fun rutaAjenaEsRechazada() {
        assertNull(LecturaQr.tokenDesdeLectura("https://proyecto-nuclear-vii-production.up.railway.app/descargar"))
        assertNull(LecturaQr.tokenDesdeLectura("https://otro-sitio.com/menu/123"))
    }

    @Test
    fun tokenCortoOInvalidoEsRechazado() {
        assertNull(LecturaQr.tokenDesdeLectura("https://proyecto-nuclear-vii-production.up.railway.app/s/abc"))
        assertNull(LecturaQr.tokenDesdeLectura("texto-cualquiera"))
        assertNull(LecturaQr.tokenDesdeLectura(null))
    }
}
