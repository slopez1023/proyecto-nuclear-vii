package co.edu.cue.nuclear.cliente.ui.screens.cola

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ReproduccionActual
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Decide qué solicitud resalta la cola y a cuál se desplaza (lógica de presentación; no prueba el dibujo). */
class ColaScreenLogicaTest {

    private fun solicitud(id: String) = SolicitudCola(
        idSolicitud = id,
        cancion = Cancion("V-$id", "Titulo $id", "Canal", 200, null, true),
        estado = EstadoSolicitud.PENDIENTE,
        posicion = 1,
        totalVotos = 1,
        esMia = false,
        miVoto = null,
        esperaEstimadaSegundos = null,
    )

    private val suena = ReproduccionActual("S0", Cancion("V-S0", "Suena", "Canal", 200, null, true), 100)
    private fun cola(vararg ids: String) = CargaCola.Exito(EstadoCola(suena, ids.map(::solicitud)))

    @Test
    fun `una solicitud destacada que esta en la lista se resalta`() {
        assertEquals("C", idDestacadoEnLista(cola("A", "B", "C"), "C"))
    }

    @Test
    fun `una solicitud destacada al final de la lista tambien cuenta`() {
        assertEquals("Z", idDestacadoEnLista(cola("A", "B", "C", "D", "E", "Z"), "Z"))
    }

    @Test
    fun `si la solicitud ya no esta en la lista no hay nada que resaltar`() {
        assertNull(idDestacadoEnLista(cola("A", "B"), "C"))
    }

    @Test
    fun `sin destacado no se resalta nada`() {
        assertNull(idDestacadoEnLista(cola("A", "B"), null))
    }

    @Test
    fun `solo se resalta cuando hay datos de la cola`() {
        assertNull(idDestacadoEnLista(CargaCola.Cargando, "A"))
        assertNull(idDestacadoEnLista(CargaCola.Vacia, "A"))
        assertNull(idDestacadoEnLista(CargaCola.Error(TipoErrorCola.CONEXION), "A"))
    }
}
