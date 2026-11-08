package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas para revisar los fundamentos sin backend (Android Studio: panel Preview).

private val ICONOS = listOf(
    "qr" to R.drawable.ic_qr_code,
    "escudo" to R.drawable.ic_shield_check,
    "lupa" to R.drawable.ic_search,
    "cerrar" to R.drawable.ic_close,
    "atrás" to R.drawable.ic_arrow_back,
    "música" to R.drawable.ic_music,
    "reloj" to R.drawable.ic_clock,
    "sin red" to R.drawable.ic_wifi_off,
    "alerta" to R.drawable.ic_alert_circle,
)

@Composable
private fun GaleriaIconos() {
    NuclearScreen(scrollable = true) {
        Text("Fundamentos", style = MaterialTheme.typography.headlineMedium, color = NuclearColors.Text)
        Text(
            "Iconos de línea sobre el fondo con degradado.",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
        )
        ICONOS.chunked(3).forEach { fila ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Lg)) {
                fila.forEach { (nombre, id) ->
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Xs),
                    ) {
                        NuclearIcon(id, contentDescription = null, tamano = NuclearIconSize.Xl, tint = NuclearColors.AccentStrong)
                        Text(nombre, style = MaterialTheme.typography.labelMedium, color = NuclearColors.Muted)
                    }
                }
            }
        }
    }
}

@Preview(name = "Teléfono", widthDp = 360, heightDp = 640)
@Composable
private fun FundamentosTelefonoPreview() = NuclearTheme { GaleriaIconos() }

@Preview(name = "Tableta horizontal", widthDp = 1280, heightDp = 800)
@Composable
private fun FundamentosTabletaPreview() = NuclearTheme { GaleriaIconos() }
