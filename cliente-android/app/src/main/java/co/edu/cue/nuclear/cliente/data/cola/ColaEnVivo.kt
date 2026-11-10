package co.edu.cue.nuclear.cliente.data.cola

import kotlinx.coroutines.flow.Flow

/** Lo que ocurre en el flujo en tiempo real de la cola. */
sealed interface EventoFlujo {
    /** El servidor aceptó la conexión (cabeceras 200 `text/event-stream`). */
    data object Conectado : EventoFlujo

    /** Estado COMPLETO de la cola (el mismo contenido que `GET /cola`). Quien lo aplica descarta versiones viejas. */
    data class Estado(val estado: EstadoCola) : EventoFlujo

    /** El flujo se cortó; se volverá a conectar en [enMs] milisegundos. */
    data class Reconectando(val enMs: Long) : EventoFlujo

    /** No se reconecta: la sesión ya no existe o se cerró, o el servidor rechazó la petición de forma definitiva. */
    data class Terminado(val error: TipoErrorCola) : EventoFlujo
}

/**
 * Actualizaciones de la cola en tiempo real (SSE). Cada colección de [flujo] abre UNA conexión y la cierra al
 * cancelarse; reconecta sola mientras siga activa. Quien la use es responsable de no abrir dos a la vez.
 */
interface ColaEnVivo {
    fun flujo(): Flow<EventoFlujo>
}
