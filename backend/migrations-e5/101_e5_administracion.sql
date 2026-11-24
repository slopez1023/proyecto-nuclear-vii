-- Entregable 5: administración y continuidad musical (PostgreSQL 16).
-- ADITIVA: solo crea tablas nuevas con prefijo e5_. No altera ni borra tablas, columnas, restricciones ni datos
-- de los entregables 3 y 4. Fechas en BIGINT epoch ms (mismo criterio que 001_esquema.sql). Idempotente.

-- Personal autorizado (administrador del establecimiento y DJ / operador de sonido)
CREATE TABLE IF NOT EXISTS e5_usuario (
  id_usuario         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_establecimiento TEXT    NOT NULL REFERENCES establecimiento,
  usuario            TEXT    NOT NULL UNIQUE,
  nombre             TEXT    NOT NULL,
  rol                TEXT    NOT NULL CHECK (rol IN ('admin','dj')),
  clave_hash         TEXT    NOT NULL,                 -- scrypt$N$r$p$sal$hash (nunca la clave en claro)
  activo             BOOLEAN NOT NULL DEFAULT true,
  creado_en          BIGINT  NOT NULL,
  ultimo_acceso      BIGINT
);

-- Sesiones de acceso al panel (se guarda el SHA-256 del token, nunca el token)
CREATE TABLE IF NOT EXISTS e5_sesion_usuario (
  token_hash  TEXT   PRIMARY KEY,
  id_usuario  BIGINT NOT NULL REFERENCES e5_usuario,
  creado_en   BIGINT NOT NULL,
  expira_en   BIGINT NOT NULL,
  cerrado_en  BIGINT
);

-- Listas de reproducción predeterminadas (continuidad musical)
CREATE TABLE IF NOT EXISTS e5_lista (
  id_lista           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_establecimiento TEXT    NOT NULL REFERENCES establecimiento,
  nombre             TEXT    NOT NULL,
  descripcion        TEXT,
  en_rotacion        BOOLEAN NOT NULL DEFAULT true,
  creada_en          BIGINT  NOT NULL,
  actualizada_en     BIGINT  NOT NULL,
  eliminada_en       BIGINT                            -- borrado lógico: el historial la sigue referenciando
);

CREATE TABLE IF NOT EXISTS e5_lista_cancion (
  id_lista    BIGINT  NOT NULL REFERENCES e5_lista,
  id_cancion  BIGINT  NOT NULL REFERENCES cancion,
  posicion    INTEGER NOT NULL CHECK (posicion > 0),
  agregada_en BIGINT  NOT NULL,
  PRIMARY KEY (id_lista, id_cancion)
);
CREATE INDEX IF NOT EXISTS e5_lista_cancion_orden ON e5_lista_cancion (id_lista, posicion);

-- Configuración operativa por establecimiento
CREATE TABLE IF NOT EXISTS e5_config_establecimiento (
  id_establecimiento  TEXT    PRIMARY KEY REFERENCES establecimiento,
  id_sesion_principal TEXT    REFERENCES sesion,       -- la sesión que abre/cierra el horario
  modo_automatico     BOOLEAN NOT NULL DEFAULT false,  -- true = el horario abre/cierra sesión y QR
  pausa_manual        BOOLEAN NOT NULL DEFAULT false,  -- true = QR desactivado aunque el horario esté abierto
  pausa_motivo        TEXT,
  zona_horaria        TEXT    NOT NULL DEFAULT 'America/Bogota',
  id_lista_defecto    BIGINT  REFERENCES e5_lista,
  rotacion_listas     BOOLEAN NOT NULL DEFAULT false,
  actualizado_en      BIGINT  NOT NULL
);

-- Horario semanal: una franja por día. Si cierre <= apertura la franja termina al día siguiente (p. ej. 20:00-03:00)
CREATE TABLE IF NOT EXISTS e5_horario (
  id_establecimiento TEXT     NOT NULL REFERENCES establecimiento,
  dia_semana         SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),   -- 0 = domingo
  apertura_min       SMALLINT NOT NULL CHECK (apertura_min BETWEEN 0 AND 1439),
  cierre_min         SMALLINT NOT NULL CHECK (cierre_min BETWEEN 0 AND 1439),
  activo             BOOLEAN  NOT NULL DEFAULT true,
  actualizado_en     BIGINT   NOT NULL,
  PRIMARY KEY (id_establecimiento, dia_semana),
  CHECK (apertura_min <> cierre_min)
);

