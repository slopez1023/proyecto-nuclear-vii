package co.edu.cue.nuclear.cliente.data.busqueda

import org.junit.Assert.assertEquals
import org.junit.Test

class CancionTest {
    @Test
    fun formatearDuracion_minutosYSegundos() {
        assertEquals("0:00", formatearDuracion(0))
        assertEquals("0:45", formatearDuracion(45))
        assertEquals("3:05", formatearDuracion(185))
        assertEquals("6:00", formatearDuracion(360))
        assertEquals("59:59", formatearDuracion(3599))
    }

    @Test
    fun formatearDuracion_conHoras() {
        assertEquals("1:00:00", formatearDuracion(3600))
        assertEquals("1:02:03", formatearDuracion(3723))
    }

    @Test
    fun formatearDuracion_sinDato_muestraGuiones() {
        assertEquals("--:--", formatearDuracion(null))
        assertEquals("--:--", formatearDuracion(-1))
    }

    @Test
    fun duracionTexto_usaLaDuracionDeLaCancion() {
        assertEquals("3:05", Cancion("id", "t", "c", 185, null, true).duracionTexto)
    }
}
