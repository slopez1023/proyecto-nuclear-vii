package co.edu.cue.nuclear.cliente.data.cola.simulado

import android.content.Context
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.ColaRepository
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ResultadoCola
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import java.io.File

/**
 * Envoltorio SOLO DEBUG del [ColaRepositoryFalso] para probar cada estado en el celular sin recompilar.
 *
 * Antes de cada operación lee `files/cola_simulada.txt` (si existe) y aplica sus claves. Se escribe
 * desde el computador, por ejemplo:
 *
 *     adb shell "run-as co.edu.cue.nuclear.cliente sh -c 'printf \"estado=vacia\n\" > files/cola_simulada.txt'"
 *
 * Claves (una por línea, `clave=valor`; sin la clave, vale su valor por defecto):
 * - `estado`: `normal` (por defecto), `vacia`, `sonando` (suena una canción y no hay cola). Cambiar su valor reinicia la cola.
 * - `existente`: `youtube_video_id` de una canción real; la tercera solicitud simulada (de otra persona) pasa a ser esa
 *   canción, para probar "la canción ya estaba en la cola" desde la búsqueda. Cambiarlo reinicia la cola.
 * - `existenteMia`: igual, pero la canción pasa a ser la primera solicitud simulada, que es de este dispositivo.
 * - `existenteSonando`: igual, pero la canción pasa a ser la que suena ahora.
 * - `errorConsulta`: `CONEXION` o `SERVIDOR` → la consulta de la cola falla.
 * - `errorOperacion`: `CONEXION` o `SERVIDOR` → solicitar y votar fallan.
 * - `rechazoSolicitud` / `rechazoVoto`: un valor de `MotivoRechazoOperacion` → el servidor falso rechaza.
 * - `latenciaMs`: demora simulada (por defecto 700) para poder ver los estados "cargando" y "votando".
 */
class ColaRepositoryDepurable(contexto: Context) : ColaRepository {

    private val archivo = File(contexto.filesDir, "cola_simulada.txt")
    private val falso = ColaRepositoryFalso(latenciaMs = LATENCIA_POR_DEFECTO)
    private var estadoAplicado = "normal|"

    private suspend fun aplicarConfiguracion() {
        val c: Map<String, String> = if (archivo.exists()) {
            archivo.readLines()
                .mapNotNull { linea -> linea.split("=", limit = 2).takeIf { it.size == 2 } }
                .associate { it[0].trim() to it[1].trim() }
        } else {
            emptyMap()
        }
        val estado = c["estado"] ?: "normal"
        val existente = c["existente"]
        val existenteMia = c["existenteMia"]
        val existenteSonando = c["existenteSonando"]
        // Cambiar `estado` o cualquiera de las claves `existente*` reinicia la cola simulada.
        val clave = "$estado|${existente.orEmpty()}|${existenteMia.orEmpty()}|${existenteSonando.orEmpty()}"
        if (clave != estadoAplicado) {
            estadoAplicado = clave
            falso.reiniciar(estadoPorNombre(estado, existente, existenteMia, existenteSonando))
        }
        falso.latenciaMs = c["latenciaMs"]?.toLongOrNull() ?: LATENCIA_POR_DEFECTO
        falso.errorConsulta = c["errorConsulta"]?.let { runCatching { TipoErrorCola.valueOf(it) }.getOrNull() }
        falso.errorOperacion = c["errorOperacion"]?.let { runCatching { TipoErrorCola.valueOf(it) }.getOrNull() }
        falso.rechazoSolicitud = c["rechazoSolicitud"]?.let { runCatching { MotivoRechazoOperacion.valueOf(it) }.getOrNull() }
        falso.rechazoVoto = c["rechazoVoto"]?.let { runCatching { MotivoRechazoOperacion.valueOf(it) }.getOrNull() }
    }

    private fun estadoPorNombre(nombre: String, existente: String?, mia: String?, sonando: String?): EstadoCola = when (nombre) {
        "vacia" -> DatosSimulados.colaVacia()
        "sonando" -> DatosSimulados.soloReproduciendo()
        else -> DatosSimulados.colaConVarias().conCancionExistente(existente, mia, sonando)
    }

    /**
     * Para probar "la canción ya estaba en la cola" con una canción real de la búsqueda: la tercera
     * solicitud (sin voto de este dispositivo) pasa a tener ese `youtube_video_id`.
     */
    private fun EstadoCola.conCancionExistente(pendiente: String?, mia: String?, sonando: String?): EstadoCola {
        fun SolicitudCola.conId(id: String) = copy(cancion = cancion.copy(youtubeVideoId = id))
        return copy(
            reproduccionActual = if (!sonando.isNullOrBlank()) {
                reproduccionActual?.let { it.copy(cancion = it.cancion.copy(youtubeVideoId = sonando)) }
            } else {
                reproduccionActual
            },
            cola = cola.map {
                when {
                    !pendiente.isNullOrBlank() && it.idSolicitud == "SIM-SOL-0003" -> it.conId(pendiente)
                    !mia.isNullOrBlank() && it.idSolicitud == "SIM-SOL-0001" -> it.conId(mia)
                    else -> it
                }
            },
        )
    }

    override suspend fun obtenerCola(): ResultadoCola {
        aplicarConfiguracion()
        return falso.obtenerCola()
    }

    override suspend fun solicitar(cancion: Cancion): ResultadoSolicitud {
        aplicarConfiguracion()
        return falso.solicitar(cancion)
    }

    override suspend fun votar(idSolicitud: String): ResultadoVoto {
        aplicarConfiguracion()
        return falso.votar(idSolicitud)
    }

    private companion object {
        const val LATENCIA_POR_DEFECTO = 700L
    }
}
