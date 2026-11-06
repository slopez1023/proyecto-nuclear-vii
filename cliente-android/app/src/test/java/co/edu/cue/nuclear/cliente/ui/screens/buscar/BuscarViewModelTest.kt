package co.edu.cue.nuclear.cliente.ui.screens.buscar

import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaApi
import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaRepository
import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaRespuestaDto
import co.edu.cue.nuclear.cliente.data.busqueda.CancionDto
import co.edu.cue.nuclear.cliente.data.busqueda.SugerenciasRespuestaDto
import co.edu.cue.nuclear.cliente.data.busqueda.TipoErrorBusqueda
import co.edu.cue.nuclear.cliente.data.eventos.Evento
import co.edu.cue.nuclear.cliente.data.eventos.RegistradorFalso
import co.edu.cue.nuclear.cliente.data.sesion.SesionActiva
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class BuscarViewModelTest {

    private class ApiFalsa : BusquedaApi {
        val consultasBusqueda = mutableListOf<String>()
        val consultasSugerencias = mutableListOf<String>()
        var respuestaBusqueda: () -> Response<BusquedaRespuestaDto> = { Response.success(BusquedaRespuestaDto(emptyList())) }
        var respuestaSugerencias: () -> Response<SugerenciasRespuestaDto> = { Response.success(SugerenciasRespuestaDto(emptyList())) }

        override suspend fun buscar(consulta: String): Response<BusquedaRespuestaDto> {
            consultasBusqueda += consulta
            return respuestaBusqueda()
        }

        override suspend fun sugerencias(consulta: String): Response<SugerenciasRespuestaDto> {
            consultasSugerencias += consulta
            return respuestaSugerencias()
        }
    }

    private val api = ApiFalsa()
    private val eventos = RegistradorFalso()
    private val sesionActiva = SesionActivaStore().apply { actual = SesionActiva("SES-1", "dispositivo-uuid") }
    private lateinit var viewModel: BuscarViewModel

    private fun cancionDto(id: String) = CancionDto(id, "Título $id", "Canal", 200, "https://i.ytimg.com/$id.jpg")

    private fun <T : Any> errorHttp(status: Int, codigo: String): Response<T> = Response.error(
        status,
        """{"error":{"codigo":"$codigo","mensaje":"x"}}""".toResponseBody("application/json".toMediaType()),
    )

    @Before
    fun preparar() {
        Dispatchers.setMain(StandardTestDispatcher())
        viewModel = BuscarViewModel(BusquedaRepository(api), eventos, sesionActiva, debounceMs = 450)
    }

    @After
    fun limpiar() {
        Dispatchers.resetMain()
    }

    @Test
    fun alEmpezar_estadoInicial() {
        assertEquals(BuscarUiState(), viewModel.estado.value)
    }

    @Test
    fun autocompletado_noConsultaConMenosDeTresCaracteres() = runTest {
        viewModel.onConsultaCambio("ab")
        advanceUntilIdle()

        assertTrue(api.consultasSugerencias.isEmpty())
    }

    @Test
    fun autocompletado_esperaAQueElUsuarioDejeDeEscribir() = runTest {
        api.respuestaSugerencias = { Response.success(SugerenciasRespuestaDto(listOf("Shakira - Soltera"))) }

        viewModel.onConsultaCambio("Sha")
        advanceTimeBy(200)
        viewModel.onConsultaCambio("Shak")
        advanceTimeBy(200)
        viewModel.onConsultaCambio("Shaki")
        advanceTimeBy(449)
        runCurrent()
        assertTrue("aún no debe consultar", api.consultasSugerencias.isEmpty())

        advanceTimeBy(2)
        runCurrent()

        assertEquals(listOf("Shaki"), api.consultasSugerencias) // una sola consulta, con el texto final
        assertEquals(listOf("Shakira - Soltera"), viewModel.estado.value.sugerencias)
    }

    @Test
    fun autocompletado_conErrorNoMuestraSugerenciasNiFallaLaPantalla() = runTest {
        api.respuestaSugerencias = { errorHttp(503, "cuota_excedida") }

        viewModel.onConsultaCambio("Shakira")
        advanceUntilIdle()

        assertTrue(viewModel.estado.value.sugerencias.isEmpty())
        assertEquals(ResultadosUi.Inicial, viewModel.estado.value.resultados)
    }

    @Test
    fun alEscribirDeNuevo_seLimpianLasSugerenciasAnteriores() = runTest {
        api.respuestaSugerencias = { Response.success(SugerenciasRespuestaDto(listOf("Shakira - Soltera"))) }
        viewModel.onConsultaCambio("Shakira")
        advanceUntilIdle()
        assertEquals(1, viewModel.estado.value.sugerencias.size)

        viewModel.onConsultaCambio("Shakira W")

        assertTrue(viewModel.estado.value.sugerencias.isEmpty())
    }

    @Test
    fun buscar_pasaPorCargandoYMuestraResultados() = runTest {
        api.respuestaBusqueda = { Response.success(BusquedaRespuestaDto(listOf(cancionDto("a"), cancionDto("b")))) }
        viewModel.onConsultaCambio("Queen")

        viewModel.buscar()
        assertEquals(ResultadosUi.Cargando, viewModel.estado.value.resultados)
        advanceUntilIdle()

        val resultados = viewModel.estado.value.resultados as ResultadosUi.Exito
        assertEquals(listOf("a", "b"), resultados.canciones.map { it.youtubeVideoId })
        assertEquals(listOf("Queen"), api.consultasBusqueda)
    }

    @Test
    fun buscar_sinResultados() = runTest {
        viewModel.onConsultaCambio("zzqxjk")
        viewModel.buscar()
        advanceUntilIdle()

        assertEquals(ResultadosUi.SinResultados("zzqxjk"), viewModel.estado.value.resultados)
    }

    @Test
    fun buscar_ignoraConsultasConMenosDeDosCaracteres() = runTest {
        viewModel.onConsultaCambio("a")
        viewModel.buscar()
        advanceUntilIdle()

        assertTrue(api.consultasBusqueda.isEmpty())
        assertEquals(ResultadosUi.Inicial, viewModel.estado.value.resultados)
    }

    @Test
    fun buscar_cancelaElAutocompletadoPendiente() = runTest {
        viewModel.onConsultaCambio("Queen")
        viewModel.buscar() // antes de que venza el debounce
        advanceUntilIdle()

        assertTrue(api.consultasSugerencias.isEmpty())
        assertTrue(viewModel.estado.value.sugerencias.isEmpty())
    }

    @Test
    fun elegirSugerencia_poneElTextoYBusca() = runTest {
        viewModel.elegirSugerencia("Shakira - Soltera")
        advanceUntilIdle()

        assertEquals("Shakira - Soltera", viewModel.estado.value.consulta)
        assertEquals(listOf("Shakira - Soltera"), api.consultasBusqueda)
    }

    @Test
    fun errorDeConexion_yReintentarRecupera() = runTest {
        var fallar = true
        api.respuestaBusqueda = {
            if (fallar) throw IOException("sin red")
            Response.success(BusquedaRespuestaDto(listOf(cancionDto("a"))))
        }
        viewModel.onConsultaCambio("Queen")
        viewModel.buscar()
        advanceUntilIdle()
        assertEquals(ResultadosUi.Error(TipoErrorBusqueda.CONEXION), viewModel.estado.value.resultados)

        fallar = false
        viewModel.reintentar()
        advanceUntilIdle()

        assertTrue(viewModel.estado.value.resultados is ResultadosUi.Exito)
    }

    @Test
    fun cuotaAgotada_yClaveInvalida_seReflejanEnElEstado() = runTest {
        api.respuestaBusqueda = { errorHttp(503, "cuota_excedida") }
        viewModel.onConsultaCambio("Queen")
        viewModel.buscar()
        advanceUntilIdle()
        assertEquals(ResultadosUi.Error(TipoErrorBusqueda.CUOTA), viewModel.estado.value.resultados)

        api.respuestaBusqueda = { errorHttp(503, "api_key_invalida") }
        viewModel.onConsultaCambio("Queen 2")
        viewModel.buscar()
        advanceUntilIdle()
        assertEquals(ResultadosUi.Error(TipoErrorBusqueda.SERVICIO_NO_DISPONIBLE), viewModel.estado.value.resultados)
    }

    @Test
    fun mensajesDeError_soloOfreceReintentarCuandoPuedeServir() {
        assertTrue(TipoErrorBusqueda.CONEXION.aMensaje().reintentable)
        assertTrue(TipoErrorBusqueda.SERVIDOR.aMensaje().reintentable)
        assertEquals(false, TipoErrorBusqueda.CUOTA.aMensaje().reintentable)
        assertEquals(false, TipoErrorBusqueda.SERVICIO_NO_DISPONIBLE.aMensaje().reintentable)
        assertEquals(false, TipoErrorBusqueda.CONSULTA_INVALIDA.aMensaje().reintentable)
    }

    @Test
    fun busquedaExitosa_emiteBusquedaRealizadaConTerminoYCantidad() = runTest {
        api.respuestaBusqueda = { Response.success(BusquedaRespuestaDto(listOf(cancionDto("a"), cancionDto("b")))) }
        viewModel.onConsultaCambio("  Queen  ")
        viewModel.buscar()
        advanceUntilIdle()

        assertEquals(
            listOf<Evento>(Evento.BusquedaRealizada("SES-1", "dispositivo-uuid", "Queen", 2, desdeCache = false)),
            eventos.eventos,
        )
    }

    @Test
    fun busquedaSinResultados_tambienSeRegistraConCantidadCero() = runTest {
        viewModel.onConsultaCambio("zzqxjk")
        viewModel.buscar()
        advanceUntilIdle()

        assertEquals(0, (eventos.eventos.single() as Evento.BusquedaRealizada).cantidadResultados)
    }

    @Test
    fun busquedaRepetida_seRegistraComoDesdeCache() = runTest {
        api.respuestaBusqueda = { Response.success(BusquedaRespuestaDto(listOf(cancionDto("a")))) }
        viewModel.onConsultaCambio("Queen")
        viewModel.buscar()
        advanceUntilIdle()
        viewModel.buscar()
        advanceUntilIdle()

        assertEquals(listOf(false, true), eventos.eventos.map { (it as Evento.BusquedaRealizada).desdeCache })
        assertEquals(1, api.consultasBusqueda.size) // la segunda no llegó al servidor
    }

    @Test
    fun busquedaConError_noSeRegistra() = runTest {
        api.respuestaBusqueda = { errorHttp(503, "cuota_excedida") }
        viewModel.onConsultaCambio("Queen")
        viewModel.buscar()
        advanceUntilIdle()

        assertTrue(eventos.eventos.isEmpty())
    }

    @Test
    fun elAutocompletado_noGeneraEventos() = runTest {
        api.respuestaSugerencias = { Response.success(SugerenciasRespuestaDto(listOf("Shakira - Soltera"))) }
        viewModel.onConsultaCambio("Shakira")
        advanceUntilIdle()

        assertTrue(eventos.eventos.isEmpty())
    }

    @Test
    fun sinSesionActiva_noSeRegistraNada() = runTest {
        sesionActiva.actual = null
        api.respuestaBusqueda = { Response.success(BusquedaRespuestaDto(listOf(cancionDto("a")))) }
        viewModel.onConsultaCambio("Queen")
        viewModel.buscar()
        advanceUntilIdle()

        assertTrue(eventos.eventos.isEmpty())
        assertTrue(viewModel.estado.value.resultados is ResultadosUi.Exito) // la búsqueda funciona igual
    }
}
