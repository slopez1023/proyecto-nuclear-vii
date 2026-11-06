package co.edu.cue.nuclear.cliente

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import co.edu.cue.nuclear.cliente.ui.navigation.NuclearNavHost
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NuclearTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = NuclearColors.Canvas) {
                    NuclearNavHost(modifier = Modifier.safeDrawingPadding())
                }
            }
        }
    }
}
