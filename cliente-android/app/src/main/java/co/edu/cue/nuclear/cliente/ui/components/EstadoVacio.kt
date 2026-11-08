package co.edu.cue.nuclear.cliente.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size

/**
 * Estado vacío de Figma (`.empty-state`): tarjeta de borde punteado con un icono, un texto y,
 * opcionalmente, un título y una acción. Sirve para "nada que mostrar todavía", "sin resultados" y errores.
 *
 * @param titulo opcional; si existe se muestra encima de [descripcion].
 * @param tono color del icono (de la paleta): neutro, acento, aviso o peligro.
 * @param anunciar si es true, el mensaje se anuncia a los lectores de pantalla al aparecer.
 * @param accion contenido opcional bajo el texto (p. ej. un botón "Reintentar").
 */
@Composable
fun EstadoVacio(
    @DrawableRes icono: Int,
    descripcion: String,
    modifier: Modifier = Modifier,
    titulo: String? = null,
    tono: TonoVisual = TonoVisual.Acento,
    anunciar: Boolean = false,
    accion: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val estilo = tono.estilo()
    val formaCaja = RoundedCornerShape(16.dp)
    Column(
        modifier = modifier
            // Región activa: un lector de pantalla anuncia el mensaje cuando aparece (errores, sin resultados).
            .then(if (anunciar) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier)
            .fillMaxWidth()
            .heightIn(min = 180.dp)
            .drawBehind {
                // Borde punteado: Compose no tiene "dashed" en border(), se dibuja a mano.
                // El trazo se centra en el borde que se le da: se desplaza medio grosor hacia dentro para que
                // no sobresalga de los límites del componente (si no, asoma bajo lo que se dibuje encima).
                val trazo = 1.dp.toPx()
                val mitad = trazo / 2
                drawRoundRect(
                    color = NuclearColors.LineStrong,
                    topLeft = Offset(mitad, mitad),
                    size = Size(size.width - trazo, size.height - trazo),
                    cornerRadius = CornerRadius(20.dp.toPx() - mitad),
                    style = Stroke(
                        width = trazo,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 6.dp.toPx())),
                    ),
                )
            }
            .padding(NuclearSpacing.Xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md, Alignment.CenterVertically),
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .background(estilo.fondo, formaCaja)
                .border(1.dp, estilo.borde, formaCaja),
            contentAlignment = Alignment.Center,
        ) {
            NuclearIcon(icono, contentDescription = null, tamano = NuclearIconSize.Lg, tint = estilo.contenido)
        }
        if (titulo != null) {
            Text(
                titulo,
                style = MaterialTheme.typography.titleLarge,
                color = NuclearColors.Text,
                textAlign = TextAlign.Center,
            )
        }
        Text(
            descripcion,
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
            textAlign = TextAlign.Center,
        )
        if (accion != null) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = NuclearSpacing.Sm),
                horizontalAlignment = Alignment.CenterHorizontally,
                content = accion,
            )
        }
    }
}
