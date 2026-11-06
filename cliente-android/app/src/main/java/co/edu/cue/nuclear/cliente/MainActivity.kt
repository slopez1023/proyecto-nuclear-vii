package co.edu.cue.nuclear.cliente

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import co.edu.cue.nuclear.cliente.data.sesion.TokenQr
import co.edu.cue.nuclear.cliente.ui.navigation.NuclearNavHost
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

class MainActivity : ComponentActivity() {

    /** Token del último enlace https://HOST/s/TOKEN recibido (App Link). */
    private var tokenQr by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        tokenQr = tokenDesde(intent)
        val contenedor = (application as NuclearApp).contenedor
        setContent {
            NuclearTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = NuclearColors.Canvas) {
                    // Un enlace nuevo reinicia el flujo de acceso con el token nuevo.
                    key(tokenQr) {
                        NuclearNavHost(
                            token = tokenQr,
                            contenedor = contenedor,
                            modifier = Modifier.safeDrawingPadding(),
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        tokenDesde(intent)?.let { tokenQr = it }
    }

    private fun tokenDesde(intent: Intent?): String? =
        if (intent?.action == Intent.ACTION_VIEW) TokenQr.desdeUrl(intent.dataString) else null
}
