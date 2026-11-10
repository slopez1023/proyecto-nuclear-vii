package co.edu.cue.nuclear.cliente.data.cola

/** Un mensaje SSE completo (terminado por una línea en blanco). */
data class MensajeSse(val tipo: String, val datos: String, val id: String?)

/**
 * Lector de líneas del formato `text/event-stream` (sin red, para poder probarlo).
 * - `: ping` (comentario) se ignora: nunca produce un mensaje.
 * - `retry: n` fija [reintentoMs]; no produce mensaje.
 * - Varias líneas `data:` se unen con `\n`.
 * - Un mensaje sin `data` no se entrega.
 */
class LectorSse {
    /** Último `retry:` recibido (milisegundos), o `null` si el servidor no lo envió. */
    var reintentoMs: Long? = null
        private set

    private var tipo: String? = null
    private var id: String? = null
    private val datos = StringBuilder()
    private var hayDatos = false

    /** Procesa una línea (sin el salto de línea). Devuelve el mensaje cuando la línea en blanco lo completa. */
    fun linea(linea: String): MensajeSse? {
        if (linea.isEmpty()) {
            val mensaje = if (hayDatos) MensajeSse(tipo ?: "message", datos.toString(), id) else null
            tipo = null
            datos.setLength(0)
            hayDatos = false
            return mensaje
        }
        if (linea.startsWith(":")) return null // comentario, p. ej. ": ping"
        val separador = linea.indexOf(':')
        val campo = if (separador < 0) linea else linea.substring(0, separador)
        val valor = if (separador < 0) "" else linea.substring(separador + 1).removePrefix(" ")
        when (campo) {
            "event" -> tipo = valor
            "data" -> {
                if (hayDatos) datos.append('\n')
                datos.append(valor)
                hayDatos = true
            }
            "id" -> id = valor
            "retry" -> valor.toLongOrNull()?.takeIf { it >= 0 }?.let { reintentoMs = it }
        }
        return null
    }
}
