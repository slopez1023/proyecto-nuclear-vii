-- Fase 8: automatización de sesiones por horario, seguimiento de jornadas programadas y persistencia de dispositivos.
-- ADITIVA e idempotente: no elimina ni modifica registros históricos de E3/E4/E5/F7.

CREATE TABLE IF NOT EXISTS e5_jornada_programada (
  id_establecimiento     TEXT   NOT NULL REFERENCES establecimiento,
  fecha_jornada          TEXT   NOT NULL CHECK (fecha_jornada ~ '^\d{4}-\d{2}-\d{2}$'),
  apertura_programada_en BIGINT NOT NULL,
  cierre_programado_en   BIGINT NOT NULL,
  id_sesion              TEXT   REFERENCES sesion,
  estado                 TEXT   NOT NULL CHECK (estado IN (
    'abierta', 'cerrada_auto', 'cerrada_manual', 'omitida_sesion_manual'
  )),
  motivo                 TEXT,
  creada_en              BIGINT NOT NULL,
  cerrada_en             BIGINT,
  PRIMARY KEY (id_establecimiento, fecha_jornada)
);

CREATE INDEX IF NOT EXISTS e5_jornada_prog_abierta
  ON e5_jornada_programada (estado, cierre_programado_en)
  WHERE estado = 'abierta';

CREATE UNIQUE INDEX IF NOT EXISTS e5_jornada_prog_sesion_unica
  ON e5_jornada_programada (id_sesion)
  WHERE id_sesion IS NOT NULL;

ALTER TABLE e5_jornada ADD COLUMN IF NOT EXISTS motivo_cierre TEXT;

ALTER TABLE dispositivo_sesion ADD COLUMN IF NOT EXISTS ultima_actividad BIGINT;

UPDATE dispositivo_sesion
SET ultima_actividad = COALESCE(ultima_desconexion, ultima_conexion, unido_en)
WHERE ultima_actividad IS NULL;

CREATE INDEX IF NOT EXISTS dispositivo_sesion_actividad
  ON dispositivo_sesion (id_sesion, ultima_actividad DESC);
