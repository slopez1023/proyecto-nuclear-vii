-- Reversión manual de 108_f8_automatizacion_dispositivos.sql (fuera del directorio leído por el migrador automático).
DROP INDEX IF EXISTS dispositivo_sesion_actividad;
ALTER TABLE dispositivo_sesion DROP COLUMN IF EXISTS ultima_actividad;
ALTER TABLE e5_jornada DROP COLUMN IF EXISTS motivo_cierre;
DROP TABLE IF EXISTS e5_jornada_programada;
