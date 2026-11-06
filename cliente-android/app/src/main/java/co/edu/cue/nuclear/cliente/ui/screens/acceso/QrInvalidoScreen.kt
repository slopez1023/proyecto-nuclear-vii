package co.edu.cue.nuclear.cliente.ui.screens.acceso

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo
import co.edu.cue.nuclear.cliente.ui.components.Brand
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors

/** Mensaje para el cliente según el motivo de rechazo (textos de Figma cuando existen). */
fun mensajeRechazo(motivo: MotivoRechazo): String = when (motivo) {
    MotivoRechazo.TOKEN_INVALIDO -> "El código QR no es válido."
    MotivoRechazo.SESION_INEXISTENTE -> "No pudimos identificar el establecimiento."
    MotivoRechazo.SESION_CERRADA -> "La sesión de este establecimiento ya terminó."
    MotivoRechazo.QR_DESACTIVADO -> "Este código QR está desactivado en este momento."
}

/** Pantalla "qr-invalido" de Figma. No ofrece solicitudes ni votos (HU-01). */
@Composable
fun QrInvalidoScreen(motivo: MotivoRechazo, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Brand()
        Text("Acceso no disponible", style = MaterialTheme.typography.headlineMedium, color = NuclearColors.Danger)
        Text(mensajeRechazo(motivo), style = MaterialTheme.typography.bodyLarge, color = NuclearColors.Text)
        Text(
            "Escanea de nuevo el código QR del establecimiento o pide ayuda al personal.",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
        )
    }
}
