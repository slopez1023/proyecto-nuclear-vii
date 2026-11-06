package co.edu.cue.nuclear.cliente.ui.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

class DestinosTest {
    @Test
    fun detalle_construyeRutaConElIdDeVideo() {
        assertEquals("detalle/dQw4w9WgXcQ", Destinos.detalle("dQw4w9WgXcQ"))
    }

    @Test
    fun plantillaDeDetalle_usaElMismoArgumentoQueElConstructor() {
        assertEquals("detalle/{${Destinos.ARG_VIDEO_ID}}", Destinos.DETALLE)
    }
}
