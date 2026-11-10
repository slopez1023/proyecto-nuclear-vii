package co.edu.cue.nuclear.cliente.data.cola

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** DTO y mapeadores contra los ejemplos REALES del backend (backend/test/fixtures/contrato-e4.json). */
class ColaMapeadoresTest {

    private fun estado(caso: String): EstadoCola =
        ContratoE4.json.decodeFromString<EstadoColaDto>(ContratoE4.cuerpo(caso)).aDominio()

    private fun solicitarCaso(caso: String): ResultadoSolicitud.Aceptada =
        ContratoE4.json.decodeFromString<SolicitudRespuestaDto>(ContratoE4.cuerpo(caso)).aDominio()

    // --- Cola ---------------------------------------------------------------------------------

    @Test
    fun `el estado de la cola conserva version, reglas y elegibilidad`() {
        val e = estado("estado_cola")

        assertEquals(5L, e.version)
        assertEquals(Instant.parse("2026-11-10T20:16:40.000Z"), e.generadoEn)
        assertEquals(ReglasVotacion(dispositivosActivos = 2, intervaloCanciones = 2), e.reglasVotacion)
        assertEquals(MiVotacion(puedeVotar = false, intervaloCanciones = 2, reproduccionesContadas = 0, cancionesRestantes = 2), e.miVotacion)
    }

    @Test
    fun `la cola mantiene el orden del servidor y no se reordena`() {
        val e = estado("estado_cola")

        assertEquals(listOf("SOL-2", "SOL-3"), e.cola.map { it.idSolicitud })
        assertEquals(listOf(1, 2), e.cola.map { it.posicion })
        assertEquals(listOf(2, 1), e.cola.map { it.totalVotos })
    }

    @Test
    fun `la espera estimada viene en segundos y puede ser nula`() {
        val e = estado("estado_cola")

        assertEquals(134, e.cola[0].esperaEstimadaSegundos)
        assertEquals(489, e.cola[1].esperaEstimadaSegundos)
        assertEquals(134, e.reproduccionActual?.segundosRestantesEstimados)
    }

    @Test
    fun `ya_voto y es_mia se conservan por separado`() {
        val e = estado("estado_cola")

        // SOL-2 es de otro dispositivo y este ya votó; SOL-3 es de otro y no ha votado.
        assertEquals(false, e.cola[0].esMia)
        assertEquals(true, e.cola[0].yaVoto)
        assertEquals(false, e.cola[1].esMia)
        assertEquals(false, e.cola[1].yaVoto)
        assertFalse(e.cola[0].puedeVotar) // ya votó
        assertTrue(e.cola[1].puedeVotar)
    }

    @Test
    fun `la cancion que suena viaja aparte y no esta en la cola`() {
        val e = estado("estado_cola")
        val sonando = e.reproduccionActual!!

        assertEquals("SOL-1", sonando.idSolicitud)
        assertEquals("REP-1", sonando.idReproduccion)
        assertEquals("Billie Jean", sonando.cancion.titulo)
        assertEquals("Zi_XLOBDo_Y", sonando.cancion.youtubeVideoId)
        assertTrue(e.cola.none { it.idSolicitud == sonando.idSolicitud })
        assertTrue(e.cola.all { it.estado == EstadoSolicitud.PENDIENTE })
    }

    @Test
    fun `los campos opcionales de la cancion pueden ser nulos`() {
        val yesterday = estado("estado_cola").cola[1].cancion

        assertNull(yesterday.urlMiniatura)
        assertEquals(125, yesterday.duracionSegundos)
    }

    @Test
    fun `la vista publica no trae elegibilidad ni marcas personales`() {
        val e = estado("estado_cola_publica")

        assertNull(e.miVotacion)
        assertEquals(ReglasVotacion(2, 2), e.reglasVotacion) // las reglas vienen siempre
        assertTrue(e.cola.all { !it.yaVoto && !it.esMia })
    }

