-- Entregable 5 / Pantalla Pública (FASE 4): autoridad exclusiva del televisor, claim_code seguro y tiempo efectivo.
-- ADITIVA: solo amplía restricciones/columnas de tablas e5_*. No modifica tablas del E3/E4.

-- 1. Ampliar salidas válidas del sistema de sonido para incluir la pantalla pública autorizada.
ALTER TABLE e5_sonido DROP CONSTRAINT IF EXISTS e5_sonido_salida_check;
ALTER TABLE e5_sonido ADD CONSTRAINT e5_sonido_salida_check
  CHECK (salida IN ('panel', 'equipo_local', 'pantalla_publica'));

-- 2. Credenciales efímeras de autorización y lease exclusivo de reproducción en e5_display.
ALTER TABLE e5_display ADD COLUMN IF NOT EXISTS claim_hash TEXT;
ALTER TABLE e5_display ADD COLUMN IF NOT EXISTS claim_expira_en BIGINT;
ALTER TABLE e5_display ADD COLUMN IF NOT EXISTS claim_intentos SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE e5_display ADD COLUMN IF NOT EXISTS control_hash TEXT;
ALTER TABLE e5_display ADD COLUMN IF NOT EXISTS control_expira_en BIGINT;
ALTER TABLE e5_display ADD COLUMN IF NOT EXISTS ultimo_latido_display BIGINT;

-- 3. Seguimiento de pausas acumuladas e identificador único persistente por reproducción en e5_estado_reproduccion.
ALTER TABLE e5_estado_reproduccion ADD COLUMN IF NOT EXISTS tiempo_pausado_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE e5_estado_reproduccion ADD COLUMN IF NOT EXISTS reproduccion_uid TEXT;
