package co.edu.cue.nuclear.cliente.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize

/**
 * Icono de línea de PONGA. Los vectores (`R.drawable.ic_*`) son blancos y aquí se tiñen con un color
 * de la paleta, así que un mismo icono sirve para cualquier estado (normal, acento, peligro...).
 *
 * @param contentDescription texto para lector de pantalla; `null` si el icono es solo decorativo
 *   (por ejemplo, cuando ya hay un texto al lado).
 */
@Composable
fun NuclearIcon(
    @DrawableRes icono: Int,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    tamano: Dp = NuclearIconSize.Lg,
    tint: Color = NuclearColors.Text2,
) {
    Icon(
        painter = painterResource(icono),
        contentDescription = contentDescription,
        modifier = modifier.size(tamano),
        tint = tint,
    )
}
