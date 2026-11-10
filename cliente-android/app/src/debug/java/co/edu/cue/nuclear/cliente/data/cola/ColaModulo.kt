package co.edu.cue.nuclear.cliente.data.cola

import android.content.Context
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import retrofit2.Retrofit
import co.edu.cue.nuclear.cliente.data.cola.simulado.ColaRepositoryDepurable

/**
 * Variante DEBUG: la cola usa datos SIMULADOS (nunca el backend). Se puede cambiar de escenario en
 * caliente desde el computador con ADB; ver [ColaRepositoryDepurable]. Hoy ignora el cliente de red y la
 * sesión; cuando exista el repositorio real, aquí se elegirá entre el real y el simulado (p. ej. con una propiedad
 * de Gradle) sin tocar `AppContainer`.
 */
@Suppress("UNUSED_PARAMETER")
fun crearColaRepository(contexto: Context, retrofit: Retrofit, sesionActiva: SesionActivaStore): ColaRepository? =
    ColaRepositoryDepurable(contexto.applicationContext)
