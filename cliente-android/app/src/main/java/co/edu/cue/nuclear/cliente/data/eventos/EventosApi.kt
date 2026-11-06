package co.edu.cue.nuclear.cliente.data.eventos

import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/** Contrato real del backend: POST /api/eventos responde 202 con `{ "evento_id": "..." }`. */
interface EventosApi {
    @POST("api/eventos")
    suspend fun enviar(@Body evento: JsonObject): Response<Unit>
}
