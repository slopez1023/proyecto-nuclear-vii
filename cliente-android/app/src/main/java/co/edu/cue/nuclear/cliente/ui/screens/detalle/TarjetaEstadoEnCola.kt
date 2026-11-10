package co.edu.cue.nuclear.cliente.ui.screens.detalle

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.data.cola.TipoVoto
import co.edu.cue.nuclear.cliente.ui.components.ContadorVotos
import co.edu.cue.nuclear.cliente.ui.components.Insignia
import co.edu.cue.nuclear.cliente.ui.components.TiempoEstimado
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.components.aEstadoTiempo
import co.edu.cue.nuclear.cliente.ui.screens.confirmacion.textoPosicion
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing

/** Textos de la tarjeta según el estado. Solo presentan lo que informó el repositorio; no afirman reglas del servidor. */
internal data class TextosEstadoCancion(
    val insignia: String,
    val tono: TonoVisual,
    val titulo: String,
    val detalle: String?,
)

/** `null` cuando no hay nada que decir (canción disponible o estado aún desconocido). */
internal fun EstadoCancionEnCola.textos(): TextosEstadoCancion? = when (this) {
    EstadoCancionEnCola.Desconocido, EstadoCancionEnCola.Disponible -> null
    is EstadoCancionEnCola.Sonando -> TextosEstadoCancion(
        insignia = "Ahora suena",
        tono = TonoVisual.Acento,
        titulo = "Esta canción suena ahora.",
        detalle = "No hace falta solicitarla.",
    )
    is EstadoCancionEnCola.SolicitadaPorTi -> TextosEstadoCancion(
        insignia = "Solicitada por ti",
        tono = TonoVisual.Exito,
        titulo = "Tu solicitud ya está en la cola.",
        // Solo se afirma el voto automático si el repositorio lo informó así.
        detalle = if (solicitud.miVoto == TipoVoto.AUTOMATICO) "Incluye tu voto automático." else null,
    )
    is EstadoCancionEnCola.Pendiente -> TextosEstadoCancion(
        insignia = "En la cola",
        tono = TonoVisual.Acento,
        titulo = "Esta canción ya está en la cola.",
        detalle = if (solicitud.miVoto == TipoVoto.MANUAL) "Ya votaste por ella." else "Para apoyarla con un voto, ve a la cola.",
    )
}

/**
 * Estado de la canción respecto a la cola (en la cola, solicitada por ti o sonando), con su posición, votos y
 * espera cuando el repositorio los informa. No se muestra si la canción está disponible o el estado se desconoce.
 */
@Composable
fun TarjetaEstadoEnCola(estado: EstadoCancionEnCola, modifier: Modifier = Modifier) {
    val textos = estado.textos() ?: return
    val sonando = estado is EstadoCancionEnCola.Sonando
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(if (sonando) NuclearColors.AccentSoft else NuclearColors.Surface, MaterialTheme.shapes.medium)
            .border(1.dp, if (sonando) NuclearColors.Accent.copy(alpha = 0.5f) else NuclearColors.Line, MaterialTheme.shapes.medium)
            .padding(NuclearSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
    ) {
        Insignia(textos.insignia, tono = textos.tono, conPunto = sonando || estado is EstadoCancionEnCola.SolicitadaPorTi)
        Column(verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Xs)) {
            Text(textos.titulo, style = MaterialTheme.typography.titleMedium, color = NuclearColors.Text)
            textos.detalle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Text2) }
        }
        when (estado) {
            is EstadoCancionEnCola.Sonando ->
                TiempoEstimado(estado.reproduccion.segundosRestantesEstimados.aEstadoTiempo(), Modifier.fillMaxWidth(), etiqueta = "Termina en")
            is EstadoCancionEnCola.SolicitadaPorTi -> DatosDeSolicitud(estado.solicitud)
            is EstadoCancionEnCola.Pendiente -> DatosDeSolicitud(estado.solicitud)
            else -> Unit
        }
    }
}

@Composable
private fun DatosDeSolicitud(solicitud: co.edu.cue.nuclear.cliente.data.cola.SolicitudCola) {
    Column(verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Lg),
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Posición actual", style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Muted)
                Text(textoPosicion(solicitud), style = MaterialTheme.typography.titleLarge, color = NuclearColors.Text)
            }
            ContadorVotos(solicitud.totalVotos)
        }
        TiempoEstimado(solicitud.esperaEstimadaSegundos.aEstadoTiempo(), Modifier.fillMaxWidth())
    }
}
