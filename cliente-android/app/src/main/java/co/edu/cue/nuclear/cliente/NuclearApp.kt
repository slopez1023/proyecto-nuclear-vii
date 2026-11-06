package co.edu.cue.nuclear.cliente

import android.app.Application
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import co.edu.cue.nuclear.cliente.data.crearSesionApi
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.sesion.SesionRepository

private val Context.dispositivoDataStore: DataStore<Preferences> by preferencesDataStore(name = "dispositivo")

/** Contenedor de dependencias manual (sin framework de DI: el alcance no lo justifica). */
class AppContainer(contexto: Context) {
    val dispositivos = DispositivoRepository(contexto.dispositivoDataStore)
    val sesiones = SesionRepository(crearSesionApi(BuildConfig.BACKEND_URL))
}

class NuclearApp : Application() {
    val contenedor: AppContainer by lazy { AppContainer(this) }
}
