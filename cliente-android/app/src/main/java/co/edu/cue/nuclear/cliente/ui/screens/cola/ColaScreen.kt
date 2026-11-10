package co.edu.cue.nuclear.cliente.ui.screens.cola

import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.TipoErrorCola
import co.edu.cue.nuclear.cliente.ui.components.BarraSuperior
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.ElementoCola
import co.edu.cue.nuclear.cliente.ui.components.EstadoVacio
import co.edu.cue.nuclear.cliente.ui.components.ListaEsqueleto
import co.edu.cue.nuclear.cliente.ui.components.MensajeOperacion
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.components.TarjetaAhoraSuena
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.components.aMensaje
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla

/**
 * Cola de reproducción del establecimiento (E4): la canción que suena, las solicitudes en espera con
 * sus votos y el botón de voto. Solo muestra lo que entrega el repositorio.
 *
 * La flecha de volver usa el retroceso del sistema, igual que el detalle.
 */
@Composable
fun ColaScreen(
    estado: ColaUiState,
    onVotar: (String) -> Unit,
    onReintentar: () -> Unit,
    onCerrarMensaje: () -> Unit,
    modifier: Modifier = Modifier,
    onVolver: (() -> Unit)? = null,
    onBuscar: (() -> Unit)? = null,
) {
    val despachadorAtras = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    NuclearScreen(
        modifier = modifier,
        scrollable = true,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
        header = {
            BarraSuperior(
                descripcionVolver = "Volver",
                onVolver = onVolver ?: { despachadorAtras?.onBackPressed(); Unit },
            )
        },
        // El aviso va en el pie fijo: así se ve aunque la lista esté desplazada (probado en el celular).
        footer = estado.mensaje?.let { mensaje -> { MensajeOperacion(mensaje, onCerrar = onCerrarMensaje) } },
        // También en horizontal: si el aviso se moviera al final de la lista, no se vería al votar (probado en el celular).
        mantenerCabeceraYPieFijos = true,
    ) {
        Text(
            "Cola de reproducción",
            style = TituloPantalla,
            color = NuclearColors.Text,
            modifier = Modifier.semantics { heading() },
        )

        when (val carga = estado.carga) {
            CargaCola.Cargando -> Cargando()
            CargaCola.Vacia -> EstadoVacio(
                icono = R.drawable.ic_music,
                titulo = "La cola está vacía",
                descripcion = "Todavía no hay canciones. Busca una y sé el primero en pedirla.",
                anunciar = true,
                accion = botonBuscar(onBuscar),
            )
            is CargaCola.Error -> ErrorCola(carga.tipo, onReintentar)
            is CargaCola.Exito -> Contenido(
                cola = carga.estado,
                votando = estado.votando,
                onVotar = onVotar,
                destacada = idDestacadoEnLista(carga, estado.solicitudDestacada),
                onBuscar = onBuscar,
            )
        }
    }
}

@Composable
private fun Cargando() {
    Column(verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm)) {
        Text(
            "Cargando la cola…",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        ListaEsqueleto(cantidad = 3)
    }
}

@Composable
private fun ErrorCola(tipo: TipoErrorCola, onReintentar: () -> Unit) {
    val mensaje = tipo.aMensaje()
    EstadoVacio(
        icono = if (tipo == TipoErrorCola.CONEXION) R.drawable.ic_wifi_off else R.drawable.ic_alert_circle,
        titulo = mensaje.titulo,
        descripcion = mensaje.detalle.orEmpty(),
        tono = if (tipo == TipoErrorCola.CONEXION) TonoVisual.Aviso else TonoVisual.Peligro,
        anunciar = true,
        accion = { BotonPrincipal("Reintentar", onReintentar) },
    )
}

/** Botón "Buscar una canción" de los estados vacíos; sin destino (`null`) no se ofrece. */
private fun botonBuscar(onBuscar: (() -> Unit)?): (@Composable ColumnScope.() -> Unit)? =
    onBuscar?.let { buscar -> { BotonPrincipal("Buscar una canción", buscar) } }

/**
 * La solicitud destacada solo cuenta si está en la lista de espera (si ya suena o se fue, no hay a qué
 * desplazarse ni qué resaltar).
 */
internal fun idDestacadoEnLista(carga: CargaCola, destacado: String?): String? =
    if (destacado != null && carga is CargaCola.Exito && carga.estado.cola.any { it.idSolicitud == destacado }) destacado else null

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Contenido(
    cola: EstadoCola,
    votando: Set<String>,
    onVotar: (String) -> Unit,
    destacada: String?,
    onBuscar: (() -> Unit)?,
) {
    // Lleva la vista a la solicitud destacada una sola vez, aunque esté al final de la lista.
    val requester = remember { BringIntoViewRequester() }
    var yaDesplazada by rememberSaveable(destacada) { mutableStateOf(false) }
    LaunchedEffect(destacada) {
        if (destacada != null && !yaDesplazada) {
            withFrameNanos { } // espera a que la lista esté medida
            requester.bringIntoView()
            yaDesplazada = true
        }
    }

    cola.reproduccionActual?.let { TarjetaAhoraSuena(it) }

    Text(
        "En espera",
        style = MaterialTheme.typography.titleMedium,
        color = NuclearColors.Text2,
        modifier = Modifier.semantics { heading() },
    )
    if (cola.cola.isEmpty()) {
        EstadoVacio(
            icono = R.drawable.ic_music,
            descripcion = "No hay canciones en espera. Busca una y pídela.",
            accion = botonBuscar(onBuscar),
        )
        return
    }
    // La barra de popularidad compara con la solicitud más votada de esta lista (solo presentación).
    val maximo = cola.cola.maxOf { it.totalVotos }.coerceAtLeast(1).toFloat()
    cola.cola.forEach { solicitud ->
        ElementoCola(
            solicitud = solicitud,
            votando = solicitud.idSolicitud in votando,
            onVotar = { onVotar(solicitud.idSolicitud) },
            modifier = if (solicitud.idSolicitud == destacada) Modifier.bringIntoViewRequester(requester) else Modifier,
            proporcionPopularidad = solicitud.totalVotos / maximo,
            resaltada = solicitud.idSolicitud == destacada,
        )
    }
}
