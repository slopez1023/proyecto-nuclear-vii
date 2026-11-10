package co.edu.cue.nuclear.cliente.data.cola

import co.edu.cue.nuclear.cliente.data.sesion.SesionActiva
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Cliente SSE contra un servidor HTTP SIMULADO (MockWebServer) que emite el formato real del backend
 * (fixture `flujo_primer_mensaje` de contrato-e4.json). No prueba el backend ni PostgreSQL.
 */
class ColaEnVivoSseTest {
    private val uuid = "3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b"
    private lateinit var servidor: MockWebServer
    private lateinit var sesionActiva: SesionActivaStore
    private val esperas = mutableListOf<Long>()

    @Before
    fun preparar() {
        servidor = MockWebServer().apply { start() }
        sesionActiva = SesionActivaStore().apply { actual = SesionActiva("SES-MOCK-001", uuid, "EST-MOCK-001") }
    }

    @After
    fun limpiar() {
        runCatching { servidor.shutdown() }
    }

    private fun enVivo(cliente: OkHttpClient = ColaEnVivoSse.crearClienteSse()) = ColaEnVivoSse(
        cliente = cliente,
        baseUrl = servidor.url("/"),
        sesionActiva = sesionActiva,
        esperar = { esperas += it }, // sin esperar de verdad
    )

    private fun estadoJson(version: Long) =
        """{"sesion_id":"SES-MOCK-001","version":$version,"generado_en":"2026-11-10T20:21:30.000Z",""" +
            """"reproduccion_actual":null,"reglas_votacion":{"dispositivos_activos":3,"intervalo_canciones":2},""" +
            """"mi_votacion":{"puede_votar":true,"intervalo_canciones":2,"reproducciones_contadas":0,"canciones_restantes":0},"cola":[]}"""

    private fun mensaje(version: Long) = "id: $version\nevent: estado\ndata: ${estadoJson(version)}\n\n"

    private fun flujo(cuerpo: String, status: Int = 200, tipo: String = "text/event-stream; charset=utf-8") {
        servidor.enqueue(MockResponse().setResponseCode(status).setHeader("Content-Type", tipo).setBody(cuerpo))
    }

    private fun versiones(eventos: List<EventoFlujo>) = eventos.filterIsInstance<EventoFlujo.Estado>().map { it.estado.version }

    // --- Conexión y estado inicial ------------------------------------------------------------

    @Test
    fun `abre el flujo de la sesion con las cabeceras del contrato`() = runTest {
        flujo("retry: 3000\n\n" + mensaje(9))

        enVivo().flujo().take(2).toList()
        val peticion = servidor.takeRequest()

        assertEquals("GET", peticion.method)
        assertEquals("/api/sesiones/SES-MOCK-001/cola/flujo", peticion.path)
        assertEquals("text/event-stream", peticion.getHeader("Accept"))
        assertEquals(uuid, peticion.getHeader("X-Dispositivo-Id"))
    }

    @Test
    fun `el primer mensaje real del backend llega como estado inicial`() = runTest {
        val lineas = ContratoE4.lineasFlujo("flujo_primer_mensaje")
        flujo(lineas.joinToString("\n") + "\n\n")

        val eventos = enVivo().flujo().take(2).toList()

        assertEquals(EventoFlujo.Conectado, eventos[0])
        val estado = (eventos[1] as EventoFlujo.Estado).estado
        assertEquals(11L, estado.version)
        assertTrue(estado.cola.isEmpty())
        assertNull(estado.reproduccionActual)
        assertEquals(3, estado.reglasVotacion?.dispositivosActivos)
        assertEquals(true, estado.miVotacion?.puedeVotar) // H1: cola inactiva
    }

    @Test
    fun `los ping no se procesan como estados`() = runTest {
        flujo("retry: 3000\n\n: ping\n\n" + mensaje(1) + ": ping\n\n: ping\n\n" + mensaje(2))

        val eventos = enVivo().flujo().take(3).toList() // Conectado + 2 estados

        assertEquals(listOf(1L, 2L), versiones(eventos))
    }

    @Test
    fun `las actualizaciones sucesivas llegan en orden`() = runTest {
        flujo(mensaje(10) + mensaje(11) + mensaje(12))

        val eventos = enVivo().flujo().take(4).toList()

        assertEquals(listOf(10L, 11L, 12L), versiones(eventos))
    }

