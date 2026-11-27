package co.edu.cue.nuclear.cliente.data.sesion

import co.edu.cue.nuclear.cliente.data.crearSesionApi
import java.net.SocketTimeoutException
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import retrofit2.Response
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * Pruebas del repositorio contra un servidor HTTP SIMULADO (MockWebServer) que reproduce el contrato
 * real de GET /api/sesiones/:token. No prueban el backend real; para eso ver docs/entregable-3.
 */
class SesionRepositoryTest {
    private lateinit var servidor: MockWebServer
    private lateinit var repositorio: SesionRepository

    @Before
    fun preparar() {
        servidor = MockWebServer().apply { start() }
        repositorio = SesionRepository(crearSesionApi(servidor.url("/").toString()))
    }

    @After
    fun limpiar() {
        runCatching { servidor.shutdown() }
    }

    private fun responder(codigo: Int, cuerpo: String) {
        servidor.enqueue(
            MockResponse().setResponseCode(codigo).setHeader("Content-Type", "application/json").setBody(cuerpo),
        )
    }

    private fun error(codigo: String) = """{"error":{"codigo":"$codigo","mensaje":"Acceso no disponible para este código QR."}}"""

    @Test
    fun conservaElIdDelEstablecimientoYDelaSesion() = runTest {
        responder(200, """{"id_sesion":"S1","establecimiento":{"id_establecimiento":"E1","nombre":"Bar"},"estado":"activa"}""")

        val sesion = (repositorio.validar("demo-activa-001") as ResultadoAcceso.Valido).sesion

        assertEquals("S1", sesion.idSesion)
        assertEquals("E1", sesion.idEstablecimiento)
    }

    @Test
    fun sesionActiva_devuelveValidoConDatosDelBackend() = runTest {
        responder(
            200,
            """{"id_sesion":"SES-MOCK-001","establecimiento":{"id_establecimiento":"EST-MOCK-001","nombre":"La Nota Bar (demo)"},"estado":"activa","provisional":true,"campo_nuevo":1}""",
        )

        val resultado = repositorio.validar("demo-activa-001")

        assertEquals(
            ResultadoAcceso.Valido(Sesion("SES-MOCK-001", "La Nota Bar (demo)", provisional = true, idEstablecimiento = "EST-MOCK-001")),
            resultado,
        )
        assertEquals("/api/sesiones/demo-activa-001", servidor.takeRequest().path)
    }

    @Test
    fun sinCampoProvisional_seAsumeNoProvisional() = runTest {
        responder(200, """{"id_sesion":"S1","establecimiento":{"id_establecimiento":"E1","nombre":"Bar"},"estado":"activa"}""")

        val resultado = repositorio.validar("token-valido-1") as ResultadoAcceso.Valido

        assertEquals(false, resultado.sesion.provisional)
    }

    @Test
    fun tokenConFormatoInvalido_seRechazaSinLlamarAlServidor() = runTest {
        val resultado = repositorio.validar("x")

        assertEquals(ResultadoAcceso.Rechazado(MotivoRechazo.TOKEN_INVALIDO), resultado)
        assertEquals(0, servidor.requestCount)
    }

    @Test
    fun tokenNulo_seRechazaSinLlamarAlServidor() = runTest {
        assertEquals(ResultadoAcceso.Rechazado(MotivoRechazo.TOKEN_INVALIDO), repositorio.validar(null))
        assertEquals(0, servidor.requestCount)
    }

    @Test
    fun http400_esTokenInvalido() = runTest {
        responder(400, error("token_invalido"))
        assertEquals(ResultadoAcceso.Rechazado(MotivoRechazo.TOKEN_INVALIDO), repositorio.validar("token-valido-1"))
    }

    @Test
    fun http404_esSesionInexistente() = runTest {
        responder(404, error("sesion_inexistente"))
        assertEquals(ResultadoAcceso.Rechazado(MotivoRechazo.SESION_INEXISTENTE), repositorio.validar("no-existe-12345"))
    }

    @Test
    fun http410SesionCerrada_esSesionCerrada() = runTest {
        responder(410, error("sesion_cerrada"))
        assertEquals(ResultadoAcceso.Rechazado(MotivoRechazo.SESION_CERRADA), repositorio.validar("demo-cerrada-002"))
    }

