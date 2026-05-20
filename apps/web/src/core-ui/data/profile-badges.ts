import type { AchievementResponseDTO } from '../types';
import type { AchievementDetail } from '../components/pages/profile/AchievementModal';

/**
 * Shared catalog of achievements rendered on the profile page and the trophy
 * room. Today it is a static mock that derives `progress` / `unlocked` from
 * live user signals (streak, deposits, XP, savings, friends, leaderboard).
 * When the backend exposes a real catalog the only swap is replacing
 * `buildAchievements` with a hook.
 *
 * Files referenced by `icon` live at `apps/web/public/icons/achievements/`
 * and are named after the achievement `id` for predictable lookups — see
 * the README in that folder when adding a new achievement.
 */
export type Badge = AchievementDetail & { unlocked: boolean };

export type AchievementsCtx = {
  totalStreak: number;
  totalDeposits: number;
  experience: number;
  /** Cumulative USDC the user has ever deposited. Use the active total as a
   *  proxy until the backend exposes historical deposits. */
  totalSavedAmount?: number;
  /** Number of friends followed. `undefined` while social is not shipped. */
  friendsCount?: number;
  /** 1-based leaderboard rank; `undefined` means "not on the board". */
  leaderboardRank?: number;
  /** Server-derived: true when the user's profile was created before the
   *  Beta Tester cutoff (see `BETA_TESTER_CUTOFF` in @vaquita/shared). The
   *  GET /achievements endpoint computes this; callers should pull it from
   *  `useProfileAchievements()` and pass it in. Defaults to `false` if the
   *  query hasn't resolved yet so a locked tile is shown by default rather
   *  than briefly flashing as unlocked. */
  isBetaTester?: boolean;
  /** Server-derived ISO timestamp of the Beta Tester claim, if any. */
  betaTesterClaimedAt?: string;
  /** Full server response. Any achievement whose `key` is NOT in the hardcoded
   *  catalog below is appended at the end of the grid using its server copy
   *  (name/description/tier/coinReward/claimedAt). This is how redeem-code
   *  badges (e.g. `secret-launch`, `churrasquito-05-2026`) become visible
   *  after the user claims them, without us shipping a frontend update per
   *  badge. The image must live at `/icons/achievements/<key>.png`. */
  extraAchievements?: AchievementResponseDTO[];
};

/** Default accent gradient by tier — used for server-only achievements that
 *  don't have a hand-tuned gradient in the local catalog. */
const ACCENT_BY_TIER: Record<string, string> = {
  Bronze: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
  Silver: 'linear-gradient(180deg, #E0E0E0 0%, #9E9E9E 100%)',
  Gold: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
  Diamond: 'linear-gradient(180deg, #FFD180 0%, #FF6F00 100%)',
  Founder: 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
};

const DEFAULT_ACCENT = ACCENT_BY_TIER.Founder;

const ICONS = '/icons/achievements';

