package co.edu.cue.nuclear.cliente.ui.screens.escaner

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import co.edu.cue.nuclear.cliente.R
import co.edu.cue.nuclear.cliente.data.sesion.LecturaQr
import co.edu.cue.nuclear.cliente.ui.components.BarraSuperior
import co.edu.cue.nuclear.cliente.ui.components.BotonPrincipal
import co.edu.cue.nuclear.cliente.ui.components.BotonSecundario
import co.edu.cue.nuclear.cliente.ui.components.NuclearScreen
import co.edu.cue.nuclear.cliente.ui.components.SimboloIcono
import co.edu.cue.nuclear.cliente.ui.components.TonoVisual
import co.edu.cue.nuclear.cliente.ui.theme.NuclearColors
import co.edu.cue.nuclear.cliente.ui.theme.NuclearSpacing
import co.edu.cue.nuclear.cliente.ui.theme.TituloPantalla
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private tailrec fun Context.buscarActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.buscarActivity()
    else -> null
}

/**
 * Escáner QR integrado con CameraX + ML Kit empaquetado.
 * Emite una sola lectura válida hacia el flujo de token existente y libera la cámara al salir.
 */
@Composable
fun EscanerScreen(
    onTokenDetectado: (String) -> Unit,
    onIngresarCodigo: () -> Unit,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contexto = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var tienePermiso by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(contexto, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var permisoSolicitado by rememberSaveable { mutableStateOf(false) }

    val lanzadorPermiso = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { concedido ->
        permisoSolicitado = true
        tienePermiso = concedido
    }

    // Revalida el permiso cuando el usuario vuelve desde Ajustes del sistema.
    DisposableEffect(lifecycleOwner, contexto) {
        val observador = LifecycleEventObserver { _, evento ->
            if (evento == Lifecycle.Event.ON_RESUME) {
                tienePermiso = ContextCompat.checkSelfPermission(contexto, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED
            }
        }
        lifecycleOwner.lifecycle.addObserver(observador)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observador) }
    }

    LaunchedEffect(Unit) {
        if (!tienePermiso && !permisoSolicitado) {
            permisoSolicitado = true
            lanzadorPermiso.launch(Manifest.permission.CAMERA)
        }
    }

    if (!tienePermiso) {
        val actividad = contexto.buscarActivity()
        val denegadoPermanente = permisoSolicitado &&
            actividad != null &&
            !ActivityCompat.shouldShowRequestPermissionRationale(actividad, Manifest.permission.CAMERA)
        PantallaPermisoCamara(
            denegadoPermanente = denegadoPermanente,
            onSolicitarPermiso = {
                permisoSolicitado = true
                lanzadorPermiso.launch(Manifest.permission.CAMERA)
            },
            onAbrirAjustes = {
                val intent = Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", contexto.packageName, null),
                )
                contexto.startActivity(intent)
            },
            onIngresarCodigo = onIngresarCodigo,
            onVolver = onVolver,
            modifier = modifier,
        )
        return
    }

    VisorCamaraQr(
        onTokenDetectado = onTokenDetectado,
        onIngresarCodigo = onIngresarCodigo,
        onVolver = onVolver,
        modifier = modifier,
    )
}

