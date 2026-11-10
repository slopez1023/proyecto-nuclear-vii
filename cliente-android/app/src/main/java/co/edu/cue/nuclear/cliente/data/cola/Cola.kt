package co.edu.cue.nuclear.cliente.data.cola

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion

/*
 * MODELOS DE DOMINIO PROVISIONALES DEL E4 (cola, solicitud y voto).
 *
 * Fuente: docs/entregable-4/ESPECIFICACION_TECNICA_ENTREGABLE_4.md (secciones 5 y 8, borrador).
 * El contrato JSON entre Android y el backend lo propone Juan Camilo y lo revisa Santiago, así
 * que aquí NO hay DTOs ni rutas: solo lo que la interfaz necesita mostrar. Los nombres y la
 * forma de estos modelos pueden ajustarse cuando el contrato esté acordado (ver PENDIENTES
 * en la documentación del incremento).
 *
 * Android no calcula votos, posiciones ni esperas: muestra lo que entrega el repositorio.
 */

/**
 * Estado de una solicitud. El E4 solo produce estos cuatro; "saltada" y "retirada" del ER
 * quedan fuera del alcance (la lista definitiva sigue por validar con el equipo).
 */
enum class EstadoSolicitud { PENDIENTE, EN_REPRODUCCION, REPRODUCIDA, FALLIDA }

/** Tipos de voto del diccionario de datos. El automático nace con la solicitud; el manual es un voto sobre una solicitud ajena. */
enum class TipoVoto { AUTOMATICO, MANUAL }

/**
 * Una solicitud de la cola.
 *
 * @property posicion lugar en la cola (1 = la siguiente); `null` si no está en la cola (p. ej. la que suena).
 * @property totalVotos votos totales según el servidor; la UI nunca lo incrementa por su cuenta.
 * @property esMia la solicitó este dispositivo.
 * @property miVoto voto de este dispositivo sobre la solicitud: `AUTOMATICO` si la creó, `MANUAL` si la votó después, `null` si no ha votado.
 * @property esperaEstimadaSegundos espera calculada por el backend; `null` cuando no puede calcularse.
 */
data class SolicitudCola(
    val idSolicitud: String,
    val cancion: Cancion,
    val estado: EstadoSolicitud,
    val posicion: Int?,
    val totalVotos: Int,
    val esMia: Boolean,
    val miVoto: TipoVoto?,
    val esperaEstimadaSegundos: Int?,
) {
    /** Solo se vota una solicitud pendiente a la que este dispositivo aún no ha votado (HU-05). */
    val puedeVotar: Boolean get() = estado == EstadoSolicitud.PENDIENTE && miVoto == null
}

/** La canción que suena ahora. Viaja aparte de la cola: una pendiente nunca se muestra como reproduciéndose. */
data class ReproduccionActual(
    val idSolicitud: String,
    val cancion: Cancion,
    val segundosRestantesEstimados: Int?,
)

/** Instantánea de la cola tal como la entrega el repositorio. `cola` contiene solo solicitudes pendientes, ya ordenadas. */
data class EstadoCola(
    val reproduccionActual: ReproduccionActual?,
    val cola: List<SolicitudCola>,
) {
    val estaVacia: Boolean get() = reproduccionActual == null && cola.isEmpty()
}

/** Por qué el servidor rechazó una operación (no es un error de red). Los códigos reales están por definir en el contrato. */
enum class MotivoRechazoOperacion {
    /** Aún no han sonado suficientes canciones desde la última solicitud o voto de este dispositivo. */
    INTERVALO_NO_CUMPLIDO,

    /** Este dispositivo ya votó esa solicitud. */
    VOTO_DUPLICADO,

    /** La solicitud ya no está pendiente (empezó a sonar o terminó). */
    SOLICITUD_NO_VOTABLE,

    /** La canción no puede solicitarse (validación del catálogo, por definir). */
    CANCION_NO_DISPONIBLE,
}

/** Por qué falló la comunicación, distinto de un rechazo de negocio. */
enum class TipoErrorCola {
    /** Sin red, timeout o servidor inalcanzable. */
    CONEXION,

    /** El servidor respondió algo inesperado. */
    SERVIDOR,
}

sealed interface ResultadoCola {
    data class Exito(val estado: EstadoCola) : ResultadoCola
    data class Error(val tipo: TipoErrorCola) : ResultadoCola
}

sealed interface ResultadoSolicitud {
    /**
     * La solicitud quedó aceptada y su voto automático ya está incluido en [solicitud].
     * [sumoVotoAExistente]: la canción ya estaba esperando o sonando y se sumó un voto en vez de duplicarla (regla 1B).
     */
    data class Aceptada(val solicitud: SolicitudCola, val sumoVotoAExistente: Boolean) : ResultadoSolicitud
    data class Rechazada(val motivo: MotivoRechazoOperacion, val faltantes: Int? = null) : ResultadoSolicitud
    data class Error(val tipo: TipoErrorCola) : ResultadoSolicitud
}

sealed interface ResultadoVoto {
    /** Voto manual registrado; [solicitud] trae el total de votos que dice el servidor. */
    data class Registrado(val solicitud: SolicitudCola) : ResultadoVoto
    data class Rechazado(val motivo: MotivoRechazoOperacion, val faltantes: Int? = null) : ResultadoVoto
    data class Error(val tipo: TipoErrorCola) : ResultadoVoto
}
