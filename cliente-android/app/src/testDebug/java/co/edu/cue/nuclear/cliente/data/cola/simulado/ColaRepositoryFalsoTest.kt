package co.edu.cue.nuclear.cliente.data.cola.simulado

import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ResultadoCola
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.data.cola.TipoVoto
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Verifica que el servidor falso se comporte como lo describe la especificación; no prueba código de producción. */
class ColaRepositoryFalsoTest {

    private suspend fun ColaRepositoryFalso.cola(): EstadoCola =
        (obtenerCola() as ResultadoCola.Exito).estado

    @Test
    fun `la cola inicial trae la que suena aparte y solo pendientes en la lista`() = runTest {
        val estado = ColaRepositoryFalso().cola()

        assertNotNull(estado.reproduccionActual)
        assertTrue(estado.cola.all { it.estado == EstadoSolicitud.PENDIENTE })
        assertEquals(listOf(1, 2, 3, 4), estado.cola.map { it.posicion })
    }

    @Test
    fun `una cola vacia se reporta como vacia`() = runTest {
        val estado = ColaRepositoryFalso(DatosSimulados.colaVacia()).cola()

        assertTrue(estado.estaVacia)
        assertNull(estado.reproduccionActual)
    }

    @Test
    fun `una cancion que suena sin cola no es una cola vacia`() = runTest {
        val estado = ColaRepositoryFalso(DatosSimulados.soloReproduciendo()).cola()

        assertFalse(estado.estaVacia)
        assertTrue(estado.cola.isEmpty())
    }

    @Test
    fun `solicitar una cancion nueva la agrega con un voto automatico`() = runTest {
        val repo = ColaRepositoryFalso()

        val resultado = repo.solicitar(DatosSimulados.nuevaCancion) as ResultadoSolicitud.Aceptada

        assertFalse(resultado.sumoVotoAExistente)
        assertEquals(1, resultado.solicitud.totalVotos)
        assertEquals(true, resultado.solicitud.yaVoto)
        assertEquals(TipoVoto.AUTOMATICO, resultado.origenVoto)
        assertTrue(resultado.solicitud.esMia)
        assertEquals(EstadoSolicitud.PENDIENTE, resultado.solicitud.estado)
        assertEquals(5, repo.cola().cola.size)
    }

    @Test
    fun `la solicitud nueva queda detras de las que tienen los mismos votos`() = runTest {
        val repo = ColaRepositoryFalso()

        val nueva = (repo.solicitar(DatosSimulados.nuevaCancion) as ResultadoSolicitud.Aceptada).solicitud

        assertEquals(5, nueva.posicion)
        assertEquals(nueva.idSolicitud, repo.cola().cola.last().idSolicitud)
    }

    @Test
    fun `solicitar una cancion que ya espera suma un voto en vez de duplicarla`() = runTest {
        val repo = ColaRepositoryFalso()

        val resultado = repo.solicitar(DatosSimulados.hotelCalifornia) as ResultadoSolicitud.Aceptada

        assertTrue(resultado.sumoVotoAExistente)
        assertEquals(2, resultado.solicitud.totalVotos)
        assertEquals(true, resultado.solicitud.yaVoto)
        assertEquals(TipoVoto.AUTOMATICO, resultado.origenVoto)
        assertEquals(4, repo.cola().cola.size)
    }

    @Test
    fun `solicitar una cancion que suena ahora suma voto y no la manda a la cola`() = runTest {
        val repo = ColaRepositoryFalso()

        val resultado = repo.solicitar(DatosSimulados.sweetChild) as ResultadoSolicitud.Aceptada

        assertTrue(resultado.sumoVotoAExistente)
        assertEquals(EstadoSolicitud.EN_REPRODUCCION, resultado.solicitud.estado)
        assertNull(resultado.solicitud.posicion)
        assertEquals(4, repo.cola().cola.size)
    }

    @Test
    fun `solicitar de nuevo una cancion ya votada por este dispositivo se rechaza`() = runTest {
        val repo = ColaRepositoryFalso()

        val resultado = repo.solicitar(DatosSimulados.bohemian)

        assertEquals(ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.VOTO_DUPLICADO), resultado)
    }

    @Test
    fun `un voto manual suma uno y se marca como manual`() = runTest {
        val repo = ColaRepositoryFalso()

        val resultado = repo.votar("SIM-SOL-0003") as ResultadoVoto.Registrado

        assertEquals(2, resultado.solicitud.totalVotos)
        assertEquals(true, resultado.solicitud.yaVoto)
        assertEquals(TipoVoto.MANUAL, resultado.origenVoto)
        assertFalse(resultado.solicitud.esMia)
        assertFalse(resultado.solicitud.puedeVotar)
    }

    @Test
    fun `un voto reordena por votos y desempata por antiguedad`() = runTest {
        val repo = ColaRepositoryFalso()

        // SOL-0004 pasa de 1 a 2 votos y empata con SOL-0002, que es mas antigua: queda detras.
        repo.votar("SIM-SOL-0004")

        val ids = repo.cola().cola.map { it.idSolicitud }
        assertEquals(listOf("SIM-SOL-0001", "SIM-SOL-0002", "SIM-SOL-0004", "SIM-SOL-0003"), ids)
        assertEquals(listOf(1, 2, 3, 4), repo.cola().cola.map { it.posicion })
    }

    @Test
    fun `votar dos veces la misma solicitud se rechaza como voto duplicado`() = runTest {
        val repo = ColaRepositoryFalso()
        repo.votar("SIM-SOL-0003")

        val segundo = repo.votar("SIM-SOL-0003")

        assertEquals(ResultadoVoto.Rechazado(MotivoRechazoOperacion.VOTO_DUPLICADO), segundo)
        assertEquals(2, repo.cola().cola.first { it.idSolicitud == "SIM-SOL-0003" }.totalVotos)
    }

    @Test
    fun `votar una solicitud inexistente no es votable`() = runTest {
        val resultado = ColaRepositoryFalso().votar("SIM-SOL-9999")

        assertEquals(ResultadoVoto.Rechazado(MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE), resultado)
    }

    @Test
    fun `un rechazo configurado no agrega cancion ni voto`() = runTest {
        val repo = ColaRepositoryFalso().apply {
            rechazoSolicitud = MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO
            rechazoVoto = MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO
        }
        val antes = repo.cola()

        val solicitud = repo.solicitar(DatosSimulados.nuevaCancion)
        val voto = repo.votar("SIM-SOL-0003")

        assertTrue(solicitud is ResultadoSolicitud.Rechazada)
        assertTrue(voto is ResultadoVoto.Rechazado)
        assertEquals(antes, repo.cola())
    }

    @Test
    fun `los errores configurados se reportan como errores de comunicacion`() = runTest {
        val repo = ColaRepositoryFalso().apply {
            errorConsulta = TipoErrorCola.CONEXION
            errorOperacion = TipoErrorCola.SERVIDOR
        }

        assertEquals(ResultadoCola.Error(TipoErrorCola.CONEXION), repo.obtenerCola())
        assertEquals(ResultadoSolicitud.Error(TipoErrorCola.SERVIDOR), repo.solicitar(DatosSimulados.nuevaCancion))
        assertEquals(ResultadoVoto.Error(TipoErrorCola.SERVIDOR), repo.votar("SIM-SOL-0003"))
    }

    @Test
    fun `solo una solicitud pendiente sin voto propio es votable`() = runTest {
        val cola = ColaRepositoryFalso().cola().cola

        assertEquals(
            listOf(false, false, true, true),
            cola.map { it.puedeVotar },
        )
    }
}
