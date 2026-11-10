package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing

/** Número de posición en un círculo. Una lista sin posición (`null`) muestra un guion. */
@Composable
private fun PosicionCola(posicion: Int?, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(32.dp)
            .background(NuclearColors.Surface3, CircleShape)
            .border(1.dp, NuclearColors.Line, CircleShape)
            .semantics { contentDescription = if (posicion != null) "Posición $posicion" else "Sin posición" },
        contentAlignment = Alignment.Center,
    ) {
        Text(posicion?.toString() ?: "–", style = MaterialTheme.typography.labelLarge, color = NuclearColors.Text)
    }
}

/**
 * Una solicitud pendiente de la cola: posición, canción, votos, espera estimada y botón de voto.
 * Todos los números (posición, votos, espera) vienen en [solicitud]; este componente no calcula nada.
 *
 * @param votando hay un voto de ESTA solicitud en curso (lo informa el ViewModel).
 * @param onVotar se invoca solo cuando el botón está disponible.
 * @param proporcionPopularidad 0 a 1, votos frente a la más votada de la lista; `null` oculta la barra.
 * @param resaltada se destaca con el color de acento: es la solicitud que la persona acaba de confirmar.
 * @param puedeVotarAhora `mi_votacion.puede_votar`: ayuda visual; si es `false` el botón muestra "Aún no".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ElementoCola(
    solicitud: SolicitudCola,
    votando: Boolean,
    onVotar: () -> Unit,
    modifier: Modifier = Modifier,
    proporcionPopularidad: Float? = null,
    resaltada: Boolean = false,
    puedeVotarAhora: Boolean = true,
) {
    val cancion = solicitud.cancion
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(if (resaltada) NuclearColors.AccentSoft else NuclearColors.Surface, MaterialTheme.shapes.medium)
            .border(
                if (resaltada) 2.dp else 1.dp,
                if (resaltada) NuclearColors.Accent else NuclearColors.Line,
                MaterialTheme.shapes.medium,
            )
            .semantics {
                isTraversalGroup = true
                if (resaltada) stateDescription = "Tu última solicitud"
            }
            .padding(NuclearSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PosicionCola(solicitud.posicion)
            MiniaturaCancion(cancion.urlMiniatura, Modifier.width(72.dp).height(40.dp))
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
        // Con letra grande el botón no cabe junto al contador: baja a la línea siguiente en lugar de comprimirlo.
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            ContadorVotos(solicitud.totalVotos, proporcion = proporcionPopularidad)
            BotonVoto(
                estado = solicitud.estadoBotonVoto(votando, puedeVotarAhora),
                onClick = onVotar,
                nombreCancion = cancion.titulo,
            )
        }
        // En su propia línea: junto al botón de voto no cabe en una pantalla de 360 dp (se partía letra por letra).
        TiempoEstimado(solicitud.esperaEstimadaSegundos.aEstadoTiempo(), Modifier.fillMaxWidth())
    }
}
