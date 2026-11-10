package co.edu.cue.nuclear.cliente.ui.screens.detalle

import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ReproduccionActual
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.ui.screens.cola.CargaCola

/**
 * Qué sabe Android de una canción respecto a la cola, para mostrarlo en su detalle.
 *
 * Es solo una PISTA calculada con la última cola recibida, que puede estar desactualizada. **No sustituye
 * las reglas del servidor**: quien decide si una solicitud se acepta, se rechaza o suma un voto es el backend.
 */
sealed interface EstadoCancionEnCola {
    /** Aún no se sabe (la cola está cargando o falló): no se bloquea nada; decide el servidor. */
    data object Desconocido : EstadoCancionEnCola

    /** Con datos recientes de la cola, la canción no está esperando ni suena: se puede solicitar. */
    data object Disponible : EstadoCancionEnCola

    /** La canción suena ahora. */
    data class Sonando(val reproduccion: ReproduccionActual) : EstadoCancionEnCola

    /** Hay una solicitud pendiente de esta canción hecha por este dispositivo. */
    data class SolicitadaPorTi(val solicitud: SolicitudCola) : EstadoCancionEnCola

    /** Hay una solicitud pendiente de esta canción hecha por otro dispositivo. */
    data class Pendiente(val solicitud: SolicitudCola) : EstadoCancionEnCola
}

/** Ya hay una solicitud pendiente o la canción suena: no se ofrece iniciar otra solicitud desde el detalle. */
val EstadoCancionEnCola.yaEstaEnLaCola: Boolean
    get() = this is EstadoCancionEnCola.Sonando ||
        this is EstadoCancionEnCola.SolicitadaPorTi ||
        this is EstadoCancionEnCola.Pendiente

/**
 * Busca la canción ([youtubeVideoId]) en la última cola recibida. Si suena, manda ese estado; si no, mira las
 * solicitudes pendientes. Una canción que ya terminó, falló o salió de la cola vuelve a estar disponible.
 */
fun estadoDeCancionEnCola(carga: CargaCola, youtubeVideoId: String): EstadoCancionEnCola = when (carga) {
    CargaCola.Cargando, is CargaCola.Error -> EstadoCancionEnCola.Desconocido
    CargaCola.Vacia -> EstadoCancionEnCola.Disponible
    is CargaCola.Exito -> {
        val sonando = carga.estado.reproduccionActual?.takeIf { it.cancion.youtubeVideoId == youtubeVideoId }
        val pendiente = carga.estado.cola.firstOrNull {
            it.estado == EstadoSolicitud.PENDIENTE && it.cancion.youtubeVideoId == youtubeVideoId
        }
        when {
            sonando != null -> EstadoCancionEnCola.Sonando(sonando)
            pendiente != null && pendiente.esMia -> EstadoCancionEnCola.SolicitadaPorTi(pendiente)
            pendiente != null -> EstadoCancionEnCola.Pendiente(pendiente)
            else -> EstadoCancionEnCola.Disponible
        }
    }
}
