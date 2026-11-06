package co.edu.cue.nuclear.cliente.ui.screens.buscar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaRepository
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.busqueda.ResultadoBusqueda
import co.edu.cue.nuclear.cliente.data.busqueda.ResultadoSugerencias
import co.edu.cue.nuclear.cliente.data.busqueda.TipoErrorBusqueda
import co.edu.cue.nuclear.cliente.data.eventos.Evento
import co.edu.cue.nuclear.cliente.data.eventos.RegistradorEventos
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ResultadosUi {
    /** Aún no se ha buscado nada. */
    data object Inicial : ResultadosUi
    data object Cargando : ResultadosUi
    data class Exito(val canciones: List<Cancion>) : ResultadosUi
    data class SinResultados(val consulta: String) : ResultadosUi
    data class Error(val tipo: TipoErrorBusqueda) : ResultadosUi
}

data class BuscarUiState(
    val consulta: String = "",
    val sugerencias: List<String> = emptyList(),
    val resultados: ResultadosUi = ResultadosUi.Inicial,
)

class BuscarViewModel(
    private val repositorio: BusquedaRepository,
    private val eventos: RegistradorEventos,
    private val sesionActiva: SesionActivaStore,
    private val debounceMs: Long = DEBOUNCE_MS,
) : ViewModel() {

    private val _estado = MutableStateFlow(BuscarUiState())
    val estado: StateFlow<BuscarUiState> = _estado.asStateFlow()

    private var trabajoSugerencias: Job? = null
    private var trabajoBusqueda: Job? = null

    /** Autocompletado (B04): espera a que el usuario deje de escribir y solo consulta con 3+ caracteres. */
    fun onConsultaCambio(texto: String) {
        _estado.update { it.copy(consulta = texto, sugerencias = emptyList()) }
        trabajoSugerencias?.cancel()
        if (texto.trim().length < MIN_SUGERENCIA) return

        trabajoSugerencias = viewModelScope.launch {
            delay(debounceMs)
            val resultado = repositorio.sugerir(texto)
            // Se descarta la respuesta si el usuario siguió escribiendo o ya lanzó la búsqueda.
            if (resultado is ResultadoSugerencias.Exito && _estado.value.consulta == texto) {
                _estado.update { it.copy(sugerencias = resultado.sugerencias) }
            }
        }
    }

    fun elegirSugerencia(sugerencia: String) {
        _estado.update { it.copy(consulta = sugerencia) }
        buscar()
    }

    /** Búsqueda (B03) de la consulta actual. */
    fun buscar() {
        val consulta = _estado.value.consulta.trim()
        if (consulta.length < MIN_BUSQUEDA) return

        trabajoSugerencias?.cancel()
        trabajoBusqueda?.cancel()
        _estado.update { it.copy(sugerencias = emptyList(), resultados = ResultadosUi.Cargando) }

        trabajoBusqueda = viewModelScope.launch {
            val ui = when (val resultado = repositorio.buscar(consulta)) {
                is ResultadoBusqueda.Exito -> {
                    registrarBusqueda(consulta, resultado)
                    if (resultado.canciones.isEmpty()) ResultadosUi.SinResultados(consulta)
                    else ResultadosUi.Exito(resultado.canciones)
                }
                is ResultadoBusqueda.Error -> ResultadosUi.Error(resultado.tipo)
            }
            _estado.update { it.copy(resultados = ui) }
        }
    }

    fun reintentar() = buscar()

    /** Evento `busqueda_realizada`: solo para búsquedas aceptadas y si hay una sesión activa. */
    private fun registrarBusqueda(consulta: String, resultado: ResultadoBusqueda.Exito) {
        val sesion = sesionActiva.actual ?: return
        eventos.registrar(
            Evento.BusquedaRealizada(
                sesionId = sesion.idSesion,
                dispositivoId = sesion.dispositivoId,
                termino = consulta,
                cantidadResultados = resultado.canciones.size,
                desdeCache = resultado.desdeCache,
            ),
        )
    }

    companion object {
        const val DEBOUNCE_MS = 450L
        const val MIN_SUGERENCIA = 3
        const val MIN_BUSQUEDA = 2
    }
}
