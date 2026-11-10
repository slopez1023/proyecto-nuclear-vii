package co.edu.cue.nuclear.cliente.ui.screens.detalle

import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.ui.components.BarraSuperior
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.BotonSecundario
import co.edu.cue.nuclear.cliente.data.cola.MiVotacion
import co.edu.cue.nuclear.cliente.ui.components.InfoVotacion
import co.edu.cue.nuclear.cliente.ui.components.MensajeOperacion
import co.edu.cue.nuclear.cliente.ui.components.MensajeUi
import co.edu.cue.nuclear.cliente.ui.components.EstadoVacio
import co.edu.cue.nuclear.cliente.ui.components.Insignia
import co.edu.cue.nuclear.cliente.ui.components.MiniaturaCancion
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import co.edu.cue.nuclear.cliente.ui.components.aparicion

/**
 * Pantalla "detalle" de Figma: información y miniatura de la canción (B05).
 * Solicitar la canción (E4) aparece solo si se pasa [onSolicitar], es decir, si hay cola disponible.
 *
 * La flecha de volver usa el mismo retroceso que el gesto del sistema (el despachador de "atrás" de la
 * actividad), que `NavHost` ya intercepta: no requiere cambiar la navegación.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DetalleScreen(
    cancion: Cancion?,
    modifier: Modifier = Modifier,
    onSolicitar: (() -> Unit)? = null,
    solicitando: Boolean = false,
    mensaje: MensajeUi? = null,
    onCerrarMensaje: () -> Unit = {},
    onVerCola: (() -> Unit)? = null,
    estadoEnCola: EstadoCancionEnCola = EstadoCancionEnCola.Desconocido,
    /** `mi_votacion` de la última cola: si aún no puede pedir, se le avisa antes de pulsar «Solicitar». */
    votacion: MiVotacion? = null,
) {
    val despachadorAtras = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher

    NuclearScreen(
        modifier = modifier,
        scrollable = true,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Lg),
        header = {
            BarraSuperior(
                descripcionVolver = "Volver a resultados",
                onVolver = { despachadorAtras?.onBackPressed() },
            )
        },
        // E4: solicitar la canción. Solo si hay cola disponible y la canción se puede reproducir.
        footer = if (cancion != null && onSolicitar != null) {
            {
                mensaje?.let { MensajeOperacion(it, onCerrar = onCerrarMensaje) }
                if (estadoEnCola.yaEstaEnLaCola) {
                    // Ya hay una solicitud pendiente o suena: no se ofrece otra desde aquí. Es solo una pista con la
                    // última cola recibida; el servidor sigue decidiendo qué se acepta.
                    if (onVerCola != null) BotonPrincipal("Ver la cola", onVerCola)
                } else {
                    if (cancion.disponible && votacion != null && !votacion.puedeVotar) InfoVotacion(votacion)
                    if (cancion.disponible) {
                        BotonPrincipal(
                            texto = if (solicitando) "Enviando solicitud…" else "Solicitar esta canción",
                            onClick = onSolicitar,
                            habilitado = !solicitando,
                        )
                    }
                    if (onVerCola != null) BotonSecundario("Ver la cola", onVerCola)
                }
            }
        } else {
            null
        },
    ) {
        if (cancion == null) {
            EstadoVacio(
                icono = R.drawable.ic_alert_circle,
                modifier = Modifier.aparicion(0),
                titulo = "Canción no encontrada",
                descripcion = "Vuelve a la búsqueda y selecciona la canción de nuevo.",
                tono = TonoVisual.Aviso,
            )
            return@NuclearScreen
        }

        val forma = MaterialTheme.shapes.large
        Box(
            Modifier
                .aparicion(0)
                .fillMaxWidth()
                // Con la tarjeta de estado en la cola la miniatura es algo más baja, para que quepa todo sin desplazar.
                .aspectRatio(if (estadoEnCola.textos() != null) 2f else 16f / 9f)
                .clip(forma)
                .border(1.dp, NuclearColors.Line, forma),
        ) {
            MiniaturaCancion(cancion.urlMiniatura, Modifier.fillMaxSize())
        }

        Column(Modifier.aparicion(1), verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Xs)) {
            Text(
                cancion.titulo,
                style = TituloPantalla,
                color = NuclearColors.Text,
                modifier = Modifier.semantics { heading() },
            )
            Text(cancion.artistaCanal, style = MaterialTheme.typography.titleMedium, color = NuclearColors.Text2)
        }

        FlowRow(
            modifier = Modifier.aparicion(2),
            horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm),
            verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm),
        ) {
            Insignia("Duración ${cancion.duracionTexto}", tono = TonoVisual.Neutro)
            if (cancion.disponible) {
                Insignia("Disponible para reproducir", tono = TonoVisual.Exito, conPunto = true)
            } else {
                Insignia("No disponible", tono = TonoVisual.Aviso, conPunto = true)
            }
        }

        // Estado de la canción en la cola (en la cola, solicitada por ti o sonando); no aparece si está disponible.
        TarjetaEstadoEnCola(estadoEnCola, Modifier.aparicion(3))
    }
}
