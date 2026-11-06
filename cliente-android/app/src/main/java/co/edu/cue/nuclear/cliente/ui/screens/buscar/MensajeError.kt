package co.edu.cue.nuclear.cliente.ui.screens.buscar

import co.edu.cue.nuclear.cliente.data.busqueda.TipoErrorBusqueda

data class MensajeError(val titulo: String, val detalle: String, val reintentable: Boolean)

/** Texto para el cliente. No culpa al usuario y solo ofrece "Reintentar" cuando reintentar puede servir. */
fun TipoErrorBusqueda.aMensaje(): MensajeError = when (this) {
    TipoErrorBusqueda.CONEXION -> MensajeError(
        "Sin conexión",
        "No pudimos conectarnos con el servidor. Revisa tu conexión e inténtalo de nuevo.",
        reintentable = true,
    )
    TipoErrorBusqueda.CUOTA -> MensajeError(
        "Búsqueda no disponible por hoy",
        "Se alcanzó el límite diario de consultas a YouTube. Inténtalo de nuevo mañana.",
        reintentable = false,
    )
    TipoErrorBusqueda.SERVICIO_NO_DISPONIBLE -> MensajeError(
        "Búsqueda no disponible",
        "El servicio de búsqueda no está disponible en este momento. Avisa al personal del establecimiento.",
        reintentable = false,
    )
    TipoErrorBusqueda.SERVIDOR -> MensajeError(
        "Algo salió mal",
        "No pudimos obtener los resultados. Inténtalo de nuevo en unos segundos.",
        reintentable = true,
    )
    TipoErrorBusqueda.CONSULTA_INVALIDA -> MensajeError(
        "Búsqueda no válida",
        "Escribe entre 2 y 100 caracteres.",
        reintentable = false,
    )
}