    @Test
    fun http410QrDesactivado_esQrDesactivado() = runTest {
        responder(410, error("qr_desactivado"))
        assertEquals(ResultadoAcceso.Rechazado(MotivoRechazo.QR_DESACTIVADO), repositorio.validar("demo-qr-desactivado-003"))
    }

    @Test
    fun http410ConCodigoDesconocido_esErrorDeServidor() = runTest {
        responder(410, error("motivo_nuevo"))
        assertEquals(ResultadoAcceso.ErrorServidor, repositorio.validar("token-valido-1"))
    }

    @Test
    fun http500_esErrorDeServidor() = runTest {
        responder(500, error("error_interno"))
        assertEquals(ResultadoAcceso.ErrorServidor, repositorio.validar("token-valido-1"))
    }

    @Test
    fun rechazoSinCuerpoLegible_esErrorDeServidor() = runTest {
        responder(404, "<html>no es json</html>")
        assertEquals(ResultadoAcceso.ErrorServidor, repositorio.validar("token-valido-1"))
    }

    @Test
    fun respuestaExitosaConCuerpoIlegible_esErrorDeServidor() = runTest {
        responder(200, "esto no es json")
        assertEquals(ResultadoAcceso.ErrorServidor, repositorio.validar("token-valido-1"))
    }

    @Test
    fun servidorCaido_esErrorDeConexion() = runTest {
        servidor.shutdown()
        assertEquals(ResultadoAcceso.ErrorConexion, repositorio.validar("token-valido-1"))
    }

    @Test
    fun resolverCodigo_200_conservaCerosInicialesYDevuelveToken() = runTest {
        responder(200, """{"qr_token":"ponga-token-01"}""")

        val resultado = repositorio.resolverCodigo("004281", "uuid-disp-1")

        assertEquals(ResultadoCodigo.Valido("ponga-token-01"), resultado)
        val req = servidor.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/api/sesiones/acceso-codigo", req.path)
        assertEquals("uuid-disp-1", req.getHeader("X-Dispositivo-Id"))
        assertEquals("""{"codigo":"004281"}""", req.body.readUtf8())
    }

    @Test
    fun resolverCodigo_incompleto_noLlamaAlServidor() = runTest {
        assertEquals(ResultadoCodigo.NoDisponible, repositorio.resolverCodigo("0042"))
        assertEquals(0, servidor.requestCount)
    }

    @Test
    fun resolverCodigo_404_esNoDisponible() = runTest {
        responder(404, """{"error":{"codigo":"codigo_no_disponible","mensaje":"No disponible"}}""")
        assertEquals(ResultadoCodigo.NoDisponible, repositorio.resolverCodigo("004281"))
    }

    @Test
    fun resolverCodigo_429_devuelveDemasiadosIntentosConRetryAfter() = runTest {
        servidor.enqueue(
            MockResponse()
                .setResponseCode(429)
                .setHeader("Retry-After", "45")
                .setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"codigo":"demasiados_intentos","mensaje":"Espera","reintentar_en_s":45}}"""),
        )
        assertEquals(ResultadoCodigo.DemasiadosIntentos(45), repositorio.resolverCodigo("004281"))
    }

    @Test
    fun resolverCodigo_500_esErrorServidor() = runTest {
        responder(500, """{"error":{"codigo":"error_interno","mensaje":"Error"}}""")
        assertEquals(ResultadoCodigo.ErrorServidor, repositorio.resolverCodigo("004281"))
    }

    @Test
    fun resolverCodigo_servidorCaido_esErrorConexion() = runTest {
        servidor.shutdown()
        assertEquals(ResultadoCodigo.ErrorConexion, repositorio.resolverCodigo("004281"))
    }

    @Test
    fun resolverCodigo_timeout_esTiempoAgotado() = runTest {
        val apiTimeout = object : SesionApi {
            override suspend fun obtener(token: String): Response<SesionDto> = kotlin.error("no usado")
            override suspend fun resolverCodigo(peticion: CodigoAccesoPeticionDto, dispositivoId: String?): Response<CodigoAccesoRespuestaDto> {
                throw SocketTimeoutException("timeout")
            }
        }
        val repoTimeout = SesionRepository(apiTimeout)
        assertEquals(ResultadoCodigo.TiempoAgotado, repoTimeout.resolverCodigo("004281"))
    }
}
