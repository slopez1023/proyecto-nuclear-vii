plugins {
    alias(libs.plugins.android.application)
    // AGP 9 incluye soporte integrado de Kotlin: no se aplica org.jetbrains.kotlin.android.
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// URL base del backend; se puede sobrescribir con -Pnuclear.backendUrl=...
fun backendUrl(porDefecto: String): String =
    providers.gradleProperty("nuclear.backendUrl").getOrElse(porDefecto)

// Solo debug: -Pnuclear.colaReal=true usa el repositorio real de la cola en lugar de los datos simulados.
val colaReal: Boolean = providers.gradleProperty("nuclear.colaReal").map { it.toBoolean() }.getOrElse(false)

android {
    namespace = "co.edu.cue.nuclear.cliente"
    compileSdk = 37

    defaultConfig {
        applicationId = "co.edu.cue.nuclear.cliente"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Host HTTPS de los App Links (https://HOST/s/TOKEN). PLACEHOLDER hasta tener un host público:
        // la verificación autoVerify solo funciona con un dominio real que sirva /.well-known/assetlinks.json.
        manifestPlaceholders["appLinkHost"] =
            providers.gradleProperty("nuclear.appLinkHost").getOrElse("nuclear.example.com")
    }

    buildTypes {
        debug {
            // Backend local vía `adb reverse tcp:3000 tcp:3000` (emulador o teléfono por USB).
            // En el emulador probado, 10.0.2.2 no era alcanzable desde la app; sobrescribible con -Pnuclear.backendUrl=...
            buildConfigField("String", "BACKEND_URL", "\"${backendUrl("http://localhost:3000/")}\"")
            buildConfigField("boolean", "COLA_REAL", colaReal.toString())
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "BACKEND_URL", "\"${backendUrl("https://nuclear.example.com/")}\"")
            buildConfigField("boolean", "COLA_REAL", "true") // release usa siempre el repositorio real
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.kotlinx.serialization)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.androidx.compose.ui.tooling)

    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
