package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.data.cola.ReproduccionActual
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing

/**
 * La canción que suena ahora. Se ve distinta de cualquier elemento de la cola (borde de acento e
 * insignia "Ahora suena") y no tiene botón de voto: no es votable.
 *
 * Android no reproduce ni controla nada; solo muestra lo que informa el repositorio. El tiempo
 * restante es el que entrega el backend (puede faltar).
 */
@Composable
fun TarjetaAhoraSuena(reproduccion: ReproduccionActual, modifier: Modifier = Modifier) {
    val cancion = reproduccion.cancion
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(NuclearColors.AccentSoft, MaterialTheme.shapes.medium)
            .border(1.dp, NuclearColors.Accent.copy(alpha = 0.5f), MaterialTheme.shapes.medium)
            .semantics { isTraversalGroup = true }
            .padding(NuclearSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
    ) {
        Insignia("Ahora suena", tono = TonoVisual.Acento, conPunto = true)
        Row(
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
                    color = NuclearColors.Text2,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        TiempoEstimado(reproduccion.segundosRestantesEstimados.aEstadoTiempo(), etiqueta = "Termina en")
    }
}
