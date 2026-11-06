package co.edu.cue.nuclear.cliente.ui.screens.detalle

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.ui.components.Insignia
import co.edu.cue.nuclear.cliente.ui.components.MiniaturaCancion
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors

/**
 * Pantalla "detalle" de Figma: información y miniatura de la canción (B05).
 * La acción de solicitar la canción pertenece al Entregable 4 y no se incluye.
 */
@Composable
fun DetalleScreen(cancion: Cancion?, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (cancion == null) {
            Text("Canción no encontrada", style = MaterialTheme.typography.headlineMedium, color = NuclearColors.Text)
            Text(
                "Vuelve a la búsqueda y selecciona la canción de nuevo.",
                style = MaterialTheme.typography.bodyLarge,
                color = NuclearColors.Text2,
            )
            return@Column
        }

        MiniaturaCancion(cancion.urlMiniatura, Modifier.fillMaxWidth().aspectRatio(16f / 9f))
        Text(cancion.titulo, style = MaterialTheme.typography.headlineMedium, color = NuclearColors.Text)
        Text(cancion.artistaCanal, style = MaterialTheme.typography.titleMedium, color = NuclearColors.Text2)
        Insignia("Duración ${cancion.duracionTexto}")
        if (cancion.disponible) {
            Text("Disponible para reproducir", style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Success)
        } else {
            Text("No disponible", style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Warning)
        }
        Text(
            "ID de YouTube: ${cancion.youtubeVideoId}",
            style = MaterialTheme.typography.labelMedium,
            color = NuclearColors.Muted,
        )
    }
}
