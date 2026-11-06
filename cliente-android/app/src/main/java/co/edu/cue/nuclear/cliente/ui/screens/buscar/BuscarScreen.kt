package co.edu.cue.nuclear.cliente.ui.screens.buscar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.CancionItem
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors

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
    LaunchedEffect(Unit) { foco.requestFocus() }

    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Busca una canción", style = MaterialTheme.typography.headlineMedium, color = NuclearColors.Text)

        OutlinedTextField(
            value = estado.consulta,
            onValueChange = onConsultaCambio,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).focusRequester(foco),
            singleLine = true,
            placeholder = { Text("Canción, artista o canal", color = NuclearColors.Muted) },
            shape = MaterialTheme.shapes.medium,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onBuscar() }),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = NuclearColors.Text,
                unfocusedTextColor = NuclearColors.Text,
                focusedContainerColor = NuclearColors.Surface2,
                unfocusedContainerColor = NuclearColors.Surface2,
                focusedBorderColor = NuclearColors.Accent,
                unfocusedBorderColor = NuclearColors.Line,
                cursorColor = NuclearColors.Accent,
            ),
        )

        if (estado.sugerencias.isNotEmpty()) {
            Sugerencias(estado.sugerencias, onSugerencia)
        }

        when (val resultados = estado.resultados) {
            ResultadosUi.Inicial -> Texto("Escribe el nombre de una canción o artista para empezar.")
            ResultadosUi.Cargando -> Cargando()
            is ResultadosUi.SinResultados -> Texto("No encontramos resultados para “${resultados.consulta}”. Prueba con otras palabras.")
            is ResultadosUi.Error -> ErrorBusqueda(resultados, onReintentar)
            is ResultadosUi.Exito -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(resultados.canciones, key = { it.youtubeVideoId }) { cancion ->
                    CancionItem(cancion, onClick = { onCancion(cancion) })
                }
            }
        }
    }
}

@Composable
private fun Sugerencias(sugerencias: List<String>, onSugerencia: (String) -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(NuclearColors.Surface, MaterialTheme.shapes.medium)
            .border(1.dp, NuclearColors.Line, MaterialTheme.shapes.medium),
    ) {
        sugerencias.forEach { sugerencia ->
            Text(
                sugerencia,
                style = MaterialTheme.typography.bodyLarge,
                color = NuclearColors.Text,
                maxLines = 2,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable { onSugerencia(sugerencia) }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun Cargando() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        CircularProgressIndicator(color = NuclearColors.Accent)
        Texto("Buscando…")
    }
}

@Composable
private fun ErrorBusqueda(error: ResultadosUi.Error, onReintentar: () -> Unit) {
    val mensaje = error.tipo.aMensaje()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(mensaje.titulo, style = MaterialTheme.typography.titleLarge, color = NuclearColors.Danger)
        Texto(mensaje.detalle)
        if (mensaje.reintentable) BotonPrincipal("Reintentar", onReintentar)
    }
}

@Composable
private fun Texto(texto: String) =
    Text(texto, style = MaterialTheme.typography.bodyLarge, color = NuclearColors.Text2)
