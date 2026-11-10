package co.edu.cue.nuclear.cliente.ui.screens.cola

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.ColaRepository
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.ResultadoCola
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.ui.components.MensajeUi
import co.edu.cue.nuclear.cliente.ui.components.aMensaje
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Qué se sabe de la cola. */
sealed interface CargaCola {
    /** Primera carga (o reintento tras un error): todavía no hay datos que mostrar. */
    data object Cargando : CargaCola

    /** Hay una canción sonando o solicitudes en espera. */
    data class Exito(val estado: EstadoCola) : CargaCola

    /** Nada suena y nada espera. */
    data object Vacia : CargaCola

    data class Error(val tipo: TipoErrorCola) : CargaCola
}

/**
 * Estado de la pantalla de cola y de las operaciones en curso.
 *
 * @property votando solicitudes con un voto en camino (impide una segunda pulsación).
 * @property solicitando hay una solicitud en camino.
 * @property mensaje último resultado de una operación (rechazo o error), hasta que se cierre.
 * @property confirmacion solicitud aceptada que muestra la pantalla de confirmación (hasta que se cierre).
 * @property navegarAConfirmacion evento de una sola vez: la pantalla que pidió la solicitud debe abrir la confirmación.
 * @property solicitudDestacada solicitud que la cola debe resaltar y mostrar (la que se acaba de confirmar); `null` si ninguna.
 */
data class ColaUiState(
    val carga: CargaCola = CargaCola.Cargando,
    val votando: Set<String> = emptySet(),
    val solicitando: Boolean = false,
    val mensaje: MensajeUi? = null,
    val confirmacion: ConfirmacionSolicitud? = null,
    val navegarAConfirmacion: Boolean = false,
    val solicitudDestacada: String? = null,
)

/**
 * Una solicitud aceptada por el servidor.
 *
 * @property sumoVotoAExistente `false`: la canción es una solicitud nueva (con su voto automático);
 *   `true`: la canción ya estaba esperando o sonando y no se duplicó, se sumó un voto a su solicitud (regla 1B).
 */
data class ConfirmacionSolicitud(val solicitud: SolicitudCola, val sumoVotoAExistente: Boolean)

/**
 * Estado de la cola para las pantallas de cola y detalle (comparten una sola instancia).
 *
 * No aplica reglas del servidor: no suma votos, no reordena ni calcula esperas. Tras cada operación
 * aceptada vuelve a pedir la cola, de modo que lo que se ve es siempre lo que informó el repositorio.
 * Solo evita lo evidente en local: una segunda pulsación mientras la primera sigue en camino y votar
 * una solicitud que la propia lista muestra como no votable. El servidor valida siempre.
 */
class ColaViewModel(private val repositorio: ColaRepository) : ViewModel() {

    private val _estado = MutableStateFlow(ColaUiState())
    val estado: StateFlow<ColaUiState> = _estado.asStateFlow()

    private var cargaInicialHecha = false

    /**
     * Se llama cada vez que se muestra la pantalla de cola. La primera vez (o tras un error) carga con
     * indicador; después refresca sin vaciar lo que ya se ve.
     */
    fun alMostrarse() {
        val actual = _estado.value.carga
        if (!cargaInicialHecha || actual is CargaCola.Error) {
            cargaInicialHecha = true
            cargar()
        } else {
            viewModelScope.launch { refrescar() }
        }
    }

    fun reintentar() = cargar()

    private fun cargar() {
        _estado.update { it.copy(carga = CargaCola.Cargando) }
        viewModelScope.launch {
            _estado.update { it.copy(carga = repositorio.obtenerCola().aCarga()) }
        }
    }

    /** Pide la cola de nuevo sin mostrar "cargando". Si falla, conserva lo que ya había. */
    private suspend fun refrescar(respaldo: SolicitudCola? = null) {
        when (val resultado = repositorio.obtenerCola()) {
            is ResultadoCola.Exito -> _estado.update {
                it.copy(carga = resultado.aCarga(), confirmacion = it.confirmacion?.actualizadaCon(resultado.estado))
            }
            is ResultadoCola.Error -> if (respaldo != null) _estado.update { it.conRespaldo(respaldo) }
        }
    }

