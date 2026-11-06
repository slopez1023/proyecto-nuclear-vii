package co.edu.cue.nuclear.cliente.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

/** Radios de Figma: 10, 14, 20 y 28 px. */
private val NuclearShapes = Shapes(
    extraSmall = RoundedCornerShape(10.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

private val NuclearColorScheme = darkColorScheme(
    primary = NuclearColors.Accent,
    onPrimary = NuclearColors.Canvas,
    primaryContainer = NuclearColors.AccentSoft,
    onPrimaryContainer = NuclearColors.AccentStrong,
    secondary = NuclearColors.Cyan,
    background = NuclearColors.Canvas,
    onBackground = NuclearColors.Text,
    surface = NuclearColors.Surface,
    onSurface = NuclearColors.Text,
    surfaceVariant = NuclearColors.Surface2,
    onSurfaceVariant = NuclearColors.Text2,
    outline = NuclearColors.Line,
    outlineVariant = NuclearColors.LineStrong,
    error = NuclearColors.Danger,
)

/** La app es siempre nocturna (el diseño de Figma solo define tema oscuro). */
@Composable
fun NuclearTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = NuclearColorScheme,
        typography = NuclearTypography,
        shapes = NuclearShapes,
        content = content,
    )
}
