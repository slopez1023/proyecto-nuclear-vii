package co.edu.cue.nuclear.cliente.ui.screens.detalle

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas de Detalle (Android Studio: panel Preview). Datos de ejemplo; sin red no hay imagen real.

private fun ejemplo(titulo: String = "Canción de ejemplo", url: String? = null, disponible: Boolean = true, segundos: Int? = 189) =
    Cancion("AAAAAAAAAAA", titulo, "Canal de ejemplo", segundos, url, disponible)

@Composable
private fun Detalle(cancion: Cancion?) = NuclearTheme { DetalleScreen(cancion) }

@Preview(name = "Normal (miniatura cargando)", widthDp = 360, heightDp = 780)
@Composable
private fun NormalPreview() = Detalle(ejemplo(url = "https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg"))

@Preview(name = "Sin miniatura", widthDp = 360, heightDp = 780)
@Composable
private fun SinMiniaturaPreview() = Detalle(ejemplo())

@Preview(name = "Título largo", widthDp = 360, heightDp = 780)
@Composable
private fun TituloLargoPreview() = Detalle(
    ejemplo("Un título de canción extremadamente largo que ocupa varias líneas para comprobar que el desplazamiento y la jerarquía se mantienen bien (Official Video) [Remastered 2026]"),
)

@Preview(name = "No disponible", widthDp = 360, heightDp = 780)
@Composable
private fun NoDisponiblePreview() = Detalle(ejemplo(disponible = false, segundos = null))

@Preview(name = "Canción no encontrada", widthDp = 360, heightDp = 780)
@Composable
private fun NoEncontradaPreview() = Detalle(null)

@Preview(name = "Tableta horizontal", widthDp = 1280, heightDp = 800)
@Composable
private fun TabletaPreview() = Detalle(ejemplo())

@Preview(name = "Letra grande", widthDp = 360, heightDp = 780, fontScale = 1.6f)
@Composable
private fun LetraGrandePreview() = Detalle(ejemplo("Canción de ejemplo con un título bastante largo"))