    @Test
    fun `un mensaje que no cumple el contrato se ignora sin cortar el flujo`() = runTest {
        flujo("event: estado\ndata: esto no es json\n\n" + "event: otro\ndata: {}\n\n" + mensaje(5))

        val eventos = enVivo().flujo().take(2).toList()

        assertEquals(listOf(5L), versiones(eventos))
    }

    // --- Reconexión ---------------------------------------------------------------------------

    @Test
    fun `al cortarse se reconecta tras el retry que dijo el servidor y vuelve a recibir el estado completo`() = runTest {
        flujo("retry: 1500\n\n" + mensaje(3)) // se cierra
        flujo("retry: 1500\n\n" + mensaje(4))

        val eventos = enVivo().flujo().take(5).toList() // Conectado, Estado, Reconectando, Conectado, Estado

        assertEquals(EventoFlujo.Reconectando(1500), eventos[2])
        assertEquals(listOf(3L, 4L), versiones(eventos))
        assertEquals(listOf(1500L), esperas)
        assertEquals(2, servidor.requestCount)
    }

    @Test
    fun `sin retry del servidor usa 3 segundos`() = runTest {
        flujo(mensaje(1))
        flujo(mensaje(2))

        val eventos = enVivo().flujo().take(5).toList()

        assertEquals(EventoFlujo.Reconectando(3000), eventos[2])
    }

    @Test
    fun `un error 503 antes del flujo se reintenta`() = runTest {
        flujo("""{"error":{"codigo":"error_interno","mensaje":"x"}}""", status = 503, tipo = "application/json")
        flujo(mensaje(7))

        val eventos = enVivo().flujo().take(3).toList() // Reconectando, Conectado, Estado

        assertTrue(eventos[0] is EventoFlujo.Reconectando)
        assertEquals(listOf(7L), versiones(eventos))
    }

    @Test
    fun `sin servidor alcanzable reintenta en lugar de terminar`() = runTest {
        val cliente = enVivo()
        servidor.shutdown()

        val eventos = cliente.flujo().take(1).toList()

        assertTrue(eventos[0] is EventoFlujo.Reconectando)
    }

    @Test
    fun `una respuesta que no es event-stream se trata como fallo y se reintenta`() = runTest {
        flujo("<html>proxy</html>", tipo = "text/html")
        flujo(mensaje(8))

        val eventos = enVivo().flujo().take(3).toList()

        assertTrue(eventos[0] is EventoFlujo.Reconectando)
        assertEquals(listOf(8L), versiones(eventos))
    }

    // --- Errores HTTP previos al flujo ----------------------------------------------------------

    @Test
    fun `410 sesion_cerrada termina sin reintentar`() = runTest {
        flujo("""{"error":{"codigo":"sesion_cerrada","mensaje":"x"}}""", status = 410, tipo = "application/json")

        val eventos = enVivo().flujo().toList()

        assertEquals(listOf<EventoFlujo>(EventoFlujo.Terminado(TipoErrorCola.SESION_NO_DISPONIBLE)), eventos)
        assertEquals(1, servidor.requestCount)
        assertTrue(esperas.isEmpty())
    }

    @Test
    fun `404 sesion_inexistente y 410 qr_desactivado terminan como sesion no disponible`() = runTest {
        flujo("""{"error":{"codigo":"sesion_inexistente","mensaje":"x"}}""", status = 404, tipo = "application/json")
        flujo("""{"error":{"codigo":"qr_desactivado","mensaje":"x"}}""", status = 410, tipo = "application/json")

        assertEquals(EventoFlujo.Terminado(TipoErrorCola.SESION_NO_DISPONIBLE), enVivo().flujo().first())
        assertEquals(EventoFlujo.Terminado(TipoErrorCola.SESION_NO_DISPONIBLE), enVivo().flujo().first())
    }

    @Test
    fun `400 dispositivo_id_invalido y un 404 sin codigo terminan como error de servidor sin bucle`() = runTest {
        flujo("""{"error":{"codigo":"dispositivo_id_invalido","mensaje":"x"}}""", status = 400, tipo = "application/json")
        flujo("<html>Cannot GET</html>", status = 404, tipo = "text/html")

        assertEquals(EventoFlujo.Terminado(TipoErrorCola.SERVIDOR), enVivo().flujo().first())
        assertEquals(EventoFlujo.Terminado(TipoErrorCola.SERVIDOR), enVivo().flujo().first())
        assertEquals(2, servidor.requestCount)
    }

