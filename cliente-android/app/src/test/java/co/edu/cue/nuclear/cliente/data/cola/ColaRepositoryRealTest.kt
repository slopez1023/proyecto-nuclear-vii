package co.edu.cue.nuclear.cliente.data.cola

import co.edu.cue.nuclear.cliente.data.InterceptorDispositivo
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.crearRetrofit
import co.edu.cue.nuclear.cliente.data.sesion.SesionActiva
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * `ColaRepositoryReal` contra un servidor HTTP SIMULADO (MockWebServer) que responde con los cuerpos EXACTOS del
 * backend (fixture `contrato-e4.json`). No prueban el backend real ni PostgreSQL.
 */
class ColaRepositoryRealTest {
    private val uuid = "3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b"
    private val cancion = Cancion("fJ9rUzIMcZQ", "Bohemian Rhapsody", "Queen Official", 355, null, true)

    private lateinit var servidor: MockWebServer
    private lateinit var sesionActiva: SesionActivaStore
    private lateinit var repositorio: ColaRepositoryReal

    @Before
    fun preparar() {
        servidor = MockWebServer().apply { start() }
        sesionActiva = SesionActivaStore().apply { actual = SesionActiva("SES-MOCK-001", uuid, "EST-MOCK-001") }
        repositorio = ColaRepositoryReal(
            crearRetrofit(servidor.url("/").toString(), sesionActiva).create(ColaApi::class.java),
            sesionActiva,
        )
    }

    @After
    fun limpiar() {
        runCatching { servidor.shutdown() }
    }

