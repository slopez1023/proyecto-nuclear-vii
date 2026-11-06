package co.edu.cue.nuclear.cliente.ui.screens.acceso

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.Brand
import co.edu.cue.nuclear.cliente.ui.components.Insignia
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors

/** Pantalla "acceso" de Figma: bienvenida tras validar el QR. Los rechazos se muestran en QrInvalidoScreen. */
@Composable
fun AccesoScreen(
    estado: AccesoEstado,
    onEntrar: () -> Unit,
    onReintentar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Brand()
        when (estado) {
            AccesoEstado.Cargando, is AccesoEstado.Rechazado -> {
                // Rechazado dura un instante antes de navegar a QR inválido; se mantiene el indicador.
                CircularProgressIndicator(color = NuclearColors.Accent)
                Text("Validando el código QR…", color = NuclearColors.Text2)
            }
            AccesoEstado.SinQr -> {
                Titulo("Escanea el código QR")
                Cuerpo("Abre esta aplicación escaneando el código QR del establecimiento. No necesitas registrarte.")
            }
            AccesoEstado.ErrorConexion -> {
                Titulo("Sin conexión")
                Cuerpo("No pudimos conectarnos con el servidor. Revisa tu conexión e inténtalo de nuevo.")
                BotonPrincipal("Reintentar", onReintentar)
            }
            AccesoEstado.ErrorServidor -> {
                Titulo("Algo salió mal")
                Cuerpo("El servidor respondió de forma inesperada. Inténtalo de nuevo en unos segundos.")
                BotonPrincipal("Reintentar", onReintentar)
            }
            is AccesoEstado.Valido -> {
                Insignia("Acceso mediante QR")
                Titulo("La música también la eliges tú.")
                Cuerpo(estado.sesion.nombreEstablecimiento)
                Cuerpo("Sin nombre, correo ni datos personales.")
                if (estado.sesion.provisional) {
                    Text(
                        "Sesión de prueba (datos simulados del backend).",
                        style = MaterialTheme.typography.labelMedium,
                        color = NuclearColors.Warning,
                    )
                }
                BotonPrincipal("Entrar", onEntrar)
            }
        }
    }
}

@Composable
private fun Titulo(texto: String) =
    Text(texto, style = MaterialTheme.typography.headlineMedium, color = NuclearColors.Text)

@Composable
private fun Cuerpo(texto: String) =
    Text(texto, style = MaterialTheme.typography.bodyLarge, color = NuclearColors.Text2)
