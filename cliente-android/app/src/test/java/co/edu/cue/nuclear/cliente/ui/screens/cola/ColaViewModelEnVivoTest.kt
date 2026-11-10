package co.edu.cue.nuclear.cliente.ui.screens.cola

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.ColaEnVivo
import co.edu.cue.nuclear.cliente.data.cola.ColaRepository
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.EventoFlujo
import co.edu.cue.nuclear.cliente.data.cola.ResultadoCola
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** `ColaViewModel` con el flujo en tiempo real: ciclo de vida, versiones y sesión no disponible. */
@OptIn(ExperimentalCoroutinesApi::class)
class ColaViewModelEnVivoTest {

    private fun cancion(id: String) = Cancion(id, "Título $id", "Canal", 200, null, true)
    private fun solicitud(id: String) = SolicitudCola(id, cancion(id), EstadoSolicitud.PENDIENTE, 1, 1, false, false, null)
    private fun cola(version: Long, vararg ids: String) = EstadoCola(null, ids.map(::solicitud), version = version)

    /** Flujo controlable: cuenta aperturas y cierres (una apertura = una conexión). */
    private class EnVivoFalso : ColaEnVivo {
        var aperturas = 0
        var cierres = 0
        val eventos = MutableSharedFlow<EventoFlujo>(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)
        override fun flujo(): Flow<EventoFlujo> = eventos
            .onStart { aperturas++ }
            .onCompletion { cierres++ }
    }

