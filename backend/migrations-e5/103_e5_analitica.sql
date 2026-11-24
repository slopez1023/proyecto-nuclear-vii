-- Entregable 6 / Analítica: almacenamiento limpio de eventos y registro de corridas del pipeline.
CREATE TABLE IF NOT EXISTS e5_analitica_evento (
  evento_id          TEXT   PRIMARY KEY,
  tipo               TEXT   NOT NULL,
  fecha_hora         BIGINT NOT NULL,
  sesion_id          TEXT,
  id_establecimiento TEXT,
  actor              TEXT   NOT NULL,
  dispositivo_hash   TEXT,  -- Identificador anonimizado (HMAC-SHA256 truncado); nunca se guarda el UUID crudo
  version_esquema    TEXT,
  datos_evento       JSONB  NOT NULL DEFAULT '{}'::jsonb,
  ingestado_en       BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS e5_analitica_evento_est_fecha
  ON e5_analitica_evento (id_establecimiento, fecha_hora DESC);

CREATE INDEX IF NOT EXISTS e5_analitica_evento_sesion
  ON e5_analitica_evento (sesion_id, tipo);

CREATE TABLE IF NOT EXISTS e5_analitica_corrida (
  id_corrida   BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ejecutado_en BIGINT  NOT NULL,
  leidos       INTEGER NOT NULL,
  validos      INTEGER NOT NULL,
  duplicados   INTEGER NOT NULL,
  descartados  INTEGER NOT NULL,
  anonimizados INTEGER NOT NULL
);
