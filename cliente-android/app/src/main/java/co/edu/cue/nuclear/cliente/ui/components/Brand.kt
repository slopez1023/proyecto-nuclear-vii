package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearMotion

/** El resplandor se "enciende" una sola vez por sesión de la app; las pantallas siguientes ya lo muestran encendido. */
private var resplandorYaEncendido = false

/**
 * Logo oficial de PONGA (copia de docs/logo/ponga-logo.png). El PNG es cuadrado y sin transparencia,
 * asi que, igual que en Figma, se recorta a una franja horizontal sobre el fondo oscuro.
 *
 * El resplandor violeta aparece con un encendido suave de 700 ms la primera vez y después queda fijo
 * (sin animación continua, para no gastar batería ni distraer).
 */
@Composable
fun Brand(compact: Boolean = false, modifier: Modifier = Modifier) {
    val permitidas = animacionesPermitidas()
    val intensidad = remember { Animatable(if (resplandorYaEncendido || !permitidas) 1f else 0.3f) }
    LaunchedEffect(Unit) {
        if (intensidad.value < 1f) {
            resplandorYaEncendido = true
            intensidad.animateTo(1f, tween(NuclearMotion.RESPLANDOR_MS, easing = NuclearMotion.Entrada))
        }
        resplandorYaEncendido = true
    }
    val colorResplandor = NuclearColors.Accent.copy(alpha = intensidad.value)

    Image(
        painter = painterResource(R.drawable.ponga_logo),
        contentDescription = "PONGA",
        contentScale = ContentScale.Crop,
        alignment = Alignment.Center,
        modifier = modifier
            .width(if (compact) 96.dp else 112.dp)
            .height(if (compact) 38.dp else 44.dp)
            // Resplandor violeta del logo de Figma (.brand-logo: box-shadow 0 0 22px rgba(139,124,255,.14)).
            // En Android 9+ la sombra toma el color indicado; antes se ve la sombra neutra, casi invisible sobre el fondo oscuro.
            .shadow(
                elevation = 14.dp,
                shape = RoundedCornerShape(10.dp),
                ambientColor = colorResplandor,
                spotColor = colorResplandor,
            )
            .clip(RoundedCornerShape(10.dp))
            .background(NuclearColors.Canvas),
    )
}
