package co.edu.cue.nuclear.cliente.ui.navigation

import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo

/**
 * Rutas de navegacion del cliente (pantallas del Entregable 3 segun Figma:
 * acceso, qr-invalido, inicio, buscar, detalle).
 */
object Destinos {
    const val ARG_VIDEO_ID = "videoId"
    const val ARG_MOTIVO = "motivo"

    const val ACCESO = "acceso"
    const val ESCANER = "escaner"
    const val CODIGO = "codigo"
    const val QR_INVALIDO = "qr-invalido/{$ARG_MOTIVO}"
    const val INICIO = "inicio"
    const val BUSCAR = "buscar"
    const val DETALLE = "detalle/{$ARG_VIDEO_ID}"

    /** Cola de reproducción (Entregable 4). Solo existe si hay un repositorio de cola disponible. */
    const val COLA = "cola"

    /** Confirmación de una solicitud aceptada (Entregable 4). Se abre desde el detalle de la canción. */
    const val CONFIRMACION = "confirmacion"

    fun detalle(youtubeVideoId: String): String = "detalle/$youtubeVideoId"

    fun qrInvalido(motivo: MotivoRechazo): String = "qr-invalido/${motivo.codigo}"
}
