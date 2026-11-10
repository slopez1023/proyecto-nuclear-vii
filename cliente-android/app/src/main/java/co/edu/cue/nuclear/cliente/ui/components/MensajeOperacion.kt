package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.cola.MotivoRechazoOperacion
import co.edu.cue.nuclear.cliente.data.cola.ResultadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ResultadoVoto
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearLayout
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing

/**
 * Texto y tono de un aviso al cliente. Sin códigos HTTP, excepciones ni nombres técnicos.
 * [enProceso] muestra un indicador de progreso en lugar del icono.
 */
data class MensajeUi(
    val tono: TonoVisual,
    val titulo: String,
    val detalle: String? = null,
    val enProceso: Boolean = false,
)

/** Avisos fijos que no dependen de un resultado. */
object MensajesOperacion {
    val EnviandoSolicitud = MensajeUi(TonoVisual.Neutro, "Enviando tu solicitud…", enProceso = true)
    val RegistrandoVoto = MensajeUi(TonoVisual.Neutro, "Registrando tu voto…", enProceso = true)
    val InformacionNoDisponible = MensajeUi(
        TonoVisual.Neutro,
        "Información no disponible",
        "Por ahora no tenemos estos datos. Inténtalo de nuevo en unos segundos.",
    )
}

private fun textoFaltantes(faltantes: Int?): String? = when {
    faltantes == null || faltantes <= 0 -> null
    faltantes == 1 -> "Falta 1 canción por sonar."
    else -> "Faltan $faltantes canciones por sonar."
}

private fun MotivoRechazoOperacion.aMensaje(faltantes: Int?, esVoto: Boolean): MensajeUi = when (this) {
    MotivoRechazoOperacion.INTERVALO_NO_CUMPLIDO -> MensajeUi(
        TonoVisual.Aviso,
        if (esVoto) "Todavía no puedes votar" else "Todavía no puedes pedir otra canción",
        listOfNotNull(
            "Espera a que suenen más canciones.",
            textoFaltantes(faltantes),
        ).joinToString(" "),
    )
    MotivoRechazoOperacion.VOTO_DUPLICADO -> MensajeUi(
        TonoVisual.Aviso,
        "Ya votaste esta canción",
        "Cada persona puede votar una sola vez por canción.",
    )
    MotivoRechazoOperacion.SOLICITUD_NO_VOTABLE -> MensajeUi(
        TonoVisual.Aviso,
        "Esta canción ya no está en espera",
        "Ya empezó a sonar o salió de la cola, así que no se puede votar.",
    )
    MotivoRechazoOperacion.CANCION_NO_DISPONIBLE -> MensajeUi(
        TonoVisual.Aviso,
        "Canción no disponible",
        "No se puede pedir esa canción en este momento. Prueba con otra.",
    )
}

fun TipoErrorCola.aMensaje(): MensajeUi = when (this) {
    TipoErrorCola.CONEXION -> MensajeUi(
        TonoVisual.Peligro,
        "Sin conexión",
        "No pudimos comunicarnos con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    )
    TipoErrorCola.SERVIDOR -> MensajeUi(
        TonoVisual.Peligro,
        "Algo salió mal",
        "No pudimos completar la operación. Inténtalo de nuevo en unos segundos.",
    )
    TipoErrorCola.SESION_NO_DISPONIBLE -> MensajeUi(
        TonoVisual.Aviso,
        "Sesión no disponible",
        "Esta sesión ya no está activa. Escanea de nuevo el código QR del establecimiento.",
    )
    TipoErrorCola.SERVICIO_NO_DISPONIBLE -> MensajeUi(
        TonoVisual.Aviso,
        "Servicio no disponible",
        "No pudimos validar la canción en este momento. Inténtalo de nuevo en unos minutos.",
    )
    TipoErrorCola.SIN_CONFIRMAR -> MensajeUi(
        TonoVisual.Aviso,
        "No pudimos confirmar tu acción",
        "No sabemos si se registró. Revisa la cola antes de intentarlo de nuevo.",
    )
}

/** Confirmación o rechazo de una solicitud. */
fun ResultadoSolicitud.aMensaje(): MensajeUi = when (this) {
    is ResultadoSolicitud.Aceptada ->
        if (sumoVotoAExistente) {
            MensajeUi(
                TonoVisual.Exito,
                "Tu voto se sumó",
                "Esa canción ya estaba en la cola o sonando, así que sumamos tu voto en lugar de repetirla.",
            )
        } else {
            // La solicitud ya incluye un voto automático; no se presenta como un voto adicional.
            MensajeUi(TonoVisual.Exito, "Canción solicitada", "Quedó en la cola y ya cuenta con tu voto.")
        }
    is ResultadoSolicitud.Rechazada -> motivo.aMensaje(faltantes, esVoto = false)
    is ResultadoSolicitud.Error -> tipo.aMensaje()
}

/** Confirmación o rechazo de un voto manual. */
fun ResultadoVoto.aMensaje(): MensajeUi = when (this) {
    is ResultadoVoto.Registrado -> MensajeUi(TonoVisual.Exito, "Voto registrado", "Gracias por votar.")
    is ResultadoVoto.Rechazado -> motivo.aMensaje(faltantes, esVoto = true)
    is ResultadoVoto.Error -> tipo.aMensaje()
}

/**
 * Aviso sobre una operación (confirmación, rechazo, error o "en proceso"). Se anuncia a los lectores
 * de pantalla al aparecer. [onCerrar] muestra una X; sin ella el aviso lo retira quien lo muestra.
 */
@Composable
fun MensajeOperacion(
    mensaje: MensajeUi,
    modifier: Modifier = Modifier,
    onCerrar: (() -> Unit)? = null,
) {
    val estilo = mensaje.tono.estilo()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite }
            .background(estilo.fondo, MaterialTheme.shapes.medium)
            .border(1.dp, estilo.borde, MaterialTheme.shapes.medium)
            .padding(start = NuclearSpacing.Md, top = NuclearSpacing.Md, bottom = NuclearSpacing.Md, end = NuclearSpacing.Sm),
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        verticalAlignment = Alignment.Top,
    ) {
        if (mensaje.enProceso) {
            IndicadorProceso(estilo.contenido, Modifier.padding(top = 2.dp))
        } else {
            val icono = if (mensaje.tono == TonoVisual.Exito) R.drawable.ic_check else R.drawable.ic_alert_circle
            NuclearIcon(icono, contentDescription = null, tamano = NuclearIconSize.Md, tint = estilo.contenido)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Xs)) {
            Text(mensaje.titulo, style = MaterialTheme.typography.titleMedium, color = NuclearColors.Text)
            if (mensaje.detalle != null) {
                Text(mensaje.detalle, style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Text2)
            }
        }
        if (onCerrar != null) {
            Box(
                modifier = Modifier
                    .size(NuclearLayout.MinTouchTarget)
                    .clickable(role = Role.Button, onClick = onCerrar),
                contentAlignment = Alignment.Center,
            ) {
                NuclearIcon(R.drawable.ic_close, contentDescription = "Cerrar aviso", tamano = NuclearIconSize.Md, tint = NuclearColors.Muted)
            }
        }
    }
}
