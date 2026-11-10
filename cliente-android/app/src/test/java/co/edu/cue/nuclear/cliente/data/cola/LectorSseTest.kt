package co.edu.cue.nuclear.cliente.data.cola

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LectorSseTest {
    private fun LectorSse.leer(vararg lineas: String): List<MensajeSse> = lineas.mapNotNull { linea(it) }

    @Test
    fun `un mensaje se entrega al llegar la linea en blanco`() {
        val lector = LectorSse()

        val mensajes = lector.leer("id: 9", "event: estado", "data: {\"a\":1}", "")

        assertEquals(listOf(MensajeSse("estado", "{\"a\":1}", "9")), mensajes)
    }

    @Test
    fun `el comentario ping nunca produce un mensaje`() {
        val lector = LectorSse()

        assertEquals(emptyList<MensajeSse>(), lector.leer(": ping", ""))
    }

    @Test
    fun `retry fija el intervalo y no produce mensaje`() {
        val lector = LectorSse()

        assertEquals(emptyList<MensajeSse>(), lector.leer("retry: 3000", ""))
        assertEquals(3000L, lector.reintentoMs)
    }

    @Test
    fun `sin retry el intervalo es nulo y un retry invalido se ignora`() {
        val lector = LectorSse()
        assertNull(lector.reintentoMs)

        lector.leer("retry: abc", "retry: -5", "")

        assertNull(lector.reintentoMs)
    }

    @Test
    fun `varias lineas data se unen con salto de linea`() {
        val lector = LectorSse()

        val mensajes = lector.leer("event: estado", "data: uno", "data: dos", "")

        assertEquals("uno" + "\n" + "dos", mensajes.single().datos)
    }

    @Test
    fun `un mensaje sin data no se entrega y el siguiente no hereda el tipo`() {
        val lector = LectorSse()

        val mensajes = lector.leer("event: estado", "", "data: x", "")

        assertEquals(listOf(MensajeSse("message", "x", null)), mensajes)
    }

    @Test
    fun `el espacio tras los dos puntos es opcional`() {
        val lector = LectorSse()

        assertEquals("v", lector.leer("event:estado", "data:v", "").single().datos)
    }
}
