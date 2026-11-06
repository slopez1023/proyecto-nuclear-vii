package co.edu.cue.nuclear.cliente.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import co.edu.cue.nuclear.cliente.ui.screens.PantallaProvisional

@Composable
fun NuclearNavHost(modifier: Modifier = Modifier) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Destinos.ACCESO, modifier = modifier) {
        composable(Destinos.ACCESO) {
            PantallaProvisional("Acceso", "B01/B02: validacion del QR (incremento 3).")
        }
        composable(Destinos.QR_INVALIDO) {
            PantallaProvisional("Acceso no disponible", "Estado de QR invalido (incremento 3).")
        }
        composable(Destinos.INICIO) {
            PantallaProvisional("¿Que quieres escuchar?", "Inicio y busqueda (incremento 4).")
        }
        composable(Destinos.BUSCAR) {
            PantallaProvisional("Busca una cancion", "B03/B04/B05/B16 (incremento 4).")
        }
        composable(Destinos.DETALLE) {
            PantallaProvisional("Detalle de cancion", "B05: informacion y miniatura (incremento 4).")
        }
    }
}
