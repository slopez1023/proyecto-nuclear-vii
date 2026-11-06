package co.edu.cue.nuclear.cliente.data.sesion

import java.net.URI

/**
 * Validación del token del QR (B01). Mismas reglas que el backend (backend/src/sesiones.js):
 * entre 8 y 64 caracteres A-Z a-z 0-9 _ -. El QR codifica únicamente https://HOST/s/TOKEN.
 */
object TokenQr {
    private val FORMATO = Regex("^[A-Za-z0-9_-]{8,64}$")
    private const val PREFIJO_RUTA = "/s/"

    fun esValido(token: String?): Boolean = token != null && FORMATO.matches(token)

    /**
     * Extrae el token de una URL de acceso. Devuelve null si no es HTTPS o no tiene la forma /s/TOKEN.
     * No valida el formato del token: eso lo hace [esValido], para poder informar "QR inválido".
     */
    fun desdeUrl(url: String?): String? {
        if (url == null) return null
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        if (uri.scheme != "https") return null
        val ruta = uri.rawPath ?: return null
        if (!ruta.startsWith(PREFIJO_RUTA)) return null
        val token = ruta.removePrefix(PREFIJO_RUTA).trimEnd('/')
        return token.ifEmpty { null }
    }
}