    private fun responder(status: Int, cuerpo: String) {
        servidor.enqueue(MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json; charset=utf-8").setBody(cuerpo))
    }

    private fun responderCaso(caso: String) = responder(ContratoE4.status(caso), ContratoE4.cuerpo(caso))

    private fun error(codigo: String, detalle: String? = null) =
        """{"error":{"codigo":"$codigo","mensaje":"m"${if (detalle != null) ""","detalle":$detalle""" else ""}}}"""

    /** Cliente con lectura corta para provocar timeouts sin esperar los 15 s reales. */
    private fun repositorioConTimeout(): ColaRepositoryReal {
        val cliente = OkHttpClient.Builder()
            .connectTimeout(500, TimeUnit.MILLISECONDS)
            .readTimeout(300, TimeUnit.MILLISECONDS)
            .addInterceptor(InterceptorDispositivo(sesionActiva))
            .build()
        val api = Retrofit.Builder()
            .baseUrl(servidor.url("/"))
            .client(cliente)
            .addConverterFactory(Json { ignoreUnknownKeys = true }.asConverterFactory("application/json; charset=UTF-8".toMediaType()))
            .build()
            .create(ColaApi::class.java)
        return ColaRepositoryReal(api, sesionActiva)
    }

    // --- Rutas, cabecera y cuerpo --------------------------------------------------------------

    @Test
    fun `consultar la cola usa el id_sesion y envia el UUID en la cabecera`() = runTest {
        responderCaso("estado_cola")

        val r = repositorio.obtenerCola() as ResultadoCola.Exito
        val peticion = servidor.takeRequest()

        assertEquals("GET", peticion.method)
        assertEquals("/api/sesiones/SES-MOCK-001/cola", peticion.path)
        assertEquals(uuid, peticion.getHeader("X-Dispositivo-Id"))
        assertEquals(5L, r.estado.version)
        assertEquals(listOf("SOL-2", "SOL-3"), r.estado.cola.map { it.idSolicitud })
    }

    @Test
    fun `solicitar envia solo el id del video a la ruta de la sesion`() = runTest {
        responderCaso("solicitar_creada")

        val r = repositorio.solicitar(cancion) as ResultadoSolicitud.Aceptada
        val peticion = servidor.takeRequest()

        assertEquals("POST", peticion.method)
        assertEquals("/api/sesiones/SES-MOCK-001/solicitudes", peticion.path)
        assertEquals(uuid, peticion.getHeader("X-Dispositivo-Id"))
        assertTrue(peticion.getHeader("Content-Type").orEmpty().startsWith("application/json"))
        val cuerpo = Json.parseToJsonElement(peticion.body.readUtf8()).jsonObject
        assertEquals(setOf("youtube_video_id"), cuerpo.keys)
        assertEquals("fJ9rUzIMcZQ", cuerpo["youtube_video_id"]!!.jsonPrimitive.content)
        assertEquals("SOL-2", r.solicitud.idSolicitud)
    }

    @Test
    fun `votar usa la ruta de votos de la solicitud y no lleva cuerpo`() = runTest {
        responderCaso("votar_manual")

        val r = repositorio.votar("SOL-2") as ResultadoVoto.Registrado
        val peticion = servidor.takeRequest()

        assertEquals("POST", peticion.method)
        assertEquals("/api/sesiones/SES-MOCK-001/solicitudes/SOL-2/votos", peticion.path)
        assertEquals(uuid, peticion.getHeader("X-Dispositivo-Id"))
        assertEquals(0L, peticion.bodySize)
        assertEquals(TipoVoto.MANUAL, r.origenVoto)
    }

    @Test
    fun `las rutas usan el id de sesion y nunca el token del QR`() = runTest {
        responderCaso("estado_cola")
        sesionActiva.actual = SesionActiva("SES-MOCK-001", uuid)

        repositorio.obtenerCola()

        assertTrue(!servidor.takeRequest().path!!.contains("demo-activa"))
    }

    // --- 200 y 201 ------------------------------------------------------------------------------

    @Test
    fun `201 es una solicitud nueva y 200 un voto sumado`() = runTest {
        responderCaso("solicitar_creada") // 201
        responderCaso("solicitar_voto_sumado_en_reproduccion") // 200

        val nueva = repositorio.solicitar(cancion) as ResultadoSolicitud.Aceptada
        val sumado = repositorio.solicitar(cancion) as ResultadoSolicitud.Aceptada

        assertEquals(false, nueva.sumoVotoAExistente)
        assertEquals(true, sumado.sumoVotoAExistente)
        assertNull(sumado.solicitud.posicion) // suena: no tiene posición
        assertEquals(EstadoSolicitud.EN_REPRODUCCION, sumado.solicitud.estado)
    }

    // --- Errores del contrato -----------------------------------------------------------------

    @Test
    fun `409 intervalo_no_cumplido es un rechazo con las canciones restantes`() = runTest {
        responderCaso("error_intervalo_no_cumplido")

        val r = repositorio.solicitar(cancion)

        assertEquals(ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 2), r)
    }

