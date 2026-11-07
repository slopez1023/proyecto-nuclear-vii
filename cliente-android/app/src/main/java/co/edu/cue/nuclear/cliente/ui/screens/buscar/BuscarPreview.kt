package co.edu.cue.nuclear.cliente.ui.screens.buscar

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.busqueda.TipoErrorBusqueda
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas de Buscar (Android Studio: panel Preview). Datos de ejemplo; no afectan a la app.

private val CANCIONES = listOf(
    Cancion("AAAAAAAAAAA", "Canción de ejemplo número uno con un título bastante largo", "Canal de ejemplo", 241, null, true),
    Cancion("BBBBBBBBBBB", "Otra canción de ejemplo", "Artista de ejemplo", 192, null, true),
    Cancion("CCCCCCCCCCC", "Canción no disponible", "Canal", null, null, false),
)

@Composable
private fun Buscar(estado: BuscarUiState) = NuclearTheme {
    BuscarScreen(estado, onConsultaCambio = {}, onBuscar = {}, onSugerencia = {}, onReintentar = {}, onCancion = {})
}

@Preview(name = "Inicial", widthDp = 360, heightDp = 780)
@Composable
private fun InicialPreview() = Buscar(BuscarUiState())

@Preview(name = "Sugerencias", widthDp = 360, heightDp = 780)
@Composable
private fun SugerenciasPreview() = Buscar(
    BuscarUiState(consulta = "ejemplo", sugerencias = listOf("Canción de ejemplo uno", "Otra canción de ejemplo con un título muy largo que ocupa dos líneas completas"), resultados = ResultadosUi.Inicial),
)

@Preview(name = "Cargando", widthDp = 360, heightDp = 780)
@Composable
private fun CargandoPreview() = Buscar(BuscarUiState(consulta = "ejemplo", resultados = ResultadosUi.Cargando))

@Preview(name = "Resultados", widthDp = 360, heightDp = 780)
@Composable
private fun ResultadosPreview() = Buscar(BuscarUiState(consulta = "ejemplo", resultados = ResultadosUi.Exito(CANCIONES)))

@Preview(name = "Sin resultados", widthDp = 360, heightDp = 780)
@Composable
private fun SinResultadosPreview() = Buscar(BuscarUiState(consulta = "zzqx", resultados = ResultadosUi.SinResultados("zzqx")))

@Preview(name = "Error: sin conexión", widthDp = 360, heightDp = 780)
@Composable
private fun ErrorConexionPreview() = Buscar(BuscarUiState(consulta = "ejemplo", resultados = ResultadosUi.Error(TipoErrorBusqueda.CONEXION)))

@Preview(name = "Error: cuota", widthDp = 360, heightDp = 780)
@Composable
private fun ErrorCuotaPreview() = Buscar(BuscarUiState(consulta = "ejemplo", resultados = ResultadosUi.Error(TipoErrorBusqueda.CUOTA)))

@Preview(name = "Error: servicio no disponible", widthDp = 360, heightDp = 780)
@Composable
private fun ErrorServicioPreview() = Buscar(BuscarUiState(consulta = "ejemplo", resultados = ResultadosUi.Error(TipoErrorBusqueda.SERVICIO_NO_DISPONIBLE)))

@Preview(name = "Error: servidor", widthDp = 360, heightDp = 780)
@Composable
private fun ErrorServidorPreview() = Buscar(BuscarUiState(consulta = "ejemplo", resultados = ResultadosUi.Error(TipoErrorBusqueda.SERVIDOR)))

@Preview(name = "Tableta horizontal", widthDp = 1280, heightDp = 800)
@Composable
private fun TabletaPreview() = Buscar(BuscarUiState(consulta = "ejemplo", resultados = ResultadosUi.Exito(CANCIONES)))

@Preview(name = "Sugerencias con desplazamiento (poco alto)", widthDp = 360, heightDp = 420)
@Composable
private fun SugerenciasDesplazablesPreview() = Buscar(
    BuscarUiState(
        consulta = "ejemplo",
        sugerencias = List(8) { "Sugerencia de ejemplo número ${it + 1} con un título más largo para ocupar dos líneas" },
    ),
)
