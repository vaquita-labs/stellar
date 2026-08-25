-- map_objects is a catalog, keyed in practice by (type, variants). A duplicate
-- pair makes the shop render the same item twice and makes the seed script
-- insert where it meant to update.
--
-- Not expressible as @@unique in the Prisma schema without changing the model's
-- shape, so `prisma db push` drops it during reconciliation; this directory
-- re-runs after every push and puts it back.
CREATE UNIQUE INDEX IF NOT EXISTS map_objects_type_variants_uq
  ON "map_objects" ("type", "variants");
