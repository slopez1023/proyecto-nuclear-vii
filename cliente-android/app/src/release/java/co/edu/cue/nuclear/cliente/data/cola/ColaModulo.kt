package co.edu.cue.nuclear.cliente.data.cola

import android.content.Context
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import okhttp3.HttpUrl.Companion.toHttpUrl
import retrofit2.Retrofit

/**
 * Variante RELEASE: usa exclusivamente el repositorio real y el flujo SSE real. Los datos simulados no existen en esta variante.
 */
@Suppress("UNUSED_PARAMETER")
fun crearColaRepository(contexto: Context, retrofit: Retrofit, sesionActiva: SesionActivaStore): ColaRepository? =
    ColaRepositoryReal(retrofit.create(ColaApi::class.java), sesionActiva)

fun crearColaEnVivo(baseUrl: String, sesionActiva: SesionActivaStore): ColaEnVivo? =
    ColaEnVivoSse(ColaEnVivoSse.crearClienteSse(), baseUrl.toHttpUrl(), sesionActiva)
