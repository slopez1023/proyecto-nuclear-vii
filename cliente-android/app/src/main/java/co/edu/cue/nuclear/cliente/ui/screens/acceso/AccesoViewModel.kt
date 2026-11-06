package co.edu.cue.nuclear.cliente.ui.screens.acceso

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.eventos.Evento
import co.edu.cue.nuclear.cliente.data.eventos.RegistradorEventos
import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo
import co.edu.cue.nuclear.cliente.data.sesion.ResultadoAcceso
import co.edu.cue.nuclear.cliente.data.sesion.Sesion
import co.edu.cue.nuclear.cliente.data.sesion.SesionActiva
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import co.edu.cue.nuclear.cliente.data.sesion.SesionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AccesoEstado {
    /** La app se abrió sin un enlace de QR. */
    data object SinQr : AccesoEstado
    data object Cargando : AccesoEstado
    data class Valido(val sesion: Sesion, val dispositivoId: String) : AccesoEstado
    data class Rechazado(val motivo: MotivoRechazo) : AccesoEstado
    data object ErrorConexion : AccesoEstado
    data object ErrorServidor : AccesoEstado
}

/** Traduce el resultado del repositorio al estado de pantalla. */
fun ResultadoAcceso.aEstado(dispositivoId: String): AccesoEstado = when (this) {
    is ResultadoAcceso.Valido -> AccesoEstado.Valido(sesion, dispositivoId)
    is ResultadoAcceso.Rechazado -> AccesoEstado.Rechazado(motivo)
    ResultadoAcceso.ErrorConexion -> AccesoEstado.ErrorConexion
    ResultadoAcceso.ErrorServidor -> AccesoEstado.ErrorServidor
}

class AccesoViewModel(
    private val token: String?,
    private val sesiones: SesionRepository,
    private val dispositivos: DispositivoRepository,
    private val eventos: RegistradorEventos,
    private val sesionActiva: SesionActivaStore,
) : ViewModel() {

    private val _estado = MutableStateFlow<AccesoEstado>(
        if (token == null) AccesoEstado.SinQr else AccesoEstado.Cargando,
    )
    val estado: StateFlow<AccesoEstado> = _estado.asStateFlow()

    init {
        if (token != null) validar()
    }

    fun reintentar() {
        if (token == null) return
        _estado.value = AccesoEstado.Cargando
        validar()
    }

    private fun validar() {
        viewModelScope.launch {
            // Se garantiza el UUID del dispositivo antes de entrar a la sesión (B07).
            val dispositivoId = dispositivos.obtenerId()
            val estado = sesiones.validar(token).aEstado(dispositivoId)
            if (estado is AccesoEstado.Valido) registrarUnion(estado)
            _estado.value = estado
        }
    }

    /** Deja la sesión disponible para otras pantallas y emite `dispositivo_unido`, una vez por validación exitosa. */
    private suspend fun registrarUnion(estado: AccesoEstado.Valido) {
        val idSesion = estado.sesion.idSesion
        sesionActiva.actual = SesionActiva(idSesion, estado.dispositivoId)
        val recurrente = dispositivos.marcarUnion()
        eventos.registrar(Evento.DispositivoUnido(idSesion, estado.dispositivoId, recurrente))
    }
}
