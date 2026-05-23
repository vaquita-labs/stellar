/**
 * Identity-level catalog of achievements (title / description / icon / accent).
 *
 * Decoupled from `profile-badges.ts` on purpose: the share/OG flow needs the
 * static metadata of an achievement without the user-specific signals (XP,
 * streak, unlocked state, …) that `buildAchievements` mixes in. The OG image
 * endpoint and the public share page can resolve a badge by `id` without
 * dragging a fake `AchievementsCtx` through them.
 *
 * When the backend ships a real catalog this file becomes a thin client of
 * that endpoint (e.g. cached `fetch` in a server util). The OG route and the
 * `/share` page stay the same.
 */
export type CatalogAchievement = {
  id: string;
  title: string;
  description: string;
  /** Public path under `apps/web/public`. Always relative — the OG endpoint
   *  resolves it against the request origin before handing it to satori. */
  icon: string;
  /** CSS gradient used as the halo behind the icon. Falls back to the
   *  golden gradient when omitted. */
  accent?: string;
  tier?: 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Founder';
};

export const ACHIEVEMENT_CATALOG: Record<string, CatalogAchievement> = {
  'beta-tester': {
    id: 'beta-tester',
    title: 'Beta Tester',
    description: 'You joined Vaquita during the beta. Thanks for helping us shape it.',
    icon: '/icons/achievements/beta-tester2.png',
    accent: 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
    tier: 'Founder',
  },
  rookie: {
    id: 'rookie',
    title: 'Rookie',
    description: 'Earn your first 50 XP. Welcome to the herd.',
    icon: '/icons/achievements/rookie.png',
    accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
    tier: 'Bronze',
  },
  'week-warrior': {
    id: 'week-warrior',
    title: 'Week Warrior',
    description: 'Reach a 7-day savings streak.',
    icon: '/icons/achievements/week-warrior.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)',
    tier: 'Bronze',
  },
  'first-deposit': {
    id: 'first-deposit',
    title: 'First Deposit',
    description: 'Made your very first deposit in Vaquita.',
    icon: '/icons/achievements/first-deposit.png',
    accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
    tier: 'Bronze',
  },
  'first-friend': {
    id: 'first-friend',
    title: 'Crew Mate',
    description: 'Follow your first fellow vaquero.',
    icon: '/icons/achievements/first-friend.png',
    accent: 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)',
    tier: 'Bronze',
  },
  'savings-starter': {
    id: 'savings-starter',
    title: 'Savings Starter',
    description: 'Reach $100 USDC in cumulative deposits.',
    icon: '/icons/achievements/savings-starter.png',
    accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
    tier: 'Silver',
  },
  'trio-saver': {
    id: 'trio-saver',
    title: 'Triple Threat',
    description: 'Keep 3 active deposits running at the same time.',
    icon: '/icons/achievements/trio-saver.png',
    accent: 'linear-gradient(180deg, #B89AFF 0%, #7C4DFF 100%)',
    tier: 'Silver',
  },
  'month-master': {
    id: 'month-master',
    title: 'Month Master',
    description: 'Reach a 30-day savings streak.',
    icon: '/icons/achievements/month-master.png',
    accent: 'linear-gradient(180deg, #FF8A65 0%, #E64A19 100%)',
    tier: 'Silver',
  },
  explorer: {
    id: 'explorer',
    title: 'Explorer',
    description: 'Earn 300 XP across all challenges.',
    icon: '/icons/achievements/explorer.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)',
    tier: 'Silver',
  },
  'streak-master': {
    id: 'streak-master',
    title: 'Streak Master',
    description: 'Reach a 50-day savings streak.',
    icon: '/icons/achievements/streak-master.png',
    accent: 'linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)',
    tier: 'Gold',
  },
  whale: {
    id: 'whale',
    title: 'Vaquita Whale',
    description: 'Reach 30,000 XP. Now THAT is dedication.',
    icon: '/icons/achievements/whale.png',
    accent: 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)',
    tier: 'Gold',
  },
  'savings-baron': {
    id: 'savings-baron',
    title: 'Savings Baron',
    description: 'Reach $10,000 USDC in cumulative deposits.',
    icon: '/icons/achievements/savings-baron.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
    tier: 'Gold',
  },
  'century-saver': {
    id: 'century-saver',
    title: 'Century Saver',
    description: 'Reach a 100-day savings streak. Legendary.',
    icon: '/icons/achievements/century-saver.png',
    accent: 'linear-gradient(180deg, #FFD180 0%, #FF6F00 100%)',
    tier: 'Diamond',
  },
  'third-place': {
    id: 'third-place',
    title: 'Bronze Medalist',
    description: 'Finish #3 on the monthly leaderboard.',
    icon: '/icons/achievements/third-place.png',
    accent: 'linear-gradient(180deg, #FFCC80 0%, #A05A2C 100%)',
    tier: 'Bronze',
  },
  'second-place': {
    id: 'second-place',
    title: 'Silver Medalist',
    description: 'Finish #2 on the monthly leaderboard.',
    icon: '/icons/achievements/second-place.png',
    accent: 'linear-gradient(180deg, #E0E0E0 0%, #9E9E9E 100%)',
    tier: 'Silver',
  },
  'first-place': {
    id: 'first-place',
    title: 'Gold Medalist',
    description: 'Finish #1 on the monthly leaderboard.',
    icon: '/icons/achievements/first-place.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
    tier: 'Gold',
  },
};

/** Look up an achievement by id. Returns `null` for unknown ids so callers
 *  can decide whether to 404 or fall back to a generic card. */
export const getCatalogAchievement = (id: string): CatalogAchievement | null =>
  ACHIEVEMENT_CATALOG[id] ?? null;
