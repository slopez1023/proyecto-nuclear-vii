package co.edu.cue.nuclear.cliente.ui.screens.acceso

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.sesion.EstablecimientoDto
import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo
import co.edu.cue.nuclear.cliente.data.sesion.Sesion
import co.edu.cue.nuclear.cliente.data.sesion.SesionApi
import co.edu.cue.nuclear.cliente.data.sesion.SesionDto
import co.edu.cue.nuclear.cliente.data.sesion.SesionRepository
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class AccesoViewModelTest {
    @get:Rule
    val carpeta = TemporaryFolder()

    private val job = Job()
    private lateinit var dispositivos: DispositivoRepository

    private val sesionOk = SesionDto("SES-1", EstablecimientoDto("EST-1", "Bar Demo"), "activa", provisional = true)

    @Before
    fun preparar() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        val dataStore = PreferenceDataStoreFactory.create(scope = CoroutineScope(Dispatchers.IO + job)) {
            File(carpeta.root, "vm.preferences_pb")
        }
        dispositivos = DispositivoRepository(dataStore)
    }

    @After
    fun limpiar() = runTest {
        job.cancelAndJoin()
        Dispatchers.resetMain()
    }

    private fun viewModel(token: String?, api: SesionApi) =
        AccesoViewModel(token, SesionRepository(api), dispositivos)

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

        assertEquals(Sesion("SES-1", "Bar Demo", provisional = true), estado.sesion)
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
}
