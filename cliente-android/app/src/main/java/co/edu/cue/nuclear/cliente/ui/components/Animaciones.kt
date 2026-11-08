package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearMotion
import co.edu.cue.nuclear.cliente.ui.theme.animacionesActivas
import kotlinx.coroutines.delay

/**
 * `true` si se pueden animar cosas ahora mismo: el sistema no las tiene desactivadas y no estamos en una
 * vista previa de Android Studio. Si es `false`, todo debe quedar en su estado final al instante.
 */
@Composable
fun animacionesPermitidas(): Boolean {
    val contexto = LocalContext.current
    return !LocalInspectionMode.current && animacionesActivas(contexto)
}

/**
 * Aparición suave del contenido (opacidad y 12 dp hacia arriba), escalonada con [orden] (30 ms por
 * posición). Ocurre **una sola vez** por pantalla: no se repite al rotar ni al volver atrás. Solo usa
 * `graphicsLayer`, así que no cambia el diseño ni lo que ve un lector de pantalla.
 */
@Composable
fun Modifier.aparicion(orden: Int = 0): Modifier {
    val permitidas = animacionesPermitidas()
    var yaAparecio by rememberSaveable { mutableStateOf(!permitidas) }
    val progreso = remember { Animatable(if (yaAparecio) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (!yaAparecio) {
            if (permitidas) {
                delay((orden * NuclearMotion.DESFASE_MS).toLong())
                progreso.animateTo(1f, tween(NuclearMotion.APARICION_MS, easing = NuclearMotion.Entrada))
            } else {
                progreso.snapTo(1f)
            }
            yaAparecio = true
        }
    }
    val desplazamiento = with(LocalDensity.current) { NuclearMotion.DESPLAZAMIENTO_APARICION.toPx() }
    return graphicsLayer {
        alpha = progreso.value
        translationY = (1f - progreso.value) * desplazamiento
    }
}

/**
 * Pulsación: el elemento se encoge un poco mientras se mantiene presionado y recupera su tamaño al soltar.
 * [fuente] debe ser la misma `MutableInteractionSource` que usa el `clickable`/`Button`. La ondulación
 * (ripple) propia de Material se conserva.
 */
@Composable
fun Modifier.efectoPulsacion(fuente: InteractionSource, escala: Float = 0.98f): Modifier {
    if (!animacionesPermitidas()) return this
    val presionado by fuente.collectIsPressedAsState()
    val actual by animateFloatAsState(
        targetValue = if (presionado) escala else 1f,
        animationSpec = tween(if (presionado) NuclearMotion.PULSAR_BAJA_MS else NuclearMotion.PULSAR_SUBE_MS),
        label = "pulsacion",
    )
    return graphicsLayer {
        scaleX = actual
        scaleY = actual
    }
}

/**
 * Fase (0 a 1) del brillo que recorre los esqueletos; un valor negativo significa "sin brillo". La da
 * [ListaEsqueleto]: una sola animación compartida por todas las filas, que existe solo mientras haya
 * esqueletos en pantalla.
 */
internal val LocalFaseBrillo = compositionLocalOf<() -> Float> { { -1f } }

private val COLOR_BRILLO = NuclearColors.LineStrong.copy(alpha = 0.55f)

/** Brillo suave que cruza el elemento de izquierda a derecha. Se dibuja en la fase de dibujo (sin recomponer). */
@Composable
internal fun Modifier.brillo(forma: Shape): Modifier {
    val fase = LocalFaseBrillo.current
    return clip(forma).drawWithContent {
        drawContent()
        val f = fase()
        if (f >= 0f) {
            val ancho = size.width
            val inicio = -ancho + f * ancho * 3f
            drawRect(
                Brush.linearGradient(
                    colors = listOf(Color.Transparent, COLOR_BRILLO, Color.Transparent),
                    start = Offset(inicio, 0f),
                    end = Offset(inicio + ancho, 0f),
                ),
            )
        }
    }
}

/** Ejecuta [contenido] con la animación de brillo de los esqueletos (o sin brillo si no se permiten animaciones). */
@Composable
internal fun ConBrillo(contenido: @Composable () -> Unit) {
    if (animacionesPermitidas()) {
        val transicion = rememberInfiniteTransition(label = "brillo")
        val fase by transicion.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(NuclearMotion.BRILLO_MS, easing = LinearEasing), RepeatMode.Restart),
            label = "fase",
        )
        CompositionLocalProvider(LocalFaseBrillo provides { fase }, contenido)
    } else {
        contenido()
    }
}
