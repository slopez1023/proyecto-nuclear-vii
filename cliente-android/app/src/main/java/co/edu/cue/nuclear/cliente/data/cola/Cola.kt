package co.edu.cue.nuclear.cliente.data.cola

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import java.time.Instant

/*
 * MODELOS DE DOMINIO DEL E4 (cola, solicitud y voto).
 *
 * Contrato con el backend: docs/entregable-4/contrato-api-e4.md y backend/test/fixtures/contrato-e4.json.
 * Los DTO JSON viven en ColaDtos.kt y se traducen a estos modelos en ColaMapeadores.kt; la UI nunca
 * ve un DTO.
 *
 * Android no calcula votos, posiciones, esperas ni elegibilidad: muestra lo que entrega el repositorio.
 */

/**
 * Estado de una solicitud. El E4 solo produce estos cuatro; "saltada" y "retirada" del ER
 * quedan fuera del alcance (la lista definitiva sigue por validar con el equipo).
 */
enum class EstadoSolicitud { PENDIENTE, EN_REPRODUCCION, REPRODUCIDA, FALLIDA }

/**
 * Origen de un voto, tal como lo informa el servidor en `voto.origen`: `solicitud` (AUTOMATICO, nace al
 * solicitar o al pedir una canción que ya estaba en la cola) o `manual` (voto sobre una solicitud ajena).
 * Solo se conoce en la respuesta de solicitar y de votar; la cola no lo trae, así que no se deduce de otros campos.
 */
enum class TipoVoto { AUTOMATICO, MANUAL }

/**
 * Estado de votación de este dispositivo (`mi_votacion`). `puedeVotar` es solo una ayuda visual:
 * el servidor vuelve a validar siempre.
 */
data class MiVotacion(
    val puedeVotar: Boolean,
    val intervaloCanciones: Int,
    val reproduccionesContadas: Int,
    val cancionesRestantes: Int,
)

/** Reglas de votación vigentes en el establecimiento (`reglas_votacion`); vienen también en la vista pública. */
data class ReglasVotacion(val dispositivosActivos: Int, val intervaloCanciones: Int)

/**
 * Una solicitud de la cola.
 *
 * @property posicion lugar en la cola (1 = la siguiente); `null` si no está en la cola (p. ej. la que suena).
 * @property totalVotos votos totales según el servidor; la UI nunca lo incrementa por su cuenta.
 * @property esMia la solicitó este dispositivo (`es_mia`).
 * @property yaVoto este dispositivo ya votó esta solicitud (`ya_voto`). Es independiente de [esMia]: no se usa para
 *   deducir si el voto fue automático o manual.
 * @property esperaEstimadaSegundos espera calculada por el backend; `null` cuando no puede calcularse.
 */
data class SolicitudCola(
    val idSolicitud: String,
    val cancion: Cancion,
    val estado: EstadoSolicitud,
    val posicion: Int?,
    val totalVotos: Int,
    val esMia: Boolean,
    val yaVoto: Boolean,
    val esperaEstimadaSegundos: Int?,
) {
    /** Solo se vota una solicitud pendiente a la que este dispositivo aún no ha votado (HU-05). */
    val puedeVotar: Boolean get() = estado == EstadoSolicitud.PENDIENTE && !yaVoto
}

/** La canción que suena ahora. Viaja aparte de la cola: una pendiente nunca se muestra como reproduciéndose. */
data class ReproduccionActual(
    val idSolicitud: String,
    val cancion: Cancion,
    val segundosRestantesEstimados: Int?,
    val idReproduccion: String? = null,
    val totalVotos: Int? = null,
)

/**
 * Instantánea de la cola tal como la entrega el repositorio. `cola` contiene solo solicitudes pendientes, ya ordenadas
 * por el servidor (Android no las reordena).
 *
 * @property version contador de la sesión en el servidor; crece con cada cambio. `null` = sin versión (datos simulados).
 * @property generadoEn instante en que el servidor calculó el estado y las esperas.
 * @property reglasVotacion reglas vigentes del establecimiento.
 * @property miVotacion elegibilidad de este dispositivo; `null` si el servidor no la informó.
 */
data class EstadoCola(
    val reproduccionActual: ReproduccionActual?,
    val cola: List<SolicitudCola>,
    val version: Long? = null,
    val generadoEn: Instant? = null,
    val reglasVotacion: ReglasVotacion? = null,
    val miVotacion: MiVotacion? = null,
) {
    val estaVacia: Boolean get() = reproduccionActual == null && cola.isEmpty()

    /**
     * `false` si este estado es más viejo o igual que [aplicado] (una respuesta desordenada, un GET que llegó
     * después de un mensaje en tiempo real). Sin versión en alguno de los dos se acepta.
     */
    fun esMasNuevoQue(aplicado: Long?): Boolean = version == null || aplicado == null || version > aplicado
}

/** Por qué el servidor rechazó una operación (no es un error de red). Equivale a los códigos 409/422/404 del contrato. */
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

    /** La sesión ya no existe, se cerró o su QR se desactivó (404/410), o la app no tiene sesión activa. */
    SESION_NO_DISPONIBLE,

    /** YouTube no pudo validar la canción (502/503: cuota, servicio o clave). No se arregla reintentando de inmediato. */
    SERVICIO_NO_DISPONIBLE,

    /**
     * Solo en solicitar y votar: la petición pudo llegar al servidor pero no hubo respuesta (timeout, corte).
     * No se sabe si se registró; hay que consultar la cola antes de repetir.
     */
    SIN_CONFIRMAR,
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
    data class Aceptada(
        val solicitud: SolicitudCola,
        val sumoVotoAExistente: Boolean,
        /** `voto.origen` de la respuesta; `null` si no se informó. */
        val origenVoto: TipoVoto? = null,
        val miVotacion: MiVotacion? = null,
    ) : ResultadoSolicitud
    data class Rechazada(val motivo: MotivoRechazoOperacion, val faltantes: Int? = null) : ResultadoSolicitud
    data class Error(val tipo: TipoErrorCola) : ResultadoSolicitud
}

sealed interface ResultadoVoto {
    /** Voto manual registrado; [solicitud] trae el total de votos que dice el servidor. */
    data class Registrado(
        val solicitud: SolicitudCola,
        val origenVoto: TipoVoto? = null,
        val miVotacion: MiVotacion? = null,
    ) : ResultadoVoto
    data class Rechazado(val motivo: MotivoRechazoOperacion, val faltantes: Int? = null) : ResultadoVoto
    data class Error(val tipo: TipoErrorCola) : ResultadoVoto
}
