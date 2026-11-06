package co.edu.cue.nuclear.cliente.data.dispositivo

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import java.util.UUID

/**
 * Identificación única y seudónima del dispositivo (B07).
 *
 * Decisión de diseño del E3: UUID aleatorio generado en el primer arranque y guardado en DataStore.
 * No usa IMEI, número telefónico ni ANDROID_ID, y no requiere permisos. Se pierde si el usuario
 * borra los datos de la app o la desinstala; el documento del proyecto admite que no siempre
 * se reconoce al mismo dispositivo.
 */
class DispositivoRepository(
    private val dataStore: DataStore<Preferences>,
    private val generarUuid: () -> String = { UUID.randomUUID().toString() },
) {
    /** Devuelve el UUID persistido; lo crea (de forma atómica) la primera vez. */
    suspend fun obtenerId(): String {
        val preferencias = dataStore.edit { if (it[CLAVE_ID] == null) it[CLAVE_ID] = generarUuid() }
        return checkNotNull(preferencias[CLAVE_ID])
    }

    /**
     * Registra que este dispositivo se unió a una sesión y devuelve si ya lo había hecho antes
     * (campo `recurrente` del evento `dispositivo_unido`). Es atómico: la lectura y la marca
     * ocurren en la misma transacción de DataStore.
     */
    suspend fun marcarUnion(): Boolean {
        var yaSeHabiaUnido = false
        dataStore.edit {
            yaSeHabiaUnido = it[CLAVE_YA_UNIDO] == true
            it[CLAVE_YA_UNIDO] = true
        }
        return yaSeHabiaUnido
    }

    private companion object {
        val CLAVE_ID = stringPreferencesKey("dispositivo_id")
        val CLAVE_YA_UNIDO = booleanPreferencesKey("ya_se_unio")
    }
}
