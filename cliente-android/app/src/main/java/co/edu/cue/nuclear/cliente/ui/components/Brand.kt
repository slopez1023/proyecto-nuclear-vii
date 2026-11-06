package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors

/**
 * Logo oficial de PONGA (copia de docs/logo/ponga-logo.png). El PNG es cuadrado y sin transparencia,
 * asi que, igual que en Figma, se recorta a una franja horizontal sobre el fondo oscuro.
 */
@Composable
fun Brand(compact: Boolean = false, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.ponga_logo),
        contentDescription = "PONGA",
        contentScale = ContentScale.Crop,
        alignment = Alignment.Center,
        modifier = modifier
            .width(if (compact) 96.dp else 112.dp)
            .height(if (compact) 38.dp else 44.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(NuclearColors.Canvas),
    )
}
