package co.edu.cue.nuclear.cliente.data

import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Añade la cabecera `X-Dispositivo-Id` (UUID del dispositivo) a las llamadas del E4:
 * `/api/sesiones/{idSesion}/cola`, `/cola/flujo` y `/solicitudes…`. No se añade a `GET /api/sesiones/{token}`
 * (acceso del E3), a la búsqueda ni a `/api/eventos`, que no la usan.
 *
 * El UUID se toma de [SesionActivaStore] (síncrono, apto para un interceptor); sin sesión activa no se añade nada
 * y el servidor responderá `dispositivo_id_invalido` en las operaciones que la exigen.
 */
class InterceptorDispositivo(private val sesionActiva: SesionActivaStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val peticion = chain.request()
        val uuid = sesionActiva.actual?.dispositivoId
        if (uuid == null || !RUTA_E4.matches(peticion.url.encodedPath)) return chain.proceed(peticion)
        return chain.proceed(peticion.newBuilder().header(CABECERA, uuid).build())
    }

    companion object {
        const val CABECERA = "X-Dispositivo-Id"
        private val RUTA_E4 = Regex("^/api/sesiones/[^/]+/(cola(/flujo)?|solicitudes(/.*)?)$")
    }
}
