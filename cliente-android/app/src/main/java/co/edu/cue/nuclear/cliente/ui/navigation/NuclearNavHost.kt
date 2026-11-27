package co.edu.cue.nuclear.cliente.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import androidx.navigation.compose.currentBackStackEntryAsState
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
import co.edu.cue.nuclear.cliente.data.sesion.ResultadoRestauracion
import co.edu.cue.nuclear.cliente.ui.screens.acceso.AccesoEstado
import co.edu.cue.nuclear.cliente.ui.screens.acceso.AccesoScreen
import co.edu.cue.nuclear.cliente.ui.screens.acceso.AccesoViewModel
import co.edu.cue.nuclear.cliente.ui.screens.acceso.QrInvalidoScreen
import co.edu.cue.nuclear.cliente.ui.screens.codigo.CodigoAccesoScreen
import co.edu.cue.nuclear.cliente.ui.screens.codigo.CodigoAccesoViewModel
import co.edu.cue.nuclear.cliente.ui.screens.escaner.EscanerScreen
import co.edu.cue.nuclear.cliente.ui.screens.buscar.BuscarScreen
import co.edu.cue.nuclear.cliente.ui.screens.buscar.BuscarViewModel
import co.edu.cue.nuclear.cliente.ui.screens.cola.ColaScreen
import co.edu.cue.nuclear.cliente.ui.screens.confirmacion.ConfirmacionScreen
import co.edu.cue.nuclear.cliente.ui.screens.cola.CargaCola
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
    generacionEntrada: Int = 0,
    onTokenObtenido: (String) -> Unit = {},
    onReiniciarAcceso: () -> Unit = {},
) {
    val navController = rememberNavController()
    // Cambia cada vez que la sesión termina: la cola de la sesión anterior no debe sobrevivir a la siguiente.
    var generacionSesion by rememberSaveable { mutableIntStateOf(0) }
    // Una sola instancia de la cola para las pantallas de cola y detalle (alcance: la actividad).
    val colaViewModel: ColaViewModel? = contenedor.cola?.let { repositorio ->
        // Con clave por token y generación: evita heredar cola al cambiar de entrada o sesión.
        viewModel(key = "cola-$token-$generacionEntrada-$generacionSesion") { ColaViewModel(repositorio, contenedor.colaEnVivo) }
    }
    var sesionLista by remember { mutableStateOf(false) }
    val irAAcceso: () -> Unit = {
        sesionLista = false
        navController.navigate(Destinos.ACCESO) { popUpTo(navController.graph.id) { inclusive = true } }
    }
    // F2: si la sesión terminó se explica (en vez de un rebote silencioso a Acceso).
    val irAAvisoSesionTerminada: () -> Unit = {
        sesionLista = false
        navController.navigate(Destinos.qrInvalido(MotivoRechazo.SESION_CERRADA)) { popUpTo(navController.graph.id) { inclusive = true } }
    }
    val puerta = remember(contenedor) { PuertaSesion(contenedor, onSinSesion = { irAAcceso() }, onLista = { sesionLista = true }) }

    // --- Tiempo real: abierto solo con la app en primer plano y dentro de la sesión; un único flujo por ViewModel.
    val estadoCiclo by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val rutaActual by navController.currentBackStackEntryAsState()
    val flujoActivo = sesionLista && estadoCiclo.isAtLeast(Lifecycle.State.STARTED) &&
        rutaActual?.destination?.route in RUTAS_CON_SESION
    LaunchedEffect(colaViewModel, flujoActivo) {
        if (flujoActivo) colaViewModel?.alPrimerPlano() else colaViewModel?.alSegundoPlano()
    }
    DisposableEffect(colaViewModel) { onDispose { colaViewModel?.alSegundoPlano() } }

    // --- Sesión cerrada, expirada o inexistente: se limpia lo local y se vuelve a Acceso (que la revalida).
    val sesionNoDisponible = colaViewModel?.estado?.collectAsState()?.value?.sesionNoDisponible == true
    LaunchedEffect(sesionNoDisponible) {
        if (sesionNoDisponible) {
            colaViewModel.alSegundoPlano()
            contenedor.restauradorSesion.cerrarLocalmente()
            generacionSesion++
            irAAvisoSesionTerminada()
        }
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
            val viewModel: AccesoViewModel = viewModel(key = "acceso-$token-$generacionEntrada") {
                AccesoViewModel(
                    token, contenedor.sesiones, contenedor.dispositivos, contenedor.eventos, contenedor.sesionActiva,
                    contenedor.sesionLocal,
                )
            }
            val estado by viewModel.estado.collectAsState()

            // Sin QR en la apertura: si hay una sesión guardada, se recupera SOLO si el servidor la confirma.
            LaunchedEffect(estado) {
                if (estado is AccesoEstado.SinQr &&
                    contenedor.restauradorSesion.restaurar() is ResultadoRestauracion.Restaurada
                ) {
                    navController.navigate(Destinos.INICIO) { popUpTo(Destinos.ACCESO) { inclusive = true } }
                }
            }

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
                onEscanearQr = { navController.navigate(Destinos.ESCANER) { launchSingleTop = true } },
                onIngresarCodigo = { navController.navigate(Destinos.CODIGO) { launchSingleTop = true } },
            )
        }
        composable(Destinos.ESCANER) {
            EscanerScreen(
                onTokenDetectado = onTokenObtenido,
                onIngresarCodigo = {
                    navController.navigate(Destinos.CODIGO) {
                        popUpTo(Destinos.ESCANER) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onVolver = { navController.popBackStack() },
            )
        }
        composable(Destinos.CODIGO) {
            val viewModelCodigo: CodigoAccesoViewModel = viewModel(key = "codigo-$generacionEntrada") {
                CodigoAccesoViewModel(contenedor.sesiones, contenedor.dispositivos)
            }
            val estadoCodigo by viewModelCodigo.estado.collectAsState()
            LaunchedEffect(estadoCodigo.tokenResuelto) {
                val resuelto = estadoCodigo.tokenResuelto
                if (resuelto != null) {
                    viewModelCodigo.consumirToken()
                    onTokenObtenido(resuelto)
                }
            }
            CodigoAccesoScreen(
                estado = estadoCodigo,
                onCodigoCambio = viewModelCodigo::alCambiarCodigo,
                onIngresar = viewModelCodigo::ingresar,
                onCerrarMensaje = viewModelCodigo::limpiarMensaje,
                onVolver = { navController.popBackStack() },
            )
        }
        composable(
            route = Destinos.QR_INVALIDO,
            arguments = listOf(navArgument(Destinos.ARG_MOTIVO) { type = NavType.StringType }),
        ) { entrada ->
            val motivo = MotivoRechazo.desdeCodigo(entrada.arguments?.getString(Destinos.ARG_MOTIVO))
                ?: MotivoRechazo.TOKEN_INVALIDO
            QrInvalidoScreen(motivo, onVolverAlInicio = onReiniciarAcceso)
        }
        conSesion(puerta, Destinos.INICIO) {
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
            conSesion(puerta, Destinos.CONFIRMACION) {
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
            conSesion(puerta, Destinos.COLA) {
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
        conSesion(puerta, Destinos.BUSCAR) {
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
        conSesion(
            puerta,
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
                    votacion = (estadoCola.carga as? CargaCola.Exito)?.estado?.miVotacion,
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
