package co.edu.cue.nuclear.cliente.ui.screens.detalle

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.simulado.DatosSimulados
import co.edu.cue.nuclear.cliente.ui.components.aMensaje
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Detalle con la acción de solicitar (E4). Usa DatosSimulados, que solo existe en debug.

private val cancion = DatosSimulados.nuevaCancion
private val aceptada = ResultadoSolicitud.Aceptada(DatosSimulados.colaConVarias().cola[0], sumoVotoAExistente = false)

@Composable
private fun Detalle(solicitando: Boolean = false, mensaje: co.edu.cue.nuclear.cliente.ui.components.MensajeUi? = null) =
    NuclearTheme {
        DetalleScreen(
            cancion = cancion,
            onSolicitar = {},
            solicitando = solicitando,
            mensaje = mensaje,
            onVerCola = {},
        )
    }

@Preview(name = "Solicitar", widthDp = 360, heightDp = 780)
@Composable
private fun SolicitarPreview() = Detalle()

@Preview(name = "Enviando solicitud", widthDp = 360, heightDp = 780)
@Composable
private fun EnviandoPreview() = Detalle(solicitando = true)

@Preview(name = "Solicitud aceptada", widthDp = 360, heightDp = 780)
@Composable
private fun AceptadaPreview() = Detalle(mensaje = aceptada.aMensaje())

@Preview(name = "Solicitud rechazada", widthDp = 360, heightDp = 780)
@Composable
private fun RechazadaPreview() = Detalle(
    mensaje = ResultadoSolicitud.Rechazada(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 2).aMensaje(),
)

@Preview(name = "Canción no disponible (sin botón)", widthDp = 360, heightDp = 780)
@Composable
private fun NoDisponiblePreview() = NuclearTheme {
    DetalleScreen(cancion = cancion.copy(disponible = false), onSolicitar = {}, onVerCola = {})
}

// --- Estados de la canción respecto a la cola (paso 3) ---

private val pendienteAjena = DatosSimulados.colaConVarias().cola[2]
private val mia = DatosSimulados.colaConVarias().cola[0]

@Composable
private fun DetalleEnCola(estado: EstadoCancionEnCola) = NuclearTheme {
    DetalleScreen(cancion = cancion, onSolicitar = {}, onVerCola = {}, estadoEnCola = estado)
}

@Preview(name = "En la cola (de otra persona)", widthDp = 360, heightDp = 800)
@Composable
private fun EnColaPreview() = DetalleEnCola(EstadoCancionEnCola.Pendiente(pendienteAjena))

@Preview(name = "En la cola, ya votaste", widthDp = 360, heightDp = 800)
@Composable
private fun EnColaVotadaPreview() = DetalleEnCola(
    EstadoCancionEnCola.Pendiente(pendienteAjena.copy(yaVoto = true)),
)

@Preview(name = "Solicitada por ti", widthDp = 360, heightDp = 800)
@Composable
private fun SolicitadaPorTiPreview() = DetalleEnCola(EstadoCancionEnCola.SolicitadaPorTi(mia))

@Preview(name = "Suena ahora", widthDp = 360, heightDp = 800)
@Composable
private fun SonandoPreview() = DetalleEnCola(EstadoCancionEnCola.Sonando(DatosSimulados.reproduccionActual))

@Preview(name = "Solicitada por ti, letra grande (1.5x)", widthDp = 360, heightDp = 800, fontScale = 1.5f)
@Composable
private fun SolicitadaLetraGrandePreview() = DetalleEnCola(EstadoCancionEnCola.SolicitadaPorTi(mia))
