package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.MiVotacion
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearLayout
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing

/**
 * Qué muestra el botón de una solicitud. Se decide con `esMia` y `yaVoto` por separado: la solicitud propia
 * ya incluye su voto automático y no es un voto adicional; `yaVoto` en una ajena es solo "ya votaste", sin
 * deducir si fue manual o automático.
 */
enum class EstadoBotonVoto {
    /** Se puede votar ahora. */
    Disponible,

    /** Hay un voto en camino: el botón no admite otra pulsación. */
    EnProceso,

    /** Este dispositivo ya votó esta solicitud ajena. */
    Votado,

    /** Es una solicitud de este dispositivo: su voto automático ya está incluido. */
    TuSolicitud,

    /** Se podría votar, pero el servidor informó que este dispositivo aún no cumple el intervalo (`mi_votacion.puede_votar`). */
    Espera,

    /** No se puede votar (la solicitud ya no está pendiente). */
    NoDisponible,
}

/**
 * Presentación del botón según el estado que entregó el repositorio. [votando]: hay un voto de esta solicitud en curso.
 * [puedeVotarAhora]: `mi_votacion.puede_votar`, solo una ayuda visual (el servidor vuelve a validar siempre).
 */
fun SolicitudCola.estadoBotonVoto(votando: Boolean, puedeVotarAhora: Boolean = true): EstadoBotonVoto = when {
    votando -> EstadoBotonVoto.EnProceso
    esMia -> EstadoBotonVoto.TuSolicitud
    yaVoto -> EstadoBotonVoto.Votado
    estado != EstadoSolicitud.PENDIENTE -> EstadoBotonVoto.NoDisponible
    !puedeVotarAhora -> EstadoBotonVoto.Espera
    else -> EstadoBotonVoto.Disponible
}

/**
 * Texto para la persona sobre su turno de votar (F4). Solo comunica lo que dijo el servidor en `mi_votacion`: no calcula
 * nada. «Ya puedes…» cuando `puede_votar`; si no, cuántas canciones faltan por sonar.
 */
fun textoVotacion(votacion: MiVotacion): String = when {
    votacion.puedeVotar -> "Ya puedes pedir una canción o votar."
    votacion.cancionesRestantes <= 1 -> "Podrás pedir otra canción o votar cuando suene 1 canción más."
    else -> "Podrás pedir otra canción o votar cuando suenen ${votacion.cancionesRestantes} canciones más."
}

/** Línea informativa sobre el intervalo de votación (ver [textoVotacion]); se anuncia a los lectores de pantalla al cambiar. */
@Composable
fun InfoVotacion(votacion: MiVotacion, modifier: Modifier = Modifier) {
    val texto = textoVotacion(votacion)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NuclearIcon(
            if (votacion.puedeVotar) R.drawable.ic_check else R.drawable.ic_clock,
            contentDescription = null,
            tamano = NuclearIconSize.Sm,
            tint = if (votacion.puedeVotar) NuclearColors.Success else NuclearColors.Muted,
        )
        Text(texto, style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Text2)
    }
}

/** "1 voto", "0 votos", "3 votos". */
fun textoVotos(total: Int): String {
    val n = total.coerceAtLeast(0)
    return if (n == 1) "1 voto" else "$n votos"
}

/**
 * Indicador de progreso pequeño. Si el sistema pidió quitar animaciones (o es una vista previa) se
 * muestra un arco fijo en lugar de girar.
 */
@Composable
internal fun IndicadorProceso(color: Color, modifier: Modifier = Modifier) {
    val tamano = modifier.size(NuclearIconSize.Sm)
    if (animacionesPermitidas()) {
        CircularProgressIndicator(modifier = tamano, color = color, strokeWidth = 2.dp)
    } else {
        CircularProgressIndicator(progress = { 0.3f }, modifier = tamano, color = color, strokeWidth = 2.dp)
    }
}

/**
 * Total de votos tal como lo informa el servidor, con una barra opcional de popularidad.
 * No suma ni resta: solo muestra el número recibido.
 *
 * @param proporcion 0 a 1: votos de esta solicitud frente a la más votada de la lista; `null` oculta la barra.
 */
