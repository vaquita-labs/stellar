// Derive a level + progress from a single total-XP value. The backend only
// exposes aggregated `experience`, so the level curve lives here until it does:
// reaching the next level costs 100 XP, +50 more each level (100, 150, 200 …).
// Shared by the profile summary page and the XP modal so both stay in sync.
export function deriveLevel(totalXp: number) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  let xpForNextLevel = 100;
  while (remaining >= xpForNextLevel && level < 999) {
    remaining -= xpForNextLevel;
    level += 1;
    xpForNextLevel = 100 + (level - 1) * 50;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel };
}
