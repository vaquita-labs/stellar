-- La tabla no tiene una columna única tipo "key", así que el upsert usa (type, variants).
-- Este índice único es necesario para que el ON CONFLICT funcione (no hace nada si ya existe):
CREATE UNIQUE INDEX IF NOT EXISTS map_objects_type_variants_uq ON "public"."map_objects" ("type", "variants");

INSERT INTO "public"."map_objects" ("type", "size", "variants", "prices", "free_items", "deleted_at", "updated_at") VALUES
-- Vegetación (de más barato a más caro)
('grass', '1,1,1', '0', '25', '2', null, now()),
('bush', '1,1,1', '0', '40', '0', null, now()),
('tree', '1,1,1', '0', '60', '1', null, now()),
('tree', '1,1,1', '4', '90', '0', null, now()),
('tree', '1,1,1', '6', '80', '0', null, now()),
-- Terreno / caminos
('rock', '1,1,1', '3', '120', '1', null, now()),
('road', '1,1,1', '0', '20', '0', null, now()),
-- Estructuras / decoración (free_items = 0: solo por compra o grant de admin)
('clock', '1,1,1', '0', '350', '0', null, now()),
('windmill', '1,1,1', '0', '350', '0', null, now()),
('well', '1,1,1', '0', '250', '0', null, now()),
('lamp', '1,1,1', '0', '150', '0', null, now()),
-- Eliminados (soft delete)
('bank', '1,1,1', '0', '500', '0', '2026-07-04 10:26:12.026411+00', now())
    ON CONFLICT ("type", "variants") DO UPDATE SET
    "size" = EXCLUDED."size",
                                            "prices" = EXCLUDED."prices",
                                            "free_items" = EXCLUDED."free_items",
                                            "deleted_at" = EXCLUDED."deleted_at",
                                            "updated_at" = now();
