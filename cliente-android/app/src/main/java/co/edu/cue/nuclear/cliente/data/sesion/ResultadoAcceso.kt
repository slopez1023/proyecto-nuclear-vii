package co.edu.cue.nuclear.cliente.data.sesion

data class Sesion(
    val idSesion: String,
    val nombreEstablecimiento: String,
    /** La sesión proviene de datos simulados del backend (no de un módulo de sesiones real). */
    val provisional: Boolean,
    /** `establecimiento.id_establecimiento` de la respuesta de acceso (contrato del E3). Se conserva por si el E4 lo necesita. */
    val idEstablecimiento: String? = null,
)

/** Motivos de rechazo del QR; el código coincide con `error.codigo` del backend. */
enum class MotivoRechazo(val codigo: String) {
    TOKEN_INVALIDO("token_invalido"),
    SESION_INEXISTENTE("sesion_inexistente"),
    SESION_CERRADA("sesion_cerrada"),
    QR_DESACTIVADO("qr_desactivado"),
    ;

    companion object {
        fun desdeCodigo(codigo: String?): MotivoRechazo? = entries.firstOrNull { it.codigo == codigo }
    }
}

sealed interface ResultadoAcceso {
    data class Valido(val sesion: Sesion) : ResultadoAcceso
    data class Rechazado(val motivo: MotivoRechazo) : ResultadoAcceso

    /** No hubo respuesta del servidor (sin red, timeout, host inalcanzable). */
    data object ErrorConexion : ResultadoAcceso

    /** El servidor respondió algo inesperado (5xx, cuerpo ilegible, código desconocido). */
    data object ErrorServidor : ResultadoAcceso
}

/** Resultado al resolver un código numérico de 6 dígitos hacia el token QR de la misma sesión. */
sealed interface ResultadoCodigo {
    data class Valido(val qrToken: String) : ResultadoCodigo

    /** Código incorrecto, revocado, sesión cerrada o no disponible (400 / 404 uniforme). */
    data object NoDisponible : ResultadoCodigo

    /** Límite temporal por fuerza bruta (429). */
    data class DemasiadosIntentos(val reintentarEnSegundos: Int?) : ResultadoCodigo

    data object TiempoAgotado : ResultadoCodigo
    data object ErrorConexion : ResultadoCodigo
    data object ErrorServidor : ResultadoCodigo
}
