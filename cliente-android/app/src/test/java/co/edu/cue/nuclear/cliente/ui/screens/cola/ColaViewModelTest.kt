package co.edu.cue.nuclear.cliente.ui.screens.cola

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.ColaRepository
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ReproduccionActual
import co.edu.cue.nuclear.cliente.data.cola.ResultadoCola
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ColaViewModelTest {

    private fun cancion(id: String) = Cancion(id, "Título $id", "Canal", 200, null, true)

    private fun solicitud(
        id: String,
        votos: Int = 1,
        yaVoto: Boolean = false,
        esMia: Boolean = false,
    ) = SolicitudCola(id, cancion(id), EstadoSolicitud.PENDIENTE, 1, votos, esMia, yaVoto, null)

    private val suena = ReproduccionActual("S0", cancion("S0"), 100)
    private val conCola = EstadoCola(suena, listOf(solicitud("A", 2, true, esMia = true), solicitud("B")))

    /** Repositorio controlable: cuenta llamadas y permite dejar una operación "en camino". */
    private class RepoControlable : ColaRepository {
        var respuestaCola: ResultadoCola = ResultadoCola.Exito(EstadoCola(null, emptyList()))
        var respuestaVoto: ResultadoVoto = ResultadoVoto.Error(TipoErrorCola.SERVIDOR)
        var respuestaSolicitud: ResultadoSolicitud = ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR)
        var compuertaVoto: CompletableDeferred<Unit>? = null
        var compuertaSolicitud: CompletableDeferred<Unit>? = null
        var consultas = 0
        val votos = mutableListOf<String>()
        val solicitudes = mutableListOf<String>()

        override suspend fun obtenerCola(): ResultadoCola {
            consultas++
            return respuestaCola
        }

        override suspend fun solicitar(cancion: Cancion): ResultadoSolicitud {
            solicitudes += cancion.youtubeVideoId
            compuertaSolicitud?.await()
            return respuestaSolicitud
        }

        override suspend fun votar(idSolicitud: String): ResultadoVoto {
            votos += idSolicitud
            compuertaVoto?.await()
            return respuestaVoto
        }
    }

    private val repo = RepoControlable()
    private lateinit var vm: ColaViewModel

    @Before
    fun preparar() {
        Dispatchers.setMain(StandardTestDispatcher())
        repo.respuestaCola = ResultadoCola.Exito(conCola)
        vm = ColaViewModel(repo)
    }

    @After
    fun limpiar() = Dispatchers.resetMain()

    private fun TestScope.abrir() {
        vm.alMostrarse()
        runCurrent()
    }

    private fun exito() = vm.estado.value.carga as CargaCola.Exito

    // --- Carga -----------------------------------------------------------------------------

    @Test
    fun `antes de abrir la pantalla no se consulta nada y el estado es cargando`() = runTest {
        runCurrent()

        assertEquals(CargaCola.Cargando, vm.estado.value.carga)
        assertEquals(0, repo.consultas)
    }

    @Test
    fun `al abrir carga con indicador y luego muestra la cola`() = runTest {
        vm.alMostrarse()
        assertEquals(CargaCola.Cargando, vm.estado.value.carga)

        runCurrent()

        assertEquals(CargaCola.Exito(conCola), vm.estado.value.carga)
    }

    @Test
    fun `una cola sin cancion actual ni solicitudes es vacia`() = runTest {
        repo.respuestaCola = ResultadoCola.Exito(EstadoCola(null, emptyList()))

        abrir()

        assertEquals(CargaCola.Vacia, vm.estado.value.carga)
    }

    @Test
    fun `una cancion sonando sin cola no es vacia`() = runTest {
        repo.respuestaCola = ResultadoCola.Exito(EstadoCola(suena, emptyList()))

        abrir()

        assertEquals(suena, exito().estado.reproduccionActual)
        assertTrue(exito().estado.cola.isEmpty())
    }

    @Test
    fun `un error se muestra y reintentar lo recupera`() = runTest {
        repo.respuestaCola = ResultadoCola.Error(TipoErrorCola.CONEXION)
        abrir()
        assertEquals(CargaCola.Error(TipoErrorCola.CONEXION), vm.estado.value.carga)

        repo.respuestaCola = ResultadoCola.Exito(conCola)
        vm.reintentar()
        assertEquals(CargaCola.Cargando, vm.estado.value.carga)
        runCurrent()

        assertEquals(CargaCola.Exito(conCola), vm.estado.value.carga)
    }

    @Test
    fun `volver a la pantalla tras un error recarga sin tocar el boton`() = runTest {
        repo.respuestaCola = ResultadoCola.Error(TipoErrorCola.SERVIDOR)
        abrir()

        repo.respuestaCola = ResultadoCola.Exito(conCola)
        abrir()

        assertEquals(CargaCola.Exito(conCola), vm.estado.value.carga)
    }

    @Test
    fun `volver a abrir con datos refresca sin pasar por cargando`() = runTest {
        abrir()
        val nueva = EstadoCola(suena, listOf(solicitud("C")))
        repo.respuestaCola = ResultadoCola.Exito(nueva)

        vm.alMostrarse()
        assertEquals(CargaCola.Exito(conCola), vm.estado.value.carga) // sigue viéndose lo anterior
        runCurrent()

        assertEquals(CargaCola.Exito(nueva), vm.estado.value.carga)
    }

    @Test
    fun `si el refresco falla se conservan los datos que ya se veian`() = runTest {
        abrir()
        repo.respuestaCola = ResultadoCola.Error(TipoErrorCola.CONEXION)

        abrir()

        assertEquals(CargaCola.Exito(conCola), vm.estado.value.carga)
    }

    // --- Votar -----------------------------------------------------------------------------

    @Test
    fun `votar marca la solicitud en proceso y una segunda pulsacion se ignora`() = runTest {
        abrir()
        repo.compuertaVoto = CompletableDeferred()

        vm.votar("B")
        vm.votar("B")
        runCurrent()

        assertEquals(setOf("B"), vm.estado.value.votando)
        assertEquals(listOf("B"), repo.votos)
    }

    @Test
    fun `un voto registrado confirma, libera el boton y vuelve a pedir la cola`() = runTest {
        abrir()
        val votada = solicitud("B", votos = 2, yaVoto = true)
        val despues = EstadoCola(suena, listOf(votada, solicitud("A", 2, true, true)))
        repo.respuestaVoto = ResultadoVoto.Registrado(votada)
        repo.respuestaCola = ResultadoCola.Exito(despues)
        val consultasAntes = repo.consultas

        vm.votar("B")
        runCurrent()

        val estado = vm.estado.value
        assertTrue(estado.votando.isEmpty())
        assertEquals("Voto registrado", estado.mensaje?.titulo)
        assertEquals(TonoVisual.Exito, estado.mensaje?.tono)
        assertEquals(consultasAntes + 1, repo.consultas)
        assertEquals(despues, exito().estado) // el orden y los totales son los que dio el repositorio
    }

    @Test
    fun `si no se puede refrescar tras votar se aplica la solicitud devuelta`() = runTest {
        abrir()
        val votada = solicitud("B", votos = 2, yaVoto = true)
        repo.respuestaVoto = ResultadoVoto.Registrado(votada)
        repo.respuestaCola = ResultadoCola.Error(TipoErrorCola.CONEXION)

        vm.votar("B")
        runCurrent()

        val b = exito().estado.cola.first { it.idSolicitud == "B" }
        assertEquals(2, b.totalVotos)
        assertEquals(true, b.yaVoto)
    }

    @Test
    fun `un voto rechazado muestra el aviso y no cambia los votos`() = runTest {
        abrir()
        repo.respuestaVoto = ResultadoVoto.Rechazado(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 2)
        val consultasAntes = repo.consultas

        vm.votar("B")
        runCurrent()

        val estado = vm.estado.value
        assertEquals(TonoVisual.Aviso, estado.mensaje?.tono)
        assertTrue(estado.votando.isEmpty())
        assertEquals(consultasAntes, repo.consultas)
        assertEquals(conCola, exito().estado)
    }

    @Test
    fun `un error al votar se informa como problema de comunicacion`() = runTest {
        abrir()
        repo.respuestaVoto = ResultadoVoto.Error(TipoErrorCola.CONEXION)

        vm.votar("B")
        runCurrent()

        assertEquals(TonoVisual.Peligro, vm.estado.value.mensaje?.tono)
        assertTrue(vm.estado.value.votando.isEmpty())
    }

    @Test
    fun `no se vota una solicitud propia ni una ya votada ni una que no esta en la lista`() = runTest {
        abrir()

        vm.votar("A") // propia, voto automático
        vm.votar("Z") // no existe
        runCurrent()

        assertTrue(repo.votos.isEmpty())
        assertTrue(vm.estado.value.votando.isEmpty())
    }

    @Test
    fun `no se vota antes de que cargue la cola`() = runTest {
        vm.votar("B")
        runCurrent()

        assertTrue(repo.votos.isEmpty())
    }

    // --- Solicitar -------------------------------------------------------------------------

    @Test
    fun `solicitar marca en proceso y una segunda solicitud se ignora`() = runTest {
        repo.compuertaSolicitud = CompletableDeferred()

        vm.solicitar(cancion("N"))
        vm.solicitar(cancion("N"))
        runCurrent()

        assertTrue(vm.estado.value.solicitando)
        assertEquals(listOf("N"), repo.solicitudes)
    }

    @Test
    fun `una solicitud aceptada abre la confirmacion y vuelve a pedir la cola`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("N", 1, true, true), false)

        vm.solicitar(cancion("N"))
        runCurrent()

        val estado = vm.estado.value
        assertEquals(false, estado.solicitando)
        assertNull(estado.mensaje) // se confirma en su propia pantalla, no con un aviso
        assertEquals("N", estado.confirmacion?.solicitud?.idSolicitud)
        assertEquals(true, estado.navegarAConfirmacion)
        assertEquals(1, repo.consultas)
        assertNotNull(estado.carga as? CargaCola.Exito)
    }

    @Test
    fun `una solicitud nueva se distingue de una que sumo un voto a una existente`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("N", 1, true, true), sumoVotoAExistente = false)
        vm.solicitar(cancion("N"))
        runCurrent()
        assertEquals(false, vm.estado.value.confirmacion?.sumoVotoAExistente)

        vm.cerrarConfirmacion()
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("B", 3, true), sumoVotoAExistente = true)
        vm.solicitar(cancion("B"))
        runCurrent()
        assertEquals(true, vm.estado.value.confirmacion?.sumoVotoAExistente)
        assertEquals("B", vm.estado.value.confirmacion?.solicitud?.idSolicitud)
    }

    @Test
    fun `abrir la confirmacion consume el evento pero conserva los datos`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("N", 1, true, true), false)
        vm.solicitar(cancion("N"))
        runCurrent()

        vm.confirmacionMostrada()

        assertEquals(false, vm.estado.value.navegarAConfirmacion)
        assertNotNull(vm.estado.value.confirmacion)
    }

    @Test
    fun `cerrar la confirmacion la olvida junto con su evento pendiente`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("N", 1, true, true), false)
        vm.solicitar(cancion("N"))
        runCurrent()

        vm.cerrarConfirmacion()

        assertNull(vm.estado.value.confirmacion)
        assertEquals(false, vm.estado.value.navegarAConfirmacion)
    }

    @Test
    fun `una solicitud rechazada o con error no crea confirmacion`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 1)
        vm.solicitar(cancion("N"))
        runCurrent()
        assertNull(vm.estado.value.confirmacion)
        assertEquals(false, vm.estado.value.navegarAConfirmacion)
        assertNotNull(vm.estado.value.mensaje)

        repo.respuestaSolicitud = ResultadoSolicitud.Error(TipoErrorCola.CONEXION)
        vm.solicitar(cancion("N"))
        runCurrent()
        assertNull(vm.estado.value.confirmacion)
        assertEquals(false, vm.estado.value.navegarAConfirmacion)
    }

    @Test
    fun `la confirmacion se actualiza con la posicion y la espera mas recientes de la cola`() = runTest {
        val aceptada = solicitud("N", 1, true, true).copy(posicion = null, esperaEstimadaSegundos = null)
        val enLaCola = solicitud("N", 2, true, true).copy(posicion = 3, esperaEstimadaSegundos = 420)
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(aceptada, false)
        repo.respuestaCola = ResultadoCola.Exito(EstadoCola(suena, listOf(enLaCola)))

        vm.solicitar(cancion("N"))
        runCurrent()

        val actual = vm.estado.value.confirmacion?.solicitud
        assertEquals(3, actual?.posicion)
        assertEquals(2, actual?.totalVotos)
        assertEquals(420, actual?.esperaEstimadaSegundos)
    }

    @Test
    fun `si la cola no trae la solicitud se conserva la confirmacion original`() = runTest {
        // Suma de voto a la canción que suena: no está en la lista de espera.
        val sonando = solicitud("S0", 2, true).copy(estado = EstadoSolicitud.EN_REPRODUCCION, posicion = null)
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(sonando, sumoVotoAExistente = true)
        repo.respuestaCola = ResultadoCola.Exito(EstadoCola(suena, listOf(solicitud("A"))))

        vm.solicitar(cancion("S0"))
        runCurrent()

        assertEquals(sonando, vm.estado.value.confirmacion?.solicitud)
    }

    @Test
    fun `una solicitud rechazada avisa y no pide la cola`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 1)

        vm.solicitar(cancion("N"))
        runCurrent()

        val estado = vm.estado.value
        assertEquals(false, estado.solicitando)
        assertEquals(TonoVisual.Aviso, estado.mensaje?.tono)
        assertEquals(0, repo.consultas)
    }

    @Test
    fun `cerrar el mensaje lo quita`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Error(TipoErrorCola.CONEXION)
        vm.solicitar(cancion("N"))
        runCurrent()
        assertNotNull(vm.estado.value.mensaje)

        vm.cerrarMensaje()

        assertNull(vm.estado.value.mensaje)
    }

    @Test
    fun `una operacion nueva limpia el mensaje anterior`() = runTest {
        abrir()
        repo.respuestaVoto = ResultadoVoto.Error(TipoErrorCola.CONEXION)
        vm.votar("B")
        runCurrent()
        assertNotNull(vm.estado.value.mensaje)
        repo.compuertaVoto = CompletableDeferred()
        repo.respuestaVoto = ResultadoVoto.Registrado(solicitud("B", 2, true))

        vm.votar("B")

        assertNull(vm.estado.value.mensaje)
    }

    // --- Solicitud destacada (paso 2) ---------------------------------------------------------

    @Test
    fun `ver la cola desde la confirmacion destaca la solicitud y cierra la confirmacion`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("N", 1, true, true), false)
        vm.solicitar(cancion("N"))
        runCurrent()

        vm.verColaDesdeConfirmacion()

        val estado = vm.estado.value
        assertEquals("N", estado.solicitudDestacada)
        assertNull(estado.confirmacion)
        assertEquals(false, estado.navegarAConfirmacion)
    }

    @Test
    fun `sin confirmacion no hay nada que destacar`() = runTest {
        vm.verColaDesdeConfirmacion()

        assertNull(vm.estado.value.solicitudDestacada)
    }

    @Test
    fun `quitar el destacado lo borra`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("N", 1, true, true), false)
        vm.solicitar(cancion("N"))
        runCurrent()
        vm.verColaDesdeConfirmacion()

        vm.quitarDestacado()

        assertNull(vm.estado.value.solicitudDestacada)
    }

    @Test
    fun `cerrar la confirmacion no toca el destacado`() = runTest {
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("N", 1, true, true), false)
        vm.solicitar(cancion("N"))
        runCurrent()
        vm.verColaDesdeConfirmacion()

        vm.cerrarConfirmacion()

        assertEquals("N", vm.estado.value.solicitudDestacada)
    }

    @Test
    fun `un voto o un refresco no cambian la solicitud destacada`() = runTest {
        abrir()
        repo.respuestaSolicitud = ResultadoSolicitud.Aceptada(solicitud("B", 3, true), true)
        vm.solicitar(cancion("B"))
        runCurrent()
        vm.verColaDesdeConfirmacion()

        repo.respuestaVoto = ResultadoVoto.Error(TipoErrorCola.CONEXION)
        vm.votar("A")
        abrir()

        assertEquals("B", vm.estado.value.solicitudDestacada)
    }

    // --- Versiones de la cola y operaciones sin confirmar -----------------------------------------

    private fun conVersion(version: Long, vararg ids: String) =
        EstadoCola(suena, ids.map { solicitud(it) }, version = version)

    @Test
    fun `un estado con version menor o igual a la aplicada se descarta`() = runTest {
        repo.respuestaCola = ResultadoCola.Exito(conVersion(5, "A", "B"))
        abrir()

        repo.respuestaCola = ResultadoCola.Exito(conVersion(4, "VIEJA")) // llegó tarde
        vm.alMostrarse()
        runCurrent()
        assertEquals(listOf("A", "B"), exito().estado.cola.map { it.idSolicitud })

        repo.respuestaCola = ResultadoCola.Exito(conVersion(5, "IGUAL"))
        vm.alMostrarse()
        runCurrent()
        assertEquals(listOf("A", "B"), exito().estado.cola.map { it.idSolicitud })
    }

    @Test
    fun `un estado con version mayor reemplaza al anterior`() = runTest {
        repo.respuestaCola = ResultadoCola.Exito(conVersion(5, "A", "B"))
        abrir()

        repo.respuestaCola = ResultadoCola.Exito(conVersion(6, "B", "A"))
        vm.alMostrarse()
        runCurrent()

        assertEquals(listOf("B", "A"), exito().estado.cola.map { it.idSolicitud }) // se respeta el orden del servidor
    }

    @Test
    fun `un reintento tras un error acepta lo que llegue aunque la version sea la misma`() = runTest {
        repo.respuestaCola = ResultadoCola.Exito(conVersion(5, "A"))
        abrir()
        repo.respuestaCola = ResultadoCola.Error(TipoErrorCola.CONEXION)
        vm.reintentar()
        runCurrent()
        assertTrue(vm.estado.value.carga is CargaCola.Error)

        repo.respuestaCola = ResultadoCola.Exito(conVersion(5, "A"))
        vm.reintentar()
        runCurrent()

        assertEquals(listOf("A"), exito().estado.cola.map { it.idSolicitud })
    }

    @Test
    fun `una solicitud sin confirmar consulta la cola y no se repite sola`() = runTest {
        abrir()
        repo.respuestaSolicitud = ResultadoSolicitud.Error(TipoErrorCola.SIN_CONFIRMAR)
        val consultasAntes = repo.consultas

        vm.solicitar(cancion("N"))
        runCurrent()

        assertEquals(listOf("N"), repo.solicitudes) // una sola vez
        assertEquals(consultasAntes + 1, repo.consultas) // pidió la cola para ver si se registró
        assertEquals("No pudimos confirmar tu acción", vm.estado.value.mensaje?.titulo)
        assertEquals(false, vm.estado.value.solicitando)
    }

    @Test
    fun `un voto sin confirmar consulta la cola y no se repite solo`() = runTest {
        abrir()
        repo.respuestaVoto = ResultadoVoto.Error(TipoErrorCola.SIN_CONFIRMAR)
        val consultasAntes = repo.consultas

        vm.votar("B")
        runCurrent()

        assertEquals(listOf("B"), repo.votos)
        assertEquals(consultasAntes + 1, repo.consultas)
        assertTrue(vm.estado.value.votando.isEmpty())
    }

    @Test
    fun `un error de conexion comun al solicitar no consulta la cola`() = runTest {
        abrir()
        repo.respuestaSolicitud = ResultadoSolicitud.Error(TipoErrorCola.CONEXION)
        val consultasAntes = repo.consultas

        vm.solicitar(cancion("N"))
        runCurrent()

        assertEquals(consultasAntes, repo.consultas)
    }
}
