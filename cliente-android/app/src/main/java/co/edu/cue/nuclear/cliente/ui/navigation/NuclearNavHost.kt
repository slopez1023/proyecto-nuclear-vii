package co.edu.cue.nuclear.cliente.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import co.edu.cue.nuclear.cliente.AppContainer
import co.edu.cue.nuclear.cliente.data.sesion.MotivoRechazo
import co.edu.cue.nuclear.cliente.ui.screens.acceso.AccesoEstado
import co.edu.cue.nuclear.cliente.ui.screens.acceso.AccesoScreen
import co.edu.cue.nuclear.cliente.ui.screens.acceso.AccesoViewModel
import co.edu.cue.nuclear.cliente.ui.screens.acceso.QrInvalidoScreen
import co.edu.cue.nuclear.cliente.ui.screens.buscar.BuscarScreen
import co.edu.cue.nuclear.cliente.ui.screens.buscar.BuscarViewModel
import co.edu.cue.nuclear.cliente.ui.screens.detalle.DetalleScreen
import co.edu.cue.nuclear.cliente.ui.screens.inicio.InicioScreen
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import co.edu.cue.nuclear.cliente.ui.theme.NuclearMotion
import co.edu.cue.nuclear.cliente.ui.theme.animacionesActivas

/**
 * @param token token del QR recibido por App Link (null si la app se abrió sin enlace).
 */
@Composable
fun NuclearNavHost(
    token: String?,
    contenedor: AppContainer,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()
    val contexto = LocalContext.current
    val desplazamiento = with(LocalDensity.current) { NuclearMotion.DESPLAZAMIENTO_NAVEGACION.roundToPx() }
    val duracionEntrada = tween<Float>(NuclearMotion.ENTRADA_MS, easing = NuclearMotion.Entrada)
    val duracionSalida = tween<Float>(NuclearMotion.SALIDA_MS, easing = NuclearMotion.Salida)
    val desplazar = tween<IntOffset>(NuclearMotion.ENTRADA_MS, easing = NuclearMotion.Entrada)
    // Transiciones solo visuales (ni rutas ni pila de navegación cambian). Sin animaciones del sistema: instantáneas.
    NavHost(
        navController = navController,
        startDestination = Destinos.ACCESO,
        modifier = modifier,
        enterTransition = {
            when {
                !animacionesActivas(contexto) -> EnterTransition.None
                // De Acceso a Inicio o QR inválido: solo fundido, sin desplazamiento.
                initialState.destination.route == Destinos.ACCESO -> fadeIn(duracionEntrada)
                else -> fadeIn(duracionEntrada) +
                    slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Start, desplazar) { desplazamiento }
            }
        },
        exitTransition = {
            if (animacionesActivas(contexto)) fadeOut(duracionSalida) else ExitTransition.None
        },
        popEnterTransition = {
            if (animacionesActivas(contexto)) {
                fadeIn(duracionEntrada) +
                    slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.End, desplazar) { desplazamiento }
            } else {
                EnterTransition.None
            }
        },
        popExitTransition = {
            if (animacionesActivas(contexto)) fadeOut(duracionSalida) else ExitTransition.None
        },
    ) {
        composable(Destinos.ACCESO) {
            val viewModel: AccesoViewModel = viewModel(key = "acceso-$token") {
                AccesoViewModel(
                    token, contenedor.sesiones, contenedor.dispositivos, contenedor.eventos, contenedor.sesionActiva,
                )
            }
            val estado by viewModel.estado.collectAsState()

            LaunchedEffect(estado) {
                val actual = estado
                if (actual is AccesoEstado.Rechazado) {
                    navController.navigate(Destinos.qrInvalido(actual.motivo)) {
                        popUpTo(Destinos.ACCESO) { inclusive = true }
                    }
                }
            }

            AccesoScreen(
                estado = estado,
                onEntrar = {
                    navController.navigate(Destinos.INICIO) { popUpTo(Destinos.ACCESO) { inclusive = true } }
                },
                onReintentar = viewModel::reintentar,
            )
        }
        composable(
            route = Destinos.QR_INVALIDO,
            arguments = listOf(navArgument(Destinos.ARG_MOTIVO) { type = NavType.StringType }),
        ) { entrada ->
            val motivo = MotivoRechazo.desdeCodigo(entrada.arguments?.getString(Destinos.ARG_MOTIVO))
                ?: MotivoRechazo.TOKEN_INVALIDO
            QrInvalidoScreen(motivo)
        }
        composable(Destinos.INICIO) {
            InicioScreen(onBuscar = { navController.navigate(Destinos.BUSCAR) })
        }
        composable(Destinos.BUSCAR) {
            val viewModel: BuscarViewModel = viewModel {
                BuscarViewModel(contenedor.busqueda, contenedor.eventos, contenedor.sesionActiva)
            }
            val estado by viewModel.estado.collectAsState()
            BuscarScreen(
                estado = estado,
                onConsultaCambio = viewModel::onConsultaCambio,
                onBuscar = viewModel::buscar,
                onSugerencia = viewModel::elegirSugerencia,
                onReintentar = viewModel::reintentar,
                onCancion = { navController.navigate(Destinos.detalle(it.youtubeVideoId)) },
            )
        }
        composable(
            route = Destinos.DETALLE,
            arguments = listOf(navArgument(Destinos.ARG_VIDEO_ID) { type = NavType.StringType }),
        ) { entrada ->
            val id = entrada.arguments?.getString(Destinos.ARG_VIDEO_ID)
            DetalleScreen(cancion = id?.let(contenedor.busqueda::cancionPorId))
        }
    }
}
