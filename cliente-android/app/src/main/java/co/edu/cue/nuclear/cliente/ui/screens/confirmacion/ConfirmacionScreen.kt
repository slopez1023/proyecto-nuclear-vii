package co.edu.cue.nuclear.cliente.ui.screens.confirmacion

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.BotonSecundario
import co.edu.cue.nuclear.cliente.ui.components.ContadorVotos
import co.edu.cue.nuclear.cliente.ui.components.Insignia
import co.edu.cue.nuclear.cliente.ui.components.MiniaturaCancion
import co.edu.cue.nuclear.cliente.ui.components.NuclearIcon
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.components.SimboloIcono
import co.edu.cue.nuclear.cliente.ui.components.TiempoEstimado
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.components.aEstadoTiempo
import co.edu.cue.nuclear.cliente.ui.components.estilo
import co.edu.cue.nuclear.cliente.ui.screens.cola.ConfirmacionSolicitud
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla

/** Textos de la confirmación según el caso. Sin lógica de servidor: solo presentan lo que informó el repositorio. */
internal data class TextosConfirmacion(
    val insignia: String,
    val titulo: String,
    val detalle: String,
    /** Deja claro que el voto va incluido y que no es uno adicional. */
    val voto: String,
)

internal fun ConfirmacionSolicitud.textos(): TextosConfirmacion =
    if (sumoVotoAExistente) {
        TextosConfirmacion(
            insignia = "Voto sumado",
            titulo = "Tu voto se sumó a esta canción.",
            detalle = "La canción ya estaba en la cola o sonando, así que no se repitió. " +
                "La posición puede cambiar según los votos de la sesión.",
            voto = "Se sumó tu voto; la canción no se duplicó.",
        )
    } else {
        TextosConfirmacion(
            insignia = "Solicitud registrada",
            titulo = "Tu canción está en la cola.",
            detalle = "La posición puede cambiar según los votos de la sesión.",
            voto = "Incluye tu voto automático.",
        )
    }

/** "#3", "Ahora suena" o "No disponible" cuando el servidor no informa posición. */
internal fun textoPosicion(solicitud: SolicitudCola): String = when {
    solicitud.estado == EstadoSolicitud.EN_REPRODUCCION -> "Ahora suena"
    solicitud.posicion != null -> "#${solicitud.posicion}"
    else -> "No disponible"
}

/**
 * Confirmación de una solicitud aceptada (`confirmacion` del prototipo de Figma). Muestra la canción,
 * la posición y la espera que informó el servidor (cuando existen), los votos y que el voto va incluido.
 * Los números no se calculan aquí.
 *
 * @param onVerCola abre la cola.
 * @param onSeguirExplorando vuelve a los resultados de búsqueda.
 */
@Composable
fun ConfirmacionScreen(
    confirmacion: ConfirmacionSolicitud,
    onVerCola: () -> Unit,
    onSeguirExplorando: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val textos = confirmacion.textos()
    val solicitud = confirmacion.solicitud
    val estiloExito = TonoVisual.Exito.estilo()
    // Con letra muy grande los botones fijos taparían la posición y la espera: pasan al final del contenido
    // desplazable (mismo criterio que `CancionItem` con la duración).
    val botonesEnLinea = LocalDensity.current.fontScale > ESCALA_BOTONES_EN_LINEA
    NuclearScreen(
        modifier = modifier,
        scrollable = true,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        footer = if (botonesEnLinea) null else ({ Botones(onVerCola, onSeguirExplorando) }),
    ) {
        // Se anuncia a los lectores de pantalla al aparecer (el `role="status"` del prototipo).
        Column(
            modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        ) {
            SimboloIcono(R.drawable.ic_check, tono = TonoVisual.Exito)
            Insignia(textos.insignia, tono = TonoVisual.Exito, conPunto = true)
            Text(
                textos.titulo,
                style = TituloPantalla,
                color = NuclearColors.Text,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                textos.detalle,
                style = MaterialTheme.typography.bodyLarge,
                color = NuclearColors.Text2,
                textAlign = TextAlign.Center,
            )
        }

        FilaCancion(solicitud)

        // El voto va incluido: se dice con claridad y no se presenta como un voto adicional.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(estiloExito.fondo, MaterialTheme.shapes.medium)
                .border(1.dp, estiloExito.borde, MaterialTheme.shapes.medium)
                .padding(NuclearSpacing.Md),
            horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NuclearIcon(R.drawable.ic_check, contentDescription = null, tamano = NuclearIconSize.Md, tint = NuclearColors.Success)
            Text(textos.voto, style = MaterialTheme.typography.titleMedium, color = NuclearColors.Text)
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(NuclearColors.Surface, MaterialTheme.shapes.medium)
                .border(1.dp, NuclearColors.Line, MaterialTheme.shapes.medium)
                .padding(NuclearSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        ) {
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

        if (botonesEnLinea) Botones(onVerCola, onSeguirExplorando)
    }
}

/** Por encima de esta escala de letra, los botones dejan de ir fijos abajo y se desplazan con el contenido. */
private const val ESCALA_BOTONES_EN_LINEA = 1.3f

@Composable
private fun ColumnScope.Botones(onVerCola: () -> Unit, onSeguirExplorando: () -> Unit) {
    BotonPrincipal("Ver cola", onVerCola)
    BotonSecundario("Seguir explorando", onSeguirExplorando)
}

/** Canción de la solicitud, sin acción (a diferencia de `CancionItem`, que se toca). */
@Composable
private fun FilaCancion(solicitud: SolicitudCola) {
    val cancion = solicitud.cancion
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(NuclearColors.Surface, MaterialTheme.shapes.medium)
            .border(1.dp, NuclearColors.Line, MaterialTheme.shapes.medium)
            .padding(NuclearSpacing.Md),
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MiniaturaCancion(cancion.urlMiniatura, Modifier.width(96.dp).height(54.dp))
        Column(Modifier.weight(1f)) {
            Text(
                cancion.titulo,
                style = MaterialTheme.typography.titleMedium,
                color = NuclearColors.Text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                cancion.artistaCanal,
                style = MaterialTheme.typography.bodyMedium,
                color = NuclearColors.Muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}
