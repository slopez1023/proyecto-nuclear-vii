package co.edu.cue.nuclear.cliente.data.sesion

import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Resultado de intentar recuperar la sesión tras recrearse el proceso. */
sealed interface ResultadoRestauracion {
    /** La sesión guardada sigue vigente según el servidor y ya está en [SesionActivaStore]. */
    data class Restaurada(val sesion: SesionActiva) : ResultadoRestauracion

    /** No había nada guardado. */
    data object SinSesion : ResultadoRestauracion

    /** El servidor dijo que la sesión no existe o está cerrada: se borró lo guardado. */
    data object Invalida : ResultadoRestauracion

    /** No se pudo confirmar (sin red o error del servidor): NO se da por vigente, pero lo guardado se conserva. */
    data object NoConfirmada : ResultadoRestauracion
}

/**
 * Recupera la sesión al reiniciarse el proceso. Una sesión guardada no es válida por estarlo: se confirma con el
 * servidor ([validar], que consulta la cola de esa sesión) antes de dejarla en [SesionActivaStore].
 *
 * - `Exito` → vigente. `SESION_NO_DISPONIBLE` → se limpia todo. Cualquier otro error → no confirmada.
 * - Mientras se valida, la sesión candidata está en el store porque el repositorio la necesita para armar la ruta;
 *   si no se confirma, se retira.
 */
class RestauradorSesion(
    private val local: SesionLocal,
    private val dispositivos: DispositivoRepository,
    private val sesionActiva: SesionActivaStore,
    private val validar: suspend () -> Validacion,
) {
    enum class Validacion { VIGENTE, NO_DISPONIBLE, SIN_CONFIRMAR }

    private val exclusion = Mutex()

    /** Seguro de llamar desde varias pantallas a la vez: la restauración se hace una sola vez. */
    suspend fun restaurar(): ResultadoRestauracion = exclusion.withLock {
        sesionActiva.actual?.let { return ResultadoRestauracion.Restaurada(it) }
        val guardada = local.leer() ?: return ResultadoRestauracion.SinSesion
        val candidata = SesionActiva(guardada.idSesion, dispositivos.obtenerId(), guardada.idEstablecimiento)
        sesionActiva.actual = candidata
        when (validar()) {
            Validacion.VIGENTE -> ResultadoRestauracion.Restaurada(candidata)
            Validacion.NO_DISPONIBLE -> {
                sesionActiva.actual = null
                local.limpiar()
                ResultadoRestauracion.Invalida
            }
            Validacion.SIN_CONFIRMAR -> {
                sesionActiva.actual = null
                ResultadoRestauracion.NoConfirmada
            }
        }
    }

    /** La sesión terminó (cerrada, expirada o inexistente): olvida la local y la guardada. */
    suspend fun cerrarLocalmente() {
        sesionActiva.actual = null
        local.limpiar()
    }
}
