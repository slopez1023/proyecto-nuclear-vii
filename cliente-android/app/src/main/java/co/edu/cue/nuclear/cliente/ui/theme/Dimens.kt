package co.edu.cue.nuclear.cliente.ui.theme

import androidx.compose.ui.unit.dp

/** Escala de espaciado (ritmo de 4/8 dp). Usar estos valores en lugar de números sueltos. */
object NuclearSpacing {
    val Xs = 4.dp
    val Sm = 8.dp
    val Md = 12.dp
    val Lg = 16.dp
    val Xl = 24.dp
    val Xxl = 32.dp
}

/** Tamaños de icono. `Xl` es el del símbolo grande de Figma (icono QR de 34). */
object NuclearIconSize {
    val Sm = 16.dp
    val Md = 20.dp
    val Lg = 24.dp
    val Xl = 34.dp
}

/** Medidas de distribución compartidas por todas las pantallas. */
object NuclearLayout {
    /** Ancho máximo del contenido: en teléfonos no tiene efecto; en tabletas evita que todo se estire. */
    val ContentMaxWidth = 560.dp

    /** Margen horizontal de pantalla. */
    val ScreenMargin = 16.dp

    /** Tamaño mínimo de un objetivo táctil (Material: 48 dp). */
    val MinTouchTarget = 48.dp
}