    @Test
    fun `una cola vacia y sin reproduccion llega por el flujo y se lee igual`() {
        val data = ContratoE4.lineasFlujo("flujo_primer_mensaje").first { it.startsWith("data: ") }.removePrefix("data: ")

        val e = ContratoE4.json.decodeFromString<EstadoColaDto>(data).aDominio()

        assertEquals(11L, e.version)
        assertNull(e.reproduccionActual)
        assertTrue(e.cola.isEmpty())
        assertTrue(e.estaVacia)
        assertEquals(1, e.miVotacion?.reproduccionesContadas)
        // H1: con la cola vacía y nada sonando el servidor deja pedir (canciones_restantes = 0) aunque no se cumpla el intervalo.
        assertEquals(true, e.miVotacion?.puedeVotar)
        assertEquals(0, e.miVotacion?.cancionesRestantes)
        assertEquals(3, e.reglasVotacion?.dispositivosActivos)
    }

    // --- Solicitar ----------------------------------------------------------------------------

    @Test
    fun `201 solicitud_creada es una solicitud nueva con su voto automatico`() {
        assertEquals(201, ContratoE4.status("solicitar_creada"))

        val r = solicitarCaso("solicitar_creada")

        assertFalse(r.sumoVotoAExistente)
        assertEquals("SOL-2", r.solicitud.idSolicitud)
        assertEquals(1, r.solicitud.totalVotos)
        assertTrue(r.solicitud.esMia)
        assertTrue(r.solicitud.yaVoto)
        assertEquals(TipoVoto.AUTOMATICO, r.origenVoto)
        assertEquals(false, r.miVotacion?.puedeVotar)
        assertEquals(231, r.solicitud.esperaEstimadaSegundos)
    }

    @Test
    fun `la primera solicitud de una cola sin nada sonando tiene espera cero`() {
        val r = solicitarCaso("solicitar_billie_jean")

        assertEquals(0, r.solicitud.esperaEstimadaSegundos)
        assertEquals(1, r.solicitud.posicion)
    }

    @Test
    fun `200 voto_sumado sobre la cancion que suena no tiene posicion ni espera`() {
        assertEquals(200, ContratoE4.status("solicitar_voto_sumado_en_reproduccion"))

        val r = solicitarCaso("solicitar_voto_sumado_en_reproduccion")

        assertTrue(r.sumoVotoAExistente)
        assertEquals(EstadoSolicitud.EN_REPRODUCCION, r.solicitud.estado)
        assertNull(r.solicitud.posicion)
        assertNull(r.solicitud.esperaEstimadaSegundos)
        assertEquals(3, r.solicitud.totalVotos)
    }

    @Test
    fun `un voto sumado no se clasifica como manual solo porque es_mia sea falso`() {
        val r = solicitarCaso("solicitar_voto_sumado_en_reproduccion")

        assertFalse(r.solicitud.esMia)
        assertTrue(r.solicitud.yaVoto)
        // El origen sale de voto.origen ("solicitud"), no de es_mia/ya_voto.
        assertEquals(TipoVoto.AUTOMATICO, r.origenVoto)
    }

    // --- Votar --------------------------------------------------------------------------------

    @Test
    fun `201 de un voto manual trae origen manual y la solicitud actualizada`() {
        assertEquals(201, ContratoE4.status("votar_manual"))

        val r = ContratoE4.json.decodeFromString<VotoRespuestaDto>(ContratoE4.cuerpo("votar_manual")).aDominio()

        assertEquals(TipoVoto.MANUAL, r.origenVoto)
        assertEquals("SOL-2", r.solicitud.idSolicitud)
        assertEquals(2, r.solicitud.totalVotos)
        assertTrue(r.solicitud.yaVoto)
        assertFalse(r.solicitud.esMia)
        assertEquals(false, r.miVotacion?.puedeVotar)
    }

    // --- Respuestas fuera de contrato -----------------------------------------------------------

    @Test
    fun `un estado de solicitud desconocido es una respuesta inesperada`() {
        val dto = ContratoE4.json.decodeFromString<SolicitudColaDto>(
            """{"id_solicitud":"SOL-9","estado":"saltada","total_votos":1,"fecha_solicitud":"2026-11-10T20:00:00.000Z",
               "cancion":{"youtube_video_id":"aaaaaaaaaaa","titulo":"t","artista_canal":"c"}}""",
        )

        assertThrows(RespuestaInesperadaException::class.java) { dto.aDominio() }
    }

