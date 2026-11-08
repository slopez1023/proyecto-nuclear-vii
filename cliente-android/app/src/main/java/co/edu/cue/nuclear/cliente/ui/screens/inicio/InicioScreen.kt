package co.edu.cue.nuclear.cliente.ui.screens.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.Brand
import co.edu.cue.nuclear.cliente.ui.components.NuclearIcon
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.components.SimboloIcono
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import co.edu.cue.nuclear.cliente.ui.components.aparicion
import co.edu.cue.nuclear.cliente.ui.components.efectoPulsacion
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.remember

/**
 * Pantalla "inicio" de Figma, reducida al alcance del Entregable 3: solo el acceso a la búsqueda.
 * "Ahora suena" y "Mi solicitud" pertenecen al Entregable 4.
 *
 * Composición: marca arriba, bloque central (símbolo, título, descripción) centrado en vertical y, en la
 * zona del pulgar, un formulario de búsqueda formado por la entrada y el botón. La entrada no se puede
 * escribir: es un acceso a Buscar igual que el botón, que es la única acción primaria (relleno sólido).
 */
@Composable
fun InicioScreen(onBuscar: () -> Unit, modifier: Modifier = Modifier) {
    NuclearScreen(
        modifier = modifier,
        scrollable = true,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md, Alignment.CenterVertically),
        header = { Brand() },
        footer = {
            EntradaBusqueda("Canción, artista o canal", onBuscar, Modifier.aparicion(3))
            BotonPrincipal("Buscar una canción", onBuscar, Modifier.aparicion(4))
        },
    ) {
        SimboloIcono(
            R.drawable.ic_music,
            Modifier.aparicion(0),
            tamanoCaja = 56.dp,
            tamanoIcono = NuclearIconSize.Lg,
            radio = 18.dp,
        )
        Text(
            "¿Qué quieres escuchar?",
            style = TituloPantalla,
            color = NuclearColors.Text,
            textAlign = TextAlign.Center,
            modifier = Modifier.aparicion(1).semantics { heading() },
        )
        Text(
            "Busca por canción, artista o canal.",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
            textAlign = TextAlign.Center,
            modifier = Modifier.aparicion(2),
        )
    }
}

/**
 * Entrada con el aspecto del campo de búsqueda, pero de solo toque: no permite escribir, solo lleva a
 * Buscar (que pide el foco y abre el teclado por sí misma). Para el lector de pantalla es un botón.
 */
@Composable
private fun EntradaBusqueda(placeholder: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val forma = MaterialTheme.shapes.medium
    val fuente = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .efectoPulsacion(fuente, 0.98f)
            .heightIn(min = 56.dp)
            .clip(forma)
            .background(NuclearColors.Surface2)
            .border(1.dp, NuclearColors.Line, forma)
            .clickable(interactionSource = fuente, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .padding(horizontal = NuclearSpacing.Lg, vertical = NuclearSpacing.Md),
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NuclearIcon(R.drawable.ic_search, contentDescription = null, tamano = NuclearIconSize.Md, tint = NuclearColors.Muted)
        Text(
            placeholder,
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Muted,
        )
    }
}
