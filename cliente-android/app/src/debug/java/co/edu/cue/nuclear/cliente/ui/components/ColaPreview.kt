package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ReproduccionActual
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.data.cola.simulado.DatosSimulados
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas de los componentes de la cola (E4). Usan DatosSimulados, que solo existe en debug:
// por eso viven en src/debug. Ninguno de estos datos viene del backend.

private val cola = DatosSimulados.colaConVarias().cola

@Composable
private fun Pantalla(contenido: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) = NuclearTheme {
    NuclearScreen(scrollable = true, verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md), content = contenido)
}

@Preview(name = "Elementos: posiciones, votos y estados", widthDp = 360, heightDp = 1100)
@Composable
private fun ElementosPreview() = Pantalla {
    // 1: solicitud propia (voto automático) · 2: voto manual ya hecho · 3 y 4: se puede votar (4 sin espera)
    cola.forEachIndexed { i, s ->
        ElementoCola(s, votando = false, onVotar = {}, proporcionPopularidad = s.totalVotos / 3f)
    }
    // Votando: el botón no admite otra pulsación
    ElementoCola(cola[2], votando = true, onVotar = {}, proporcionPopularidad = 1 / 3f)
    // Ya no es votable
    ElementoCola(cola[2].copy(estado = EstadoSolicitud.REPRODUCIDA, posicion = null), votando = false, onVotar = {})
}

@Preview(name = "Elemento con título largo", widthDp = 320, heightDp = 300)
@Composable
private fun ElementoLargoPreview() = Pantalla {
    ElementoCola(
        cola[2].copy(
            cancion = cola[2].cancion.copy(
                titulo = "Un título de canción extremadamente largo que necesita ocupar dos líneas y recortarse al final",
                artistaCanal = "Un nombre de canal también muy largo para comprobar el recorte",
            ),
        ),
        votando = false,
        onVotar = {},
    )
}

@Preview(name = "Letra grande (1.8x)", widthDp = 360, heightDp = 560, fontScale = 1.8f)
@Composable
private fun LetraGrandePreview() = Pantalla {
    ElementoCola(cola[2], votando = false, onVotar = {})
    TarjetaAhoraSuena(DatosSimulados.reproduccionActual)
}

@Preview(name = "Botón de voto: todos los estados", widthDp = 360, heightDp = 360)
@Composable
private fun BotonesPreview() = Pantalla {
    EstadoBotonVoto.entries.forEach { BotonVoto(it, onClick = {}, nombreCancion = "Canción de ejemplo") }
}

@Preview(name = "Contador de votos", widthDp = 360, heightDp = 260)
@Composable
private fun ContadoresPreview() = Pantalla {
    Row(horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Xl)) {
        ContadorVotos(0)
        ContadorVotos(1, proporcion = 0.33f)
        ContadorVotos(12, proporcion = 1f)
    }
}

@Preview(name = "Tiempo estimado: 4 estados", widthDp = 360, heightDp = 300)
@Composable
private fun TiempoPreview() = Pantalla {
    TiempoEstimado(EstadoTiempo.Disponible(489))
    TiempoEstimado(EstadoTiempo.Disponible(20))
    TiempoEstimado(EstadoTiempo.Disponible(3900))
    TiempoEstimado(EstadoTiempo.Cargando)
    TiempoEstimado(EstadoTiempo.NoDisponible)
}

@Preview(name = "Ahora suena", widthDp = 360, heightDp = 420)
@Composable
private fun AhoraSuenaPreview() = Pantalla {
    TarjetaAhoraSuena(DatosSimulados.reproduccionActual)
    TarjetaAhoraSuena(ReproduccionActual("SIM-SOL-0000", DatosSimulados.sweetChild, segundosRestantesEstimados = null))
}

@Preview(name = "Avisos de operación", widthDp = 360, heightDp = 1250)
@Composable
private fun MensajesPreview() = Pantalla {
    val nueva = DatosSimulados.colaConVarias().cola[0]
    MensajeOperacion(ResultadoSolicitud.Aceptada(nueva, sumoVotoAExistente = false).aMensaje())
    MensajeOperacion(ResultadoSolicitud.Aceptada(nueva, sumoVotoAExistente = true).aMensaje(), onCerrar = {})
    MensajeOperacion(ResultadoVoto.Registrado(nueva).aMensaje())
    MensajeOperacion(ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 2).aMensaje())
    MensajeOperacion(ResultadoVoto.Rechazado(MotivoRechazoOperacion.VOTO_DUPLICADO).aMensaje())
    MensajeOperacion(ResultadoVoto.Rechazado(MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE).aMensaje())
    MensajeOperacion(ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.CANCION_NO_DISPONIBLE).aMensaje())
    MensajeOperacion(TipoErrorCola.CONEXION.aMensaje())
    MensajeOperacion(TipoErrorCola.SERVIDOR.aMensaje())
    MensajeOperacion(TipoErrorCola.SESION_NO_DISPONIBLE.aMensaje())
    MensajeOperacion(TipoErrorCola.SERVICIO_NO_DISPONIBLE.aMensaje())
    MensajeOperacion(TipoErrorCola.SIN_CONFIRMAR.aMensaje())
    MensajeOperacion(MensajesOperacion.EnviandoSolicitud)
    MensajeOperacion(MensajesOperacion.InformacionNoDisponible)
}

@Preview(name = "Cola completa", widthDp = 360, heightDp = 1200)
@Composable
private fun ColaCompletaPreview() = Pantalla {
    TarjetaAhoraSuena(DatosSimulados.reproduccionActual)
    val maximo = cola.maxOf { it.totalVotos }.toFloat()
    cola.forEach { ElementoCola(it, votando = false, onVotar = {}, proporcionPopularidad = it.totalVotos / maximo) }
}

@Preview(name = "Cola en tableta horizontal", widthDp = 1280, heightDp = 800)
@Composable
private fun ColaTabletaPreview() = Pantalla {
    TarjetaAhoraSuena(DatosSimulados.reproduccionActual)
    cola.forEach { ElementoCola(it, votando = false, onVotar = {}) }
}