    @Test
    fun `409 voto_duplicado en solicitar y en votar`() = runTest {
        responderCaso("error_voto_duplicado")
        responderCaso("error_voto_duplicado")

        assertEquals(ResultadoVoto.Rechazado(MotivoRechazoOperacion.VOTO_DUPLICADO), repositorio.votar("SOL-2"))
        assertEquals(ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.VOTO_DUPLICADO), repositorio.solicitar(cancion))
    }

    @Test
    fun `409 solicitud_no_votable al votar la que suena`() = runTest {
        responderCaso("error_solicitud_no_votable")

        assertEquals(ResultadoVoto.Rechazado(MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE), repositorio.votar("SOL-1"))
    }

    @Test
    fun `422 cancion_no_permitida y 404 cancion_inexistente son cancion no disponible`() = runTest {
        responderCaso("error_cancion_no_permitida")
        responder(404, error("cancion_inexistente"))

        val noPermitida = repositorio.solicitar(cancion)
        val inexistente = repositorio.solicitar(cancion)

        assertEquals(ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.CANCION_NO_DISPONIBLE), noPermitida)
        assertEquals(ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.CANCION_NO_DISPONIBLE), inexistente)
    }

    @Test
    fun `sesion cerrada, QR desactivado o sesion inexistente son sesion no disponible`() = runTest {
        responderCaso("error_sesion_cerrada") // 410 sesion_cerrada
        responder(410, error("qr_desactivado"))
        responder(404, error("sesion_inexistente"))

        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SESION_NO_DISPONIBLE), repositorio.solicitar(cancion))
        assertEquals(ResultadoCola.Error(TipoErrorCola.SESION_NO_DISPONIBLE), repositorio.obtenerCola())
        assertEquals(ResultadoVoto.Error(TipoErrorCola.SESION_NO_DISPONIBLE), repositorio.votar("SOL-2"))
    }

    @Test
    fun `los errores de formato y solicitud inexistente son errores de servidor, no decisiones de negocio`() = runTest {
        responderCaso("error_dispositivo_id_invalido")
        responderCaso("error_cancion_invalida")
        responder(404, error("solicitud_inexistente"))

        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR), repositorio.solicitar(cancion))
        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR), repositorio.solicitar(cancion))
        assertEquals(ResultadoVoto.Error(TipoErrorCola.SERVIDOR), repositorio.votar("SOL-99"))
    }

    @Test
    fun `502 y 503 de YouTube son servicio no disponible`() = runTest {
        responder(503, error("sin_api_key"))
        responder(502, error("youtube_no_disponible"))
        responder(503, error("cuota_excedida"))

        repeat(3) { assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SERVICIO_NO_DISPONIBLE), repositorio.solicitar(cancion)) }
    }

    @Test
    fun `500 y un cuerpo sin formato son error de servidor`() = runTest {
        responder(500, error("error_interno"))
        responder(500, "<html>Bad gateway</html>")

        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR), repositorio.solicitar(cancion))
        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR), repositorio.solicitar(cancion))
    }

    @Test
    fun `un codigo de 409 desconocido no se inventa como rechazo`() = runTest {
        responder(409, error("regla_nueva"))

        assertEquals(ResultadoVoto.Error(TipoErrorCola.SERVIDOR), repositorio.votar("SOL-2"))
    }

    @Test
    fun `una respuesta que no cumple el contrato es error de servidor`() = runTest {
        responder(200, "esto no es json")
        responder(201, """{"resultado":"otra_cosa","solicitud":${solicitudJson("pendiente")},"voto":{"id_voto":"V","id_solicitud":"S","origen":"solicitud","fecha_hora":"x"}}""")
        responder(200, """{"sesion_id":"S","version":1,"generado_en":"2026-11-10T20:00:00.000Z","cola":[${solicitudJson("saltada")}]}""")

        assertEquals(ResultadoCola.Error(TipoErrorCola.SERVIDOR), repositorio.obtenerCola())
        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR), repositorio.solicitar(cancion))
        assertEquals(ResultadoCola.Error(TipoErrorCola.SERVIDOR), repositorio.obtenerCola())
    }

    private fun solicitudJson(estado: String) =
        """{"posicion":1,"id_solicitud":"SOL-1","estado":"$estado","total_votos":1,"fecha_solicitud":"2026-11-10T20:00:00.000Z",
            "cancion":{"youtube_video_id":"aaaaaaaaaaa","titulo":"t","artista_canal":"c"}}"""

    // --- Errores añadidos al fixture en la fase de cierre ---------------------------------------

    @Test
    fun `todos los errores del fixture se traducen sin caer en un error generico por accidente`() = runTest {
        val esperados = mapOf(
            "error_solicitud_no_votable" to ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE),
            "error_cancion_inexistente" to ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.CANCION_NO_DISPONIBLE),
            "error_cancion_en_vivo" to ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.CANCION_NO_DISPONIBLE),
            "error_cancion_demasiado_larga" to ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.CANCION_NO_DISPONIBLE),
            "error_youtube_no_disponible" to ResultadoSolicitud.Error(TipoErrorCola.SERVICIO_NO_DISPONIBLE),
            "error_sesion_inexistente" to ResultadoSolicitud.Error(TipoErrorCola.SESION_NO_DISPONIBLE),
            "error_qr_desactivado" to ResultadoSolicitud.Error(TipoErrorCola.SESION_NO_DISPONIBLE),
            "error_solicitud_inexistente" to ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR),
            "error_metodo_no_permitido" to ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR),
        )
        for ((caso, esperado) in esperados) {
            if (ContratoE4.cuerpo(caso) == "null") {
                servidor.enqueue(MockResponse().setResponseCode(ContratoE4.status(caso))) // 405: sin cuerpo
            } else {
                responderCaso(caso)
            }
            assertEquals(caso, esperado, repositorio.solicitar(cancion))
        }
    }

    @Test
    fun `votar la cancion que suena (H3c) se acepta y no es un rechazo`() = runTest {
        responderCaso("votar_en_reproduccion")

        val r = repositorio.votar("SOL-1") as ResultadoVoto.Registrado

        assertEquals(EstadoSolicitud.EN_REPRODUCCION, r.solicitud.estado)
        assertEquals(TipoVoto.MANUAL, r.origenVoto)
    }

    // --- Sin sesión ---------------------------------------------------------------------------

    @Test
    fun `sin sesion activa no se llama a la red`() = runTest {
        sesionActiva.actual = null

        assertEquals(ResultadoCola.Error(TipoErrorCola.SESION_NO_DISPONIBLE), repositorio.obtenerCola())
        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SESION_NO_DISPONIBLE), repositorio.solicitar(cancion))
        assertEquals(ResultadoVoto.Error(TipoErrorCola.SESION_NO_DISPONIBLE), repositorio.votar("SOL-2"))
        assertEquals(0, servidor.requestCount)
    }

    // --- Timeouts y conexión ------------------------------------------------------------------

    @Test
    fun `un timeout al solicitar queda sin confirmar y no se repite la peticion`() = runTest {
        servidor.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))

        val r = repositorioConTimeout().solicitar(cancion)

        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SIN_CONFIRMAR), r)
        assertEquals(1, servidor.requestCount) // una sola vez: la repetición queda en manos de quien consulta la cola
    }

    @Test
    fun `un timeout al votar queda sin confirmar`() = runTest {
        servidor.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))

        assertEquals(ResultadoVoto.Error(TipoErrorCola.SIN_CONFIRMAR), repositorioConTimeout().votar("SOL-2"))
        assertEquals(1, servidor.requestCount)
    }

    @Test
    fun `un timeout al consultar la cola es un error de conexion y se puede repetir`() = runTest {
        servidor.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        val repo = repositorioConTimeout()

        assertEquals(ResultadoCola.Error(TipoErrorCola.CONEXION), repo.obtenerCola())

        responderCaso("estado_cola")
        assertTrue(repo.obtenerCola() is ResultadoCola.Exito)
    }

    @Test
    fun `tras un timeout la cola consultada muestra la solicitud que si se registro`() = runTest {
        val repo = repositorioConTimeout()
        servidor.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SIN_CONFIRMAR), repo.solicitar(cancion))

        // El servidor sí la había registrado: la consulta de la cola la muestra con es_mia y ya_voto.
        responderCaso("estado_cola")
        val cola = (repo.obtenerCola() as ResultadoCola.Exito).estado

        assertEquals(2, cola.cola.size)
    }

    @Test
    fun `sin servidor alcanzable es un error de conexion tambien al solicitar`() = runTest {
        val repo = repositorioConTimeout()
        servidor.shutdown()

        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.CONEXION), repo.solicitar(cancion))
        assertEquals(ResultadoCola.Error(TipoErrorCola.CONEXION), repo.obtenerCola())
    }
}