@Composable
fun ContadorVotos(total: Int, modifier: Modifier = Modifier, proporcion: Float? = null) {
    val n = total.coerceAtLeast(0)
    Column(modifier.semantics(mergeDescendants = true) { contentDescription = textoVotos(n) }) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Xs),
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(n.toString(), style = MaterialTheme.typography.titleLarge, color = NuclearColors.AccentStrong, maxLines = 1)
            Text(if (n == 1) "voto" else "votos", style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Muted, maxLines = 1)
        }
        if (proporcion != null) {
            Box(
                Modifier
                    .padding(top = NuclearSpacing.Xs)
                    .width(72.dp)
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(NuclearColors.Surface3),
            ) {
                Box(
                    Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(proporcion.coerceIn(0f, 1f))
                        .background(NuclearColors.Accent),
                )
            }
        }
    }
}

/**
 * Botón de voto. Solo reacciona al toque en [EstadoBotonVoto.Disponible]; mientras hay un voto en curso
 * no admite otra pulsación, y en los demás estados es una etiqueta informativa.
 *
 * @param nombreCancion para el lector de pantalla ("Votar por …").
 */
@Composable
fun BotonVoto(
    estado: EstadoBotonVoto,
    onClick: () -> Unit,
    nombreCancion: String,
    modifier: Modifier = Modifier,
) {
    val fuente = remember { MutableInteractionSource() }
    val clicable = estado == EstadoBotonVoto.Disponible
    val tono = when (estado) {
        EstadoBotonVoto.Disponible, EstadoBotonVoto.EnProceso -> TonoVisual.Acento
        EstadoBotonVoto.Votado, EstadoBotonVoto.TuSolicitud -> TonoVisual.Exito
        EstadoBotonVoto.NoDisponible, EstadoBotonVoto.Espera -> TonoVisual.Neutro
    }
    val texto = when (estado) {
        EstadoBotonVoto.Disponible -> "Votar"
        EstadoBotonVoto.EnProceso -> "Votando…"
        EstadoBotonVoto.Votado -> "Votaste"
        EstadoBotonVoto.TuSolicitud -> "Tu solicitud"
        EstadoBotonVoto.Espera -> "Aún no"
        EstadoBotonVoto.NoDisponible -> "No votable"
    }
    val descripcion = when (estado) {
        EstadoBotonVoto.Disponible -> "Votar por $nombreCancion"
        EstadoBotonVoto.EnProceso -> "Registrando tu voto por $nombreCancion"
        EstadoBotonVoto.Votado -> "Ya votaste por $nombreCancion"
        EstadoBotonVoto.TuSolicitud -> "Solicitaste $nombreCancion y tu voto ya está incluido"
        EstadoBotonVoto.Espera -> "Aún no puedes votar por $nombreCancion: tienen que sonar más canciones"
        EstadoBotonVoto.NoDisponible -> "$nombreCancion ya no se puede votar"
    }
    val estilo = tono.estilo()
    val forma = RoundedCornerShape(50)
    Row(
        modifier = modifier
            .then(if (clicable) Modifier.efectoPulsacion(fuente, 0.96f) else Modifier)
            .heightIn(min = NuclearLayout.MinTouchTarget)
            .widthIn(min = 104.dp)
            .clip(forma)
            .background(estilo.fondo, forma)
            .border(1.dp, estilo.borde, forma)
            .then(
                if (clicable) {
                    Modifier.clickable(
                        interactionSource = fuente,
                        indication = LocalIndication.current,
                        role = Role.Button,
                        onClick = onClick,
                    )
                } else {
                    Modifier
                },
            )
            .semantics(mergeDescendants = true) {
                contentDescription = descripcion
                if (estado == EstadoBotonVoto.EnProceso) {
                    stateDescription = "En proceso"
                    disabled()
                }
            }
            .padding(horizontal = NuclearSpacing.Lg, vertical = NuclearSpacing.Sm),
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (estado) {
            EstadoBotonVoto.EnProceso -> IndicadorProceso(estilo.contenido)
            EstadoBotonVoto.Votado, EstadoBotonVoto.TuSolicitud ->
                NuclearIcon(R.drawable.ic_check, contentDescription = null, tamano = NuclearIconSize.Sm, tint = estilo.contenido)
            else -> Unit
        }
        Text(texto, style = MaterialTheme.typography.labelLarge, color = estilo.contenido)
    }
}
