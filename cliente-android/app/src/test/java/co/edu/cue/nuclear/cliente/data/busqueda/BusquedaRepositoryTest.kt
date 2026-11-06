package co.edu.cue.nuclear.cliente.data.busqueda

import co.edu.cue.nuclear.cliente.data.crearBusquedaApi
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * Pruebas con servidor HTTP SIMULADO (MockWebServer) que reproduce el contrato de /api/busqueda.
 * La verificación contra YouTube real está en backend/test-real y en docs/entregable-3.
 */
class BusquedaRepositoryTest {
    private lateinit var servidor: MockWebServer
    private var reloj = 0L
    private lateinit var repositorio: BusquedaRepository

    private val respuestaOk = """
        {"resultados":[
          {"youtube_video_id":"fJ9rUzIMcZQ","titulo":"Queen – Bohemian Rhapsody","artista_canal":"Queen Official","duracion_segundos":360,"url_miniatura":"https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg","disponibilidad":"disponible"},
          {"youtube_video_id":"vbvyNnw8Qjg","titulo":"Live Aid","artista_canal":"Live Aid","duracion_segundos":null,"url_miniatura":null,"disponibilidad":"no_disponible"}
        ]}
    """.trimIndent()

    @Before
    fun preparar() {
        servidor = MockWebServer().apply { start() }
        repositorio = BusquedaRepository(
            api = crearBusquedaApi(servidor.url("/").toString()),
            ahora = { reloj },
            ttlMs = 1_000,
        )
    }

    @After
    fun limpiar() {
        runCatching { servidor.shutdown() }
    }

    private fun responder(codigo: Int, cuerpo: String) {
        servidor.enqueue(MockResponse().setResponseCode(codigo).setHeader("Content-Type", "application/json").setBody(cuerpo))
    }

    private fun error(codigo: String) = """{"error":{"codigo":"$codigo","mensaje":"x"}}"""

    @Test
    fun buscar_mapeaTodosLosCamposDeLaCancion() = runTest {
        responder(200, respuestaOk)

        val resultado = repositorio.buscar("  Queen Bohemian  ") as ResultadoBusqueda.Exito

        assertEquals(2, resultado.canciones.size)
        assertEquals(
            Cancion(
                youtubeVideoId = "fJ9rUzIMcZQ",
                titulo = "Queen – Bohemian Rhapsody",
                artistaCanal = "Queen Official",
                duracionSegundos = 360,
                urlMiniatura = "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg",
                disponible = true,
            ),
            resultado.canciones[0],
        )
        // información incompleta: sin duración ni miniatura y no disponible
        assertEquals(Cancion("vbvyNnw8Qjg", "Live Aid", "Live Aid", null, null, disponible = false), resultado.canciones[1])
        assertEquals("/api/busqueda?q=Queen%20Bohemian", servidor.takeRequest().path)
    }

    @Test
    fun buscar_sinResultados_devuelveListaVacia() = runTest {
        responder(200, """{"resultados":[]}""")
        assertEquals(ResultadoBusqueda.Exito(emptyList()), repositorio.buscar("zzqxjkwvv"))
    }

    @Test
    fun buscar_repetida_usaCacheSinLlamarAlServidor() = runTest {
        responder(200, respuestaOk)

        repositorio.buscar("Queen")
        repositorio.buscar("  queen ") // misma consulta normalizada

        assertEquals(1, servidor.requestCount)
    }

    @Test
    fun buscar_cacheVencida_vuelveAConsultar() = runTest {
        responder(200, respuestaOk)
        responder(200, respuestaOk)

        repositorio.buscar("Queen")
        reloj += 1_001
        repositorio.buscar("Queen")

        assertEquals(2, servidor.requestCount)
    }

    @Test
    fun buscar_losErroresNoSeCachean_yReintentarFunciona() = runTest {
        responder(502, error("youtube_error"))
        responder(200, respuestaOk)

        assertEquals(ResultadoBusqueda.Error(TipoErrorBusqueda.SERVIDOR), repositorio.buscar("Queen"))
        assertEquals(2, (repositorio.buscar("Queen") as ResultadoBusqueda.Exito).canciones.size)
    }

    @Test
    fun buscar_cuotaAgotada() = runTest {
        responder(503, error("cuota_excedida"))
        assertEquals(ResultadoBusqueda.Error(TipoErrorBusqueda.CUOTA), repositorio.buscar("Queen"))
    }

    @Test
    fun buscar_configuracionDeClaveDelBackend_esServicioNoDisponible() = runTest {
        for (codigo in listOf("api_key_invalida", "sin_api_key", "youtube_no_autorizado")) {
            responder(503, error(codigo))
            assertEquals("fallo con $codigo", ResultadoBusqueda.Error(TipoErrorBusqueda.SERVICIO_NO_DISPONIBLE), repositorio.buscar("q-$codigo"))
        }
    }

    @Test
    fun buscar_consultaInvalida() = runTest {
        responder(400, error("consulta_invalida"))
        assertEquals(ResultadoBusqueda.Error(TipoErrorBusqueda.CONSULTA_INVALIDA), repositorio.buscar("a"))
    }

    @Test
    fun buscar_errorDeYoutube() = runTest {
        responder(502, error("youtube_no_disponible"))
        assertEquals(ResultadoBusqueda.Error(TipoErrorBusqueda.SERVIDOR), repositorio.buscar("Queen"))
    }

    @Test
    fun buscar_cuerpoIlegible_esErrorDeServidor() = runTest {
        responder(200, "esto no es json")
        assertEquals(ResultadoBusqueda.Error(TipoErrorBusqueda.SERVIDOR), repositorio.buscar("Queen"))
    }

    @Test
    fun buscar_servidorCaido_esErrorDeConexion() = runTest {
        servidor.shutdown()
        assertEquals(ResultadoBusqueda.Error(TipoErrorBusqueda.CONEXION), repositorio.buscar("Queen"))
    }

    @Test
    fun sugerir_devuelveLasSugerenciasYLasCachea() = runTest {
        responder(200, """{"sugerencias":["Shakira - Soltera","Shakira - Waka Waka"]}""")

        val primera = repositorio.sugerir("Shakira")
        val segunda = repositorio.sugerir("shakira")

        assertEquals(ResultadoSugerencias.Exito(listOf("Shakira - Soltera", "Shakira - Waka Waka")), primera)
        assertEquals(primera, segunda)
        assertEquals(1, servidor.requestCount)
    }

    @Test
    fun sugerir_cuotaAgotada() = runTest {
        responder(503, error("cuota_excedida"))
        assertEquals(ResultadoSugerencias.Error(TipoErrorBusqueda.CUOTA), repositorio.sugerir("Shakira"))
    }

    @Test
    fun cancionPorId_recuerdaLasCancionesVistasEnLosResultados() = runTest {
        assertNull(repositorio.cancionPorId("fJ9rUzIMcZQ"))
        responder(200, respuestaOk)

        repositorio.buscar("Queen")

        assertEquals("Queen – Bohemian Rhapsody", repositorio.cancionPorId("fJ9rUzIMcZQ")?.titulo)
        assertNull(repositorio.cancionPorId("inexistente"))
    }
}
