package co.edu.cue.nuclear.cliente.ui.screens.confirmacion

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.simulado.DatosSimulados
import co.edu.cue.nuclear.cliente.ui.screens.cola.ConfirmacionSolicitud
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas de la confirmación de solicitud. DatosSimulados solo existe en debug: por eso viven en src/debug.

private val pendiente = DatosSimulados.colaConVarias().cola[2].copy(esMia = true)

@Composable
private fun Confirmacion(c: ConfirmacionSolicitud) = NuclearTheme {
    ConfirmacionScreen(confirmacion = c, onVerCola = {}, onSeguirExplorando = {})
}

@Preview(name = "Solicitud nueva", widthDp = 360, heightDp = 800)
@Composable
private fun NuevaPreview() = Confirmacion(ConfirmacionSolicitud(pendiente, sumoVotoAExistente = false))

@Preview(name = "Sin posición ni espera", widthDp = 360, heightDp = 800)
@Composable
private fun SinDatosPreview() = Confirmacion(
    ConfirmacionSolicitud(pendiente.copy(posicion = null, esperaEstimadaSegundos = null), sumoVotoAExistente = false),
)

@Preview(name = "Voto sumado a una existente", widthDp = 360, heightDp = 800)
@Composable
private fun ExistentePreview() = Confirmacion(ConfirmacionSolicitud(pendiente.copy(totalVotos = 2), sumoVotoAExistente = true))

@Preview(name = "Se sumó a la que suena", widthDp = 360, heightDp = 800)
@Composable
private fun SonandoPreview() = Confirmacion(
    ConfirmacionSolicitud(
        pendiente.copy(estado = EstadoSolicitud.EN_REPRODUCCION, posicion = null, esperaEstimadaSegundos = null),
        sumoVotoAExistente = true,
    ),
)

@Preview(name = "Letra grande (2.0x)", widthDp = 360, heightDp = 800, fontScale = 2f)
@Composable
private fun LetraGrandePreview() = Confirmacion(ConfirmacionSolicitud(pendiente, sumoVotoAExistente = false))

@Preview(name = "Tableta horizontal", widthDp = 1280, heightDp = 800)
@Composable
private fun TabletaPreview() = Confirmacion(ConfirmacionSolicitud(pendiente, sumoVotoAExistente = false))
