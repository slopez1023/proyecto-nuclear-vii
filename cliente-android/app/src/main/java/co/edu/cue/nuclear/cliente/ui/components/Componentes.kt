package co.edu.cue.nuclear.cliente.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.remember

/** Botón principal: alto mínimo de 52 dp para operarlo con una sola mano. */
@Composable
fun BotonPrincipal(texto: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val fuente = remember { MutableInteractionSource() }
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp).efectoPulsacion(fuente, 0.97f),
        interactionSource = fuente,
        shape = MaterialTheme.shapes.medium,
        colors = ButtonDefaults.buttonColors(
            containerColor = NuclearColors.Accent,
            contentColor = NuclearColors.Canvas,
        ),
    ) {
        Text(texto, style = MaterialTheme.typography.labelLarge)
    }
}

/** Intención de color de un elemento (insignia, símbolo). Siempre usa colores de la paleta de Figma. */
enum class TonoVisual { Acento, Exito, Aviso, Peligro, Neutro }

internal class EstiloTono(val contenido: Color, val fondo: Color, val borde: Color)

/** Transparencias de fondo y borde tomadas de `.badge-*` de index.css (Figma). */
internal fun TonoVisual.estilo(): EstiloTono = when (this) {
    TonoVisual.Acento -> EstiloTono(NuclearColors.AccentStrong, NuclearColors.AccentSoft, NuclearColors.Accent.copy(alpha = 0.24f))
    TonoVisual.Exito -> EstiloTono(NuclearColors.Success, NuclearColors.Success.copy(alpha = 0.08f), NuclearColors.Success.copy(alpha = 0.19f))
    TonoVisual.Aviso -> EstiloTono(NuclearColors.Warning, NuclearColors.Warning.copy(alpha = 0.08f), NuclearColors.Warning.copy(alpha = 0.2f))
    TonoVisual.Peligro -> EstiloTono(NuclearColors.Danger, NuclearColors.Danger.copy(alpha = 0.08f), NuclearColors.Danger.copy(alpha = 0.2f))
    TonoVisual.Neutro -> EstiloTono(NuclearColors.Text2, NuclearColors.Surface3, NuclearColors.Line)
}

/** Etiqueta pequeña tipo "badge" del diseño (`.badge` de Figma), con punto de estado opcional. */
@Composable
fun Insignia(
    texto: String,
    modifier: Modifier = Modifier,
    tono: TonoVisual = TonoVisual.Acento,
    conPunto: Boolean = false,
) {
    val estilo = tono.estilo()
    val forma = RoundedCornerShape(50)
    Row(
        modifier = modifier
            .heightIn(min = 28.dp)
            .background(estilo.fondo, forma)
            .border(1.dp, estilo.borde, forma)
            .padding(horizontal = NuclearSpacing.Md, vertical = NuclearSpacing.Xs),
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (conPunto) Box(Modifier.size(6.dp).background(estilo.contenido, CircleShape))
        Text(texto, style = MaterialTheme.typography.labelMedium, color = estilo.contenido)
    }
}

/**
 * Cuadro de 76 dp con un icono grande (`.welcome-symbol` de Figma): marca el tema de una pantalla
 * (acceso, error...). Es decorativo: el significado lo da el texto de al lado.
 */
@Composable
fun SimboloIcono(
    @DrawableRes icono: Int,
    modifier: Modifier = Modifier,
    tono: TonoVisual = TonoVisual.Acento,
    tamanoCaja: Dp = 76.dp,
    tamanoIcono: Dp = NuclearIconSize.Xl,
    radio: Dp = 24.dp,
) {
    val estilo = tono.estilo()
    val forma = RoundedCornerShape(radio)
    Box(
        modifier = modifier
            .size(tamanoCaja)
            .background(estilo.fondo, forma)
            .border(1.dp, estilo.borde, forma),
        contentAlignment = Alignment.Center,
    ) {
        NuclearIcon(icono, contentDescription = null, tamano = tamanoIcono, tint = estilo.contenido)
    }
}

/** Nombre del establecimiento destacado, con un icono de música. */
@Composable
fun ChipEstablecimiento(nombre: String, modifier: Modifier = Modifier) {
    val forma = MaterialTheme.shapes.medium
    Row(
        modifier = modifier
            .background(NuclearColors.Surface, forma)
            .border(1.dp, NuclearColors.Line, forma)
            .padding(horizontal = NuclearSpacing.Lg, vertical = NuclearSpacing.Sm + NuclearSpacing.Xs),
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NuclearIcon(R.drawable.ic_music, contentDescription = null, tamano = NuclearIconSize.Md, tint = NuclearColors.AccentStrong)
        Text(
            nombre,
            style = MaterialTheme.typography.titleMedium,
            color = NuclearColors.Text,
            textAlign = TextAlign.Center,
        )
    }
}
