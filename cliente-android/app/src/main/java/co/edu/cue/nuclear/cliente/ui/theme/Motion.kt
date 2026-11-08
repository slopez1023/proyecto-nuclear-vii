package co.edu.cue.nuclear.cliente.ui.theme

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.ui.unit.dp

/**
 * Tokens de movimiento de PONGA. Todas las animaciones comparten estos tiempos y curvas para que la app
 * tenga un único ritmo: entradas de ~200 ms con curva suave, salidas más cortas, y solo opacidad y
 * desplazamientos/escalas pequeños (nada que cambie el tamaño del diseño).
 */
object NuclearMotion {
    /** Transición entre pantallas: entra la nueva. */
    const val ENTRADA_MS = 220

    /** Transición entre pantallas: sale la anterior (más corta, para sentirse ágil). */
    const val SALIDA_MS = 120

    /** Aparición escalonada del contenido de una pantalla. */
    const val APARICION_MS = 200

    /** Retraso entre un bloque y el siguiente en la aparición escalonada. */
    const val DESFASE_MS = 30

    /** Fundido entre los estados de Buscar (inicial, cargando, resultados, vacío, error). */
    const val FUNDIDO_ESTADO_MS = 180

    /** Fundidos pequeños (botón ✕). */
    const val FUNDIDO_RAPIDO_MS = 120

    /** Transición visual del foco del campo de búsqueda. */
    const val FOCO_MS = 150

    /** Pulsación: al presionar baja rápido, al soltar recupera un poco más despacio. */
    const val PULSAR_BAJA_MS = 90
    const val PULSAR_SUBE_MS = 140

    /** Fundido de la miniatura cuando llega la imagen. */
    const val MINIATURA_MS = 180

    /** El resplandor del logo se "enciende" una sola vez. */
    const val RESPLANDOR_MS = 700

    /** Una pasada del brillo de los esqueletos. */
    const val BRILLO_MS = 1400

    val Entrada = FastOutSlowInEasing
    val Salida = FastOutLinearInEasing

    /** Desplazamiento discreto de las transiciones entre pantallas. */
    val DESPLAZAMIENTO_NAVEGACION = 24.dp

    /** Desplazamiento de la aparición escalonada. */
    val DESPLAZAMIENTO_APARICION = 12.dp
}

/**
 * Indica si el sistema permite animaciones. Android lo desactiva con "Quitar animaciones" (accesibilidad)
 * o `animator_duration_scale = 0`; en ese caso PONGA no anima nada: todo queda en su estado final al
 * instante. Se lee en el momento de cada animación, así que un cambio del ajuste se nota enseguida.
 */
fun animacionesActivas(contexto: Context): Boolean =
    runCatching {
        Settings.Global.getFloat(contexto.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }.getOrDefault(true)
