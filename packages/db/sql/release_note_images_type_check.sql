-- release_note_images.content_type is what the image endpoint echoes back in the
-- Content-Type header. An unexpected value there is served to every user, so the
-- set is closed to the three formats the admin uploader produces.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'release_note_images_type_check'
  ) THEN
    ALTER TABLE "release_note_images"
      ADD CONSTRAINT "release_note_images_type_check"
      CHECK (content_type = ANY (ARRAY['image/png', 'image/jpeg', 'image/webp']));
  END IF;

  -- 2 MB, same ceiling as feedback attachments. The handler enforces it too;
  -- this is the backstop for any other writer.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'release_note_images_size_check'
  ) THEN
    ALTER TABLE "release_note_images"
      ADD CONSTRAINT "release_note_images_size_check"
      CHECK (byte_size > 0 AND byte_size <= 2097152);
  END IF;
END $$;
