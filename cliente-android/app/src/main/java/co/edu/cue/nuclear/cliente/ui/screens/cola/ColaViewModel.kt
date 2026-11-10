package co.edu.cue.nuclear.cliente.ui.screens.cola

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.ColaEnVivo
import co.edu.cue.nuclear.cliente.data.cola.ColaRepository
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.EventoFlujo
import co.edu.cue.nuclear.cliente.data.cola.ResultadoCola
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.ui.components.MensajeUi
import co.edu.cue.nuclear.cliente.ui.components.aMensaje
import kotlinx.coroutines.Job
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

/** Estado de la conexión en tiempo real (SSE). */
enum class ConexionEnVivo {
    /** Sin flujo abierto (segundo plano, antes de empezar o tras terminar). */
    Inactiva,
    Conectada,

    /** El flujo se cortó y se está esperando para volver a conectar. */
    Reconectando,
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
 * @property conexionEnVivo estado del flujo SSE.
 * @property sesionNoDisponible el servidor dijo que la sesión no existe o está cerrada: quien navega debe limpiar la
 *   sesión local y volver a Acceso.
 */
data class ColaUiState(
    val carga: CargaCola = CargaCola.Cargando,
    val votando: Set<String> = emptySet(),
    val solicitando: Boolean = false,
    val mensaje: MensajeUi? = null,
    val confirmacion: ConfirmacionSolicitud? = null,
    val navegarAConfirmacion: Boolean = false,
    val solicitudDestacada: String? = null,
    val conexionEnVivo: ConexionEnVivo = ConexionEnVivo.Inactiva,
    val sesionNoDisponible: Boolean = false,
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
 *
 * Con [enVivo], mientras la app está en primer plano ([alPrimerPlano]) recibe el estado completo de la cola por SSE.
 * GET y SSE comparten la regla de versiones: un estado con versión menor o igual a la aplicada se descarta.
 */
class ColaViewModel(
    private val repositorio: ColaRepository,
    private val enVivo: ColaEnVivo? = null,
) : ViewModel() {

    private val _estado = MutableStateFlow(ColaUiState())
    val estado: StateFlow<ColaUiState> = _estado.asStateFlow()

    private var cargaInicialHecha = false

    /** Versión del último estado aplicado. Un estado con versión menor o igual se descarta (respuesta desordenada). */
    private var versionAplicada: Long? = null

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
        // Solo se olvida la versión si no hay datos que proteger (primera carga o reintento tras un error).
        val carga = _estado.value.carga
        if (carga !is CargaCola.Exito && carga !is CargaCola.Vacia) versionAplicada = null
        _estado.update { it.copy(carga = CargaCola.Cargando) }
        viewModelScope.launch {
            when (val resultado = repositorio.obtenerCola()) {
                is ResultadoCola.Exito -> aplicarEstado(resultado.estado)
                is ResultadoCola.Error -> {
                    marcarSesionNoDisponible(resultado.tipo)
                    // Si mientras tanto el flujo en vivo ya trajo datos, no se pisan con un error.
                    _estado.update { if (it.carga is CargaCola.Cargando) it.copy(carga = CargaCola.Error(resultado.tipo)) else it }
                }
            }
        }
    }

    /**
     * Aplica un estado de la cola venga de GET o de SSE. Con datos ya mostrados, uno con versión menor o igual a la
     * aplicada se descarta (respuesta desordenada). Devuelve si se aplicó.
     */
    private fun aplicarEstado(nuevo: EstadoCola): Boolean {
        val sinDatos = _estado.value.carga is CargaCola.Cargando
        if (!sinDatos && !nuevo.esMasNuevoQue(versionAplicada)) return false
        versionAplicada = nuevo.version ?: versionAplicada
        _estado.update { it.copy(carga = nuevo.aCarga(), confirmacion = it.confirmacion?.actualizadaCon(nuevo)) }
        return true
    }

    private fun marcarSesionNoDisponible(tipo: TipoErrorCola) {
        if (tipo == TipoErrorCola.SESION_NO_DISPONIBLE) _estado.update { it.copy(sesionNoDisponible = true) }
    }

    // --- Tiempo real -------------------------------------------------------------------------

    private var jobFlujo: Job? = null

    /**
     * La app está en primer plano y hay sesión: abre el flujo en vivo. Es seguro llamarlo varias veces
     * (recomposiciones, navegación): si ya hay un flujo activo no abre otro.
     */
    fun alPrimerPlano() {
        val vivo = enVivo ?: return
        if (jobFlujo?.isActive == true) return
        jobFlujo = viewModelScope.launch { vivo.flujo().collect(::alEventoFlujo) }
    }

    /** La app pasó a segundo plano (o se dejó la sesión): cierra el flujo y libera la conexión. */
    fun alSegundoPlano() {
        jobFlujo?.cancel()
        jobFlujo = null
        _estado.update { if (it.conexionEnVivo == ConexionEnVivo.Inactiva) it else it.copy(conexionEnVivo = ConexionEnVivo.Inactiva) }
    }

    private fun alEventoFlujo(evento: EventoFlujo) {
        when (evento) {
            EventoFlujo.Conectado -> _estado.update { it.copy(conexionEnVivo = ConexionEnVivo.Conectada) }
            is EventoFlujo.Estado -> {
                cargaInicialHecha = true
                aplicarEstado(evento.estado)
            }
            is EventoFlujo.Reconectando -> _estado.update { it.copy(conexionEnVivo = ConexionEnVivo.Reconectando) }
            is EventoFlujo.Terminado -> {
                _estado.update { it.copy(conexionEnVivo = ConexionEnVivo.Inactiva) }
                marcarSesionNoDisponible(evento.error)
            }
        }
    }

    private fun EstadoCola.aCarga(): CargaCola = if (estaVacia) CargaCola.Vacia else CargaCola.Exito(this)

    /** Pide la cola de nuevo sin mostrar "cargando". Si falla, conserva lo que ya había. */
    private suspend fun refrescar(respaldo: SolicitudCola? = null) {
        when (val resultado = repositorio.obtenerCola()) {
            // Más viejo o igual que lo que ya se muestra: se ignora (ni siquiera reemplaza por el respaldo).
            is ResultadoCola.Exito -> aplicarEstado(resultado.estado)
            is ResultadoCola.Error -> {
                marcarSesionNoDisponible(resultado.tipo)
                if (respaldo != null) _estado.update { it.conRespaldo(respaldo) }
            }
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
            if (resultado is ResultadoVoto.Error) marcarSesionNoDisponible(resultado.tipo)
            when {
                resultado is ResultadoVoto.Registrado -> refrescar(respaldo = resultado.solicitud)
                // Sin respuesta: puede haberse registrado. Se consulta la cola (no se repite el voto a ciegas).
                resultado is ResultadoVoto.Error && resultado.tipo == TipoErrorCola.SIN_CONFIRMAR -> refrescar()
            }
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
                // Sin respuesta: puede haberse registrado. Se consulta la cola (no se repite la solicitud a ciegas).
                if (resultado is ResultadoSolicitud.Error) marcarSesionNoDisponible(resultado.tipo)
                if (resultado is ResultadoSolicitud.Error && resultado.tipo == TipoErrorCola.SIN_CONFIRMAR) refrescar()
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
}
