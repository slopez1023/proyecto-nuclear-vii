package co.edu.cue.nuclear.cliente.data.eventos

/**
 * Eventos de instrumentación del Entregable 3. Nombres y datos según el documento del proyecto
 * (sec. XVI): solo `dispositivo_unido` y `busqueda_realizada`. El esquema del lado servidor está en
 * backend/src/eventos.js. Cualquier evento nuevo requiere la definición de Big Data (Karen).
 */
sealed interface Evento {
    val sesionId: String
    val dispositivoId: String

    /** El dispositivo entró a una sesión tras validar el QR. `recurrente`: ya se había unido antes a alguna sesión. */
    data class DispositivoUnido(
        override val sesionId: String,
        override val dispositivoId: String,
        val recurrente: Boolean,
    ) : Evento

    /** Búsqueda aceptada por el servidor (también con 0 resultados). Las fallidas no se registran. */
    data class BusquedaRealizada(
        override val sesionId: String,
        override val dispositivoId: String,
        val termino: String,
        val cantidadResultados: Int,
        val desdeCache: Boolean,
    ) : Evento
}

/** Quien recibe los eventos. Registrar nunca debe bloquear ni romper la experiencia del usuario. */
fun interface RegistradorEventos {
    fun registrar(evento: Evento)
}
