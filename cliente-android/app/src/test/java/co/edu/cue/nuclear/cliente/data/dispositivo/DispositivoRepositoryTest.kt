package co.edu.cue.nuclear.cliente.data.dispositivo

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class DispositivoRepositoryTest {
    @get:Rule
    val carpeta = TemporaryFolder()

    private fun crearDataStore(archivo: File, job: Job): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = CoroutineScope(Dispatchers.IO + job)) { archivo }

    @Test
    fun primeraVez_generaUnUuidValido() = runTest {
        val job = Job()
        val repo = DispositivoRepository(crearDataStore(File(carpeta.root, "a.preferences_pb"), job))

        val id = repo.obtenerId()

        assertEquals(id, UUID.fromString(id).toString()) // formato UUID canónico
        job.cancelAndJoin()
    }

    @Test
    fun variasLlamadas_devuelvenElMismoIdYSoloGeneranUnoNuevo() = runTest {
        val job = Job()
        var generados = 0
        val repo = DispositivoRepository(crearDataStore(File(carpeta.root, "b.preferences_pb"), job)) {
            generados++
            UUID.randomUUID().toString()
        }

        val ids = List(5) { repo.obtenerId() }

        assertEquals(1, ids.toSet().size)
        assertEquals(1, generados)
        job.cancelAndJoin()
    }

    @Test
    fun alReabrirLaApp_seConservaElMismoId() = runTest {
        val archivo = File(carpeta.root, "c.preferences_pb")

        val job1 = Job()
        val idInicial = DispositivoRepository(crearDataStore(archivo, job1)).obtenerId()
        job1.cancelAndJoin() // simula cerrar la app

        val job2 = Job()
        val idReabierto = DispositivoRepository(crearDataStore(archivo, job2)).obtenerId()
        job2.cancelAndJoin()

        assertEquals(idInicial, idReabierto)
    }

    @Test
    fun dispositivosDistintos_tienenIdsDistintos() = runTest {
        val job = Job()
        val a = DispositivoRepository(crearDataStore(File(carpeta.root, "d1.preferences_pb"), job)).obtenerId()
        val b = DispositivoRepository(crearDataStore(File(carpeta.root, "d2.preferences_pb"), job)).obtenerId()

        assertNotEquals(a, b)
        assertTrue(a.length == 36 && b.length == 36)
        job.cancelAndJoin()
    }
}
