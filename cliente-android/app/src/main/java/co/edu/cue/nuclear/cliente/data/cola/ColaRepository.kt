package co.edu.cue.nuclear.cliente.data.cola

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion

/**
 * Acceso de la UI a la cola de reproducción del establecimiento.
 *
 * PROVISIONAL: todavía no existe una implementación real. La integración con el backend
 * (rutas, DTOs, envío del UUID, SSE) depende del contrato que propone Juan Camilo; hasta
 * entonces solo hay una implementación simulada, y vive únicamente en la variante debug.
 *
 * La interfaz no recibe la sesión ni el UUID a propósito: la implementación real los toma de
 * `SesionActivaStore` (idSesion, dispositivoId, idEstablecimiento), igual que ya hacen los eventos.
 *
 * Las reglas (voto automático al solicitar, intervalo de votación, duplicados, orden de la
 * cola) las aplica el servidor. Esta interfaz solo transporta sus resultados.
 */
interface ColaRepository {
    /** Estado actual de la cola y de la canción que suena. */
    suspend fun obtenerCola(): ResultadoCola

    /** Solicita [cancion]; el voto automático se registra en la misma operación. */
    suspend fun solicitar(cancion: Cancion): ResultadoSolicitud

    /** Voto manual sobre una solicitud ajena que sigue pendiente. */
    suspend fun votar(idSolicitud: String): ResultadoVoto
}
