package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearIconSize
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing

/**
 * Qué se sabe de una espera estimada. El valor lo calcula el backend (decisión 11A); Android solo lo presenta.
 *
 * PENDIENTE (DEP-11): hoy "el backend no lo envía" y "no puede calcularse" llegan igual (`null`) y se
 * muestran como [NoDisponible]. Si el contrato los distingue, se añade un estado propio.
 */
sealed interface EstadoTiempo {
    /** La información aún se está pidiendo. */
    data object Cargando : EstadoTiempo

    data class Disponible(val segundos: Int) : EstadoTiempo

    /** El backend no entregó el dato o no pudo calcularlo. */
    data object NoDisponible : EstadoTiempo
}

/** Convierte el valor opcional del modelo (`null` = sin dato) en el estado que muestra la interfaz. */
fun Int?.aEstadoTiempo(): EstadoTiempo = if (this == null) EstadoTiempo.NoDisponible else EstadoTiempo.Disponible(this)

/**
 * Texto de una duración aproximada para el cliente: "menos de 1 min", "aprox. 8 min", "aprox. 1 h 5 min".
 * Solo da formato al número que entrega el backend; no estima nada.
 */
fun formatearEspera(segundos: Int): String {
    if (segundos < 30) return "menos de 1 min"
    val minutos = (segundos + 30) / 60
    if (minutos < 60) return "aprox. $minutos min"
    val horas = minutos / 60
    val resto = minutos % 60
    return if (resto == 0) "aprox. $horas h" else "aprox. $horas h $resto min"
}

/**
 * Espera estimada en una línea, con reloj. Sirve para "Espera estimada" (solicitudes) y, cambiando
 * [etiqueta], para "Termina en" (canción actual).
 */
@Composable
fun TiempoEstimado(
    estado: EstadoTiempo,
    modifier: Modifier = Modifier,
    etiqueta: String = "Espera estimada",
) {
    val valor = when (estado) {
        EstadoTiempo.Cargando -> "calculando"
        is EstadoTiempo.Disponible -> formatearEspera(estado.segundos)
        EstadoTiempo.NoDisponible -> "no disponible"
    }
    Row(
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = "$etiqueta: $valor" },
        horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NuclearIcon(R.drawable.ic_clock, contentDescription = null, tamano = NuclearIconSize.Sm, tint = NuclearColors.Muted)
        when (estado) {
            EstadoTiempo.Cargando -> {
                Text("$etiqueta:", style = MaterialTheme.typography.bodyMedium, color = NuclearColors.Muted)
                ConBrillo {
                    Box(
                        Modifier
                            .width(48.dp)
                            .height(12.dp)
                            .background(NuclearColors.Surface3, RoundedCornerShape(6.dp))
                            .brillo(RoundedCornerShape(6.dp)),
                    )
                }
            }
            // Un solo texto continuo: con letra grande se ajusta a varias líneas sin dejar una palabra suelta.
            else -> Text(
                text = buildAnnotatedString {
                    withStyle(SpanStyle(color = NuclearColors.Muted)) { append("$etiqueta: ") }
                    withStyle(SpanStyle(color = if (estado is EstadoTiempo.Disponible) NuclearColors.Text else NuclearColors.Muted)) {
                        // Espacios duros: "aprox. 8 min" no se parte dejando "min" solo en otra línea.
                        append(valor.replace(' ', ' '))
                    }
                },
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
        }
    }
}
