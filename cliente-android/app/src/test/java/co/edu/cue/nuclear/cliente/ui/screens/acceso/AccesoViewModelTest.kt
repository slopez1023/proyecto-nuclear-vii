package co.edu.cue.nuclear.cliente.ui.screens.acceso

import co.edu.cue.nuclear.cliente.data.dispositivo.DataStoreEnMemoria
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.eventos.Evento
import co.edu.cue.nuclear.cliente.data.eventos.RegistradorFalso
import co.edu.cue.nuclear.cliente.data.sesion.SesionActiva
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import co.edu.cue.nuclear.cliente.data.sesion.EstablecimientoDto
import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo
import co.edu.cue.nuclear.cliente.data.sesion.Sesion
import co.edu.cue.nuclear.cliente.data.sesion.SesionApi
import co.edu.cue.nuclear.cliente.data.sesion.SesionDto
import co.edu.cue.nuclear.cliente.data.sesion.SesionRepository
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
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
class AccesoViewModelTest {
    private val dispositivos = DispositivoRepository(DataStoreEnMemoria())

    private val sesionOk = SesionDto("SES-1", EstablecimientoDto("EST-1", "Bar Demo"), "activa", provisional = true)

    @Before
    fun preparar() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun limpiar() {
        Dispatchers.resetMain()
    }

    private val eventos = RegistradorFalso()
    private val sesionActiva = SesionActivaStore()

    private fun viewModel(token: String?, api: SesionApi) =
        AccesoViewModel(token, SesionRepository(api), dispositivos, eventos, sesionActiva)

    private fun apiQueResponde(respuesta: Response<SesionDto>) = object : SesionApi {
        override suspend fun obtener(token: String) = respuesta
    }

    private fun rechazo(status: Int, codigo: String): Response<SesionDto> = Response.error(
        status,
        """{"error":{"codigo":"$codigo","mensaje":"x"}}""".toResponseBody("application/json".toMediaType()),
    )

    /** El UUID se obtiene en el hilo de IO de DataStore, así que se espera al estado final. */
    private suspend fun AccesoViewModel.estadoFinal(): AccesoEstado =
        estado.first { it != AccesoEstado.Cargando }

    @Test
    fun sinToken_estadoSinQr_yNoLlamaAlServidor() {
        var llamadas = 0
        val api = object : SesionApi {
            override suspend fun obtener(token: String): Response<SesionDto> {
                llamadas++
                return Response.success(sesionOk)
            }
        }

        val vm = viewModel(null, api)

        assertEquals(AccesoEstado.SinQr, vm.estado.value)
        assertEquals(0, llamadas)
    }

    @Test
    fun tokenValido_terminaEnValidoConElUuidDelDispositivo() = runTest {
        val vm = viewModel("demo-activa-001", apiQueResponde(Response.success(sesionOk)))

        val estado = vm.estadoFinal() as AccesoEstado.Valido

        assertEquals(Sesion("SES-1", "Bar Demo", provisional = true, idEstablecimiento = "EST-1"), estado.sesion)
        assertEquals(dispositivos.obtenerId(), estado.dispositivoId)
    }

    @Test
    fun sesionInexistente_estadoRechazado() = runTest {
        val vm = viewModel("no-existe-12345", apiQueResponde(rechazo(404, "sesion_inexistente")))
        assertEquals(AccesoEstado.Rechazado(MotivoRechazo.SESION_INEXISTENTE), vm.estadoFinal())
    }

    @Test
    fun sesionCerrada_estadoRechazado() = runTest {
        val vm = viewModel("demo-cerrada-002", apiQueResponde(rechazo(410, "sesion_cerrada")))
        assertEquals(AccesoEstado.Rechazado(MotivoRechazo.SESION_CERRADA), vm.estadoFinal())
    }

    @Test
    fun tokenConFormatoInvalido_estadoRechazadoTokenInvalido() = runTest {
        val vm = viewModel("x", apiQueResponde(Response.success(sesionOk)))
        assertEquals(AccesoEstado.Rechazado(MotivoRechazo.TOKEN_INVALIDO), vm.estadoFinal())
    }

    @Test
    fun errorDeRed_estadoErrorConexion_yReintentarRecupera() = runTest {
        var fallar = true
        val api = object : SesionApi {
            override suspend fun obtener(token: String): Response<SesionDto> {
                if (fallar) throw IOException("sin red")
                return Response.success(sesionOk)
            }
        }
        val vm = viewModel("demo-activa-001", api)
        assertEquals(AccesoEstado.ErrorConexion, vm.estadoFinal())

        fallar = false
        vm.reintentar() // vuelve a Cargando y luego al resultado final

        assertEquals(AccesoEstado.Valido::class, vm.estadoFinal()::class)
    }

    @Test
    fun errorDelServidor_estadoErrorServidor() = runTest {
        val vm = viewModel("demo-activa-001", apiQueResponde(rechazo(500, "error_interno")))
        assertEquals(AccesoEstado.ErrorServidor, vm.estadoFinal())
    }

    @Test
    fun reintentarSinToken_noCambiaElEstado() {
        val vm = viewModel(null, apiQueResponde(Response.success(sesionOk)))
        vm.reintentar()
        assertEquals(AccesoEstado.SinQr, vm.estado.value)
    }

    @Test
    fun sesionValida_emiteDispositivoUnidoNoRecurrenteYGuardaLaSesionActiva() = runTest {
        val vm = viewModel("demo-activa-001", apiQueResponde(Response.success(sesionOk)))

        val estado = vm.estadoFinal() as AccesoEstado.Valido

        assertEquals(listOf<Evento>(Evento.DispositivoUnido("SES-1", estado.dispositivoId, recurrente = false)), eventos.eventos)
        assertEquals(SesionActiva("SES-1", estado.dispositivoId, idEstablecimiento = "EST-1"), sesionActiva.actual)
    }

    @Test
    fun alVolverAUnirse_elEventoEsRecurrente() = runTest {
        viewModel("demo-activa-001", apiQueResponde(Response.success(sesionOk))).estadoFinal()
        viewModel("demo-activa-001", apiQueResponde(Response.success(sesionOk))).estadoFinal()

        assertEquals(listOf(false, true), eventos.eventos.map { (it as Evento.DispositivoUnido).recurrente })
        assertEquals(1, eventos.eventos.map { it.dispositivoId }.toSet().size) // mismo UUID
    }

    @Test
    fun sinSesionValida_noSeEmiteNingunEvento() = runTest {
        viewModel("no-existe-12345", apiQueResponde(rechazo(404, "sesion_inexistente"))).estadoFinal()
        viewModel("demo-activa-001", apiQueResponde(rechazo(500, "error_interno"))).estadoFinal()
        viewModel("x", apiQueResponde(Response.success(sesionOk))).estadoFinal()

        assertTrue(eventos.eventos.isEmpty())
        assertEquals(null, sesionActiva.actual)
    }

    @Test
    fun reintentarTrasUnErrorDeRed_emiteUnSoloEvento() = runTest {
        var fallar = true
        val api = object : SesionApi {
            override suspend fun obtener(token: String): Response<SesionDto> {
                if (fallar) throw IOException("sin red")
                return Response.success(sesionOk)
            }
        }
        val vm = viewModel("demo-activa-001", api)
        vm.estadoFinal()
        assertTrue(eventos.eventos.isEmpty())

        fallar = false
        vm.reintentar()
        vm.estadoFinal()

        assertEquals(1, eventos.eventos.size)
    }
}
