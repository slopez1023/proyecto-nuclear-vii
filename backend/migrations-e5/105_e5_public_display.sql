-- Entregable 5 / Pantalla Pública: token de visualización independiente por sesión.
-- ADITIVA: solo crea tabla, índice, función y trigger propios de e5_display. No altera tablas E3/E4.
-- Fechas en BIGINT epoch ms (misma convención que 001_esquema.sql y 101-104).

CREATE TABLE IF NOT EXISTS e5_display (
  id_display         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_establecimiento TEXT    NOT NULL REFERENCES establecimiento,
  id_sesion          TEXT    NOT NULL REFERENCES sesion,
  display_token      TEXT    NOT NULL UNIQUE,
  activo             BOOLEAN NOT NULL DEFAULT true,
  creado_en          BIGINT  NOT NULL,
  revocado_en        BIGINT,
  ultimo_acceso      BIGINT,
  CHECK (activo OR revocado_en IS NOT NULL)
);

-- Un solo display activo por sesión (v1: un televisor principal por sesión).
CREATE UNIQUE INDEX IF NOT EXISTS e5_display_sesion_activa_unica
  ON e5_display (id_sesion) WHERE activo = true;

CREATE INDEX IF NOT EXISTS e5_display_est
  ON e5_display (id_establecimiento, activo);

-- Garantiza correspondencia real entre id_establecimiento e id_sesion sin alterar la tabla `sesion` del E3/E4.
CREATE OR REPLACE FUNCTION e5_verificar_display_sesion()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sesion
    WHERE id_sesion = NEW.id_sesion AND id_establecimiento = NEW.id_establecimiento
  ) THEN
    RAISE EXCEPTION 'La sesión % no pertenece al establecimiento %', NEW.id_sesion, NEW.id_establecimiento;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_e5_display_sesion ON e5_display;
CREATE TRIGGER trg_e5_display_sesion
  BEFORE INSERT OR UPDATE OF id_sesion, id_establecimiento ON e5_display
  FOR EACH ROW EXECUTE FUNCTION e5_verificar_display_sesion();
