package co.edu.cue.nuclear.cliente.data.busqueda

data class Cancion(
    val youtubeVideoId: String,
    val titulo: String,
    val artistaCanal: String,
    val duracionSegundos: Int?,
    val urlMiniatura: String?,
    val disponible: Boolean,
) {
    val duracionTexto: String get() = formatearDuracion(duracionSegundos)
}

/** "m:ss" o "h:mm:ss"; "--:--" cuando YouTube no entregó la duración (información incompleta). */
fun formatearDuracion(segundos: Int?): String {
    if (segundos == null || segundos < 0) return "--:--"
    val horas = segundos / 3600
    val minutos = (segundos % 3600) / 60
    val seg = segundos % 60
    return if (horas > 0) "%d:%02d:%02d".format(horas, minutos, seg) else "%d:%02d".format(minutos, seg)
}

internal fun CancionDto.aDominio() = Cancion(
    youtubeVideoId = youtubeVideoId,
    titulo = titulo,
    artistaCanal = artistaCanal,
    duracionSegundos = duracionSegundos,
    urlMiniatura = urlMiniatura,
    disponible = disponibilidad == CancionDto.DISPONIBLE,
)

/** Por qué falló una búsqueda; el texto para el cliente se decide en la UI. */
enum class TipoErrorBusqueda {
    /** Sin red, timeout o servidor inalcanzable. */
    CONEXION,

    /** Cuota diaria de YouTube agotada (`cuota_excedida`). */
    CUOTA,

    /** Configuración del backend: clave ausente, inválida o sin permiso. No es culpa del cliente ni se arregla reintentando. */
    SERVICIO_NO_DISPONIBLE,

    /** YouTube o el backend respondieron mal; puede ser transitorio. */
    SERVIDOR,

    /** La consulta no cumple las reglas del backend (2 a 100 caracteres). */
    CONSULTA_INVALIDA,
}

sealed interface ResultadoBusqueda {
    data class Exito(val canciones: List<Cancion>) : ResultadoBusqueda
    data class Error(val tipo: TipoErrorBusqueda) : ResultadoBusqueda
}

sealed interface ResultadoSugerencias {
    data class Exito(val sugerencias: List<String>) : ResultadoSugerencias
    data class Error(val tipo: TipoErrorBusqueda) : ResultadoSugerencias
}
