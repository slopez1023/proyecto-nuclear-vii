package co.edu.cue.nuclear.cliente.ui.screens.codigo

import co.edu.cue.nuclear.cliente.data.dispositivo.DataStoreEnMemoria
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.sesion.CodigoAccesoPeticionDto
import co.edu.cue.nuclear.cliente.data.sesion.CodigoAccesoRespuestaDto
import co.edu.cue.nuclear.cliente.data.sesion.SesionApi
import co.edu.cue.nuclear.cliente.data.sesion.SesionDto
import co.edu.cue.nuclear.cliente.data.sesion.SesionRepository
import java.io.IOException
import java.net.SocketTimeoutException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class CodigoAccesoViewModelTest {
    private val dispositivos = DispositivoRepository(DataStoreEnMemoria())

    @Before
    fun preparar() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun limpiar() {
        Dispatchers.resetMain()
    }

    private fun errorResp(status: Int, body: String): Response<CodigoAccesoRespuestaDto> =
        Response.error(status, body.toResponseBody("application/json".toMediaType()))

    @Test
    fun botonDeshabilitadoSiCodigoIncompletoYNormalizaCeros() = runTest {
        val api = object : SesionApi {
            override suspend fun obtener(token: String): Response<SesionDto> = error("no")
            override suspend fun resolverCodigo(peticion: CodigoAccesoPeticionDto, dispositivoId: String?) =
                Response.success(CodigoAccesoRespuestaDto("ponga-ok-001"))
        }
        val vm = CodigoAccesoViewModel(SesionRepository(api), dispositivos)

        assertFalse(vm.estado.value.puedeIngresar)
        vm.alCambiarCodigo("00a42b")
        assertEquals("0042", vm.estado.value.codigo)
        assertFalse(vm.estado.value.puedeIngresar)

        vm.ingresar()
        assertNotNull(vm.estado.value.mensaje)

        vm.alCambiarCodigo("00428199")
        assertEquals("004281", vm.estado.value.codigo)
        assertTrue(vm.estado.value.puedeIngresar)
        assertNull(vm.estado.value.mensaje)
    }

    @Test
    fun impideEnviosDoblesMientrasCargaYResuelveToken() = runTest {
        val gate = CompletableDeferred<Unit>()
        var llamadas = 0
        val api = object : SesionApi {
            override suspend fun obtener(token: String): Response<SesionDto> = error("no")
            override suspend fun resolverCodigo(peticion: CodigoAccesoPeticionDto, dispositivoId: String?): Response<CodigoAccesoRespuestaDto> {
                llamadas++
                gate.await()
                return Response.success(CodigoAccesoRespuestaDto("ponga-ok-001"))
            }
        }
        val vm = CodigoAccesoViewModel(SesionRepository(api), dispositivos)
        vm.alCambiarCodigo("004281")

        vm.ingresar()
        assertTrue(vm.estado.value.cargando)
        assertFalse(vm.estado.value.puedeIngresar)
        vm.ingresar()
        assertEquals(1, llamadas)

        gate.complete(Unit)
        assertFalse(vm.estado.value.cargando)
        assertEquals("ponga-ok-001", vm.estado.value.tokenResuelto)
    }

    @Test
    fun mapeaErroresSinDetallesTecnicosInternos() = runTest {
        var modo = "404"
        val api = object : SesionApi {
            override suspend fun obtener(token: String): Response<SesionDto> = error("no")
            override suspend fun resolverCodigo(peticion: CodigoAccesoPeticionDto, dispositivoId: String?): Response<CodigoAccesoRespuestaDto> =
                when (modo) {
                    "404" -> errorResp(404, """{"error":{"codigo":"codigo_no_disponible","mensaje":"x"}}""")
                    "429" -> errorResp(429, """{"error":{"codigo":"demasiados_intentos","mensaje":"x","reintentar_en_s":30}}""")
                    "timeout" -> throw SocketTimeoutException("read timed out")
                    "red" -> throw IOException("network down")
                    else -> errorResp(500, """{"error":{"codigo":"error_interno","mensaje":"stack"}}""")
                }
        }
        val vm = CodigoAccesoViewModel(SesionRepository(api), dispositivos)
        vm.alCambiarCodigo("123456")

        vm.ingresar()
        assertTrue(vm.estado.value.mensaje!!.contains("no es válido", ignoreCase = true))

        modo = "429"
        vm.ingresar()
        assertTrue(vm.estado.value.mensaje!!.contains("30"))

        modo = "timeout"
        vm.ingresar()
        assertTrue(vm.estado.value.mensaje!!.contains("tardó demasiado", ignoreCase = true))

        modo = "red"
        vm.ingresar()
        assertTrue(vm.estado.value.mensaje!!.contains("conexión", ignoreCase = true))

        modo = "500"
        vm.ingresar()
        assertTrue(vm.estado.value.mensaje!!.contains("inesperado", ignoreCase = true))
    }
}
