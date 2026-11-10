package co.edu.cue.nuclear.cliente.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
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
import co.edu.cue.nuclear.cliente.ui.screens.cola.ColaScreen
import co.edu.cue.nuclear.cliente.ui.screens.confirmacion.ConfirmacionScreen
import co.edu.cue.nuclear.cliente.ui.screens.cola.ColaViewModel
import co.edu.cue.nuclear.cliente.ui.screens.detalle.DetalleScreen
import co.edu.cue.nuclear.cliente.ui.screens.detalle.EstadoCancionEnCola
import co.edu.cue.nuclear.cliente.ui.screens.detalle.estadoDeCancionEnCola
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
    // Una sola instancia de la cola para las pantallas de cola y detalle (alcance: la actividad).
    val colaViewModel: ColaViewModel? = contenedor.cola?.let { repositorio ->
        // Con clave por token: `MainActivity` reinicia el flujo con cada QR nuevo, pero un ViewModel del alcance de la
        // actividad sobreviviría y mostraría la cola de la sesión (¿otro establecimiento?) anterior.
        viewModel(key = "cola-$token") { ColaViewModel(repositorio) }
    }
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
            InicioScreen(
                onBuscar = { navController.navigate(Destinos.BUSCAR) },
                onVerCola = colaViewModel?.let { vm ->
                    {
                        vm.cerrarMensaje()
                        vm.quitarDestacado()
                        // launchSingleTop: un toque doble rápido no apila dos colas.
                        navController.navigate(Destinos.COLA) { launchSingleTop = true }
                    }
                },
            )
        }
        if (colaViewModel != null) {
            composable(Destinos.CONFIRMACION) {
                val estado by colaViewModel.estado.collectAsState()
                // Recuerda la última confirmación: al salir, el ViewModel la borra y esta pantalla (que sigue visible
                // durante la transición) no debe quedarse sin datos ni disparar el regreso a Buscar.
                var confirmacion by remember { mutableStateOf(estado.confirmacion) }
                estado.confirmacion?.let { confirmacion = it }
                val seguirExplorando = {
                    colaViewModel.cerrarConfirmacion()
                    // Vuelve a los resultados de la búsqueda (se conservan); sin ellos, al inicio.
                    if (!navController.popBackStack(Destinos.BUSCAR, inclusive = false)) {
                        navController.navigate(Destinos.INICIO) { popUpTo(Destinos.INICIO) { inclusive = true } }
                    }
                    Unit
                }
                // Atrás equivale a "Seguir explorando": no devuelve al botón "Solicitar" ya usado.
                BackHandler(onBack = seguirExplorando)
                val datos = confirmacion
                if (datos == null) {
                    // Nunca hubo confirmación que mostrar (p. ej. tras recrearse el proceso): no hay nada aquí.
                    LaunchedEffect(Unit) { seguirExplorando() }
                } else {
                    ConfirmacionScreen(
                        confirmacion = datos,
                        onVerCola = {
                            // La cola resalta y muestra la solicitud recién confirmada.
                            colaViewModel.verColaDesdeConfirmacion()
                            navController.navigate(Destinos.COLA) {
                                popUpTo(Destinos.CONFIRMACION) { inclusive = true }
                                launchSingleTop = true
                            }
                        },
                        onSeguirExplorando = seguirExplorando,
                    )
                }
            }
            composable(Destinos.COLA) {
                val estado by colaViewModel.estado.collectAsState()
                LaunchedEffect(Unit) { colaViewModel.alMostrarse() }
                ColaScreen(
                    estado = estado,
                    onVotar = colaViewModel::votar,
                    onReintentar = colaViewModel::reintentar,
                    onCerrarMensaje = colaViewModel::cerrarMensaje,
                    onBuscar = {
                        colaViewModel.quitarDestacado()
                        // Si ya hay una búsqueda en la pila (se llegó desde un detalle), vuelve a ella en vez de duplicarla.
                        if (!navController.popBackStack(Destinos.BUSCAR, inclusive = false)) {
                            navController.navigate(Destinos.BUSCAR) { launchSingleTop = true }
                        }
                    },
                )
            }
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
            val cancion = id?.let(contenedor.busqueda::cancionPorId)
            if (colaViewModel == null) {
                DetalleScreen(cancion = cancion)
            } else {
                val estadoCola by colaViewModel.estado.collectAsState()
                // Un aviso de la cola (p. ej. de un voto) o una confirmación vieja no deben aparecer aquí al entrar.
                LaunchedEffect(Unit) {
                    colaViewModel.cerrarMensaje()
                    colaViewModel.cerrarConfirmacion()
                    colaViewModel.quitarDestacado()
                    // El detalle necesita saber si la canción ya está en la cola: carga (o refresca) la cola al abrirlo.
                    colaViewModel.alMostrarse()
                }
                // Solicitud aceptada: abre la confirmación una sola vez (se consulta el estado vigente, no el capturado).
                LaunchedEffect(estadoCola.navegarAConfirmacion) {
                    if (colaViewModel.estado.value.navegarAConfirmacion) {
                        colaViewModel.confirmacionMostrada()
                        navController.navigate(Destinos.CONFIRMACION)
                    }
                }
                DetalleScreen(
                    cancion = cancion,
                    onSolicitar = cancion?.let { { colaViewModel.solicitar(it) } },
                    solicitando = estadoCola.solicitando,
                    mensaje = estadoCola.mensaje,
                    onCerrarMensaje = colaViewModel::cerrarMensaje,
                    estadoEnCola = cancion?.let { estadoDeCancionEnCola(estadoCola.carga, it.youtubeVideoId) }
                        ?: EstadoCancionEnCola.Desconocido,
                    onVerCola = {
                        // El aviso de la solicitud no debe aparecer en la cola (ahí se ve la solicitud en la lista).
                        colaViewModel.cerrarMensaje()
                        colaViewModel.quitarDestacado()
                        navController.navigate(Destinos.COLA) { launchSingleTop = true }
                    },
                )
            }
        }
    }
}
