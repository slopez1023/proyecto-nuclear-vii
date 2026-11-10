package co.edu.cue.nuclear.cliente.ui.components

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.MiVotacion
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Lógica pura de presentación de los componentes de la cola (no prueba dibujo). */
class ComponentesColaTest {

    private fun solicitud(
        estado: EstadoSolicitud = EstadoSolicitud.PENDIENTE,
        yaVoto: Boolean = false,
        esMia: Boolean = false,
    ) = SolicitudCola(
        idSolicitud = "S1",
        cancion = Cancion("V1", "Titulo", "Canal", 200, null, true),
        estado = estado,
        posicion = 1,
        totalVotos = 1,
        esMia = esMia,
        yaVoto = yaVoto,
        esperaEstimadaSegundos = null,
    )

    // --- Botón de voto ---------------------------------------------------------------------

    @Test
    fun `una pendiente sin voto propio se puede votar`() {
        assertEquals(EstadoBotonVoto.Disponible, solicitud().estadoBotonVoto(votando = false))
    }

    @Test
    fun `mientras se vota el boton queda en proceso`() {
        assertEquals(EstadoBotonVoto.EnProceso, solicitud().estadoBotonVoto(votando = true))
    }

    @Test
    fun `la solicitud propia y el voto a una ajena se muestran distinto sin deducir el origen`() {
        assertEquals(EstadoBotonVoto.Votado, solicitud(yaVoto = true).estadoBotonVoto(false))
        assertEquals(EstadoBotonVoto.TuSolicitud, solicitud(yaVoto = true, esMia = true).estadoBotonVoto(false))
    }

    @Test
    fun `si el servidor dice que aun no se puede votar el boton queda en espera`() {
        assertEquals(EstadoBotonVoto.Espera, solicitud().estadoBotonVoto(votando = false, puedeVotarAhora = false))
        assertEquals(EstadoBotonVoto.Disponible, solicitud().estadoBotonVoto(votando = false, puedeVotarAhora = true))
    }

    @Test
    fun `la ayuda de elegibilidad no oculta que ya votaste ni que es tuya`() {
        assertEquals(EstadoBotonVoto.Votado, solicitud(yaVoto = true).estadoBotonVoto(false, puedeVotarAhora = false))
        assertEquals(EstadoBotonVoto.TuSolicitud, solicitud(yaVoto = true, esMia = true).estadoBotonVoto(false, puedeVotarAhora = false))
        assertEquals(
            EstadoBotonVoto.NoDisponible,
            solicitud(estado = EstadoSolicitud.EN_REPRODUCCION).estadoBotonVoto(false, puedeVotarAhora = false),
        )
    }

    @Test
    fun `una solicitud que ya no esta pendiente no se puede votar`() {
        assertEquals(EstadoBotonVoto.NoDisponible, solicitud(estado = EstadoSolicitud.REPRODUCIDA).estadoBotonVoto(false))
        assertEquals(EstadoBotonVoto.NoDisponible, solicitud(estado = EstadoSolicitud.EN_REPRODUCCION).estadoBotonVoto(false))
    }

    @Test
    fun `textoVotos usa singular y plural y no admite negativos`() {
        assertEquals("0 votos", textoVotos(0))
        assertEquals("1 voto", textoVotos(1))
        assertEquals("12 votos", textoVotos(12))
        assertEquals("0 votos", textoVotos(-3))
    }

    // --- Tiempo estimado -------------------------------------------------------------------

    @Test
    fun `sin dato la espera no esta disponible y con dato lo esta`() {
        assertEquals(EstadoTiempo.NoDisponible, (null as Int?).aEstadoTiempo())
        assertEquals(EstadoTiempo.Disponible(489), 489.aEstadoTiempo())
    }

    @Test
    fun `formatearEspera redondea a minutos y pasa a horas`() {
        assertEquals("menos de 1 min", formatearEspera(0))
        assertEquals("menos de 1 min", formatearEspera(29))
        assertEquals("aprox. 1 min", formatearEspera(30))
        assertEquals("aprox. 8 min", formatearEspera(489))
        assertEquals("aprox. 59 min", formatearEspera(3540))
        assertEquals("aprox. 1 h", formatearEspera(3600))
        assertEquals("aprox. 1 h 5 min", formatearEspera(3900))
    }

    @Test
    fun `formatearEspera tolera valores negativos`() {
        assertEquals("menos de 1 min", formatearEspera(-10))
    }

    // --- Mensajes --------------------------------------------------------------------------

