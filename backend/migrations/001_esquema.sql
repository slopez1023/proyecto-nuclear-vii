-- Esquema del Entregable 4 (PostgreSQL 16). Traducción del esquema de la sección 4 de
-- docs/entregable-4/propuesta-backend-e4.md. Las fechas se guardan como BIGINT (epoch ms) para que la
-- comparación estricta inicio_en > L (decisión 5, caso B4d) trabaje con milisegundos exactos.
-- Idempotente: se puede ejecutar varias veces sin error.

CREATE TABLE IF NOT EXISTS establecimiento (
  id_establecimiento TEXT PRIMARY KEY,               -- 'EST-MOCK-001' (viene del mock)
  nombre             TEXT NOT NULL,
  estado             TEXT NOT NULL DEFAULT 'activo'
);

CREATE TABLE IF NOT EXISTS sesion (
  id_sesion          TEXT PRIMARY KEY,               -- 'SES-MOCK-001'
  id_establecimiento TEXT NOT NULL REFERENCES establecimiento,
  qr_token           TEXT NOT NULL UNIQUE,
  estado             TEXT NOT NULL CHECK (estado IN ('activa','cerrada')),
  qr_estado          TEXT NOT NULL CHECK (qr_estado IN ('activo','inactivo')),
  version_cola       BIGINT NOT NULL DEFAULT 0       -- se incrementa en cada cambio visible de la cola
);

CREATE TABLE IF NOT EXISTS dispositivo (
  id_dispositivo          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identificador_seudonimo TEXT   NOT NULL UNIQUE,    -- UUID generado por la app
  creado_en               BIGINT NOT NULL,           -- epoch ms
  ultima_actividad        BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS dispositivo_sesion (      -- sustituye el vínculo Dispositivo→Sesión del ER
  id_dispositivo     BIGINT NOT NULL REFERENCES dispositivo,
  id_sesion          TEXT   NOT NULL REFERENCES sesion,
  unido_en           BIGINT NOT NULL,
  ultima_conexion    BIGINT,
  ultima_desconexion BIGINT,
  PRIMARY KEY (id_dispositivo, id_sesion)
);

CREATE TABLE IF NOT EXISTS cancion (
  id_cancion          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  youtube_video_id    TEXT   NOT NULL UNIQUE,
  titulo              TEXT   NOT NULL,
  artista_canal       TEXT   NOT NULL,
  duracion_segundos   INTEGER,                       -- NULL si YouTube no la da
  url_miniatura       TEXT,
  disponibilidad      TEXT   NOT NULL CHECK (disponibilidad IN ('disponible','no_disponible')),
  -- Motivo del rechazo del catálogo (sección 8) guardado para responder 422 sin volver a llamar a YouTube.
  motivo_no_permitida TEXT CHECK (motivo_no_permitida IN ('no_musica','no_embebible','no_publico','en_vivo','sin_duracion')),
  consultado_en       BIGINT NOT NULL                -- última validación contra YouTube
);

CREATE TABLE IF NOT EXISTS solicitud (
  id_solicitud    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_sesion       TEXT   NOT NULL REFERENCES sesion,
  id_cancion      BIGINT NOT NULL REFERENCES cancion,
  id_dispositivo  BIGINT NOT NULL REFERENCES dispositivo,   -- quien la creó
  fecha_solicitud BIGINT NOT NULL,
  estado          TEXT   NOT NULL CHECK (estado IN
                   ('pendiente','en_reproduccion','reproducida','fallida','saltada','retirada'))
);
-- Defensa final contra duplicados: una sola solicitud viva por canción y sesión
CREATE UNIQUE INDEX IF NOT EXISTS solicitud_viva_unica ON solicitud (id_sesion, id_cancion)
  WHERE estado IN ('pendiente','en_reproduccion');
CREATE INDEX IF NOT EXISTS solicitud_cola ON solicitud (id_sesion, estado);

CREATE TABLE IF NOT EXISTS voto (
  id_voto            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_solicitud       BIGINT NOT NULL REFERENCES solicitud,
  id_dispositivo     BIGINT NOT NULL REFERENCES dispositivo,
  id_establecimiento TEXT   NOT NULL REFERENCES establecimiento,
  fecha_hora         BIGINT NOT NULL,
  origen             TEXT   NOT NULL CHECK (origen IN ('solicitud','manual')),
  CONSTRAINT voto_unico_por_dispositivo UNIQUE (id_solicitud, id_dispositivo)  -- un voto por dispositivo y solicitud
);
CREATE INDEX IF NOT EXISTS voto_intervalo ON voto (id_dispositivo, id_establecimiento, fecha_hora);

CREATE TABLE IF NOT EXISTS reproduccion (
  id_reproduccion       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_sesion             TEXT   NOT NULL REFERENCES sesion,
  id_establecimiento    TEXT   NOT NULL REFERENCES establecimiento,
  id_solicitud          BIGINT REFERENCES solicitud,          -- NULL reservado para la lista por defecto (E5)
  id_cancion            BIGINT NOT NULL REFERENCES cancion,
  inicio_en             BIGINT NOT NULL,
  fin_en                BIGINT,
  resultado             TEXT   NOT NULL CHECK (resultado IN ('en_curso','exitosa','fallida')),
  segundos_reproducidos INTEGER,
  codigo_error          TEXT,
  origen                TEXT   NOT NULL CHECK (origen IN ('simulacion','reproductor'))
);
CREATE UNIQUE INDEX IF NOT EXISTS reproduccion_en_curso_unica ON reproduccion (id_sesion) WHERE resultado = 'en_curso';
CREATE INDEX IF NOT EXISTS reproduccion_intervalo ON reproduccion (id_establecimiento, resultado, inicio_en);
