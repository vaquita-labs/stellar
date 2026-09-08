-- Notas de versión en varios idiomas.
--
-- Una sola columna `jsonb` en vez de `title_es` / `body_es` / `title_pt` / … :
-- sumar un idioma es escribir una clave más, no una migración más, y la app ya
-- guarda así todo lo que varía por idioma (`config.languages`, `config.currencies`).
--
-- Las columnas `title` / `body` que ya existen NO se tocan y siguen siendo el
-- texto que se muestra cuando el idioma del usuario no tiene traducción. Ese es
-- el punto: una nota se puede publicar con un solo idioma escrito y nadie ve un
-- popup vacío. Por eso tampoco hay `NOT NULL` sobre las traducciones ni un
-- CHECK que exija los tres — exigirlos convertiría "falta el portugués" en
-- "no se puede publicar".
--
-- Forma esperada: {"es": {"title": "...", "body": "..."}, "pt": {...}}
-- Los idiomas desconocidos y las claves mal formadas se descartan en la lectura
-- (`parseReleaseNoteTranslations`), así que el CHECK sólo cuida que esto sea un
-- objeto y no una lista o un número.

ALTER TABLE "release_notes"
  ADD COLUMN IF NOT EXISTS "translations" jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'release_notes_translations_check'
  ) THEN
    ALTER TABLE "release_notes"
      ADD CONSTRAINT release_notes_translations_check
      CHECK (jsonb_typeof("translations") = 'object');
  END IF;
END $$;