@Composable
private fun PantallaPermisoCamara(
    denegadoPermanente: Boolean,
    onSolicitarPermiso: () -> Unit,
    onAbrirAjustes: () -> Unit,
    onIngresarCodigo: () -> Unit,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier,
) {
    NuclearScreen(
        modifier = modifier,
        scrollable = true,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md, Alignment.CenterVertically),
        header = { BarraSuperior("Volver", onVolver) },
        footer = {
            if (denegadoPermanente) {
                BotonPrincipal("Abrir configuración", onAbrirAjustes)
            } else {
                BotonPrincipal("Permitir cámara", onSolicitarPermiso)
            }
            BotonSecundario("Ingresar código de 6 dígitos", onIngresarCodigo)
        },
    ) {
        SimboloIcono(
            R.drawable.ic_qr_code,
            tono = if (denegadoPermanente) TonoVisual.Aviso else TonoVisual.Acento,
        )
        Text(
            if (denegadoPermanente) "Permiso de cámara desactivado" else "Necesitamos usar la cámara",
            style = TituloPantalla,
            color = NuclearColors.Text,
            textAlign = TextAlign.Center,
        )
        Text(
            if (denegadoPermanente) {
                "Habilita el permiso de cámara en la configuración de PONGA PUES o ingresa manualmente el código del establecimiento."
            } else {
                "La cámara se usa solo para leer el código QR del establecimiento y no guarda imágenes."
            },
            style = MaterialTheme.typography.bodyLarge,
            color = NuclearColors.Text2,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun VisorCamaraQr(
    onTokenDetectado: (String) -> Unit,
    onIngresarCodigo: () -> Unit,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contexto = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val controller = remember {
        LifecycleCameraController(contexto).apply {
            cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
            setEnabledUseCases(CameraController.IMAGE_ANALYSIS)
        }
    }
    val scanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build(),
        )
    }
    val analizadorExecutor = remember { Executors.newSingleThreadExecutor() }
    val procesado = remember { AtomicBoolean(false) }

    var avisoQrAjeno by remember { mutableStateOf(false) }
    var ultimoAjenoValor by remember { mutableStateOf<String?>(null) }
    var ultimoAjenoMs by remember { mutableLongStateOf(0L) }

    LaunchedEffect(controller, scanner, lifecycleOwner) {
        val mainExecutor = ContextCompat.getMainExecutor(contexto)
        controller.setImageAnalysisAnalyzer(
            analizadorExecutor,
            MlKitAnalyzer(
                listOf(scanner),
                ImageAnalysis.COORDINATE_SYSTEM_VIEW_REFERENCED,
                mainExecutor,
            ) { resultado ->
                if (procesado.get()) return@MlKitAnalyzer
                val barcodes = resultado.getValue(scanner) ?: return@MlKitAnalyzer
                for (codigo in barcodes) {
                    val bruto = codigo.rawValue ?: continue
                    val token = LecturaQr.tokenDesdeLectura(bruto)
                    if (token != null) {
                        if (procesado.compareAndSet(false, true)) {
                            controller.clearImageAnalysisAnalyzer()
                            onTokenDetectado(token)
                        }
                        return@MlKitAnalyzer
                    } else if (bruto.isNotBlank()) {
                        val ahora = SystemClock.elapsedRealtime()
                        if (bruto != ultimoAjenoValor || ahora - ultimoAjenoMs >= 2_000L) {
                            ultimoAjenoValor = bruto
                            ultimoAjenoMs = ahora
                            avisoQrAjeno = true
                        }
                    }
                }
            },
        )
        controller.bindToLifecycle(lifecycleOwner)
    }

    DisposableEffect(controller, scanner, analizadorExecutor) {
        onDispose {
            controller.clearImageAnalysisAnalyzer()
            controller.unbind()
            scanner.close()
            analizadorExecutor.shutdown()
        }
    }

    Box(modifier = modifier.fillMaxSize().background(NuclearColors.Canvas)) {
        AndroidView(
            factory = { ctx ->
                PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    this.controller = controller
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        MarcoVisorQr(modifier = Modifier.fillMaxSize())

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(NuclearSpacing.Lg),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            BarraSuperior("Volver", onVolver)

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Md),
            ) {
                val borde = if (avisoQrAjeno) NuclearColors.Warning else NuclearColors.Line
                val formaTarjeta = RoundedCornerShape(16.dp)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(formaTarjeta)
                        .background(NuclearColors.Surface.copy(alpha = 0.92f))
                        .border(1.dp, borde, formaTarjeta)
                        .padding(NuclearSpacing.Lg),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(NuclearSpacing.Xs),
                ) {
                    Text(
                        if (avisoQrAjeno) {
                            "Este código QR no pertenece a PONGA PUES"
                        } else {
                            "Apunta al código QR del establecimiento"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = if (avisoQrAjeno) NuclearColors.Warning else NuclearColors.Text,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        "El ingreso es automático en cuanto se detecte un QR válido.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = NuclearColors.Text2,
                        textAlign = TextAlign.Center,
                    )
                }
                BotonSecundario("Prefiero ingresar el código", onIngresarCodigo)
            }
        }
    }
}

@Composable
private fun MarcoVisorQr(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val lado = size.minDimension * 0.66f
        val izquierda = (size.width - lado) / 2f
        val arriba = (size.height - lado) / 2f - size.height * 0.05f
        val radio = 24.dp.toPx()

        val hueco = Path().apply {
            addRoundRect(
                RoundRect(
                    rect = Rect(izquierda, arriba, izquierda + lado, arriba + lado),
                    cornerRadius = CornerRadius(radio, radio),
                ),
            )
        }
        clipPath(hueco, clipOp = ClipOp.Difference) {
            drawRect(Color.Black.copy(alpha = 0.56f))
        }
        drawRoundRect(
            color = NuclearColors.Accent,
            topLeft = Offset(izquierda, arriba),
            size = androidx.compose.ui.geometry.Size(lado, lado),
            cornerRadius = CornerRadius(radio, radio),
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
        )
    }
}
