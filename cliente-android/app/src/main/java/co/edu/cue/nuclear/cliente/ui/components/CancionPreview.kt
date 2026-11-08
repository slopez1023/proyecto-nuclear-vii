package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas de los componentes de canción (Android Studio: panel Preview). Datos de ejemplo.
// Sin red no hay imagen real: una URL falsa muestra el estado "cargando"/"error"; sin URL, el marcador.

private fun ejemplo(titulo: String, canal: String, segundos: Int?, url: String? = null, disponible: Boolean = true) =
    Cancion("AAAAAAAAAAA", titulo, canal, segundos, url, disponible)

@Composable
private fun Lista(vararg canciones: Cancion) = NuclearTheme {
    NuclearScreen(scrollable = true, verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm)) {
        canciones.forEach { CancionItem(it, onClick = {}) }
    }
}

@Preview(name = "Variantes", widthDp = 360, heightDp = 780)
@Composable
private fun VariantesPreview() = Lista(
    ejemplo("Canción de ejemplo", "Canal de ejemplo", 241),
    ejemplo("Un título de canción extremadamente largo que necesita ocupar dos líneas y recortarse con puntos suspensivos al final", "Un nombre de canal también muy largo para comprobar el recorte", 3723),
    ejemplo("Canción no disponible", "Canal de ejemplo", 192, disponible = false),
    ejemplo("Duración desconocida", "Canal de ejemplo", null),
    ejemplo("Con URL de miniatura (sin red en la vista previa)", "Canal de ejemplo", 75, url = "https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg"),
)

@Preview(name = "Esqueleto", widthDp = 360, heightDp = 480)
@Composable
private fun EsqueletoPreview() = NuclearTheme {
    NuclearScreen(scrollable = true) { ListaEsqueleto() }
}

@Preview(name = "Miniatura grande sin URL (como en Detalle)", widthDp = 360, heightDp = 300)
@Composable
private fun MiniaturaGrandePreview() = NuclearTheme {
    NuclearScreen { MiniaturaCancion(null, Modifier.fillMaxWidth().aspectRatio(16f / 9f)) }
}

@Preview(name = "Tableta horizontal", widthDp = 1280, heightDp = 800)
@Composable
private fun TabletaPreview() = Lista(
    ejemplo("Canción de ejemplo", "Canal de ejemplo", 241),
    ejemplo("Canción no disponible", "Canal de ejemplo", 192, disponible = false),
)

@Preview(name = "Letra muy grande (duración en línea propia)", widthDp = 360, heightDp = 780, fontScale = 2.0f)
@Composable
private fun LetraMuyGrandePreview() = Lista(
    ejemplo("Canción de ejemplo con un título largo", "Canal de ejemplo", 241),
    ejemplo("Canción no disponible", "Canal de ejemplo", 192, disponible = false),
)

@Preview(name = "Letra 1,3 (chip sobre la miniatura)", widthDp = 360, heightDp = 780, fontScale = 1.3f)
@Composable
private fun Letra13Preview() = Lista(
    ejemplo("Canción de ejemplo con un título largo", "Canal de ejemplo", 241),
)
