package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import coil3.compose.SubcomposeAsyncImage
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.graphicsLayer
import android.os.SystemClock
import co.edu.cue.nuclear.cliente.ui.theme.NuclearMotion
import coil3.compose.SubcomposeAsyncImageContent

/** Por encima de esta escala de letra, la duración deja de ir sobre la miniatura. */
private const val ESCALA_DURACION_EN_LINEA = 1.5f

/** Icono de música sobre el fondo gris: se ve cuando la miniatura no existe o no se pudo descargar. */
@Composable
private fun MarcadorMiniatura() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        NuclearIcon(R.drawable.ic_music, contentDescription = null, tamano = NuclearIconSize.Lg, tint = NuclearColors.Muted)
    }
}

/**
 * Miniatura de YouTube (https://i.ytimg.com/...). Estados:
 * - cargando: solo el fondo gris;
 * - cargada: la imagen recortada para llenar el cuadro;
 * - sin URL o con error de descarga: fondo gris con un icono de música.
 */
@Composable
fun MiniaturaCancion(url: String?, modifier: Modifier = Modifier) {
    val base = modifier
        .clip(MaterialTheme.shapes.small)
        .background(NuclearColors.Surface3)
    if (url == null) {
        Box(base) { MarcadorMiniatura() }
        return
    }
    val permitidas = animacionesPermitidas()
    val inicio = remember { SystemClock.uptimeMillis() }
    SubcomposeAsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = base,
        loading = {},
        error = { MarcadorMiniatura() },
        success = {
            // Fundido solo si la imagen tardó en llegar; si ya estaba en caché (al desplazar) aparece al instante.
            val instantanea = remember { !permitidas || SystemClock.uptimeMillis() - inicio < 60 }
            val opacidad = remember { Animatable(if (instantanea) 1f else 0f) }
            LaunchedEffect(Unit) {
                if (opacidad.value < 1f) opacidad.animateTo(1f, tween(NuclearMotion.MINIATURA_MS))
            }
            SubcomposeAsyncImageContent(modifier = Modifier.graphicsLayer { alpha = opacidad.value })
        },
    )
}

/** Duración sobre la esquina de la miniatura (como en YouTube). Fondo del canvas semitransparente. */
@Composable
private fun ChipDuracion(texto: String, modifier: Modifier = Modifier) {
    Text(
        text = texto,
        style = MaterialTheme.typography.labelMedium,
        color = NuclearColors.Text,
        maxLines = 1,
        modifier = modifier
            // Para el lector de pantalla la duración va después del título y el canal (en pantalla está sobre la miniatura).
            .semantics { traversalIndex = 1f }
            .background(NuclearColors.Canvas.copy(alpha = 0.82f), RoundedCornerShape(6.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/**
 * Fila de resultado (SongItem de Figma): miniatura con la duración encima, título, canal y, si no se
 * puede reproducir, la insignia "No disponible". Las canciones no disponibles se atenúan.
 */
@Composable
fun CancionItem(cancion: Cancion, onClick: () -> Unit, modifier: Modifier = Modifier) {
    // Con letra muy grande el chip taparía la miniatura (que no crece): la duración pasa a una línea propia.
    // El texto sigue escalando con normalidad; solo cambia dónde se coloca.
    val duracionEnLinea = LocalDensity.current.fontScale > ESCALA_DURACION_EN_LINEA
    val fuente = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .efectoPulsacion(fuente, 0.98f)
            .heightIn(min = 72.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(NuclearColors.Surface)
            .border(1.dp, NuclearColors.Line, MaterialTheme.shapes.medium)
            .clickable(interactionSource = fuente, indication = LocalIndication.current, onClick = onClick)
            .semantics { isTraversalGroup = true }
            .padding(NuclearSpacing.Md),
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(96.dp).height(54.dp)) {
            MiniaturaCancion(cancion.urlMiniatura, Modifier.fillMaxSize())
            if (!duracionEnLinea) {
                ChipDuracion(
                    cancion.duracionTexto,
                    Modifier.align(Alignment.BottomEnd).padding(NuclearSpacing.Xs),
                )
            }
        }
        Column(Modifier.weight(1f).alpha(if (cancion.disponible) 1f else 0.55f)) {
            Text(
                cancion.titulo,
                style = MaterialTheme.typography.titleMedium,
                color = NuclearColors.Text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                cancion.artistaCanal,
                style = MaterialTheme.typography.bodyMedium,
                color = NuclearColors.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
            if (duracionEnLinea) {
                Row(
                    modifier = Modifier.padding(top = NuclearSpacing.Xs),
                    horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    NuclearIcon(R.drawable.ic_clock, contentDescription = null, tamano = NuclearIconSize.Sm, tint = NuclearColors.Muted)
                    Text(cancion.duracionTexto, style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Muted)
                }
            }
            if (!cancion.disponible) {
                Insignia(
                    "No disponible",
                    tono = TonoVisual.Aviso,
                    modifier = Modifier.padding(top = NuclearSpacing.Sm),
                )
            }
        }
    }
}
