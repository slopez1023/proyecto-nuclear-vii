package co.edu.cue.nuclear.cliente.data.sesion

/**
 * Extrae y valida un token de PONGA PUES a partir del contenido leído por el escáner QR.
 * Reutiliza íntegramente [TokenQr.desdeUrl] y [TokenQr.esValido].
 */
object LecturaQr {
    fun tokenDesdeLectura(raw: String?): String? =
        TokenQr.desdeUrl(raw?.trim())?.takeIf(TokenQr::esValido)
}
