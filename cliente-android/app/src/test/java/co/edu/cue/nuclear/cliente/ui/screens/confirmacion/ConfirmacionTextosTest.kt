package co.edu.cue.nuclear.cliente.ui.screens.confirmacion

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.ui.screens.cola.ConfirmacionSolicitud
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Textos de la pantalla de confirmación (lógica de presentación; no prueba el dibujo). */
class ConfirmacionTextosTest {

    private fun solicitud(posicion: Int? = 3, estado: EstadoSolicitud = EstadoSolicitud.PENDIENTE) = SolicitudCola(
        idSolicitud = "S1",
        cancion = Cancion("V1", "Titulo", "Canal", 200, null, true),
        estado = estado,
        posicion = posicion,
        totalVotos = 1,
        esMia = true,
        yaVoto = true,
        esperaEstimadaSegundos = null,
    )

    @Test
    fun `una solicitud nueva dice que esta registrada e incluye el voto automatico`() {
        val t = ConfirmacionSolicitud(solicitud(), sumoVotoAExistente = false).textos()

        assertEquals("Solicitud registrada", t.insignia)
        assertEquals("Tu canción está en la cola.", t.titulo)
        assertEquals("Incluye tu voto automático.", t.voto)
        assertTrue(t.detalle.contains("La posición puede cambiar según los votos de la sesión."))
    }

    @Test
    fun `una cancion que ya estaba dice que se sumo el voto y que no se duplico`() {
        val t = ConfirmacionSolicitud(solicitud(), sumoVotoAExistente = true).textos()

        assertEquals("Voto sumado", t.insignia)
        assertEquals("Tu voto se sumó a esta canción.", t.titulo)
        assertEquals("Se sumó tu voto; la canción no se duplicó.", t.voto)
        assertTrue(t.detalle.contains("no se repitió"))
    }

    @Test
    fun `los dos casos tienen textos distintos y ninguno habla de voto adicional`() {
        val nueva = ConfirmacionSolicitud(solicitud(), false).textos()
        val existente = ConfirmacionSolicitud(solicitud(), true).textos()

        assertFalse(nueva == existente)
        assertFalse(nueva.voto.contains("adicional"))
        assertFalse(existente.voto.contains("adicional"))
    }

    @Test
    fun `la posicion se muestra solo si el servidor la informo`() {
        assertEquals("#3", textoPosicion(solicitud(posicion = 3)))
        assertEquals("#1", textoPosicion(solicitud(posicion = 1)))
        assertEquals("No disponible", textoPosicion(solicitud(posicion = null)))
    }

    @Test
    fun `una cancion que esta sonando no muestra posicion en la cola`() {
        assertEquals("Ahora suena", textoPosicion(solicitud(posicion = null, estado = EstadoSolicitud.EN_REPRODUCCION)))
        assertEquals("Ahora suena", textoPosicion(solicitud(posicion = 2, estado = EstadoSolicitud.EN_REPRODUCCION)))
    }
}
