package co.edu.cue.nuclear.cliente

import android.app.Application
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaApi
import co.edu.cue.nuclear.cliente.data.busqueda.BusquedaRepository
import co.edu.cue.nuclear.cliente.data.crearRetrofit
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.eventos.EventosApi
import co.edu.cue.nuclear.cliente.data.eventos.EventosRepository
import co.edu.cue.nuclear.cliente.data.eventos.RegistradorEventos
import co.edu.cue.nuclear.cliente.data.sesion.SesionApi
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import co.edu.cue.nuclear.cliente.data.sesion.SesionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

private val Context.dispositivoDataStore: DataStore<Preferences> by preferencesDataStore(name = "dispositivo")

/** Contenedor de dependencias manual (sin framework de DI: el alcance no lo justifica). */
class AppContainer(contexto: Context) {
    val dispositivos = DispositivoRepository(contexto.dispositivoDataStore)
    private val retrofit = crearRetrofit(BuildConfig.BACKEND_URL)

    val sesiones = SesionRepository(retrofit.create(SesionApi::class.java))
    val busqueda = BusquedaRepository(retrofit.create(BusquedaApi::class.java))
    val sesionActiva = SesionActivaStore()

    // Los eventos viven en su propio alcance: no deben cancelarse al cambiar de pantalla.
    private val alcanceEventos = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val eventos: RegistradorEventos = EventosRepository(retrofit.create(EventosApi::class.java), alcanceEventos)
}

class NuclearApp : Application() {
    val contenedor: AppContainer by lazy { AppContainer(this) }
}
