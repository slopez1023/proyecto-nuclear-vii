package co.edu.cue.nuclear.cliente

import android.app.Application
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaApi
import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaRepository
import co.edu.cue.nuclear.cliente.data.cola.ColaEnVivo
import co.edu.cue.nuclear.cliente.data.cola.ColaRepository
import co.edu.cue.nuclear.cliente.data.cola.ResultadoCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.data.cola.crearColaEnVivo
import co.edu.cue.nuclear.cliente.data.cola.crearColaRepository
import co.edu.cue.nuclear.cliente.data.crearRetrofit
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.eventos.EventosApi
import co.edu.cue.nuclear.cliente.data.eventos.EventosRepository
import co.edu.cue.nuclear.cliente.data.eventos.RegistradorEventos
import co.edu.cue.nuclear.cliente.data.sesion.RestauradorSesion
import co.edu.cue.nuclear.cliente.data.sesion.SesionApi
import co.edu.cue.nuclear.cliente.data.sesion.SesionLocal
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import co.edu.cue.nuclear.cliente.data.sesion.SesionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

private val Context.dispositivoDataStore: DataStore<Preferences> by preferencesDataStore(name = "dispositivo")

/** Contenedor de dependencias manual (sin framework de DI: el alcance no lo justifica). */
class AppContainer(contexto: Context) {
    val dispositivos = DispositivoRepository(contexto.dispositivoDataStore)
    val sesionActiva = SesionActivaStore()

    // El cliente de red toma el UUID de `sesionActiva` para la cabecera X-Dispositivo-Id de las llamadas del E4.
    private val retrofit = crearRetrofit(BuildConfig.BACKEND_URL, sesionActiva)

    val sesiones = SesionRepository(retrofit.create(SesionApi::class.java))
    val busqueda = BusquedaRepository(retrofit.create(BusquedaApi::class.java))

    /**
     * Cola de reproducción (E4). Release usa siempre `ColaRepositoryReal`. Debug usa los datos simulados
     * salvo que se compile con `-Pnuclear.colaReal=true` (ver `src/debug/.../ColaModulo.kt`).
     * `crearColaRepository` vive en `src/debug` y en `src/release`. Ver docs/entregable-4/mapa-integracion-android.md.
     */
    val cola: ColaRepository? = crearColaRepository(contexto, retrofit, sesionActiva)

    /** Tiempo real de la cola (SSE), con su propio cliente HTTP. `null` con datos simulados. */
    val colaEnVivo: ColaEnVivo? = crearColaEnVivo(BuildConfig.BACKEND_URL, sesionActiva)

    /** Contexto mínimo de la sesión en DataStore (mismo archivo que el UUID). */
    val sesionLocal = SesionLocal(contexto.dispositivoDataStore)

    /** Recupera la sesión tras recrearse el proceso, confirmándola con el servidor antes de darla por vigente. */
    val restauradorSesion = RestauradorSesion(sesionLocal, dispositivos, sesionActiva) {
        when (val r = cola?.obtenerCola()) {
            is ResultadoCola.Exito -> RestauradorSesion.Validacion.VIGENTE
            is ResultadoCola.Error ->
                if (r.tipo == TipoErrorCola.SESION_NO_DISPONIBLE) RestauradorSesion.Validacion.NO_DISPONIBLE
                else RestauradorSesion.Validacion.SIN_CONFIRMAR
            null -> RestauradorSesion.Validacion.SIN_CONFIRMAR
        }
    }

    // Los eventos viven en su propio alcance: no deben cancelarse al cambiar de pantalla.
    private val alcanceEventos = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val eventos: RegistradorEventos = EventosRepository(retrofit.create(EventosApi::class.java), alcanceEventos)
}

class NuclearApp : Application() {
    val contenedor: AppContainer by lazy { AppContainer(this) }
}