    /** Si no se pudo refrescar, reemplaza solo la solicitud que el servidor acaba de devolver. */
    private fun ColaUiState.conRespaldo(solicitud: SolicitudCola): ColaUiState {
        val exito = carga as? CargaCola.Exito ?: return this
        val cola = exito.estado.cola.map { if (it.idSolicitud == solicitud.idSolicitud) solicitud else it }
        return copy(carga = CargaCola.Exito(exito.estado.copy(cola = cola)))
    }

    fun votar(idSolicitud: String) {
        val actual = _estado.value
        val solicitud = (actual.carga as? CargaCola.Exito)?.estado?.cola?.firstOrNull { it.idSolicitud == idSolicitud }
        if (solicitud == null || !solicitud.puedeVotar || idSolicitud in actual.votando) return

        _estado.update { it.copy(votando = it.votando + idSolicitud, mensaje = null) }
        viewModelScope.launch {
            val resultado = repositorio.votar(idSolicitud)
            _estado.update { it.copy(votando = it.votando - idSolicitud, mensaje = resultado.aMensaje()) }
            if (resultado is ResultadoVoto.Registrado) refrescar(respaldo = resultado.solicitud)
        }
    }

    fun solicitar(cancion: Cancion) {
        if (_estado.value.solicitando) return

        _estado.update { it.copy(solicitando = true, mensaje = null) }
        viewModelScope.launch {
            val resultado = repositorio.solicitar(cancion)
            if (resultado is ResultadoSolicitud.Aceptada) {
                // Una solicitud aceptada se confirma en su propia pantalla; no hay aviso.
                _estado.update {
                    it.copy(
                        solicitando = false,
                        mensaje = null,
                        confirmacion = ConfirmacionSolicitud(resultado.solicitud, resultado.sumoVotoAExistente),
                        navegarAConfirmacion = true,
                    )
                }
                cargaInicialHecha = true
                refrescar()
            } else {
                _estado.update { it.copy(solicitando = false, mensaje = resultado.aMensaje()) }
            }
        }
    }

    fun cerrarMensaje() = _estado.update { it.copy(mensaje = null) }

    /** La pantalla que pidió la solicitud ya abrió la confirmación: el evento no debe repetirse. */
    fun confirmacionMostrada() = _estado.update { it.copy(navegarAConfirmacion = false) }

    /** Se salió de la confirmación (o se empieza otra solicitud): olvida la confirmación y su evento pendiente. */
    fun cerrarConfirmacion() = _estado.update { it.copy(confirmacion = null, navegarAConfirmacion = false) }

    /**
     * "Ver cola" desde la confirmación: cierra la confirmación y deja la solicitud confirmada como
     * destacada, para que la cola la resalte y la muestre.
     */
    fun verColaDesdeConfirmacion() = _estado.update {
        it.copy(
            solicitudDestacada = it.confirmacion?.solicitud?.idSolicitud,
            confirmacion = null,
            navegarAConfirmacion = false,
        )
    }

    /** Se llega a la cola (o se sale de ella) por otro camino: no debe quedar nada resaltado. */
    fun quitarDestacado() = _estado.update { it.copy(solicitudDestacada = null) }

    /** Si la cola recién pedida trae esta solicitud, muestra su posición, votos y espera más recientes (los del servidor). */
    private fun ConfirmacionSolicitud.actualizadaCon(cola: EstadoCola): ConfirmacionSolicitud {
        val reciente = cola.cola.firstOrNull { it.idSolicitud == solicitud.idSolicitud } ?: return this
        return copy(solicitud = reciente)
    }

    private fun ResultadoCola.aCarga(): CargaCola = when (this) {
        is ResultadoCola.Exito -> if (estado.estaVacia) CargaCola.Vacia else CargaCola.Exito(estado)
        is ResultadoCola.Error -> CargaCola.Error(tipo)
    }
}
