package co.edu.cue.nuclear.cliente

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import co.edu.cue.nuclear.cliente.data.sesion.TokenQr
import co.edu.cue.nuclear.cliente.ui.components.LocalFondoGlobal
import co.edu.cue.nuclear.cliente.ui.components.fondoNuclear
import co.edu.cue.nuclear.cliente.ui.navigation.NuclearNavHost
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

class MainActivity : ComponentActivity() {

    /** Token del último enlace https://HOST/s/TOKEN recibido (App Link, escáner interno o código manual). */
    private var tokenQr by mutableStateOf<String?>(null)
    private var generacionEntrada by mutableIntStateOf(0)

    private fun ingresarConToken(token: String) {
        tokenQr = token
        generacionEntrada++
    }

    private fun reiniciarAcceso() {
        tokenQr = null
        generacionEntrada++
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        tokenQr = tokenDesde(intent)
        val contenedor = (application as NuclearApp).contenedor
        setContent {
            NuclearTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = NuclearColors.Canvas) {
                    // El fondo (canvas + degradado) cubre toda la ventana, también bajo las barras del
                    // sistema; el contenido sí respeta las zonas seguras con safeDrawingPadding().
                    Box(Modifier.fillMaxSize().fondoNuclear()) {
                        CompositionLocalProvider(LocalFondoGlobal provides true) {
                            // Cada entrada nueva (App Link, escáner QR o código manual) reinicia el flujo.
                            key(tokenQr, generacionEntrada) {
                                NuclearNavHost(
                                    token = tokenQr,
                                    generacionEntrada = generacionEntrada,
                                    contenedor = contenedor,
                                    onTokenObtenido = ::ingresarConToken,
                                    onReiniciarAcceso = ::reiniciarAcceso,
                                    modifier = Modifier.safeDrawingPadding(),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        tokenDesde(intent)?.let(::ingresarConToken)
    }

    private fun tokenDesde(intent: Intent?): String? =
        if (intent?.action == Intent.ACTION_VIEW) TokenQr.desdeUrl(intent.dataString) else null
}