-- Excepciones por fecha local (festivos, eventos especiales, cierres)
CREATE TABLE IF NOT EXISTS e5_horario_excepcion (
  id_excepcion       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_establecimiento TEXT     NOT NULL REFERENCES establecimiento,
  fecha              TEXT     NOT NULL CHECK (fecha ~ '^\d{4}-\d{2}-\d{2}$'),
  cerrado            BOOLEAN  NOT NULL,
  apertura_min       SMALLINT CHECK (apertura_min BETWEEN 0 AND 1439),
  cierre_min         SMALLINT CHECK (cierre_min BETWEEN 0 AND 1439),
  motivo             TEXT,
  creado_en          BIGINT   NOT NULL,
  UNIQUE (id_establecimiento, fecha),
  CHECK (cerrado OR (apertura_min IS NOT NULL AND cierre_min IS NOT NULL AND apertura_min <> cierre_min))
);

-- Jornadas: cada apertura y cierre de una sesión (historial; nunca se borra)
CREATE TABLE IF NOT EXISTS e5_jornada (
  id_jornada            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_sesion             TEXT   NOT NULL REFERENCES sesion,
  abierta_en            BIGINT NOT NULL,
  origen_apertura       TEXT   NOT NULL CHECK (origen_apertura IN ('manual','horario')),
  cerrada_en            BIGINT,
  origen_cierre         TEXT   CHECK (origen_cierre IN ('manual','horario')),
  solicitudes_retiradas INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS e5_jornada_abierta_unica ON e5_jornada (id_sesion) WHERE cerrada_en IS NULL;

-- Estado del reproductor por sesión (lo temporal). La canción de lista en curso vive aquí y NO en `reproduccion`
-- mientras suena: así la regla de inactividad del E4 (H1) sigue funcionando. Al terminar se registra en `reproduccion`
-- con id_solicitud NULL (valor reservado para la lista por defecto en 001_esquema.sql).
CREATE TABLE IF NOT EXISTS e5_estado_reproduccion (
  id_sesion        TEXT   PRIMARY KEY REFERENCES sesion,
  estado           TEXT   NOT NULL CHECK (estado IN ('detenida','reproduciendo','pausada','en_espera')),
  pausada_en       BIGINT,
  lista_id         BIGINT REFERENCES e5_lista,
  lista_posicion   INTEGER,
  lista_cancion    BIGINT REFERENCES cancion,
  lista_inicio_en  BIGINT,
  actualizado_en   BIGINT NOT NULL
);

-- Bloqueo temporal de contenido
CREATE TABLE IF NOT EXISTS e5_bloqueo (
  id_bloqueo         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_establecimiento TEXT   NOT NULL REFERENCES establecimiento,
  id_cancion         BIGINT NOT NULL REFERENCES cancion,
  motivo             TEXT   NOT NULL,
  desde              BIGINT NOT NULL,
  hasta              BIGINT NOT NULL,
  creado_por         BIGINT REFERENCES e5_usuario,
  levantado_en       BIGINT,
  levantado_por      BIGINT REFERENCES e5_usuario,
  CHECK (hasta > desde)
);
CREATE INDEX IF NOT EXISTS e5_bloqueo_vigente ON e5_bloqueo (id_establecimiento, id_cancion, hasta);

-- Registro de auditoría de las acciones administrativas (complementa los eventos analíticos JSONL)
CREATE TABLE IF NOT EXISTS e5_registro (
  id_registro        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_establecimiento TEXT   NOT NULL REFERENCES establecimiento,
  id_usuario         BIGINT REFERENCES e5_usuario,
  accion             TEXT   NOT NULL,
  detalle            JSONB  NOT NULL DEFAULT '{}'::jsonb,
  fecha              BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS e5_registro_fecha ON e5_registro (id_establecimiento, fecha DESC);
