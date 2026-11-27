package co.edu.cue.nuclear.cliente.data.sesion

/**
 * Reglas de formato del código numérico de acceso de 6 dígitos.
 * Siempre se maneja como cadena para conservar ceros iniciales (p. ej. "004281").
 */
object CodigoAcceso {
    const val LONGITUD = 6
    val FORMATO = Regex("^[0-9]{6}$")

    fun esValido(codigo: String?): Boolean = codigo != null && FORMATO.matches(codigo)

    fun normalizar(entrada: String): String = entrada.filter(Char::isDigit).take(LONGITUD)
}
