/**
 * TEMP — placeholder stats per wallet for the Leaderboard cards.
 *
 * The current `/profile/.../by-average-deposits` endpoint only exposes
 * economic activity (totalSums, lastSum, count, timestamp). To honor the
 * privacy requirement we hide those values and instead surface
 * gamification signals (level / streak / badge count) on the leaderboard.
 *
 * Until the backend ships per-user XP + streak + badges in the listing
 * endpoint, this helper derives stable, plausible-looking values from the
 * wallet address itself. The output is fully deterministic — the same
 * wallet always gets the same numbers, so the UI doesn't flicker.
 *
 * Replace `derivePlaceholderUserStats` with real data once the API exposes
 * it; the call site in `LeaderboardPage` is already keyed on wallet.
 */

export type PlaceholderUserStats = {
  level: number;
  streak: number;
  badges: number;
  likes: number;
  comments: number;
};

const LEVEL_RANGE = 12; // 1..12
const STREAK_RANGE = 80; // 1..80
const BADGES_RANGE = 15; // 1..15
const LIKES_RANGE = 240; // 0..240
const COMMENTS_RANGE = 32; // 0..32

/** Tiny 32-bit string hash. Not cryptographic — only used for stable demo
 *  values. */
function hashWallet(wallet: string): number {
  let h = 2166136261;
  for (let i = 0; i < wallet.length; i++) {
    h ^= wallet.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function derivePlaceholderUserStats(wallet: string): PlaceholderUserStats {
  const h = hashWallet(wallet || 'anonymous');
  return {
    level: 1 + (h % LEVEL_RANGE),
    streak: 1 + ((h >>> 8) % STREAK_RANGE),
    badges: 1 + ((h >>> 16) % BADGES_RANGE),
    likes: (h >>> 4) % LIKES_RANGE,
    comments: (h >>> 12) % COMMENTS_RANGE,
  };
}
