package co.edu.cue.nuclear.cliente.data.cola.simulado

import co.edu.cue.nuclear.cliente.data.busqueda.Cancion
import co.edu.cue.nuclear.cliente.data.cola.EstadoCola
import co.edu.cue.nuclear.cliente.data.cola.EstadoSolicitud
import co.edu.cue.nuclear.cliente.data.cola.ReproduccionActual
import co.edu.cue.nuclear.cliente.data.cola.SolicitudCola

/**
 * DATOS SIMULADOS (solo variante debug). No son información del backend.
 * Los identificadores `SIM-…` hacen evidente que son de prueba. Las esperas son ejemplos
 * fijos: el cálculo real lo hace el backend.
 */
object DatosSimulados {

    private fun cancion(id: String, titulo: String, artista: String, segundos: Int?) = Cancion(
        youtubeVideoId = "SIM-$id",
        titulo = titulo,
        artistaCanal = artista,
        duracionSegundos = segundos,
        urlMiniatura = null,
        disponible = true,
    )

    val sweetChild = cancion("sweet-child", "Sweet Child O' Mine", "Guns N' Roses", 356)
    val bohemian = cancion("bohemian", "Bohemian Rhapsody", "Queen", 355)
    val billieJean = cancion("billie-jean", "Billie Jean", "Michael Jackson", 294)
    val hotelCalifornia = cancion("hotel-california", "Hotel California", "Eagles", 391)
    val dancingQueen = cancion("dancing-queen", "Dancing Queen", "ABBA", 231)
    val livinOnAPrayer = cancion("livin-prayer", "Livin' on a Prayer", "Bon Jovi", null)

    /** Canción que no está en ninguna cola simulada; sirve para probar una solicitud nueva. */
    val nuevaCancion = cancion("nueva", "Africa", "Toto", 295)

    val reproduccionActual = ReproduccionActual(
        idSolicitud = "SIM-SOL-0000",
        cancion = sweetChild,
        segundosRestantesEstimados = 134,
    )

    /** Cola ya ordenada por votos: 3, 2, 1 y 1 (los dos últimos desempatan por antigüedad). */
    fun colaConVarias(): EstadoCola = EstadoCola(
        reproduccionActual = reproduccionActual,
        cola = listOf(
            pendiente("SIM-SOL-0001", bohemian, 1, 3, esMia = true, yaVoto = true, espera = 134),
            pendiente("SIM-SOL-0002", billieJean, 2, 2, esMia = false, yaVoto = true, espera = 489),
            pendiente("SIM-SOL-0003", hotelCalifornia, 3, 1, esMia = false, yaVoto = false, espera = 783),
            pendiente("SIM-SOL-0004", livinOnAPrayer, 4, 1, esMia = false, yaVoto = false, espera = null),
        ),
    )

    /** Suena una canción y no hay nadie esperando. */
    fun soloReproduciendo(): EstadoCola = EstadoCola(reproduccionActual, emptyList())

    /** Nada suena y nada espera. */
    fun colaVacia(): EstadoCola = EstadoCola(reproduccionActual = null, cola = emptyList())

    private fun pendiente(
        id: String,
        cancion: Cancion,
        posicion: Int,
        votos: Int,
        esMia: Boolean,
        yaVoto: Boolean,
        espera: Int?,
    ) = SolicitudCola(
        idSolicitud = id,
        cancion = cancion,
        estado = EstadoSolicitud.PENDIENTE,
        posicion = posicion,
        totalVotos = votos,
        esMia = esMia,
        yaVoto = yaVoto,
        esperaEstimadaSegundos = espera,
    )
}