export const buildAchievements = (ctx: AchievementsCtx): Badge[] => {
  const isBetaTester = ctx.isBetaTester ?? false;
  const savings = ctx.totalSavedAmount ?? 0;
  const friends = ctx.friendsCount ?? 0;
  const rank = ctx.leaderboardRank;

  const badges: Badge[] = [
    {
      id: 'beta-tester',
      title: 'Beta Tester',
      description:
        'You joined Vaquita during the beta. Thanks for helping us shape it.',
      icon: `${ICONS}/beta-tester2.png`,
      accent: 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
      tier: 'Founder',
      date: ctx.betaTesterClaimedAt ?? (isBetaTester ? new Date().toISOString() : undefined),
      unlocked: isBetaTester,
    },
    {
      id: 'rookie',
      title: 'Rookie',
      description: 'Earn your first 50 XP. Welcome to the herd.',
      icon: `${ICONS}/rookie.png`,
      accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
      tier: 'Bronze',
      progress: { current: Math.min(ctx.experience, 50), target: 50 },
      date: ctx.experience >= 50 ? new Date().toISOString() : undefined,
      unlocked: ctx.experience >= 50,
    },
    {
      id: 'week-warrior',
      title: 'Week Warrior',
      description: 'Reach a 7-day savings streak.',
      icon: `${ICONS}/week-warrior.png`,
      accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)',
      tier: 'Bronze',
      progress: { current: Math.min(ctx.totalStreak, 7), target: 7 },
      date: ctx.totalStreak >= 7 ? new Date().toISOString() : undefined,
      unlocked: ctx.totalStreak >= 7,
    },
    {
      id: 'first-deposit',
      title: 'First Deposit',
      description: 'Made your very first deposit in Vaquita.',
      icon: `${ICONS}/first-deposit.png`,
      accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
      tier: 'Bronze',
      date: ctx.totalDeposits >= 1 ? new Date().toISOString() : undefined,
      unlocked: ctx.totalDeposits >= 1,
    },
    {
      id: 'first-friend',
      title: 'Crew Mate',
      description: 'Follow your first fellow vaquero.',
      icon: `${ICONS}/first-friend.png`,
      accent: 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)',
      tier: 'Bronze',
      progress: { current: Math.min(friends, 1), target: 1 },
      date: friends >= 1 ? new Date().toISOString() : undefined,
      unlocked: friends >= 1,
    },
    {
      id: 'savings-starter',
      title: 'Savings Starter',
      description: 'Reach $100 USDC in cumulative deposits.',
      icon: `${ICONS}/savings-starter.png`,
      accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
      tier: 'Silver',
      progress: { current: Math.min(Math.floor(savings), 100), target: 100 },
      date: savings >= 100 ? new Date().toISOString() : undefined,
      unlocked: savings >= 100,
    },
    {
      id: 'trio-saver',
      title: 'Triple Threat',
      description: 'Keep 3 active deposits running at the same time.',
      icon: `${ICONS}/trio-saver.png`,
      accent: 'linear-gradient(180deg, #B89AFF 0%, #7C4DFF 100%)',
      tier: 'Silver',
      progress: { current: Math.min(ctx.totalDeposits, 3), target: 3 },
      date: ctx.totalDeposits >= 3 ? new Date().toISOString() : undefined,
      unlocked: ctx.totalDeposits >= 3,
    },
    {
      id: 'month-master',
      title: 'Month Master',
      description: 'Reach a 30-day savings streak.',
      icon: `${ICONS}/month-master.png`,
      accent: 'linear-gradient(180deg, #FF8A65 0%, #E64A19 100%)',
      tier: 'Silver',
      progress: { current: Math.min(ctx.totalStreak, 30), target: 30 },
      date: ctx.totalStreak >= 30 ? new Date().toISOString() : undefined,
      unlocked: ctx.totalStreak >= 30,
    },
    {
      id: 'explorer',
      title: 'Explorer',
      description: 'Earn 300 XP across all challenges.',
      icon: `${ICONS}/explorer.png`,
      accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)',
      tier: 'Silver',
      progress: { current: Math.min(ctx.experience, 300), target: 300 },
      date: ctx.experience >= 300 ? new Date().toISOString() : undefined,
      unlocked: ctx.experience >= 300,
    },
    {
      id: 'streak-master',
      title: 'Streak Master',
      description: 'Reach a 50-day savings streak.',
      icon: `${ICONS}/streak-master.png`,
      accent: 'linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)',
      tier: 'Gold',
      progress: { current: Math.min(ctx.totalStreak, 50), target: 50 },
      date: ctx.totalStreak >= 50 ? new Date().toISOString() : undefined,
      unlocked: ctx.totalStreak >= 50,
    },
    {
      id: 'whale',
      title: 'Vaquita Whale',
      description: 'Reach 30,000 XP. Now THAT is dedication.',
      icon: `${ICONS}/whale.png`,
      accent: 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)',
      tier: 'Gold',
      progress: { current: Math.min(ctx.experience, 30000), target: 30000 },
      date: ctx.experience >= 30000 ? new Date().toISOString() : undefined,
      unlocked: ctx.experience >= 30000,
    },
    {
      id: 'savings-baron',
      title: 'Savings Baron',
      description: 'Reach $10,000 USDC in cumulative deposits.',
      icon: `${ICONS}/savings-baron.png`,
      accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
      tier: 'Gold',
      progress: { current: Math.min(Math.floor(savings), 10000), target: 10000 },
      date: savings >= 10000 ? new Date().toISOString() : undefined,
      unlocked: savings >= 10000,
    },
    {
      id: 'century-saver',
      title: 'Century Saver',
      description: 'Reach a 100-day savings streak. Legendary.',
      icon: `${ICONS}/century-saver.png`,
      accent: 'linear-gradient(180deg, #FFD180 0%, #FF6F00 100%)',
      tier: 'Diamond',
      progress: { current: Math.min(ctx.totalStreak, 100), target: 100 },
      date: ctx.totalStreak >= 100 ? new Date().toISOString() : undefined,
      unlocked: ctx.totalStreak >= 100,
    },
    {
      id: 'third-place',
      title: 'Bronze Medalist',
      description: 'Finish in the top 10 on the monthly leaderboard.',
      icon: `${ICONS}/third-place.png`,
      accent: 'linear-gradient(180deg, #FFCC80 0%, #A05A2C 100%)',
      tier: 'Bronze',
      date: rank != null && rank >= 3 && rank <= 10 ? new Date().toISOString() : undefined,
      unlocked: rank != null && rank >= 3 && rank <= 10,
    },
    {
      id: 'second-place',
      title: 'Silver Medalist',
      description: 'Finish #2 on the monthly leaderboard.',
      icon: `${ICONS}/second-place.png`,
      accent: 'linear-gradient(180deg, #E0E0E0 0%, #9E9E9E 100%)',
      tier: 'Silver',
      date: rank === 2 ? new Date().toISOString() : undefined,
      unlocked: rank === 2,
    },
    {
      id: 'first-place',
      title: 'Gold Medalist',
      description: 'Finish #1 on the monthly leaderboard.',
      icon: `${ICONS}/first-place.png`,
      accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
      tier: 'Gold',
      date: rank === 1 ? new Date().toISOString() : undefined,
      unlocked: rank === 1,
    },
  ];

  // Append any server-side achievements that aren't in the hardcoded catalog
  // (typically redeem-code / event badges). The convention for the icon is
  // `/icons/achievements/<key>.png` — drop the PNG in `apps/web/public/...`
  // and it will be picked up automatically.
  const hardcodedKeys = new Set(badges.map((b) => b.id));
  const extras: Badge[] = (ctx.extraAchievements ?? [])
    .filter((a) => !hardcodedKeys.has(a.key))
    .map((a) => ({
      id: a.key,
      title: a.name,
      description: a.description,
      icon: `${ICONS}/${a.key}.png`,
      accent: ACCENT_BY_TIER[a.tier] ?? DEFAULT_ACCENT,
      tier: a.tier as Badge['tier'],
      date: a.claimedAt ?? undefined,
      unlocked: a.unlocked,
    }));

  return [...badges, ...extras];
};
