package co.edu.cue.nuclear.cliente.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import co.edu.cue.nuclear.cliente.R

/** Manrope (variable, pesos 400-800) como en Figma. Archivo OFL en res/font/manrope.ttf. */
@OptIn(ExperimentalTextApi::class)
private fun manropeWeight(weight: FontWeight): Font = Font(
    resId = R.font.manrope,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

val Manrope = FontFamily(
    manropeWeight(FontWeight.Normal),
    manropeWeight(FontWeight.Medium),
    manropeWeight(FontWeight.SemiBold),
    manropeWeight(FontWeight.Bold),
    manropeWeight(FontWeight.ExtraBold),
)

val NuclearTypography = Typography(
    headlineMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.ExtraBold, fontSize = 28.sp, lineHeight = 34.sp),
    titleLarge = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp),
    labelMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 12.sp),
)

/**
 * Título de pantalla de Figma (`welcome-screen h1`): mismo peso y tamaño que `headlineMedium`, con
 * interlineado 1,12 y tracking de −0,02 em (suavizado respecto al −0,04 em de Figma, que dejaba las palabras muy juntas en el celular).
 */
val TituloPantalla = NuclearTypography.headlineMedium.copy(
    lineHeight = 32.sp,
    letterSpacing = (-0.02).em,
)
