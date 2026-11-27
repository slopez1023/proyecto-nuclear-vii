package co.edu.cue.nuclear.cliente.ui.navigation

import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo
import org.junit.Assert.assertEquals
import org.junit.Test

class DestinosTest {
    @Test
    fun detalle_construyeRutaConElIdDeVideo() {
        assertEquals("detalle/dQw4w9WgXcQ", Destinos.detalle("dQw4w9WgXcQ"))
    }

    @Test
    fun qrInvalido_construyeRutaConElCodigoDelMotivo() {
        assertEquals("qr-invalido/sesion_cerrada", Destinos.qrInvalido(MotivoRechazo.SESION_CERRADA))
        assertEquals("qr-invalido/{${Destinos.ARG_MOTIVO}}", Destinos.QR_INVALIDO)
    }

    @Test
    fun plantillaDeDetalle_usaElMismoArgumentoQueElConstructor() {
        assertEquals("detalle/{${Destinos.ARG_VIDEO_ID}}", Destinos.DETALLE)
    }

    @Test
    fun rutasDeIngreso_estanDefinidas() {
        assertEquals("acceso", Destinos.ACCESO)
        assertEquals("escaner", Destinos.ESCANER)
        assertEquals("codigo", Destinos.CODIGO)
    }
}
