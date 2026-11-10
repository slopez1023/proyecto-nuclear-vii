package co.edu.cue.nuclear.cliente.ui.screens.cola

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.data.cola.simulado.DatosSimulados
import co.edu.cue.nuclear.cliente.ui.components.MensajesOperacion
import co.edu.cue.nuclear.cliente.ui.components.aMensaje
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas de la pantalla de cola. DatosSimulados solo existe en debug: por eso viven en src/debug.

@Composable
private fun Cola(estado: ColaUiState) = NuclearTheme {
    ColaScreen(estado = estado, onVotar = {}, onReintentar = {}, onCerrarMensaje = {}, onBuscar = {})
}

private val conDatos = ColaUiState(CargaCola.Exito(DatosSimulados.colaConVarias()))

@Preview(name = "Con datos", widthDp = 360, heightDp = 800)
@Composable
private fun ConDatosPreview() = Cola(conDatos)

@Preview(name = "Votando", widthDp = 360, heightDp = 800)
@Composable
private fun VotandoPreview() = Cola(conDatos.copy(votando = setOf("SIM-SOL-0003")))

@Preview(name = "Voto registrado", widthDp = 360, heightDp = 800)
@Composable
private fun VotoRegistradoPreview() = Cola(
    conDatos.copy(mensaje = ResultadoVoto.Registrado(DatosSimulados.colaConVarias().cola[2]).aMensaje()),
)

@Preview(name = "Voto rechazado", widthDp = 360, heightDp = 800)
@Composable
private fun VotoRechazadoPreview() = Cola(
    conDatos.copy(
        mensaje = ResultadoVoto.Rechazado(MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO, faltantes = 2).aMensaje(),
    ),
)

@Preview(name = "Cargando", widthDp = 360, heightDp = 640)
@Composable
private fun CargandoPreview() = Cola(ColaUiState(CargaCola.Cargando))

@Preview(name = "Vacía", widthDp = 360, heightDp = 640)
@Composable
private fun VaciaPreview() = Cola(ColaUiState(CargaCola.Vacia))

@Preview(name = "Suena una canción, sin cola", widthDp = 360, heightDp = 640)
@Composable
private fun SoloSonandoPreview() = Cola(ColaUiState(CargaCola.Exito(DatosSimulados.soloReproduciendo())))

@Preview(name = "Error de conexión", widthDp = 360, heightDp = 640)
@Composable
private fun ErrorConexionPreview() = Cola(ColaUiState(CargaCola.Error(TipoErrorCola.CONEXION)))

@Preview(name = "Error del servidor", widthDp = 360, heightDp = 640)
@Composable
private fun ErrorServidorPreview() = Cola(ColaUiState(CargaCola.Error(TipoErrorCola.SERVIDOR)))

@Preview(name = "Información no disponible", widthDp = 360, heightDp = 640)
@Composable
private fun InformacionNoDisponiblePreview() = Cola(
    ColaUiState(CargaCola.Exito(DatosSimulados.soloReproduciendo()), mensaje = MensajesOperacion.InformacionNoDisponible),
)

@Preview(name = "Letra grande", widthDp = 360, heightDp = 800, fontScale = 1.8f)
@Composable
private fun LetraGrandePreview() = Cola(conDatos)

@Preview(name = "Tableta horizontal", widthDp = 1280, heightDp = 800)
@Composable
private fun TabletaPreview() = Cola(conDatos)

@Preview(name = "Solicitud destacada (la 4.ª)", widthDp = 360, heightDp = 800)
@Composable
private fun DestacadaPreview() = Cola(conDatos.copy(solicitudDestacada = "SIM-SOL-0004"))

@Preview(name = "Destacada con letra grande (1.5x)", widthDp = 360, heightDp = 800, fontScale = 1.5f)
@Composable
private fun DestacadaLetraGrandePreview() = Cola(conDatos.copy(solicitudDestacada = "SIM-SOL-0002"))
