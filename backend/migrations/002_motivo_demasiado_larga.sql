-- E4 (fase de cierre, F3): la regla de canción permitida añade el tope de duración (motivo 'demasiado_larga').
-- Aditiva: solo amplía la lista de motivos válidos de la restricción existente.
ALTER TABLE cancion DROP CONSTRAINT IF EXISTS cancion_motivo_no_permitida_check;
ALTER TABLE cancion ADD CONSTRAINT cancion_motivo_no_permitida_check
  CHECK (motivo_no_permitida IN ('no_musica','no_embebible','no_publico','en_vivo','sin_duracion','demasiado_larga'));
