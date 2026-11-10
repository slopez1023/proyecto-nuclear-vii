package co.edu.cue.nuclear.cliente.data

import co.edu.cue.nuclear.cliente.data.sesion.SesionActiva
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class InterceptorDispositivoTest {
    private val uuid = "3f2b8c1e-9d4a-4e6b-8a1c-0b5d7e9f1a2b"
    private lateinit var servidor: MockWebServer
    private val sesionActiva = SesionActivaStore()
    private lateinit var cliente: OkHttpClient

    @Before
    fun preparar() {
        servidor = MockWebServer().apply { start() }
        cliente = OkHttpClient.Builder().addInterceptor(InterceptorDispositivo(sesionActiva)).build()
    }

    @After
    fun limpiar() {
        runCatching { servidor.shutdown() }
    }

    private fun cabeceraEnviadaA(ruta: String, metodo: String = "GET"): String? {
        servidor.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        val cuerpo = if (metodo == "POST") okhttp3.RequestBody.create(null, ByteArray(0)) else null
        cliente.newCall(Request.Builder().url(servidor.url(ruta)).method(metodo, cuerpo).build()).execute().close()
        return servidor.takeRequest().getHeader("X-Dispositivo-Id")
    }

    @Test
    fun `las llamadas del E4 llevan el UUID del dispositivo`() {
        sesionActiva.actual = SesionActiva("SES-MOCK-001", uuid)

        assertEquals(uuid, cabeceraEnviadaA("/api/sesiones/SES-MOCK-001/cola"))
        assertEquals(uuid, cabeceraEnviadaA("/api/sesiones/SES-MOCK-001/cola/flujo"))
        assertEquals(uuid, cabeceraEnviadaA("/api/sesiones/SES-MOCK-001/solicitudes", "POST"))
        assertEquals(uuid, cabeceraEnviadaA("/api/sesiones/SES-MOCK-001/solicitudes/SOL-2/votos", "POST"))
    }

    @Test
    fun `el acceso del E3, la busqueda y los eventos no llevan la cabecera`() {
        sesionActiva.actual = SesionActiva("SES-MOCK-001", uuid)

        assertNull(cabeceraEnviadaA("/api/sesiones/demo-activa-001"))
        assertNull(cabeceraEnviadaA("/api/busqueda?q=queen"))
        assertNull(cabeceraEnviadaA("/api/busqueda/sugerencias?q=qu"))
        assertNull(cabeceraEnviadaA("/api/eventos", "POST"))
    }

    @Test
    fun `sin sesion activa no se inventa un UUID`() {
        sesionActiva.actual = null

        assertNull(cabeceraEnviadaA("/api/sesiones/SES-MOCK-001/cola"))
    }

    @Test
    fun `al cambiar de sesion se usa el UUID vigente`() {
        sesionActiva.actual = SesionActiva("SES-1", "11111111-1111-4111-8111-111111111111")
        assertEquals("11111111-1111-4111-8111-111111111111", cabeceraEnviadaA("/api/sesiones/SES-1/cola"))

        sesionActiva.actual = SesionActiva("SES-2", uuid)
        assertEquals(uuid, cabeceraEnviadaA("/api/sesiones/SES-2/cola"))
    }
}
