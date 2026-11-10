package co.edu.cue.nuclear.cliente.data.sesion

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first

/**
 * Contexto MÍNIMO de la sesión guardado en el dispositivo (DataStore, el mismo archivo del UUID): solo `id_sesion` y
 * `id_establecimiento`. No guarda el token del QR (las rutas del E4 usan el `id_sesion`) ni el UUID (ya vive aparte).
 * Que algo esté guardado NO significa que la sesión siga vigente: ver [RestauradorSesion].
 */
data class SesionGuardada(val idSesion: String, val idEstablecimiento: String?)

class SesionLocal(private val dataStore: DataStore<Preferences>) {

    suspend fun guardar(idSesion: String, idEstablecimiento: String?) {
        dataStore.edit {
            it[CLAVE_SESION] = idSesion
            if (idEstablecimiento != null) it[CLAVE_ESTABLECIMIENTO] = idEstablecimiento else it.remove(CLAVE_ESTABLECIMIENTO)
        }
    }

    suspend fun leer(): SesionGuardada? {
        val preferencias = dataStore.data.first()
        val idSesion = preferencias[CLAVE_SESION]?.takeIf { it.isNotBlank() } ?: return null
        return SesionGuardada(idSesion, preferencias[CLAVE_ESTABLECIMIENTO])
    }

    suspend fun limpiar() {
        dataStore.edit {
            it.remove(CLAVE_SESION)
            it.remove(CLAVE_ESTABLECIMIENTO)
        }
    }

    private companion object {
        val CLAVE_SESION = stringPreferencesKey("sesion_id")
        val CLAVE_ESTABLECIMIENTO = stringPreferencesKey("sesion_id_establecimiento")
    }
}
