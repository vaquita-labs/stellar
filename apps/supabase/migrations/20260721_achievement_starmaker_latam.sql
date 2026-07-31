-- Badge secreto "StarMaker LATAM".
--
-- No hace falta código nuevo: el catálogo ya soporta badges ocultos
-- (`hidden = true` los excluye de GET /wallets/:wallet/badges hasta que el
-- usuario los reclama — ver el filtro en toProfileAchievementsResponseDTO) y
-- desbloqueo por código (`unlock_type = 'redeem_code'`, canjeado desde el modal
-- "Redeem code" del perfil). Esto es sólo la fila.
--
-- El código se guarda en minúsculas, como los otros redeem_code de la tabla
-- (`7days`, `feedback`). La búsqueda es case-insensitive, así que el usuario
-- puede escribirlo como quiera — el input del modal lo muestra en mayúsculas.
--
-- Idempotente: se puede correr de nuevo sin duplicar ni pisar cambios hechos
-- desde el admin.

INSERT INTO achievements (
  key,
  name,
  description,
  tier,
  code,
  coin_reward,
  hidden,
  unlock_type,
  icon,
  accent,
  display_order,
  enabled,
  -- Sin default en la tabla: lo escribe Prisma (@updatedAt) en el runtime, así
  -- que un INSERT a mano tiene que ponerlo o falla el NOT NULL.
  updated_at
) VALUES (
  'starmaker_latam',
  'StarMaker LATAM',
  'Estuviste en StarMaker LATAM. Un badge que no aparece en la lista hasta que alguien te pasa el código.',
  'Founder',
  'starmaker',
  100,
  TRUE,
  'redeem_code',
  '/icons/achievements/starmaker_latam.png',
  'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
  20,
  TRUE,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Verificación:
--   SELECT key, hidden, unlock_type, code, enabled FROM achievements
--   WHERE key = 'starmaker_latam';
--
-- Para rotar el código sin tocar el badge ya reclamado por nadie:
--   UPDATE achievements SET code = '<nuevo>' WHERE key = 'starmaker_latam';
