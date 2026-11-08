package co.edu.cue.nuclear.cliente.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing

/** Barra gris de un esqueleto (texto que aún no cargó). */
@Composable
private fun BarraEsqueleto(fraccionAncho: Float, alto: Dp) {
    Box(
        Modifier
            .fillMaxWidth(fraccionAncho)
            .height(alto)
            .background(NuclearColors.Surface3, RoundedCornerShape(6.dp))
            .brillo(RoundedCornerShape(6.dp)),
    )
}

/**
 * Esqueleto estático de una fila de resultado: misma forma y medidas que [CancionItem] (miniatura de
 * 96×54 dp y dos líneas de texto), para que la lista no "salte" cuando llegan los datos.
 * Es decorativo: se oculta a los lectores de pantalla (el texto "Buscando…" ya informa).
 */
@Composable
fun CancionItemEsqueleto(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clearAndSetSemantics {}
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(NuclearColors.Surface)
            .border(1.dp, NuclearColors.Line, MaterialTheme.shapes.medium)
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .width(96.dp)
                .height(54.dp)
                .background(NuclearColors.Surface3, MaterialTheme.shapes.small)
                .brillo(MaterialTheme.shapes.small),
        ) {
            // Marca el sitio del chip de duración de CancionItem.
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(NuclearSpacing.Xs)
                    .width(30.dp)
                    .height(16.dp)
                    .background(NuclearColors.Line, RoundedCornerShape(6.dp)),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm)) {
            BarraEsqueleto(fraccionAncho = 0.9f, alto = 14.dp)
            BarraEsqueleto(fraccionAncho = 0.55f, alto = 12.dp)
        }
    }
}

/** Varias filas esqueleto separadas como la lista real (8 dp). */
@Composable
fun ListaEsqueleto(modifier: Modifier = Modifier, cantidad: Int = 4) {
    // Un único brillo compartido por todas las filas; existe solo mientras estén en pantalla.
    ConBrillo {
        Column(modifier.padding(top = NuclearSpacing.Xs), verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm)) {
            repeat(cantidad) { CancionItemEsqueleto() }
        }
    }
}
