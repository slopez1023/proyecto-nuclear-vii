package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import coil3.compose.AsyncImage

/** Miniatura de YouTube (https://i.ytimg.com/...) con fondo mientras carga o si falta. */
@Composable
fun MiniaturaCancion(url: String?, modifier: Modifier = Modifier) {
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier
            .clip(MaterialTheme.shapes.small)
            .background(NuclearColors.Surface3),
    )
}

/** Fila de resultado (SongItem de Figma): miniatura, título, canal y duración. */
@Composable
fun CancionItem(cancion: Cancion, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(NuclearColors.Surface)
            .border(1.dp, NuclearColors.Line, MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MiniaturaCancion(cancion.urlMiniatura, Modifier.width(96.dp).height(54.dp))
        Column(Modifier.weight(1f).alpha(if (cancion.disponible) 1f else 0.55f)) {
            Text(
                cancion.titulo,
                style = MaterialTheme.typography.titleMedium,
                color = NuclearColors.Text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${cancion.artistaCanal} · ${cancion.duracionTexto}",
                style = MaterialTheme.typography.bodyMedium,
                color = NuclearColors.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
            if (!cancion.disponible) {
                Text(
                    "No disponible",
                    style = MaterialTheme.typography.labelMedium,
                    color = NuclearColors.Warning,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}
