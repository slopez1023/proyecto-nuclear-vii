package co.edu.cue.nuclear.cliente.ui.screens.inicio

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.Brand
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors

/**
 * Pantalla "inicio" de Figma, reducida al alcance del Entregable 3: solo el acceso a la búsqueda.
 * "Ahora suena" y "Mi solicitud" pertenecen al Entregable 4.
 */
@Composable
fun InicioScreen(onBuscar: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Brand()
        Text("¿Qué quieres escuchar?", style = MaterialTheme.typography.headlineMedium, color = NuclearColors.Text)
        Text(
            "Busca por canción, artista o canal.",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
        )
        BotonPrincipal("Buscar una canción", onBuscar)
    }
}
