package co.edu.cue.nuclear.cliente.data.cola

import android.content.Context
import co.edu.cue.nuclear.cliente.BuildConfig
import co.edu.cue.nuclear.cliente.data.cola.simulado.ColaRepositoryDepurable
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import okhttp3.HttpUrl.Companion.toHttpUrl
import retrofit2.Retrofit

/**
 * Variante DEBUG: por defecto la cola usa datos SIMULADOS (nunca el backend); se puede cambiar de escenario en
 * caliente desde el computador con ADB (ver [ColaRepositoryDepurable]). Con `-Pnuclear.colaReal=true` se usa el
 * repositorio real y el flujo SSE real contra `BACKEND_URL` (por defecto el backend local vía `adb reverse tcp:3000 tcp:3000`).
 */
fun crearColaRepository(contexto: Context, retrofit: Retrofit, sesionActiva: SesionActivaStore): ColaRepository? =
    if (BuildConfig.COLA_REAL) {
        ColaRepositoryReal(retrofit.create(ColaApi::class.java), sesionActiva)
    } else {
        ColaRepositoryDepurable(contexto.applicationContext)
    }

/** Con datos simulados no hay flujo en tiempo real (`null`): la cola se actualiza al abrir la pantalla y tras cada operación. */
fun crearColaEnVivo(baseUrl: String, sesionActiva: SesionActivaStore): ColaEnVivo? =
    if (BuildConfig.COLA_REAL) ColaEnVivoSse(ColaEnVivoSse.crearClienteSse(), baseUrl.toHttpUrl(), sesionActiva) else null
