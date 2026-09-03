-- Two saved bank accounts with the same name in the same country are a typo,
-- not two accounts. Partial on `deleted_at` so removing one and saving another
-- under the same name works — the soft-deleted row must not hold the name.
--
-- Lives here as raw SQL because the Prisma schema language cannot express
-- partial indexes; the sql/ runner applies it after every `db push`.

CREATE UNIQUE INDEX IF NOT EXISTS saved_bank_accounts_unique_label
  ON "saved_bank_accounts" ("profile_id", "country", "label")
  WHERE "deleted_at" IS NULL;
