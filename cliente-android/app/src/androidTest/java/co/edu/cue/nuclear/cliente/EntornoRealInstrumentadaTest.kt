package co.edu.cue.nuclear.cliente

import android.content.Intent
import android.net.Uri
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import co.edu.cue.nuclear.cliente.data.crearRetrofit
import co.edu.cue.nuclear.cliente.data.dispositivo.DispositivoRepository
import co.edu.cue.nuclear.cliente.data.sesion.SesionActiva
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import co.edu.cue.nuclear.cliente.data.sesion.SesionGuardada
import co.edu.cue.nuclear.cliente.data.sesion.SesionLocal
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Pruebas INSTRUMENTADAS (se ejecutan en el teléfono). Cubren lo que las pruebas JVM no pueden: DataStore real sobre
 * el sistema de archivos de Android, el contexto de la app y el arranque de la actividad con un App Link.
 *
 * No incluyen pruebas de Compose (`ui-test-junit4`): esa dependencia no se pudo descargar en el equipo de desarrollo
 * (error de certificado). Ver docs/entregable-4/matriz-aceptacion-e4.md.
 */
@RunWith(AndroidJUnit4::class)
class EntornoRealInstrumentadaTest {

    private val contexto get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Test
    fun elPaqueteYLaUrlBaseSonLosEsperados() {
        assertEquals("co.edu.cue.nuclear.cliente", contexto.packageName)
        assertTrue("BACKEND_URL debe terminar en /", BuildConfig.BACKEND_URL.endsWith("/"))
        assertNotNull(crearRetrofit(BuildConfig.BACKEND_URL, SesionActivaStore())) // se construye sin red
    }

    private fun almacen(nombre: String, job: Job) = PreferenceDataStoreFactory.create(scope = CoroutineScope(Dispatchers.IO + job)) {
        File(contexto.cacheDir, "$nombre.preferences_pb")
    }

    @Test
    fun laSesionPersistidaSobreviveAUnAlmacenNuevoYConvivePorElUuid() = runBlocking {
        val nombre = "sesion_instrumentada_${UUID.randomUUID()}"
        val job1 = Job()
        val primero = almacen(nombre, job1)
        val uuid = DispositivoRepository(primero).obtenerId()
        SesionLocal(primero).guardar("SES-MOCK-001", "EST-MOCK-001")
        job1.cancelAndJoin() // «el proceso muere»

        val job2 = Job()
        val segundo = almacen(nombre, job2) // «el proceso vuelve a nacer» con el mismo archivo
        assertEquals(SesionGuardada("SES-MOCK-001", "EST-MOCK-001"), SesionLocal(segundo).leer())
        assertEquals(uuid, DispositivoRepository(segundo).obtenerId()) // el UUID no cambia ni se mezcla con la sesión
        SesionLocal(segundo).limpiar()
        assertNull(SesionLocal(segundo).leer())
        assertEquals(uuid, DispositivoRepository(segundo).obtenerId())
        job2.cancelAndJoin()
    }

    @Test
    fun laSesionActivaEnMemoriaGuardaElUuidParaElInterceptor() {
        val store = SesionActivaStore()
        store.actual = SesionActiva("SES-1", "3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b", "EST-1")
        assertEquals("3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b", store.actual?.dispositivoId)
    }

    @Test
    fun laActividadArrancaConUnAppLinkDeQrSinCerrarse() {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://nuclear.example.com/s/demo-activa-001"))
            .setClassName(contexto.packageName, "co.edu.cue.nuclear.cliente.MainActivity")
        ActivityScenario.launch<MainActivity>(intent).use { escenario ->
            assertEquals(Lifecycle.State.RESUMED, escenario.state)
            // Pasar a segundo plano y volver no debe cerrar la actividad (el flujo en vivo se abre y se cierra con el ciclo de vida).
            escenario.moveToState(Lifecycle.State.CREATED)
            escenario.moveToState(Lifecycle.State.RESUMED)
            assertEquals(Lifecycle.State.RESUMED, escenario.state)
        }
    }
}
