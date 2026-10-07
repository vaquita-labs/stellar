-- Kill switch for the 1Click bridge (Base USDC / Polygon USDT ↔ Stellar USDC).
--
-- 1Click can stop quoting a route for reasons outside Vaquita: on 2026-10-01 a
-- NEAR Intents exploit paused every HOT Omni network, Stellar and Polygon among
-- them. With the switch off the API answers new quotes and transfers with 503
-- and the web hides the Bridge tile, the "USDC on Base" row and the bridge-tier
-- platforms (Takenos, Wallbit). Transfers already in flight keep refreshing.
--
-- Additive, defaults to true, so applying it changes nothing for users.

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS bridge_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN config.bridge_enabled IS
  'false = 1Click bridge off: POST /bridge/quote and /bridge/transfers return 503 and the web hides every bridge entry point. In-flight transfers keep refreshing.';
