package co.edu.cue.nuclear.cliente.ui.screens.codigo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.sesion.CodigoAcceso
import co.edu.cue.nuclear.cliente.data.sesion.ResultadoCodigo
import co.edu.cue.nuclear.cliente.data.sesion.SesionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CodigoAccesoEstado(
    val codigo: String = "",
    val cargando: Boolean = false,
    val mensaje: String? = null,
    val tokenResuelto: String? = null,
) {
    val puedeIngresar: Boolean get() = CodigoAcceso.esValido(codigo) && !cargando
}

class CodigoAccesoViewModel(
    private val sesiones: SesionRepository,
    private val dispositivos: DispositivoRepository? = null,
) : ViewModel() {

    private val _estado = MutableStateFlow(CodigoAccesoEstado())
    val estado: StateFlow<CodigoAccesoEstado> = _estado.asStateFlow()

    fun alCambiarCodigo(entrada: String) {
        if (_estado.value.cargando) return
        val limpio = CodigoAcceso.normalizar(entrada)
        _estado.update { it.copy(codigo = limpio, mensaje = null) }
    }

    fun limpiarMensaje() {
        _estado.update { it.copy(mensaje = null) }
    }

    fun consumirToken() {
        _estado.update { it.copy(tokenResuelto = null) }
    }

    fun ingresar() {
        val actual = _estado.value
        if (actual.cargando) return
        if (!CodigoAcceso.esValido(actual.codigo)) {
            _estado.update {
                it.copy(mensaje = "Ingresa los ${CodigoAcceso.LONGITUD} dígitos del código de sesión.")
            }
            return
        }

        _estado.update { it.copy(cargando = true, mensaje = null) }
        viewModelScope.launch {
            val dispositivoId = dispositivos?.obtenerId()
            when (val res = sesiones.resolverCodigo(actual.codigo, dispositivoId)) {
                is ResultadoCodigo.Valido -> {
                    _estado.update { it.copy(cargando = false, tokenResuelto = res.qrToken) }
                }
                ResultadoCodigo.NoDisponible -> {
                    _estado.update {
                        it.copy(
                            cargando = false,
                            mensaje = "El código no es válido o la sesión no está disponible en este momento.",
                        )
                    }
                }
                is ResultadoCodigo.DemasiadosIntentos -> {
                    val espera = res.reintentarEnSegundos
                    val textoEspera = if (espera != null && espera > 0) {
                        "Demasiados intentos fallidos. Espera $espera segundos antes de volver a intentar."
                    } else {
                        "Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar."
                    }
                    _estado.update { it.copy(cargando = false, mensaje = textoEspera) }
                }
                ResultadoCodigo.TiempoAgotado -> {
                    _estado.update {
                        it.copy(
                            cargando = false,
                            mensaje = "La solicitud tardó demasiado. Inténtalo de nuevo.",
                        )
                    }
                }
                ResultadoCodigo.ErrorConexion -> {
                    _estado.update {
                        it.copy(
                            cargando = false,
                            mensaje = "No pudimos conectarnos con el servidor. Revisa tu conexión.",
                        )
                    }
                }
                ResultadoCodigo.ErrorServidor -> {
                    _estado.update {
                        it.copy(
                            cargando = false,
                            mensaje = "Ocurrió un error inesperado. Inténtalo de nuevo en unos segundos.",
                        )
                    }
                }
            }
        }
    }
}
