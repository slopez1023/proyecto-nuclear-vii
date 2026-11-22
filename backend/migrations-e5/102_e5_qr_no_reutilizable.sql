-- Entregable 5: registro de sesiones y códigos QR desactivados de forma irreversible.
-- Un QR o sesión desactivada manualmente no puede volver a activarse, y todos los QR deben ser únicos.
CREATE TABLE IF NOT EXISTS e5_qr_desactivado (
  id_sesion      TEXT   PRIMARY KEY REFERENCES sesion,
  qr_token       TEXT   NOT NULL UNIQUE,
  motivo         TEXT   NOT NULL CHECK (motivo IN ('qr_desactivado','sesion_cerrada')),
  desactivado_en BIGINT NOT NULL
);
