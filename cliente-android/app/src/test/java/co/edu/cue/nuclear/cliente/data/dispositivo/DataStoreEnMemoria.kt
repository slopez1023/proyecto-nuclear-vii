package co.edu.cue.nuclear.cliente.data.dispositivo

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * DataStore de pruebas que vive en memoria. Los DataStore reales con archivo no se usan en pruebas que
 * escriben varias veces: en Windows el `rename` de DataStore falla si el archivo ya existe (en Android
 * y Linux no). La persistencia real en archivo se prueba en DispositivoRepositoryTest.
 */
class DataStoreEnMemoria : DataStore<Preferences> {
    private val estado = MutableStateFlow(emptyPreferences())

    override val data: Flow<Preferences> = estado

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences {
        val nuevo = transform(estado.value)
        estado.value = nuevo
        return nuevo
    }
}
