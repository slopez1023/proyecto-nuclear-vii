package co.edu.cue.nuclear.cliente.data.cola

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Lee `backend/test/fixtures/contrato-e4.json`: los 20 casos con petición y respuesta EXACTAS que produce el backend
 * real (los verifica `backend/test/e4-contrato.test.js`). Si el backend cambia el contrato, regenera el archivo y
 * estas pruebas fallan, que es justo lo que se busca.
 */
object ContratoE4 {
    val json = Json { ignoreUnknownKeys = true }

    private val casos: JsonObject by lazy {
        val archivo = File("../../backend/test/fixtures/contrato-e4.json")
        check(archivo.exists()) { "No se encontró el fixture del backend: ${archivo.absolutePath}" }
        json.parseToJsonElement(archivo.readText(Charsets.UTF_8)).jsonObject["casos"]!!.jsonObject
    }

    val nombres: Set<String> get() = casos.keys

    private fun caso(nombre: String) = casos[nombre]?.jsonObject ?: error("El fixture no tiene el caso «$nombre»")

    fun status(nombre: String): Int = caso(nombre)["respuesta"]!!.jsonObject["status"]!!.jsonPrimitive.content.toInt()

    /** Cuerpo JSON de la respuesta, tal cual lo envía el backend. */
    fun cuerpo(nombre: String): String = caso(nombre)["respuesta"]!!.jsonObject["cuerpo"]!!.toString()

    fun cabecerasPeticion(nombre: String): Map<String, String> =
        caso(nombre)["peticion"]!!.jsonObject["cabeceras"]?.jsonObject?.mapValues { it.value.jsonPrimitive.content } ?: emptyMap()

    fun rutaPeticion(nombre: String): String = caso(nombre)["peticion"]!!.jsonObject["ruta"]!!.jsonPrimitive.content

    /** Líneas del flujo SSE del caso `flujo_primer_mensaje`. */
    fun lineasFlujo(nombre: String): List<String> =
        caso(nombre)["respuesta"]!!.jsonObject["lineas"]!!.jsonArray.map { it.jsonPrimitive.content }
}
