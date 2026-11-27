-- Fase 7: códigos de acceso numéricos de 6 dígitos asociados a la misma sesión.
-- ADITIVA: crea una tabla independiente referenciando `sesion(id_sesion)` sin alterar tablas del E3/E4.

CREATE TABLE IF NOT EXISTS e5_codigo_acceso (
  id_codigo         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_sesion         TEXT        NOT NULL REFERENCES sesion,
  codigo            VARCHAR(6)  NOT NULL CHECK (codigo ~ '^[0-9]{6}$'),
  vigente           BOOLEAN     NOT NULL DEFAULT true,
  creado_en         BIGINT      NOT NULL,
  revocado_en       BIGINT,
  motivo_revocacion TEXT,
  CHECK (vigente OR revocado_en IS NOT NULL)
);

-- Garantiza unicidad entre códigos vigentes (protección contra colisiones y concurrencia).
CREATE UNIQUE INDEX IF NOT EXISTS e5_codigo_acceso_codigo_vigente
  ON e5_codigo_acceso (codigo)
  WHERE vigente;

-- Garantiza a lo sumo un código vigente por sesión.
CREATE UNIQUE INDEX IF NOT EXISTS e5_codigo_acceso_sesion_vigente
  ON e5_codigo_acceso (id_sesion)
  WHERE vigente;
