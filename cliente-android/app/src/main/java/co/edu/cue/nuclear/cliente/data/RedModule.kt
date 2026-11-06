package co.edu.cue.nuclear.cliente.data

import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaApi
import co.edu.cue.nuclear.cliente.data.eventos.EventosApi
import co.edu.cue.nuclear.cliente.data.sesion.SesionApi
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

private val JSON = Json { ignoreUnknownKeys = true }

/** Crea el cliente Retrofit contra el backend real. `baseUrl` debe terminar en "/". */
fun crearRetrofit(baseUrl: String): Retrofit {
    val cliente = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS) // la búsqueda encadena dos llamadas a YouTube en el backend
        .build()
    return Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(cliente)
        .addConverterFactory(JSON.asConverterFactory("application/json; charset=UTF-8".toMediaType()))
        .build()
}

fun crearSesionApi(baseUrl: String): SesionApi = crearRetrofit(baseUrl).create(SesionApi::class.java)

fun crearBusquedaApi(baseUrl: String): BusquedaApi = crearRetrofit(baseUrl).create(BusquedaApi::class.java)

fun crearEventosApi(baseUrl: String): EventosApi = crearRetrofit(baseUrl).create(EventosApi::class.java)
