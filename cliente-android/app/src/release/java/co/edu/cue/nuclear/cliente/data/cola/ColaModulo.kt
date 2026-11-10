package co.edu.cue.nuclear.cliente.data.cola

import android.content.Context
import co.edu.cue.nuclear.cliente.data.sesion.SesionActivaStore
import retrofit2.Retrofit

/**
 * Variante RELEASE: todavía no hay repositorio real de la cola (depende de DEP-01 a DEP-04), y los
 * datos simulados no existen en esta variante. Devolver `null` hace que la app no ofrezca cola ni
 * solicitud. Cuando exista `ColaRepositoryReal`, se crea aquí.
 */
@Suppress("UNUSED_PARAMETER")
fun crearColaRepository(contexto: Context, retrofit: Retrofit, sesionActiva: SesionActivaStore): ColaRepository? = null
