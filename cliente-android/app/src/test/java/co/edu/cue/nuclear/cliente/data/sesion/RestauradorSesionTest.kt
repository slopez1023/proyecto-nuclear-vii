package co.edu.cue.nuclear.cliente.data.sesion

import co.edu.cue.nuclear.cliente.data.dispositivo.DataStoreEnMemoria
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.sesion.RestauradorSesion.Validacion
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RestauradorSesionTest {
    private val almacen = DataStoreEnMemoria()
    private val dispositivos = DispositivoRepository(almacen)
    private val local = SesionLocal(almacen)
    private val sesionActiva = SesionActivaStore()
    private var validaciones = 0
    private var respuesta = Validacion.VIGENTE
    private var sesionVistaAlValidar: SesionActiva? = null

    private val restaurador = RestauradorSesion(local, dispositivos, sesionActiva) {
        validaciones++
        sesionVistaAlValidar = sesionActiva.actual
        respuesta
    }

    // --- Persistencia --------------------------------------------------------------------------

    @Test
    fun `guarda solo el id de sesion y el establecimiento, y se puede leer`() = runTest {
        local.guardar("SES-MOCK-001", "EST-MOCK-001")

        assertEquals(SesionGuardada("SES-MOCK-001", "EST-MOCK-001"), local.leer())
    }

    @Test
    fun `no guarda ningun token de QR ni el UUID`() = runTest {
        local.guardar("SES-MOCK-001", "EST-MOCK-001")

        val claves = almacen.data.first().asMap().keys.map { it.name }

        assertEquals(setOf("sesion_id", "sesion_id_establecimiento"), claves.toSet())
    }

    @Test
    fun `el establecimiento es opcional y limpiar lo borra todo`() = runTest {
        local.guardar("SES-1", null)
        assertEquals(SesionGuardada("SES-1", null), local.leer())

        local.limpiar()

        assertNull(local.leer())
    }

    @Test
    fun `convive con el UUID del dispositivo en el mismo almacen`() = runTest {
        val uuid = dispositivos.obtenerId()

        local.guardar("SES-1", "EST-1")
        local.limpiar()

        assertEquals(uuid, dispositivos.obtenerId()) // limpiar la sesión no toca el UUID
    }

    // --- Restauración --------------------------------------------------------------------------

    @Test
    fun `sin nada guardado no restaura ni consulta al servidor`() = runTest {
        assertEquals(ResultadoRestauracion.SinSesion, restaurador.restaurar())
        assertEquals(0, validaciones)
        assertNull(sesionActiva.actual)
    }

    @Test
    fun `una sesion guardada y confirmada por el servidor se restaura con el UUID existente`() = runTest {
        local.guardar("SES-MOCK-001", "EST-MOCK-001")
        val uuid = dispositivos.obtenerId()

        val r = restaurador.restaurar()

        assertEquals(SesionActiva("SES-MOCK-001", uuid, "EST-MOCK-001"), (r as ResultadoRestauracion.Restaurada).sesion)
        assertEquals(r.sesion, sesionActiva.actual)
        assertEquals(1, validaciones)
    }

    @Test
    fun `no se da por valida solo por estar guardada, se valida antes de dejarla activa`() = runTest {
        local.guardar("SES-1", "EST-1")

        restaurador.restaurar()

        // Durante la validación la sesión candidata está en el store (la ruta la necesita)...
        assertEquals("SES-1", sesionVistaAlValidar?.idSesion)
        assertEquals(1, validaciones)
    }

    @Test
    fun `una sesion cerrada o inexistente se limpia y se informa como invalida`() = runTest {
        local.guardar("SES-VIEJA", "EST-1")
        respuesta = Validacion.NO_DISPONIBLE

        assertEquals(ResultadoRestauracion.Invalida, restaurador.restaurar())

        assertNull(sesionActiva.actual)
        assertNull(local.leer())
    }

    @Test
    fun `si no se puede confirmar no se activa pero se conserva lo guardado`() = runTest {
        local.guardar("SES-1", "EST-1")
        respuesta = Validacion.SIN_CONFIRMAR

        assertEquals(ResultadoRestauracion.NoConfirmada, restaurador.restaurar())

        assertNull(sesionActiva.actual)
        assertEquals("SES-1", local.leer()?.idSesion)
    }

    @Test
    fun `si ya hay sesion activa no vuelve a validar`() = runTest {
        local.guardar("SES-1", "EST-1")
        restaurador.restaurar()

        val segunda = restaurador.restaurar()

        assertTrue(segunda is ResultadoRestauracion.Restaurada)
        assertEquals(1, validaciones)
    }

    @Test
    fun `varias pantallas restaurando a la vez validan una sola vez`() = runTest {
        local.guardar("SES-1", "EST-1")

        val resultados = List(5) { async { restaurador.restaurar() } }.awaitAll()

        assertTrue(resultados.all { it is ResultadoRestauracion.Restaurada })
        assertEquals(1, validaciones)
    }

    @Test
    fun `cerrar localmente limpia el store y lo guardado`() = runTest {
        local.guardar("SES-1", "EST-1")
        restaurador.restaurar()

        restaurador.cerrarLocalmente()

        assertNull(sesionActiva.actual)
        assertNull(local.leer())
        assertEquals(ResultadoRestauracion.SinSesion, restaurador.restaurar())
    }
}