    private class RepoFijo : ColaRepository {
        var cola: ResultadoCola = ResultadoCola.Exito(EstadoCola(null, emptyList()))
        var consultas = 0
        override suspend fun obtenerCola(): ResultadoCola { consultas++; return cola }
        override suspend fun solicitar(cancion: Cancion): ResultadoSolicitud = ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR)
        override suspend fun votar(idSolicitud: String): ResultadoVoto = ResultadoVoto.Error(TipoErrorCola.SERVIDOR)
    }

    private val repo = RepoFijo()
    private val vivo = EnVivoFalso()
    private lateinit var vm: ColaViewModel

    @Before
    fun preparar() {
        Dispatchers.setMain(StandardTestDispatcher())
        vm = ColaViewModel(repo, vivo)
    }

    @After
    fun limpiar() = Dispatchers.resetMain()

    private fun TestScope.emitir(vararg e: EventoFlujo) {
        runCurrent()
        e.forEach { vivo.eventos.tryEmit(it) }
        runCurrent()
    }

    private fun ids() = (vm.estado.value.carga as CargaCola.Exito).estado.cola.map { it.idSolicitud }

    // --- Ciclo de vida ----------------------------------------------------------------------------

    @Test
    fun `llegar varias veces a primer plano abre un solo flujo`() = runTest {
        repeat(5) { vm.alPrimerPlano() }
        runCurrent()

        assertEquals(1, vivo.aperturas)
    }

    @Test
    fun `pasar a segundo plano cierra el flujo y libera la suscripcion`() = runTest {
        vm.alPrimerPlano()
        emitir(EventoFlujo.Conectado)
        assertEquals(ConexionEnVivo.Conectada, vm.estado.value.conexionEnVivo)

        vm.alSegundoPlano()
        runCurrent()

        assertEquals(1, vivo.cierres)
        assertEquals(0, vivo.eventos.subscriptionCount.value)
        assertEquals(ConexionEnVivo.Inactiva, vm.estado.value.conexionEnVivo)
    }

    @Test
    fun `al volver a primer plano reconecta y recibe el estado completo`() = runTest {
        vm.alPrimerPlano()
        emitir(EventoFlujo.Estado(cola(5, "A")))
        vm.alSegundoPlano()
        runCurrent()

        vm.alPrimerPlano()
        emitir(EventoFlujo.Estado(cola(6, "A", "B")))

        assertEquals(2, vivo.aperturas)
        assertEquals(listOf("A", "B"), ids())
    }

    @Test
    fun `ir y venir de segundo plano no deja conexiones duplicadas`() = runTest {
        repeat(3) {
            vm.alPrimerPlano()
            vm.alPrimerPlano()
            runCurrent()
            vm.alSegundoPlano()
            runCurrent()
        }

        assertEquals(3, vivo.aperturas)
        assertEquals(3, vivo.cierres)
        assertEquals(0, vivo.eventos.subscriptionCount.value)
    }

    @Test
    fun `sin flujo en vivo (datos simulados) no hace nada`() = runTest {
        val sinVivo = ColaViewModel(repo, null)

        sinVivo.alPrimerPlano()
        sinVivo.alSegundoPlano()
        runCurrent()

        assertEquals(0, vivo.aperturas)
    }

    // --- Versiones --------------------------------------------------------------------------------

    @Test
    fun `los estados del flujo se aplican en orden y los viejos o repetidos se descartan`() = runTest {
        vm.alPrimerPlano()
        emitir(EventoFlujo.Estado(cola(10, "A")))
        emitir(EventoFlujo.Estado(cola(9, "VIEJA")))
        emitir(EventoFlujo.Estado(cola(10, "IGUAL")))
        assertEquals(listOf("A"), ids())

        emitir(EventoFlujo.Estado(cola(11, "B", "A")))
        assertEquals(listOf("B", "A"), ids()) // orden del servidor, sin reordenar
    }

    @Test
    fun `un GET atrasado no pisa un estado mas nuevo del flujo`() = runTest {
        repo.cola = ResultadoCola.Exito(cola(5, "DEL_GET"))
        vm.alPrimerPlano()
        emitir(EventoFlujo.Estado(cola(7, "DEL_FLUJO")))

        vm.alMostrarse() // el GET llega con la versión 5, vieja
        runCurrent()

        assertEquals(listOf("DEL_FLUJO"), ids())
    }

    @Test
    fun `el estado inicial del flujo evita cargar con indicador y el GET igual no lo pisa`() = runTest {
        vm.alPrimerPlano()
        emitir(EventoFlujo.Estado(cola(3, "A")))
        repo.cola = ResultadoCola.Exito(cola(3, "A"))

        vm.alMostrarse()
        runCurrent()

        assertEquals(listOf("A"), ids())
        assertFalse(vm.estado.value.carga is CargaCola.Cargando)
    }

    // --- Conexión y errores -------------------------------------------------------------------------

    @Test
    fun `refleja si esta conectado o reconectando`() = runTest {
        vm.alPrimerPlano()
        emitir(EventoFlujo.Conectado)
        assertEquals(ConexionEnVivo.Conectada, vm.estado.value.conexionEnVivo)

        emitir(EventoFlujo.Reconectando(3000))
        assertEquals(ConexionEnVivo.Reconectando, vm.estado.value.conexionEnVivo)

        emitir(EventoFlujo.Conectado)
        assertEquals(ConexionEnVivo.Conectada, vm.estado.value.conexionEnVivo)
    }

    @Test
    fun `una desconexion conserva lo que ya se mostraba`() = runTest {
        vm.alPrimerPlano()
        emitir(EventoFlujo.Estado(cola(4, "A")), EventoFlujo.Reconectando(3000))

        assertEquals(listOf("A"), ids())
    }

    @Test
    fun `el flujo que termina por sesion no disponible lo marca para volver a Acceso`() = runTest {
        vm.alPrimerPlano()
        emitir(EventoFlujo.Terminado(TipoErrorCola.SESION_NO_DISPONIBLE))

        assertTrue(vm.estado.value.sesionNoDisponible)
        assertEquals(ConexionEnVivo.Inactiva, vm.estado.value.conexionEnVivo)
    }

    @Test
    fun `un error de servidor del flujo no cierra la sesion`() = runTest {
        vm.alPrimerPlano()
        emitir(EventoFlujo.Terminado(TipoErrorCola.SERVIDOR))

        assertFalse(vm.estado.value.sesionNoDisponible)
    }

    @Test
    fun `una consulta de la cola con sesion no disponible tambien lo marca`() = runTest {
        repo.cola = ResultadoCola.Error(TipoErrorCola.SESION_NO_DISPONIBLE)

        vm.alMostrarse()
        runCurrent()

        assertTrue(vm.estado.value.sesionNoDisponible)
    }

    @Test
    fun `una solicitud o un voto con sesion no disponible lo marcan`() = runTest {
        val repoSesion = object : ColaRepository {
            override suspend fun obtenerCola() = ResultadoCola.Exito(cola(1, "A"))
            override suspend fun solicitar(cancion: Cancion): ResultadoSolicitud = ResultadoSolicitud.Error(TipoErrorCola.SESION_NO_DISPONIBLE)
            override suspend fun votar(idSolicitud: String): ResultadoVoto = ResultadoVoto.Error(TipoErrorCola.SESION_NO_DISPONIBLE)
        }
        val otro = ColaViewModel(repoSesion)
        otro.alMostrarse()
        runCurrent()

        otro.solicitar(cancion("N"))
        runCurrent()

        assertTrue(otro.estado.value.sesionNoDisponible)
    }
}
