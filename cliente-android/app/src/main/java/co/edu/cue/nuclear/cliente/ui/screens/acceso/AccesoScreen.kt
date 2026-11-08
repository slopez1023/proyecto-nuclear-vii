package co.edu.cue.nuclear.cliente.ui.screens.acceso

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.Brand
import co.edu.cue.nuclear.cliente.ui.components.ChipEstablecimiento
import co.edu.cue.nuclear.cliente.ui.components.Insignia
import co.edu.cue.nuclear.cliente.ui.components.NuclearIcon
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.components.SimboloIcono
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import co.edu.cue.nuclear.cliente.ui.components.aparicion

/**
 * Pantalla "acceso" de Figma: bienvenida tras validar el QR. Los rechazos se muestran en QrInvalidoScreen.
 *
 * Composición de Figma (`welcome-screen`): marca arriba, contenido centrado y la acción principal anclada
 * abajo, a la altura del pulgar.
 */
@Composable
fun AccesoScreen(
    estado: AccesoEstado,
    onEntrar: () -> Unit,
    onReintentar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    NuclearScreen(
        modifier = modifier,
        scrollable = true,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md, Alignment.CenterVertically),
        header = { Brand() },
        footer = {
            when (estado) {
                is AccesoEstado.Valido -> {
                    BotonPrincipal("Entrar", onEntrar, Modifier.aparicion(3))
                    AvisoPrivacidad("Sin nombre, correo ni datos personales.", Modifier.aparicion(4))
                }
                AccesoEstado.ErrorConexion, AccesoEstado.ErrorServidor -> BotonPrincipal("Reintentar", onReintentar, Modifier.aparicion(3))
                else -> Unit
            }
        },
    ) {
        when (estado) {
            AccesoEstado.Cargando, is AccesoEstado.Rechazado -> {
                // Rechazado dura un instante antes de navegar a QR inválido; se mantiene el indicador.
                CircularProgressIndicator(color = NuclearColors.Accent)
                Cuerpo("Validando el código QR…")
            }
            AccesoEstado.SinQr -> {
                SimboloIcono(R.drawable.ic_qr_code, Modifier.aparicion(0))
                Titulo("Escanea el código QR", Modifier.aparicion(1))
                Cuerpo("Abre esta aplicación escaneando el código QR del establecimiento. No necesitas registrarte.", Modifier.aparicion(2))
            }
            AccesoEstado.ErrorConexion -> {
                SimboloIcono(R.drawable.ic_wifi_off, Modifier.aparicion(0), tono = TonoVisual.Aviso)
                Titulo("Sin conexión", Modifier.aparicion(1))
                Cuerpo("No pudimos conectarnos con el servidor. Revisa tu conexión e inténtalo de nuevo.", Modifier.aparicion(2))
            }
            AccesoEstado.ErrorServidor -> {
                SimboloIcono(R.drawable.ic_alert_circle, Modifier.aparicion(0), tono = TonoVisual.Peligro)
                Titulo("Algo salió mal", Modifier.aparicion(1))
                Cuerpo("El servidor respondió de forma inesperada. Inténtalo de nuevo en unos segundos.", Modifier.aparicion(2))
            }
            is AccesoEstado.Valido -> {
                SimboloIcono(R.drawable.ic_qr_code, Modifier.aparicion(0))
                Insignia("Acceso mediante QR", Modifier.aparicion(1))
                Titulo("La música también la eliges tú.", Modifier.aparicion(2))
                ChipEstablecimiento(estado.sesion.nombreEstablecimiento, Modifier.aparicion(3))
                if (estado.sesion.provisional) {
                    Insignia(
                        "Sesión de prueba (datos simulados del backend).",
                        Modifier.aparicion(4),
                        tono = TonoVisual.Aviso,
                        conPunto = true,
                    )
                }
            }
        }
    }
}

@Composable
private fun Titulo(texto: String, modifier: Modifier = Modifier) =
    Text(
        texto,
        style = TituloPantalla,
        color = NuclearColors.Text,
        textAlign = TextAlign.Center,
        modifier = modifier.semantics { heading() },
    )

@Composable
private fun Cuerpo(texto: String, modifier: Modifier = Modifier) =
    Text(
        texto,
        style = MaterialTheme.typography.bodyLarge,
        color = NuclearColors.Text2,
        textAlign = TextAlign.Center,
        modifier = modifier,
    )

/** `.privacy-inline` de Figma: escudo y texto discreto bajo el botón. */
@Composable
private fun AvisoPrivacidad(texto: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NuclearIcon(R.drawable.ic_shield_check, contentDescription = null, tamano = NuclearIconSize.Md, tint = NuclearColors.Success)
        Text(
            texto,
            style = MaterialTheme.typography.bodyMedium,
            color = NuclearColors.Muted,
            textAlign = TextAlign.Center,
        )
    }
}
