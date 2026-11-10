package co.edu.cue.nuclear.cliente.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import co.edu.cue.nuclear.cliente.AppContainer
import co.edu.cue.nuclear.cliente.data.sesion.ResultadoRestauracion

/**
 * Qué hacer cuando una pantalla que necesita sesión se muestra sin ella (p. ej. Navigation restauró la pila tras
 * recrearse el proceso): [onSinSesion] lleva a Acceso; [onLista] avisa que ya hay una sesión confirmada.
 */
class PuertaSesion(
    val contenedor: AppContainer,
    val onSinSesion: () -> Unit,
    val onLista: () -> Unit,
)

/** Rutas que existen solo con una sesión activa. */
val RUTAS_CON_SESION = setOf(Destinos.INICIO, Destinos.BUSCAR, Destinos.DETALLE, Destinos.COLA, Destinos.CONFIRMACION)

/**
 * Como `composable`, pero no muestra la pantalla hasta confirmar que hay sesión: si el store está vacío intenta
 * recuperarla del DataStore y VALIDARLA con el servidor; si no se confirma, regresa a Acceso.
 */
fun NavGraphBuilder.conSesion(
    puerta: PuertaSesion,
    route: String,
    arguments: List<NamedNavArgument> = emptyList(),
    content: @Composable (NavBackStackEntry) -> Unit,
) {
    composable(route, arguments) { entrada ->
        var lista by remember { mutableStateOf(puerta.contenedor.sesionActiva.actual != null) }
        LaunchedEffect(Unit) {
            if (!lista) {
                if (puerta.contenedor.restauradorSesion.restaurar() is ResultadoRestauracion.Restaurada) {
                    lista = true
                } else {
                    puerta.onSinSesion()
                }
            }
            if (puerta.contenedor.sesionActiva.actual != null) puerta.onLista()
        }
        if (lista) content(entrada) else Box(Modifier.fillMaxSize())
    }
}
