package co.edu.cue.nuclear.cliente.data.cola

import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl

/**
 * Servidor SSE mínimo para pruebas: envía el primer mensaje y DEJA LA CONEXIÓN ABIERTA (como un flujo real entre
 * mensajes), cosa que MockWebServer no permite. Cuando el cliente cierra el socket lo registra.
 *
 * @param mensajesPorConexion lo que se envía en la conexión 1, 2, 3… (la última lista se repite).
 */
class ServidorSseManual(private val mensajesPorConexion: List<String>) : AutoCloseable {
    private val servidor = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
    val conexiones = AtomicInteger()
    private val cierres = CopyOnLatch()

    val url: HttpUrl = "http://127.0.0.1:${servidor.localPort}/".toHttpUrl()

    /** Cabeceras de la última petición recibida. */
    @Volatile
    var ultimaPeticion: String = ""
        private set

    private class CopyOnLatch {
        val cierre = CountDownLatch(1)
    }

    init {
        thread(isDaemon = true) {
            while (!servidor.isClosed) {
                val socket = try {
                    servidor.accept()
                } catch (_: Exception) {
                    return@thread
                }
                val indice = conexiones.getAndIncrement()
                thread(isDaemon = true) { atender(socket, mensajesPorConexion[minOf(indice, mensajesPorConexion.size - 1)]) }
            }
        }
    }

    private fun atender(socket: Socket, mensaje: String) {
        socket.use {
            val entrada = it.getInputStream()
            val peticion = StringBuilder()
            while (!peticion.endsWith("\r\n\r\n")) {
                val b = entrada.read()
                if (b < 0) return
                peticion.append(b.toChar())
            }
            ultimaPeticion = peticion.toString()
            val salida = it.getOutputStream()
            // Sin Content-Length ni chunked: el cuerpo termina al cerrar la conexión, como en un SSE.
            salida.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n\r\n$mensaje".toByteArray())
            salida.flush()
            try {
                while (entrada.read() >= 0) { /* espera a que el cliente cierre */ }
            } catch (_: Exception) {
            }
            cierres.cierre.countDown()
        }
    }

    /** Espera (tiempo real) a que el cliente cierre la conexión. */
    fun esperarCierreDelCliente(segundos: Long = 5): Boolean = cierres.cierre.await(segundos, TimeUnit.SECONDS)

    override fun close() {
        runCatching { servidor.close() }
    }
}