    @Test
    fun `una fecha ilegible es una respuesta inesperada`() {
        val dto = ContratoE4.json.decodeFromString<EstadoColaDto>(
            """{"sesion_id":"S","version":1,"generado_en":"ayer","cola":[]}""",
        )

        assertThrows(RespuestaInesperadaException::class.java) { dto.aDominio() }
    }

    @Test
    fun `un campo nuevo del servidor no rompe la lectura`() {
        val dto = ContratoE4.json.decodeFromString<EstadoColaDto>(
            """{"sesion_id":"S","version":2,"generado_en":"2026-11-10T20:00:00.000Z","campo_nuevo":123,"cola":[]}""",
        )

        assertEquals(2L, dto.aDominio().version)
    }

    // --- Versiones ------------------------------------------------------------------------------

    @Test
    fun `solo un estado con version mayor reemplaza al aplicado`() {
        fun con(version: Long?) = EstadoCola(null, emptyList(), version = version)

        assertTrue(con(6).esMasNuevoQue(5))
        assertFalse(con(5).esMasNuevoQue(5))
        assertFalse(con(4).esMasNuevoQue(5))
        assertTrue(con(1).esMasNuevoQue(null)) // nada aplicado todavía
        assertTrue(con(null).esMasNuevoQue(5)) // sin versión (datos simulados): se acepta
    }

    @Test
    fun `el fixture cubre los casos que las pruebas necesitan`() {
        val esperados = setOf(
            "estado_cola", "estado_cola_publica", "solicitar_creada", "solicitar_billie_jean", "votar_manual",
            "solicitar_voto_sumado_en_reproduccion", "error_intervalo_no_cumplido", "error_voto_duplicado",
            "error_solicitud_no_votable", "error_cancion_no_permitida", "error_sesion_cerrada",
            "error_dispositivo_id_invalido", "error_cancion_invalida", "flujo_primer_mensaje",
        )
        assertTrue("Faltan casos en el fixture: ${esperados - ContratoE4.nombres}", ContratoE4.nombres.containsAll(esperados))
    }

    // --- Decisiones de cierre (H3c) y casos añadidos al fixture ----------------------------------

    @Test
    fun `H3c 201 votar la cancion que suena queda en reproduccion sin posicion ni espera y con origen manual`() {
        assertEquals(201, ContratoE4.status("votar_en_reproduccion"))

        val r = ContratoE4.json.decodeFromString<VotoRespuestaDto>(ContratoE4.cuerpo("votar_en_reproduccion")).aDominio()

        assertEquals(EstadoSolicitud.EN_REPRODUCCION, r.solicitud.estado)
        assertNull(r.solicitud.posicion)
        assertNull(r.solicitud.esperaEstimadaSegundos)
        assertEquals(TipoVoto.MANUAL, r.origenVoto)
        assertTrue(r.solicitud.yaVoto)
        assertFalse(r.solicitud.puedeVotar) // la app no ofrece votar lo que ya suena, aunque el servidor lo acepte
    }

    @Test
    fun `200 voto_sumado sobre una solicitud pendiente conserva su posicion y su espera`() {
        assertEquals(200, ContratoE4.status("solicitar_voto_sumado_en_cola"))

        val r = solicitarCaso("solicitar_voto_sumado_en_cola")

        assertTrue(r.sumoVotoAExistente)
        assertEquals(EstadoSolicitud.PENDIENTE, r.solicitud.estado)
        assertEquals(TipoVoto.AUTOMATICO, r.origenVoto)
        assertFalse(r.solicitud.esMia)
        assertTrue(r.solicitud.yaVoto)
    }

    @Test
    fun `una actualizacion del flujo trae una version mayor que la del primer mensaje`() {
        fun version(caso: String) = ContratoE4.lineasFlujo(caso).first { it.startsWith("data: ") }.removePrefix("data: ")
            .let { ContratoE4.json.decodeFromString<EstadoColaDto>(it).aDominio().version!! }

        assertTrue(version("flujo_actualizacion") > version("flujo_primer_mensaje"))
    }
}
