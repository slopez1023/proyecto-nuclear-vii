package co.edu.cue.nuclear.cliente.data.sesion

/**
 * Sesión a la que el dispositivo ya se unió, su UUID persistente y el establecimiento al que pertenece.
 * Es la fuente única que usarán los repositorios para armar sus llamadas (eventos hoy; cola, solicitud y voto
 * cuando el backend confirme su contrato). `idEstablecimiento` es `null` si la respuesta de acceso no lo trajo.
 */
data class SesionActiva(val idSesion: String, val dispositivoId: String, val idEstablecimiento: String? = null)

/** Contenedor en memoria de la sesión activa. Se vacía al cerrar la app; el acceso por QR la vuelve a crear. */
class SesionActivaStore {
    @Volatile
    var actual: SesionActiva? = null
}
