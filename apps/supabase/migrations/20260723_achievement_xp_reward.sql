-- XP otorgado al reclamar un badge, editable desde el admin (Badges > XP reward).
--
-- Al finalizar un claim (mint confirmado), `claimAchievement` inserta una fila
-- en profiles_rewards con el reward `experience` y reason 'achievement' por este
-- monto — el mismo patrón ledger que las gold coins. El valor se congela en el
-- momento del claim: cambiarlo en el admin solo afecta claims futuros, nunca el
-- XP ya otorgado (el total por usuario suma las filas persistidas, ver
-- getCheckinExperience / getExperienceByProfile).
--
-- Idempotente: se puede correr de nuevo sin efecto.

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS xp_reward INTEGER NOT NULL DEFAULT 0;

-- El claim con XP > 0 necesita la fila `experience` en `rewards` (igual que las
-- monedas necesitan `gold-coin`); sin ella la transacción del claim aborta.
-- Debería existir ya — la usa el XP del daily check-in — así que esto es sólo
-- una red de seguridad para entornos donde falte. Sin ON CONFLICT porque
-- `rewards.key` no tiene índice único.
INSERT INTO rewards (key, name)
SELECT 'experience', 'Experience'
WHERE NOT EXISTS (SELECT 1 FROM rewards WHERE key = 'experience');
