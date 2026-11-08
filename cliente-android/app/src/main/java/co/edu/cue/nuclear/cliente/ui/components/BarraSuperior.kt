package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearLayout
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.remember

/**
 * Barra superior de las pantallas secundarias: botón "volver" (flecha) de 48 dp, el tamaño táctil
 * mínimo. La acción la decide quien la usa.
 *
 * @param descripcionVolver etiqueta accesible de la flecha (no se ve en pantalla).
 */
@Composable
fun BarraSuperior(
    descripcionVolver: String,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val forma = MaterialTheme.shapes.medium
    val fuente = remember { MutableInteractionSource() }
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(NuclearLayout.MinTouchTarget)
                .efectoPulsacion(fuente, 0.92f)
                .clip(forma)
                .background(NuclearColors.Surface2)
                .border(1.dp, NuclearColors.Line, forma)
                .clickable(interactionSource = fuente, indication = LocalIndication.current, role = Role.Button, onClick = onVolver),
            contentAlignment = Alignment.Center,
        ) {
            NuclearIcon(
                R.drawable.ic_arrow_back,
                contentDescription = descripcionVolver,
                tamano = NuclearIconSize.Lg,
                tint = NuclearColors.Text,
            )
        }
    }
}
