package co.edu.cue.nuclear.cliente.ui.screens.acceso

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo
import co.edu.cue.nuclear.cliente.data.sesion.Sesion
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas de acceso y QR inválido (Android Studio: panel Preview). No afectan a la app en ejecución.

private val SESION_EJEMPLO = Sesion("SES-EJEMPLO", "Establecimiento de ejemplo", provisional = true)

@Composable
private fun Acceso(estado: AccesoEstado) = NuclearTheme { AccesoScreen(estado, onEntrar = {}, onReintentar = {}) }

@Preview(name = "Válido", widthDp = 360, heightDp = 780)
@Composable
private fun AccesoValidoPreview() = Acceso(AccesoEstado.Valido(SESION_EJEMPLO, "dispositivo-ejemplo"))

@Preview(name = "Válido - tableta horizontal", widthDp = 1280, heightDp = 800)
@Composable
private fun AccesoValidoTabletaPreview() = Acceso(AccesoEstado.Valido(SESION_EJEMPLO, "dispositivo-ejemplo"))

@Preview(name = "Cargando", widthDp = 360, heightDp = 780)
@Composable
private fun AccesoCargandoPreview() = Acceso(AccesoEstado.Cargando)

@Preview(name = "Sin QR", widthDp = 360, heightDp = 780)
@Composable
private fun AccesoSinQrPreview() = Acceso(AccesoEstado.SinQr)

@Preview(name = "Sin conexión", widthDp = 360, heightDp = 780)
@Composable
private fun AccesoSinConexionPreview() = Acceso(AccesoEstado.ErrorConexion)

@Preview(name = "Error del servidor", widthDp = 360, heightDp = 780)
@Composable
private fun AccesoErrorServidorPreview() = Acceso(AccesoEstado.ErrorServidor)

@Preview(name = "QR inválido", widthDp = 360, heightDp = 780)
@Composable
private fun QrInvalidoPreview() = NuclearTheme { QrInvalidoScreen(MotivoRechazo.SESION_INEXISTENTE) }

@Preview(name = "QR inválido - horizontal corto", widthDp = 640, heightDp = 360)
@Composable
private fun QrInvalidoHorizontalPreview() = NuclearTheme { QrInvalidoScreen(MotivoRechazo.TOKEN_INVALIDO) }