    @Test
    fun `sin sesion activa no abre ninguna conexion`() = runTest {
        sesionActiva.actual = null

        val eventos = enVivo().flujo().toList()

        assertEquals(listOf<EventoFlujo>(EventoFlujo.Terminado(TipoErrorCola.SESION_NO_DISPONIBLE)), eventos)
        assertEquals(0, servidor.requestCount)
    }

    // --- Aviso de cierre de sesión dentro del flujo -------------------------------------------------

    @Test
    fun `el aviso sesion_cerrada del servidor termina el flujo sin reconectar`() = runTest {
        val lineas = ContratoE4.lineasFlujo("flujo_sesion_cerrada")
        flujo(mensaje(3) + lineas.joinToString("\n") + "\n\n")

        val eventos = enVivo().flujo().toList()

        assertEquals(listOf(3L), versiones(eventos))
        assertEquals(EventoFlujo.Terminado(TipoErrorCola.SESION_NO_DISPONIBLE), eventos.last())
        assertEquals(1, servidor.requestCount) // no se vuelve a conectar a una sesión cerrada
        assertTrue(esperas.isEmpty())
    }

    @Test
    fun `una actualizacion real del backend se aplica despues del estado inicial`() = runTest {
        val primero = ContratoE4.lineasFlujo("flujo_primer_mensaje").joinToString("\n")
        val segundo = ContratoE4.lineasFlujo("flujo_actualizacion").joinToString("\n")
        flujo(primero + "\n\n" + segundo + "\n\n")

        val eventos = enVivo().flujo().take(3).toList()

        val v = versiones(eventos)
        assertEquals(2, v.size)
        assertTrue(v[1]!! > v[0]!!)
    }

    // --- Cancelación y timeout ------------------------------------------------------------------

    @Test
    fun `cancelar la coleccion cierra el socket y no reconecta`() = runTest {
        ServidorSseManual(listOf("retry: 3000" + "\n\n" + mensaje(1))).use { abierto ->
            val conectado = CompletableDeferred<Unit>()
            val recibidos = mutableListOf<EventoFlujo>()
            val cliente = ColaEnVivoSse(ColaEnVivoSse.crearClienteSse(), abierto.url, sesionActiva, esperar = { esperas += it })

            val tarea = launch {
                cliente.flujo().collect {
                    recibidos += it
                    if (it is EventoFlujo.Estado) conectado.complete(Unit)
                }
            }
            enTiempoReal { conectado.await() }
            assertEquals(0, esperas.size) // el flujo sigue abierto
            tarea.cancel()
            enTiempoReal { tarea.join() }

            assertTrue(tarea.isCancelled)
            assertTrue("el cliente debía cerrar la conexión al cancelar", abierto.esperarCierreDelCliente())
            assertEquals(1, abierto.conexiones.get()) // no se abrió otra conexión
            assertTrue(esperas.isEmpty())
            assertEquals(listOf(1L), versiones(recibidos))
            assertTrue(abierto.ultimaPeticion.contains("X-Dispositivo-Id: $uuid", ignoreCase = true))
        }
    }

    @Test
    fun `el cliente SSE tiene una lectura de 30 segundos, mayor que los 10 del ping`() {
        val cliente = ColaEnVivoSse.crearClienteSse()

        assertEquals(TimeUnit.SECONDS.toMillis(30).toInt(), cliente.readTimeoutMillis)
        assertTrue(cliente.readTimeoutMillis > 10_000)
        assertTrue(cliente.interceptors.isEmpty()) // independiente del cliente de Retrofit
    }

    @Test
    fun `si el servidor deja de enviar (ni siquiera ping) la lectura vence y se reconecta`() = runTest {
        ServidorSseManual(listOf(mensaje(1), mensaje(2))).use { abierto ->
            val corto = ColaEnVivoSse.crearClienteSse().newBuilder().readTimeout(300, TimeUnit.MILLISECONDS).build()
            val cliente = ColaEnVivoSse(corto, abierto.url, sesionActiva, esperar = { esperas += it })

            val eventos: List<EventoFlujo> = enTiempoReal { cliente.flujo().take(5).toList() }

            assertEquals(listOf(1L, 2L), versiones(eventos))
            assertTrue(eventos.any { it is EventoFlujo.Reconectando })
            assertFalse(eventos.any { it is EventoFlujo.Terminado })
            assertEquals(2, abierto.conexiones.get())
        }
    }

    /** Espera con reloj REAL (runTest usa tiempo virtual y la E/S de red no avanza con él). */
    private suspend fun <T> enTiempoReal(bloque: suspend () -> T): T =
        withContext(Dispatchers.Default) { withTimeout(10_000) { bloque() } }
}
