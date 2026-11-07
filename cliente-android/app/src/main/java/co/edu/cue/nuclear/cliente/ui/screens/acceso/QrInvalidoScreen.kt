package co.edu.cue.nuclear.cliente.ui.screens.acceso

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo
import co.edu.cue.nuclear.cliente.ui.components.Brand
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.components.SimboloIcono
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import co.edu.cue.nuclear.cliente.ui.components.aparicion

/** Mensaje para el cliente según el motivo de rechazo (textos de Figma cuando existen). */
fun mensajeRechazo(motivo: MotivoRechazo): String = when (motivo) {
    MotivoRechazo.TOKEN_INVALIDO -> "El código QR no es válido."
    MotivoRechazo.SESION_INEXISTENTE -> "No pudimos identificar el establecimiento."
    MotivoRechazo.SESION_CERRADA -> "La sesión de este establecimiento ya terminó."
    MotivoRechazo.QR_DESACTIVADO -> "Este código QR está desactivado en este momento."
}

/**
 * Pantalla "qr-invalido" de Figma. No ofrece solicitudes ni votos (HU-01) ni botones: la persona
 * debe escanear de nuevo. El rechazo se comunica con un símbolo en tono de peligro, no con un título rojo.
 */
@Composable
fun QrInvalidoScreen(motivo: MotivoRechazo, modifier: Modifier = Modifier) {
    NuclearScreen(
        modifier = modifier,
        scrollable = true,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md, Alignment.CenterVertically),
        header = { Brand() },
    ) {
        SimboloIcono(R.drawable.ic_qr_code, Modifier.aparicion(0), tono = TonoVisual.Peligro)
        Text(
            "Acceso no disponible",
            style = TituloPantalla,
            color = NuclearColors.Text,
            textAlign = TextAlign.Center,
            modifier = Modifier.aparicion(1).semantics { heading() },
        )
        Text(
            mensajeRechazo(motivo),
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text,
            textAlign = TextAlign.Center,
            modifier = Modifier.aparicion(2),
        )
        Text(
            "Escanea de nuevo el código QR del establecimiento o pide ayuda al personal.",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
            textAlign = TextAlign.Center,
            modifier = Modifier.aparicion(3),
        )
    }
}
