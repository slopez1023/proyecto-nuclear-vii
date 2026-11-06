package co.edu.cue.nuclear.cliente.data.sesion

/** Sesión a la que el dispositivo ya se unió y su UUID; lo necesitan los eventos de las pantallas posteriores. */
data class SesionActiva(val idSesion: String, val dispositivoId: String)

/** Contenedor en memoria de la sesión activa. Se vacía al cerrar la app; el acceso por QR la vuelve a crear. */
class SesionActivaStore {
    @Volatile
    var actual: SesionActiva? = null
}
