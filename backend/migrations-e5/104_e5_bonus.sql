-- Funcionalidades opcionales (bonificación): filtros por género, respaldo de listas populares y sistema de sonido.
-- ADITIVA: solo tablas nuevas; no altera el esquema del E3/E4.

-- Género musical por canción (etiquetado manual o inferido por palabras clave del título/canal).
CREATE TABLE IF NOT EXISTS e5_cancion_genero (
  id_cancion BIGINT PRIMARY KEY REFERENCES cancion,
  genero     TEXT   NOT NULL,
  origen     TEXT   NOT NULL CHECK (origen IN ('manual','inferido')),
  fijado_en  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS e5_cancion_genero_genero ON e5_cancion_genero (genero);

-- Respaldo automático de las listas más populares (para análisis posterior).
CREATE TABLE IF NOT EXISTS e5_respaldo_lista (
  id_respaldo        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_establecimiento TEXT   NOT NULL REFERENCES establecimiento,
  generado_en        BIGINT NOT NULL,
  origen             TEXT   NOT NULL CHECK (origen IN ('automatico','manual')),
  archivo            TEXT,
  total_canciones    INTEGER NOT NULL,
  contenido          JSONB  NOT NULL
);
CREATE INDEX IF NOT EXISTS e5_respaldo_lista_est ON e5_respaldo_lista (id_establecimiento, generado_en DESC);

-- Integración con el sistema de sonido del establecimiento (volumen, silencio y salida de audio).
CREATE TABLE IF NOT EXISTS e5_sonido (
  id_establecimiento TEXT     PRIMARY KEY REFERENCES establecimiento,
  volumen            SMALLINT NOT NULL DEFAULT 80 CHECK (volumen BETWEEN 0 AND 100),
  silenciado         BOOLEAN  NOT NULL DEFAULT false,
  salida             TEXT     NOT NULL DEFAULT 'panel' CHECK (salida IN ('panel','equipo_local')),
  ultimo_latido      BIGINT,
  actualizado_en     BIGINT   NOT NULL
);
