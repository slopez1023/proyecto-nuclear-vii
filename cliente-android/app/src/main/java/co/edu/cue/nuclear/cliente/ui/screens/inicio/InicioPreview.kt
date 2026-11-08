package co.edu.cue.nuclear.cliente.ui.screens.inicio

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

// Vistas previas de Inicio (Android Studio: panel Preview). No afectan a la app en ejecución.

@Composable
private fun Inicio() = NuclearTheme { InicioScreen(onBuscar = {}) }

@Preview(name = "Teléfono", widthDp = 360, heightDp = 780)
@Composable
private fun TelefonoPreview() = Inicio()

@Preview(name = "Teléfono pequeño", widthDp = 320, heightDp = 560)
@Composable
private fun TelefonoPequenoPreview() = Inicio()

@Preview(name = "Letra grande", widthDp = 360, heightDp = 780, fontScale = 1.6f)
@Composable
private fun LetraGrandePreview() = Inicio()

@Preview(name = "Tableta vertical", widthDp = 800, heightDp = 1280)
@Composable
private fun TabletaPreview() = Inicio()

@Preview(name = "Horizontal corto", widthDp = 640, heightDp = 360)
@Composable
private fun HorizontalPreview() = Inicio()

@Preview(name = "Letra muy grande (2,0)", widthDp = 360, heightDp = 780, fontScale = 2.0f)
@Composable
private fun LetraMuyGrandePreview() = Inicio()
