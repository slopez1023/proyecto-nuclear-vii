package co.edu.cue.nuclear.cliente.data.eventos

import co.edu.cue.nuclear.cliente.data.crearEventosApi
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Prueba de contrato: los cuerpos que arma la app deben ser idénticos a los de
 * backend/test/fixtures/eventos-e3.json, los mismos que el backend acepta en
 * backend/test/contrato-eventos.test.js. El servidor HTTP es SIMULADO (MockWebServer).
 */
class EventosRepositoryTest {
    private lateinit var servidor: MockWebServer
    private lateinit var repositorio: EventosRepository
    private val job = Job()

    private val fixtures: JsonObject = Json.parseToJsonElement(
        File("../../backend/test/fixtures/eventos-e3.json").readText(),
    ).jsonObject

    private val sesion = "SES-MOCK-001"
    private val dispositivo = "3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b"

    @Before
    fun preparar() {
        servidor = MockWebServer().apply { start() }
        repositorio = EventosRepository(
            crearEventosApi(servidor.url("/").toString()),
            CoroutineScope(Dispatchers.IO + job),
        )
    }

    @After
    fun limpiar() = runTest {
        job.cancelAndJoin()
        runCatching { servidor.shutdown() }
    }

    private fun aceptar() = servidor.enqueue(
        MockResponse().setResponseCode(202).setHeader("Content-Type", "application/json").setBody("""{"evento_id":"abc"}"""),
    )

    @Test
    fun dispositivoUnido_producExactamenteElCuerpoDelContrato() {
        assertEquals(fixtures["dispositivo_unido"], EventosRepository.aJson(Evento.DispositivoUnido(sesion, dispositivo, recurrente = false)))
        assertEquals(fixtures["dispositivo_unido_recurrente"], EventosRepository.aJson(Evento.DispositivoUnido(sesion, dispositivo, recurrente = true)))
    }

    @Test
    fun busquedaRealizada_producExactamenteElCuerpoDelContrato() {
        val termino = "Queen Bohemian Rhapsody"
        assertEquals(fixtures["busqueda_realizada"], EventosRepository.aJson(Evento.BusquedaRealizada(sesion, dispositivo, termino, 10, desdeCache = false)))
        assertEquals(fixtures["busqueda_realizada_desde_cache"], EventosRepository.aJson(Evento.BusquedaRealizada(sesion, dispositivo, termino, 10, desdeCache = true)))
    }

    @Test
    fun enviar_hacePostAlEndpointRealConElCuerpoDelContrato() = runTest {
        aceptar()

        val aceptado = repositorio.enviar(Evento.DispositivoUnido(sesion, dispositivo, recurrente = false))

        assertTrue(aceptado)
        val peticion = servidor.takeRequest()
        assertEquals("POST", peticion.method)
        assertEquals("/api/eventos", peticion.path)
        assertTrue(peticion.getHeader("Content-Type")!!.startsWith("application/json"))
        assertEquals(fixtures["dispositivo_unido"], Json.parseToJsonElement(peticion.body.readUtf8()))
    }

    @Test
    fun enviar_servidorRechazaElEvento_devuelveFalse() = runTest {
        servidor.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":{"codigo":"tipo_no_soportado","mensaje":"x"}}"""))
        assertFalse(repositorio.enviar(Evento.DispositivoUnido(sesion, dispositivo, recurrente = false)))
    }

    @Test
    fun enviar_servidorCaido_noLanzaExcepcionYDevuelveFalse() = runTest {
        servidor.shutdown()
        assertFalse(repositorio.enviar(Evento.BusquedaRealizada(sesion, dispositivo, "queen", 3, desdeCache = false)))
    }

    @Test
    fun registrar_enviaEnSegundoPlano() {
        aceptar()

        repositorio.registrar(Evento.DispositivoUnido(sesion, dispositivo, recurrente = false))

        val peticion = servidor.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)
        assertEquals("/api/eventos", peticion?.path)
    }
}
