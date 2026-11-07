package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearLayout
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.LocalIndication
import androidx.compose.ui.graphics.lerp
import co.edu.cue.nuclear.cliente.ui.theme.NuclearMotion

// `.search-field:focus-within` de Figma: borde de acento y aro suave de 3 px alrededor.
private val ANCHO_ARO_ENFOQUE = 3.dp

/**
 * Campo de búsqueda de Figma (`.search-field`): lupa a la izquierda, texto, y un botón ✕ para limpiar
 * cuando hay texto. Al enfocarse muestra el borde de acento con un aro suave.
 *
 * @param descripcionLimpiar etiqueta accesible del botón ✕ (no se ve en pantalla).
 * @param onBuscar se llama al pulsar la tecla "buscar" del teclado.
 */
@Composable
fun CampoBusqueda(
    valor: String,
    onValorChange: (String) -> Unit,
    placeholder: String,
    descripcionLimpiar: String,
    onBuscar: () -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
) {
    val interaccion = remember { MutableInteractionSource() }
    val enfocado by interaccion.collectIsFocusedAsState()
    val permitidas = animacionesPermitidas()
    // Transición visual del foco (borde y aro): 0 = sin foco, 1 = con foco.
    val progresoFoco by animateFloatAsState(
        targetValue = if (enfocado) 1f else 0f,
        animationSpec = tween(if (permitidas) NuclearMotion.FOCO_MS else 0),
        label = "foco",
    )
    val duracionFundido = if (permitidas) NuclearMotion.FUNDIDO_RAPIDO_MS else 0
    val forma = MaterialTheme.shapes.medium

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .drawBehind {
                if (progresoFoco > 0f) {
                    val aro = ANCHO_ARO_ENFOQUE.toPx()
                    drawRoundRect(
                        color = NuclearColors.AccentSoft.copy(alpha = NuclearColors.AccentSoft.alpha * progresoFoco),
                        topLeft = Offset(-aro, -aro),
                        size = Size(size.width + 2 * aro, size.height + 2 * aro),
                        cornerRadius = CornerRadius(14.dp.toPx() + aro),
                    )
                }
            }
            .background(NuclearColors.Surface2, forma)
            .border(1.dp, lerp(NuclearColors.Line, NuclearColors.Accent, progresoFoco), forma),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NuclearIcon(
            R.drawable.ic_search,
            contentDescription = null,
            modifier = Modifier.padding(start = NuclearSpacing.Lg),
            tamano = NuclearIconSize.Md,
            tint = lerp(NuclearColors.Muted, NuclearColors.AccentStrong, progresoFoco),
        )
        BasicTextField(
            value = valor,
            onValueChange = onValorChange,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = NuclearSpacing.Md, vertical = NuclearSpacing.Md)
                // El placeholder se dibuja, pero un lector de pantalla no lo ve: se le da como nombre del campo.
                .semantics { contentDescription = placeholder }
                .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier),
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = NuclearColors.Text),
            cursorBrush = SolidColor(NuclearColors.Accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onBuscar() }),
            interactionSource = interaccion,
            decorationBox = { campo ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (valor.isEmpty()) {
                        Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = NuclearColors.Muted)
                    }
                    campo()
                }
            },
        )
        AnimatedVisibility(
            visible = valor.isNotEmpty(),
            enter = fadeIn(tween(duracionFundido)),
            exit = fadeOut(tween(duracionFundido)),
        ) {
            val fuenteLimpiar = remember { MutableInteractionSource() }
            Box(
                modifier = Modifier
                    .size(NuclearLayout.MinTouchTarget)
                    .efectoPulsacion(fuenteLimpiar, 0.92f)
                    .clip(MaterialTheme.shapes.medium)
                    .clickable(interactionSource = fuenteLimpiar, indication = LocalIndication.current, role = Role.Button) { onValorChange("") },
                contentAlignment = Alignment.Center,
            ) {
                NuclearIcon(
                    R.drawable.ic_close,
                    contentDescription = descripcionLimpiar,
                    tamano = NuclearIconSize.Md,
                    tint = NuclearColors.Text2,
                )
            }
        }
    }
}

/**
 * Tarjeta de sugerencias de autocompletado: una fila por sugerencia (lupa + texto) con divisores.
 * Ocupa a lo sumo el alto que le dé quien la use (p. ej. el espacio sobre el teclado); si hay más
 * sugerencias, se desplazan dentro de la tarjeta.
 */
@Composable
fun ListaSugerencias(
    sugerencias: List<String>,
    onSugerencia: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val forma = MaterialTheme.shapes.medium
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(forma)
            .background(NuclearColors.Surface, forma)
            .border(1.dp, NuclearColors.Line, forma)
            .verticalScroll(rememberScrollState()),
    ) {
        sugerencias.forEachIndexed { indice, sugerencia ->
            if (indice > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(NuclearColors.Line))
            val fuente = remember { MutableInteractionSource() }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .efectoPulsacion(fuente, 0.98f)
                    .heightIn(min = NuclearLayout.MinTouchTarget)
                    .clickable(interactionSource = fuente, indication = LocalIndication.current) { onSugerencia(sugerencia) }
                    .padding(horizontal = NuclearSpacing.Lg, vertical = NuclearSpacing.Md),
                horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NuclearIcon(
                    R.drawable.ic_search,
                    contentDescription = null,
                    tamano = NuclearIconSize.Sm,
                    tint = NuclearColors.Muted,
                )
                Text(
                    sugerencia,
                    style = MaterialTheme.typography.bodyLarge,
                    color = NuclearColors.Text,
                    maxLines = 2,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
