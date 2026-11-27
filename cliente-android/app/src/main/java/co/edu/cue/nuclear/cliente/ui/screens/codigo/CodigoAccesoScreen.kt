package co.edu.cue.nuclear.cliente.ui.screens.codigo

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.edu.cue.nuclear.cliente.data.sesion.CodigoAcceso
import co.edu.cue.nuclear.cliente.ui.components.BarraSuperior
import co.edu.cue.nuclear.cliente.ui.components.BotonSecundario
import co.edu.cue.nuclear.cliente.ui.components.Brand
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla

/**
 * Pantalla de ingreso manual por código numérico de 6 dígitos.
 * Conserva ceros iniciales y reutiliza el flujo de acceso tras resolver el `qr_token`.
 */
@Composable
fun CodigoAccesoScreen(
    estado: CodigoAccesoEstado,
    onCodigoCambio: (String) -> Unit,
    onIngresar: () -> Unit,
    onCerrarMensaje: () -> Unit,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    NuclearScreen(
        modifier = modifier,
        scrollable = true,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md, Alignment.CenterVertically),
        header = {
            Column(verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm)) {
                BarraSuperior("Volver", onVolver)
                Brand(compact = true)
            }
        },
        footer = {
            Button(
                onClick = onIngresar,
                enabled = estado.puedeIngresar,
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(
                    containerColor = NuclearColors.Accent,
                    contentColor = NuclearColors.Canvas,
                    disabledContainerColor = NuclearColors.Surface3,
                    disabledContentColor = NuclearColors.Muted,
                ),
            ) {
                if (estado.cargando) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = NuclearColors.Canvas,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("INGRESAR", style = MaterialTheme.typography.labelLarge)
                }
            }
            BotonSecundario("Regresar", onVolver)
        },
    ) {
        Text(
            "INGRESA EL CÓDIGO DE TU SESIÓN",
            style = TituloPantalla,
            color = NuclearColors.Text,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            "Escribe los seis dígitos que aparecen en el establecimiento",
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
            textAlign = TextAlign.Center,
        )

        CampoCajasSeisDigitos(
            codigo = estado.codigo,
            habilitado = !estado.cargando,
            focusRequester = focusRequester,
            onCodigoCambio = {
                onCerrarMensaje()
                onCodigoCambio(it)
            },
            onListo = { if (estado.puedeIngresar) onIngresar() },
        )

        Text(
            "${estado.codigo.length}/${CodigoAcceso.LONGITUD} dígitos",
            style = MaterialTheme.typography.labelMedium,
            color = if (CodigoAcceso.esValido(estado.codigo)) NuclearColors.Success else NuclearColors.Muted,
        )

        if (estado.mensaje != null) {
            val formaError = RoundedCornerShape(14.dp)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(formaError)
                    .background(NuclearColors.Danger.copy(alpha = 0.1f))
                    .border(1.dp, NuclearColors.Danger.copy(alpha = 0.35f), formaError)
                    .padding(NuclearSpacing.Md),
            ) {
                Text(
                    estado.mensaje,
                    style = MaterialTheme.typography.bodyMedium,
                    color = NuclearColors.Danger,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun CampoCajasSeisDigitos(
    codigo: String,
    habilitado: Boolean,
    focusRequester: FocusRequester,
    onCodigoCambio: (String) -> Unit,
    onListo: () -> Unit,
) {
    val formaCaja = RoundedCornerShape(12.dp)
    val interaccion = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(interactionSource = interaccion, indication = null) {
                focusRequester.requestFocus()
            },
        contentAlignment = Alignment.Center,
    ) {
        BasicTextField(
            value = codigo,
            onValueChange = onCodigoCambio,
            enabled = habilitado,
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { onListo() }),
            modifier = Modifier
                .focusRequester(focusRequester)
                .size(1.dp)
                .alpha(0.01f)
                .semantics {
                    contentDescription = "Código de sesión de 6 dígitos, ingresados ${codigo.length} de 6"
                },
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(NuclearSpacing.Sm, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (indice in 0 until CodigoAcceso.LONGITUD) {
                if (indice == 3) {
                    Text(
                        "·",
                        style = MaterialTheme.typography.titleLarge,
                        color = NuclearColors.Muted,
                        modifier = Modifier.padding(horizontal = 2.dp),
                    )
                }
                val digito = codigo.getOrNull(indice)?.toString() ?: ""
                val activo = habilitado && indice == codigo.length.coerceAtMost(CodigoAcceso.LONGITUD - 1) && codigo.length < CodigoAcceso.LONGITUD
                val lleno = digito.isNotEmpty()
                val borde = when {
                    activo -> NuclearColors.Accent
                    lleno -> NuclearColors.AccentStrong.copy(alpha = 0.55f)
                    else -> NuclearColors.Line
                }
                Box(
                    modifier = Modifier
                        .width(44.dp)
                        .height(56.dp)
                        .clip(formaCaja)
                        .background(NuclearColors.Surface2)
                        .border(if (activo) 2.dp else 1.dp, borde, formaCaja),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = digito,
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontSize = 24.sp,
                            fontWeight = FontWeight.ExtraBold,
                        ),
                        color = NuclearColors.Text,
                    )
                }
            }
        }
    }
}
