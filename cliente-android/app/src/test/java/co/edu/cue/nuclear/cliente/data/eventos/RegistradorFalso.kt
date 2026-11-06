package co.edu.cue.nuclear.cliente.data.eventos

/** Registrador de pruebas: guarda los eventos en memoria. */
class RegistradorFalso : RegistradorEventos {
    val eventos = mutableListOf<Evento>()

    override fun registrar(evento: Evento) {
        eventos += evento
    }
}
