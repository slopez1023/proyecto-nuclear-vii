package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearLayout
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import kotlin.math.hypot

// Valores del fondo del prototipo de Figma (index.css, body):
// radial-gradient(circle at 70% -10%, rgba(139,124,255,.08), transparent 30%)
private const val FONDO_CENTRO_X = 0.7f
private const val FONDO_CENTRO_Y = -0.1f
private const val FONDO_ALPHA = 0.08f
private const val FONDO_ALCANCE = 0.3f

/** Por debajo de esta altura disponible, la cabecera y el pie de las pantallas desplazables dejan de ser fijos. */
private val ALTURA_CORTA = 480.dp

/**
 * Fondo de PONGA: canvas con el degradado violeta sutil de Figma. Debe aplicarse una sola vez, a
 * pantalla completa y **por debajo de las barras del sistema** (la raíz de la app lo hace en
 * `MainActivity`), para que el degradado llegue hasta el borde superior sin costuras.
 */
fun Modifier.fondoNuclear(): Modifier = this
    .background(NuclearColors.Canvas)
    .drawBehind {
        val centro = Offset(size.width * FONDO_CENTRO_X, size.height * FONDO_CENTRO_Y)
        // CSS usa "farthest-corner": la esquina más lejana del centro es la inferior izquierda.
        val radio = hypot(centro.x, size.height - centro.y) * FONDO_ALCANCE
        drawRect(
            Brush.radialGradient(
                colors = listOf(
                    NuclearColors.Accent.copy(alpha = FONDO_ALPHA),
                    NuclearColors.Accent.copy(alpha = 0f),
                ),
                center = centro,
                radius = radio,
            ),
        )
    }

/**
 * Indica que el anfitrión ya dibuja [fondoNuclear] a pantalla completa (la app real lo hace). Si es
 * `false` (por ejemplo en las `@Preview`), [NuclearScreen] dibuja su propio fondo.
 */
val LocalFondoGlobal = compositionLocalOf { false }

/**
 * Andamiaje común de las pantallas del cliente: contenido centrado con ancho máximo
 * ([NuclearLayout.ContentMaxWidth]) y márgenes uniformes, sobre el fondo de PONGA ([fondoNuclear]).
 *
 * Estructura (de arriba abajo): [header] fijo, cuerpo y [footer] fijo. El fondo no se mueve aunque el
 * cuerpo se desplace. No gestiona zonas seguras: `MainActivity` aplica `safeDrawingPadding()` al
 * contenido, de modo que nada queda bajo las barras del sistema aunque el fondo sí las cubra.
 *
 * @param scrollable si es true el cuerpo se desplaza cuando no cabe (tabletas en horizontal, letra
 *   grande) y, si sobra espacio, ocupa al menos todo el alto disponible, de modo que un
 *   `verticalArrangement` centrado funciona. No usar con listas perezosas (`LazyColumn`) dentro.
 *   Si además la altura disponible es corta (< 480 dp, p. ej. un teléfono en horizontal), la cabecera
 *   y el pie se desplazan junto con el cuerpo en lugar de quedar fijos.
 * @param header zona fija superior (p. ej. la marca).
 * @param footer zona fija inferior (p. ej. el botón principal, en la zona del pulgar).
 */
@Composable
fun NuclearScreen(
    modifier: Modifier = Modifier,
    scrollable: Boolean = false,
    horizontalAlignment: Alignment.Horizontal = Alignment.Start,
    verticalArrangement: Arrangement.Vertical = Arrangement.spacedBy(NuclearSpacing.Md),
    contentPadding: PaddingValues = PaddingValues(
        horizontal = NuclearLayout.ScreenMargin,
        vertical = NuclearSpacing.Lg,
    ),
    header: (@Composable () -> Unit)? = null,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val direccion = LocalLayoutDirection.current
    val inicio = contentPadding.calculateLeftPadding(direccion)
    val fin = contentPadding.calculateRightPadding(direccion)
    val arriba = contentPadding.calculateTopPadding()
    val abajo = contentPadding.calculateBottomPadding()

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .then(if (LocalFondoGlobal.current) Modifier else Modifier.fondoNuclear()),
    ) {
        // Alturas cortas (teléfono en horizontal): la cabecera y el pie fijos se comerían la pantalla,
        // así que pasan a formar parte del contenido que se desplaza.
        if (scrollable && maxHeight < ALTURA_CORTA) {
            Column(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .widthIn(max = NuclearLayout.ContentMaxWidth)
                    .fillMaxWidth()
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(contentPadding),
                horizontalAlignment = horizontalAlignment,
            ) {
                if (header != null) {
                    Box(Modifier.fillMaxWidth().padding(bottom = NuclearSpacing.Md)) { header() }
                }
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = horizontalAlignment,
                    verticalArrangement = verticalArrangement,
                    content = content,
                )
                if (footer != null) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(top = NuclearSpacing.Lg),
                        horizontalAlignment = horizontalAlignment,
                        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
                        content = footer,
                    )
                }
            }
            return@BoxWithConstraints
        }

        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .widthIn(max = NuclearLayout.ContentMaxWidth)
                .fillMaxWidth()
                .fillMaxHeight(),
        ) {
            if (header != null) {
                Box(Modifier.fillMaxWidth().padding(start = inicio, end = fin, top = arriba)) { header() }
            }

            if (scrollable) {
                BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .heightIn(min = maxHeight)
                            .padding(contentPadding),
                        horizontalAlignment = horizontalAlignment,
                        verticalArrangement = verticalArrangement,
                        content = content,
                    )
                }
            } else {
                Column(
                    modifier = Modifier.weight(1f).fillMaxWidth().padding(contentPadding),
                    horizontalAlignment = horizontalAlignment,
                    verticalArrangement = verticalArrangement,
                    content = content,
                )
            }

            if (footer != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = inicio, end = fin, bottom = abajo),
                    horizontalAlignment = horizontalAlignment,
                    verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
                    content = footer,
                )
            }
        }
    }
}
