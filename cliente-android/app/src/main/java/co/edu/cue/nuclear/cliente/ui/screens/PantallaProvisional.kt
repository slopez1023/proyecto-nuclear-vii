package co.edu.cue.nuclear.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.ui.components.Brand
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors

/**
 * Pantalla PROVISIONAL del scaffold (incremento 1). Se reemplaza por la pantalla real
 * en los incrementos 3 y 4; existe solo para validar tema, logo y navegacion.
 */
@Composable
fun PantallaProvisional(titulo: String, descripcion: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Brand()
        Text(titulo, style = MaterialTheme.typography.headlineMedium, color = NuclearColors.Text)
        Text(descripcion, style = MaterialTheme.typography.bodyLarge, color = NuclearColors.Text2)
    }
}
