package co.edu.cue.nuclear.cliente.ui.navigation

/**
 * Rutas de navegacion del cliente (pantallas del Entregable 3 segun Figma:
 * acceso, qr-invalido, inicio, buscar, detalle).
 */
object Destinos {
    const val ARG_VIDEO_ID = "videoId"

    const val ACCESO = "acceso"
    const val QR_INVALIDO = "qr-invalido"
    const val INICIO = "inicio"
    const val BUSCAR = "buscar"
    const val DETALLE = "detalle/{$ARG_VIDEO_ID}"

    fun detalle(youtubeVideoId: String): String = "detalle/$youtubeVideoId"
}
