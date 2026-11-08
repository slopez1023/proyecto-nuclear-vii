package co.edu.cue.nuclear.cliente.ui.screens.buscar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.busqueda.TipoErrorBusqueda
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.CampoBusqueda
import co.edu.cue.nuclear.cliente.ui.components.CancionItem
import co.edu.cue.nuclear.cliente.ui.components.EstadoVacio
import co.edu.cue.nuclear.cliente.ui.components.ListaEsqueleto
import co.edu.cue.nuclear.cliente.ui.components.ListaSugerencias
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import co.edu.cue.nuclear.cliente.ui.components.animacionesPermitidas
import co.edu.cue.nuclear.cliente.ui.theme.NuclearMotion

/** Pantalla "buscar" de Figma: caja de búsqueda con autocompletado y resultados. */
@Composable
fun BuscarScreen(
    estado: BuscarUiState,
    onConsultaCambio: (String) -> Unit,
    onBuscar: () -> Unit,
    onSugerencia: (String) -> Unit,
    onReintentar: () -> Unit,
    onCancion: (Cancion) -> Unit,
    modifier: Modifier = Modifier,
) {
    val foco = remember { FocusRequester() }
    // Foco (y teclado) automáticos solo al empezar a buscar. Al volver desde Detalle ya hay una consulta:
    // se muestran los resultados sin que el teclado reaparezca.
    LaunchedEffect(Unit) { if (estado.consulta.isEmpty()) foco.requestFocus() }

    NuclearScreen(modifier = modifier) {
        Text(
            "Busca una canción",
            style = TituloPantalla,
            color = NuclearColors.Text,
            modifier = Modifier.semantics { heading() },
        )

        CampoBusqueda(
            valor = estado.consulta,
            onValorChange = onConsultaCambio,
            placeholder = "Canción, artista o canal",
            descripcionLimpiar = "Limpiar búsqueda",
            onBuscar = onBuscar,
            focusRequester = foco,
        )

        // Zona bajo el campo. Las sugerencias se dibujan encima (como un menú desplegable) y ocupan como
        // máximo el espacio que deja el teclado; si son más, se desplazan dentro de su propia tarjeta.
        Box(Modifier.weight(1f).fillMaxWidth()) {
            // Fundido entre estados (inicial, cargando, resultados, vacío, error). Sin animaciones del sistema: cambio instantáneo.
            val permitidas = animacionesPermitidas()
            AnimatedContent(
                targetState = estado.resultados,
                modifier = Modifier.fillMaxSize(),
                transitionSpec = {
                    if (permitidas) {
                        (
                            fadeIn(tween(NuclearMotion.FUNDIDO_ESTADO_MS, easing = NuclearMotion.Entrada)) togetherWith
                                fadeOut(tween(NuclearMotion.FUNDIDO_RAPIDO_MS, easing = NuclearMotion.Salida))
                            ).using(SizeTransform(clip = false) { _, _ -> snap() })
                    } else {
                        EnterTransition.None togetherWith ExitTransition.None
                    }
                },
                label = "estados-buscar",
            ) { resultados ->
                ContenidoResultados(resultados, onReintentar, onCancion)
            }
            if (estado.sugerencias.isNotEmpty()) {
                ListaSugerencias(estado.sugerencias, onSugerencia, Modifier.align(Alignment.TopCenter))
            }
        }
    }
}

/** Contenido de la zona de resultados según el estado. */
@Composable
private fun ContenidoResultados(
    resultados: ResultadosUi,
    onReintentar: () -> Unit,
    onCancion: (Cancion) -> Unit,
) {
    when (resultados) {
        ResultadosUi.Inicial -> EstadoVacio(
            icono = R.drawable.ic_search,
            descripcion = "Escribe el nombre de una canción o artista para empezar.",
        )
        ResultadosUi.Cargando -> Cargando()
        is ResultadosUi.SinResultados -> EstadoVacio(
            icono = R.drawable.ic_search,
            descripcion = "No encontramos resultados para “${resultados.consulta}”. Prueba con otras palabras.",
            tono = TonoVisual.Neutro,
            anunciar = true,
        )
        is ResultadosUi.Error -> ErrorBusqueda(resultados, onReintentar)
        is ResultadosUi.Exito -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm),
            contentPadding = PaddingValues(bottom = NuclearSpacing.Sm),
        ) {
            items(resultados.canciones, key = { it.youtubeVideoId }) { cancion ->
                CancionItem(cancion, onClick = { onCancion(cancion) })
            }
        }
    }
}

/** Esqueletos con la forma de los resultados (con brillo suave), bajo el texto de estado. */
@Composable
private fun Cargando() {
    Column(verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm)) {
        Text(
            "Buscando…",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        ListaEsqueleto()
    }
}

@Composable
private fun ErrorBusqueda(error: ResultadosUi.Error, onReintentar: () -> Unit) {
    val mensaje = error.tipo.aMensaje()
    EstadoVacio(
        icono = error.tipo.icono(),
        titulo = mensaje.titulo,
        descripcion = mensaje.detalle,
        tono = error.tipo.tono(),
        anunciar = true,
        accion = if (mensaje.reintentable) {
            { BotonPrincipal("Reintentar", onReintentar) }
        } else {
            null
        },
    )
}

// Solo presentación: qué icono y tono de la paleta acompaña a cada tipo de error.
private fun TipoErrorBusqueda.icono(): Int = when (this) {
    TipoErrorBusqueda.CONEXION -> R.drawable.ic_wifi_off
    TipoErrorBusqueda.CUOTA -> R.drawable.ic_clock
    TipoErrorBusqueda.SERVICIO_NO_DISPONIBLE,
    TipoErrorBusqueda.SERVIDOR,
    TipoErrorBusqueda.CONSULTA_INVALIDA,
    -> R.drawable.ic_alert_circle
}

private fun TipoErrorBusqueda.tono(): TonoVisual = when (this) {
    TipoErrorBusqueda.CONEXION,
    TipoErrorBusqueda.CUOTA,
    TipoErrorBusqueda.CONSULTA_INVALIDA,
    -> TonoVisual.Aviso
    TipoErrorBusqueda.SERVICIO_NO_DISPONIBLE,
    TipoErrorBusqueda.SERVIDOR,
    -> TonoVisual.Peligro
}
