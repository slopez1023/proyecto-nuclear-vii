package co.edu.cue.nuclear.cliente.data.cola.simulado

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.ColaRepository
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ResultadoCola
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.data.cola.TipoVoto
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * IMPLEMENTACIÓN SIMULADA de [ColaRepository]. Solo existe en la variante debug (carpeta
 * `src/debug`), por lo que no puede llegar al APK de release ni usarse por accidente con el
 * backend real.
 *
 * Hace de "servidor falso" para desarrollar la interfaz: mantiene su propio estado, suma los
 * votos y reordena (votos descendentes, desempate por antigüedad). Esa lógica es de EL FALSO,
 * no de Android: en producción la hace el backend. Las esperas estimadas no se recalculan
 * (las solicitudes nuevas quedan en `null`).
 *
 * Los fallos se configuran por propiedad para ejercitar cada estado de la interfaz.
 */
class ColaRepositoryFalso(
    estadoInicial: EstadoCola = DatosSimulados.colaConVarias(),
    var latenciaMs: Long = 0,
) : ColaRepository {

    /** Si no es nulo, [obtenerCola] responde con este error de comunicación. */
    var errorConsulta: TipoErrorCola? = null

    /** Si no es nulo, [solicitar] rechaza con este motivo. */
    var rechazoSolicitud: MotivoRechazoOperacion? = null

    /** Si no es nulo, [votar] rechaza con este motivo. */
    var rechazoVoto: MotivoRechazoOperacion? = null

    /** Si no es nulo, [solicitar] y [votar] fallan con este error de comunicación. */
    var errorOperacion: TipoErrorCola? = null

    /** Entrada de la cola con su orden de llegada, que desempata los votos iguales. */
    private data class Entrada(val solicitud: SolicitudCola, val llegada: Long)

    private val mutex = Mutex()
    private var reproduccion = estadoInicial.reproduccionActual
    private var siguienteLlegada = 0L
    private var siguienteId = 100
    private var entradas: List<Entrada> = estadoInicial.cola.map { Entrada(it, siguienteLlegada++) }

    /** Vuelve a un estado inicial (cola y canción actual), olvidando lo solicitado y votado hasta ahora. */
    suspend fun reiniciar(estado: EstadoCola) = mutex.withLock {
        reproduccion = estado.reproduccionActual
        siguienteLlegada = 0L
        entradas = estado.cola.map { Entrada(it, siguienteLlegada++) }
    }

    override suspend fun obtenerCola(): ResultadoCola = mutex.withLock {
        pausa()
        errorConsulta?.let { return ResultadoCola.Error(it) }
        ResultadoCola.Exito(instantanea())
    }

    override suspend fun solicitar(cancion: Cancion): ResultadoSolicitud = mutex.withLock {
        pausa()
        errorOperacion?.let { return ResultadoSolicitud.Error(it) }
        rechazoSolicitud?.let { return ResultadoSolicitud.Rechazada(it, faltantes = 2) }

        // Regla 1B: si la canción ya espera o suena, no se duplica: se suma un voto.
        val existente = entradas.firstOrNull { it.solicitud.cancion.youtubeVideoId == cancion.youtubeVideoId }
        if (existente != null) {
            if (existente.solicitud.miVoto != null) {
                return ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.VOTO_DUPLICADO)
            }
            val actualizada = existente.solicitud.copy(
                totalVotos = existente.solicitud.totalVotos + 1,
                miVoto = TipoVoto.AUTOMATICO,
            )
            reemplazar(existente, actualizada)
            return ResultadoSolicitud.Aceptada(buscar(actualizada.idSolicitud), sumoVotoAExistente = true)
        }
        if (reproduccion?.cancion?.youtubeVideoId == cancion.youtubeVideoId) {
            // Suena ahora: la solicitud se acepta sumando un voto a la que suena, que no vuelve a la cola.
            val sonando = SolicitudCola(
                idSolicitud = reproduccion!!.idSolicitud,
                cancion = cancion,
                estado = EstadoSolicitud.EN_REPRODUCCION,
                posicion = null,
                totalVotos = 1,
                esMia = false,
                miVoto = TipoVoto.AUTOMATICO,
                esperaEstimadaSegundos = null,
            )
            return ResultadoSolicitud.Aceptada(sonando, sumoVotoAExistente = true)
        }

        val nueva = SolicitudCola(
            idSolicitud = "SIM-SOL-${siguienteId++}",
            cancion = cancion,
            estado = EstadoSolicitud.PENDIENTE,
            posicion = null,
            totalVotos = 1,
            esMia = true,
            miVoto = TipoVoto.AUTOMATICO,
            esperaEstimadaSegundos = null,
        )
        entradas = ordenar(entradas + Entrada(nueva, siguienteLlegada++))
        ResultadoSolicitud.Aceptada(buscar(nueva.idSolicitud), sumoVotoAExistente = false)
    }

    override suspend fun votar(idSolicitud: String): ResultadoVoto = mutex.withLock {
        pausa()
        errorOperacion?.let { return ResultadoVoto.Error(it) }
        rechazoVoto?.let { return ResultadoVoto.Rechazado(it, faltantes = 2) }

        val entrada = entradas.firstOrNull { it.solicitud.idSolicitud == idSolicitud }
            ?: return ResultadoVoto.Rechazado(MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE)
        if (entrada.solicitud.estado != EstadoSolicitud.PENDIENTE) {
            return ResultadoVoto.Rechazado(MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE)
        }
        if (entrada.solicitud.miVoto != null) {
            return ResultadoVoto.Rechazado(MotivoRechazoOperacion.VOTO_DUPLICADO)
        }
        val actualizada = entrada.solicitud.copy(
            totalVotos = entrada.solicitud.totalVotos + 1,
            miVoto = TipoVoto.MANUAL,
        )
        reemplazar(entrada, actualizada)
        ResultadoVoto.Registrado(buscar(idSolicitud))
    }

    private suspend fun pausa() {
        if (latenciaMs > 0) delay(latenciaMs)
    }

    private fun reemplazar(anterior: Entrada, nueva: SolicitudCola) {
        entradas = ordenar(entradas.map { if (it === anterior) anterior.copy(solicitud = nueva) else it })
    }

    /** Votos descendentes; con los mismos votos, la solicitud más antigua primero. Renumera posiciones. */
    private fun ordenar(lista: List<Entrada>): List<Entrada> =
        lista.sortedWith(compareByDescending<Entrada> { it.solicitud.totalVotos }.thenBy { it.llegada })
            .mapIndexed { indice, e -> e.copy(solicitud = e.solicitud.copy(posicion = indice + 1)) }

    private fun buscar(idSolicitud: String): SolicitudCola =
        entradas.first { it.solicitud.idSolicitud == idSolicitud }.solicitud

    private fun instantanea() = EstadoCola(reproduccion, entradas.map { it.solicitud })
}
