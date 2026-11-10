package co.edu.cue.nuclear.cliente.ui.screens.detalle

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ReproduccionActual
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.data.cola.TipoVoto
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.screens.cola.CargaCola
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Estado de una canción respecto a la cola y sus textos (lógica de presentación; el servidor decide siempre). */
class EstadoCancionEnColaTest {

    private fun cancion(id: String) = Cancion(id, "Titulo $id", "Canal", 200, null, true)

    private fun solicitud(
        video: String,
        esMia: Boolean = false,
        miVoto: TipoVoto? = null,
        estado: EstadoSolicitud = EstadoSolicitud.PENDIENTE,
    ) = SolicitudCola("S-$video", cancion(video), estado, 2, 3, esMia, miVoto, 420)

    private val suena = ReproduccionActual("S0", cancion("SUENA"), 134)

    private fun cola(vararg pendientes: SolicitudCola, sonando: ReproduccionActual? = suena) =
        CargaCola.Exito(EstadoCola(sonando, pendientes.toList()))

    // --- estadoDeCancionEnCola ---------------------------------------------------------------

    @Test
    fun `mientras la cola carga o falla no se sabe nada y no se bloquea`() {
        assertEquals(EstadoCancionEnCola.Desconocido, estadoDeCancionEnCola(CargaCola.Cargando, "A"))
        assertEquals(EstadoCancionEnCola.Desconocido, estadoDeCancionEnCola(CargaCola.Error(TipoErrorCola.CONEXION), "A"))
        assertFalse(EstadoCancionEnCola.Desconocido.yaEstaEnLaCola)
    }

    @Test
    fun `con la cola vacia la cancion esta disponible`() {
        assertEquals(EstadoCancionEnCola.Disponible, estadoDeCancionEnCola(CargaCola.Vacia, "A"))
    }

    @Test
    fun `una cancion que no esta en la cola ni suena esta disponible`() {
        assertEquals(EstadoCancionEnCola.Disponible, estadoDeCancionEnCola(cola(solicitud("B")), "A"))
        assertFalse(EstadoCancionEnCola.Disponible.yaEstaEnLaCola)
    }

    @Test
    fun `la cancion que suena se reconoce`() {
        val estado = estadoDeCancionEnCola(cola(solicitud("B")), "SUENA")

        assertTrue(estado is EstadoCancionEnCola.Sonando)
        assertTrue(estado.yaEstaEnLaCola)
    }

    @Test
    fun `una solicitud pendiente de otra persona se reconoce como pendiente`() {
        val estado = estadoDeCancionEnCola(cola(solicitud("B"), solicitud("A")), "A")

        assertTrue(estado is EstadoCancionEnCola.Pendiente)
        assertEquals("S-A", (estado as EstadoCancionEnCola.Pendiente).solicitud.idSolicitud)
        assertTrue(estado.yaEstaEnLaCola)
    }

    @Test
    fun `una solicitud pendiente de este dispositivo se reconoce como solicitada por ti`() {
        val estado = estadoDeCancionEnCola(cola(solicitud("A", esMia = true, miVoto = TipoVoto.AUTOMATICO)), "A")

        assertTrue(estado is EstadoCancionEnCola.SolicitadaPorTi)
        assertTrue(estado.yaEstaEnLaCola)
    }

    @Test
    fun `si suena y ademas hay otra solicitud pendiente manda lo que suena`() {
        val carga = cola(solicitud("SUENA"))

        assertTrue(estadoDeCancionEnCola(carga, "SUENA") is EstadoCancionEnCola.Sonando)
    }

    @Test
    fun `una solicitud que ya no esta pendiente no bloquea una nueva`() {
        val reproducida = solicitud("A", estado = EstadoSolicitud.REPRODUCIDA)
        val fallida = solicitud("B", estado = EstadoSolicitud.FALLIDA)

        assertEquals(EstadoCancionEnCola.Disponible, estadoDeCancionEnCola(cola(reproducida, fallida), "A"))
        assertEquals(EstadoCancionEnCola.Disponible, estadoDeCancionEnCola(cola(reproducida, fallida), "B"))
    }

    @Test
    fun `sin cancion sonando solo cuentan las solicitudes pendientes`() {
        val carga = cola(solicitud("A"), sonando = null)

        assertTrue(estadoDeCancionEnCola(carga, "A") is EstadoCancionEnCola.Pendiente)
        assertEquals(EstadoCancionEnCola.Disponible, estadoDeCancionEnCola(carga, "SUENA"))
    }

    // --- textos -------------------------------------------------------------------------------

    @Test
    fun `disponible y desconocido no muestran tarjeta`() {
        assertNull(EstadoCancionEnCola.Disponible.textos())
        assertNull(EstadoCancionEnCola.Desconocido.textos())
    }

    @Test
    fun `la cancion que suena lo dice con claridad`() {
        val t = EstadoCancionEnCola.Sonando(suena).textos()!!

        assertEquals("Ahora suena", t.insignia)
        assertEquals("Esta canción suena ahora.", t.titulo)
        assertEquals(TonoVisual.Acento, t.tono)
    }

    @Test
    fun `solicitada por ti solo afirma el voto automatico si el repositorio lo informo`() {
        val conAutomatico = EstadoCancionEnCola.SolicitadaPorTi(solicitud("A", esMia = true, miVoto = TipoVoto.AUTOMATICO)).textos()!!
        val sinVoto = EstadoCancionEnCola.SolicitadaPorTi(solicitud("A", esMia = true, miVoto = null)).textos()!!

        assertEquals("Solicitada por ti", conAutomatico.insignia)
        assertEquals("Incluye tu voto automático.", conAutomatico.detalle)
        assertNull(sinVoto.detalle)
    }

    @Test
    fun `una pendiente de otra persona distingue si ya votaste`() {
        val sinVoto = EstadoCancionEnCola.Pendiente(solicitud("A")).textos()!!
        val votada = EstadoCancionEnCola.Pendiente(solicitud("A", miVoto = TipoVoto.MANUAL)).textos()!!

        assertEquals("En la cola", sinVoto.insignia)
        assertEquals("Para apoyarla con un voto, ve a la cola.", sinVoto.detalle)
        assertEquals("Ya votaste por ella.", votada.detalle)
    }

    @Test
    fun `los textos no afirman reglas de elegibilidad que decide el servidor`() {
        val todos = listOf(
            EstadoCancionEnCola.Sonando(suena),
            EstadoCancionEnCola.SolicitadaPorTi(solicitud("A", esMia = true, miVoto = TipoVoto.AUTOMATICO)),
            EstadoCancionEnCola.Pendiente(solicitud("A")),
        ).mapNotNull { it.textos() }.joinToString(" ") { "${it.titulo} ${it.detalle.orEmpty()}" }.lowercase()

        assertFalse(todos.contains("puedes votar"))
        assertFalse(todos.contains("no puedes"))
        assertFalse(todos.contains("intervalo"))
    }
}