    @Test
    fun `una solicitud nueva se confirma con el voto automatico incluido`() {
        val mensaje = ResultadoSolicitud.Aceptada(solicitud(), sumoVotoAExistente = false).aMensaje()

        assertEquals(TonoVisual.Exito, mensaje.tono)
        assertEquals("Canción solicitada", mensaje.titulo)
        assertTrue(mensaje.detalle!!.contains("ya cuenta con tu voto"))
    }

    @Test
    fun `si se sumo a una existente el mensaje lo dice`() {
        val mensaje = ResultadoSolicitud.Aceptada(solicitud(), sumoVotoAExistente = true).aMensaje()

        assertEquals("Tu voto se sumó", mensaje.titulo)
    }

    @Test
    fun `un voto registrado se confirma`() {
        val mensaje = ResultadoVoto.Registrado(solicitud()).aMensaje()

        assertEquals(TonoVisual.Exito, mensaje.tono)
    }

    @Test
    fun `el rechazo por intervalo distingue solicitud de voto e indica cuantas faltan`() {
        val deSolicitud = ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 2).aMensaje()
        val deVoto = ResultadoVoto.Rechazado(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 1).aMensaje()

        assertEquals(TonoVisual.Aviso, deSolicitud.tono)
        val textoSolicitud = deSolicitud.detalle.orEmpty()
        val textoVoto = deVoto.detalle.orEmpty()
        assertTrue(textoSolicitud.contains("Faltan 2 canciones por sonar."))
        assertTrue(textoVoto.contains("Falta 1 canción por sonar."))
        // El título distingue qué operación no se hizo.
        assertEquals("Todavía no puedes pedir otra canción", deSolicitud.titulo)
        assertEquals("Todavía no puedes votar", deVoto.titulo)
    }

    @Test
    fun `sin dato de faltantes el rechazo no inventa una cifra`() {
        val mensaje = ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO).aMensaje()

        assertFalse(mensaje.detalle!!.contains("Falta"))
    }

    @Test
    fun `cada motivo de rechazo tiene un texto propio`() {
        val titulos = MotivoRechazoOperacion.entries.map { ResultadoVoto.Rechazado(it).aMensaje().titulo }

        assertEquals(titulos.size, titulos.toSet().size)
        titulos.forEach { assertTrue(it.isNotBlank()) }
    }

    @Test
    fun `los errores de comunicacion tienen tono propio y no muestran detalles tecnicos`() {
        val avisos = setOf(TipoErrorCola.SESION_NO_DISPONIBLE, TipoErrorCola.SERVICIO_NO_DISPONIBLE, TipoErrorCola.SIN_CONFIRMAR)
        TipoErrorCola.entries.forEach {
            val mensaje = ResultadoVoto.Error(it).aMensaje()
            assertEquals(if (it in avisos) TonoVisual.Aviso else TonoVisual.Peligro, mensaje.tono)
            val texto = (mensaje.titulo + " " + mensaje.detalle).lowercase()
            assertFalse(texto.contains("http"))
            assertFalse(texto.contains("exception"))
        }
    }

    @Test
    fun `los avisos de proceso e informacion no disponible`() {
        assertTrue(MensajesOperacion.EnviandoSolicitud.enProceso)
        assertTrue(MensajesOperacion.RegistrandoVoto.enProceso)
        assertFalse(MensajesOperacion.InformacionNoDisponible.enProceso)
        assertNotNull(MensajesOperacion.InformacionNoDisponible.detalle)
        assertNull(MensajesOperacion.EnviandoSolicitud.detalle)
    }

    // --- Información sobre el intervalo de votación (F4) -------------------------------------

    private fun votacion(puede: Boolean, restantes: Int) = MiVotacion(puede, intervaloCanciones = 2, reproduccionesContadas = 2 - restantes, cancionesRestantes = restantes)

    @Test
    fun `el texto de votacion dice cuantas canciones faltan sin calcular nada`() {
        assertEquals("Ya puedes pedir una canción o votar.", textoVotacion(votacion(true, 0)))
        assertEquals("Podrás pedir otra canción o votar cuando suene 1 canción más.", textoVotacion(votacion(false, 1)))
        assertEquals("Podrás pedir otra canción o votar cuando suenen 2 canciones más.", textoVotacion(votacion(false, 2)))
        assertEquals("Podrás pedir otra canción o votar cuando suenen 8 canciones más.", textoVotacion(votacion(false, 8)))
    }

    @Test
    fun `si el servidor deja pedir (por ejemplo cola inactiva) el texto no habla de canciones que faltan`() {
        assertFalse(textoVotacion(votacion(true, 0)).contains("faltan"))
        assertFalse(textoVotacion(MiVotacion(true, 2, 1, 0)).contains("suenen"))
    }
}
