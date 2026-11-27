package co.edu.cue.nuclear.cliente.ui.screens.acceso

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.BotonSecundario
import co.edu.cue.nuclear.cliente.ui.components.aparicion
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla

/**
 * Contenido principal de la pantalla de inicio cuando la app se abre sin enlace QR:
 * presenta la marca PONGA PUES y los dos métodos de ingreso (escáner QR o código de 6 dígitos).
 */
@Composable
fun BienvenidaContenido(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
    ) {
        val formaLogo = RoundedCornerShape(24.dp)
        Image(
            painter = painterResource(R.drawable.ponga_logo),
            contentDescription = "Logotipo de PONGA PUES",
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .aparicion(0)
                .size(104.dp)
                .shadow(
                    elevation = 18.dp,
                    shape = formaLogo,
                    ambientColor = NuclearColors.Accent,
                    spotColor = NuclearColors.Accent,
                )
                .clip(formaLogo)
                .border(1.dp, NuclearColors.Accent.copy(alpha = 0.35f), formaLogo),
        )
        Text(
            "Bienvenido a PONGA PUES",
            style = TituloPantalla,
            color = NuclearColors.Text,
            textAlign = TextAlign.Center,
            modifier = Modifier.aparicion(1).semantics { heading() },
        )
        Text(
            "Elige la música del establecimiento pidiendo y votando canciones en tiempo real. Sin registro.",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
            textAlign = TextAlign.Center,
            modifier = Modifier.aparicion(2),
        )
    }
}

@Composable
fun BienvenidaBotones(
    onEscanearQr: () -> Unit,
    onIngresarCodigo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
    ) {
        BotonPrincipal(
            texto = "ESCANEAR CÓDIGO QR",
            onClick = onEscanearQr,
            modifier = Modifier.aparicion(3),
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = NuclearSpacing.Xs).aparicion(4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        ) {
            HorizontalDivider(modifier = Modifier.weight(1f), color = NuclearColors.Line)
            Text(
                "O TAMBIÉN",
                style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
                color = NuclearColors.Muted,
            )
            HorizontalDivider(modifier = Modifier.weight(1f), color = NuclearColors.Line)
        }
        BotonSecundario(
            texto = "INGRESAR CÓDIGO",
            onClick = onIngresarCodigo,
            modifier = Modifier.aparicion(5),
        )
    }
}
