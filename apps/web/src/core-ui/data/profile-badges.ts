import type { AchievementDetail } from '../components/pages/profile/AchievementModal';

/**
 * Shared catalog of monthly badges and achievements used by the profile page
 * and the full trophy-room screen. These are placeholders until the back-end
 * exposes a real catalog.
 */
export type Badge = AchievementDetail & { unlocked: boolean };

const monthName = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleDateString(undefined, { month: 'long' });
};

const monthDate = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return d.toISOString();
};

export const buildMonthlyBadges = (): Badge[] => [
  {
    id: 'month-current',
    title: `${monthName(0)} Champion`,
    description: 'Top 10% saver of the month. Keep stacking those vaquitas!',
    icon: '/icons/summary/streak.png',
    accent: 'linear-gradient(180deg, #58CC02 0%, #2BB300 100%)',
    tier: 'Diamond',
    date: monthDate(0),
    unlocked: true,
  },
  {
    id: 'month-1',
    title: `${monthName(1)} Saver`,
    description: 'You deposited consistently every week of the month.',
    icon: '/icons/summary/silver_coin.png',
    accent: 'linear-gradient(180deg, #B89AFF 0%, #7C4DFF 100%)',
    tier: 'Amethyst',
    date: monthDate(1),
    unlocked: true,
  },
  {
    id: 'month-2',
    title: `${monthName(2)} Pioneer`,
    description: 'One of the first vaqueros to save during this month.',
    icon: '/icons/summary/gold_coin.png',
    accent: 'linear-gradient(180deg, #6BD3F2 0%, #1FA2C8 100%)',
    tier: 'Aquamarine',
    date: monthDate(2),
    unlocked: true,
  },
  {
    id: 'month-3',
    title: `${monthName(3)} Hidden`,
    description: 'Save during this month next year to reveal this badge.',
    icon: '/icons/summary/streak_freeze.png',
    accent: 'linear-gradient(180deg, #404040 0%, #1a1a1a 100%)',
    tier: 'Locked',
    unlocked: false,
  },
  {
    id: 'month-4',
    title: `${monthName(4)} Hidden`,
    description: 'Save during this month next year to reveal this badge.',
    icon: '/icons/summary/streak_freeze.png',
    accent: 'linear-gradient(180deg, #404040 0%, #1a1a1a 100%)',
    tier: 'Locked',
    unlocked: false,
  },
  {
    id: 'month-5',
    title: `${monthName(5)} Hidden`,
    description: 'Save during this month next year to reveal this badge.',
    icon: '/icons/summary/streak_freeze.png',
    accent: 'linear-gradient(180deg, #404040 0%, #1a1a1a 100%)',
    tier: 'Locked',
    unlocked: false,
  },
];

export type AchievementsCtx = {
  totalStreak: number;
  totalDeposits: number;
  experience: number;
};

export const buildAchievements = (ctx: AchievementsCtx): Badge[] => [
  {
    id: 'streak-master',
    title: 'Streak Master',
    description: 'Reach a 50-day savings streak.',
    icon: '/icons/summary/streak.png',
    accent: 'linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)',
    tier: 'Level 3',
    progress: { current: Math.min(ctx.totalStreak, 50), target: 50 },
    date: ctx.totalStreak >= 50 ? new Date().toISOString() : undefined,
    unlocked: ctx.totalStreak >= 50,
  },
  {
    id: 'first-deposit',
    title: 'First Deposit',
    description: 'Made your very first deposit in Vaquita.',
    icon: '/icons/summary/silver_coin.png',
    accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
    tier: 'Bronze',
    progress: { current: Math.min(ctx.totalDeposits, 1), target: 1 },
    date: ctx.totalDeposits >= 1 ? new Date().toISOString() : undefined,
    unlocked: ctx.totalDeposits >= 1,
  },
  {
    id: 'explorer',
    title: 'Explorer',
    description: 'Earn 300 XP across all challenges.',
    icon: '/icons/summary/gold_coin.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)',
    tier: 'Silver',
    progress: { current: Math.min(ctx.experience, 300), target: 300 },
    date: ctx.experience >= 300 ? new Date().toISOString() : undefined,
    unlocked: ctx.experience >= 300,
  },
  {
    id: 'whale',
    title: 'Vaquita Whale',
    description: 'Reach 30,000 XP. Now THAT is dedication.',
    icon: '/trofeo.png',
    accent: 'linear-gradient(180deg, #FFB6C1 0%, #FF4D6D 100%)',
    tier: 'Gold',
    progress: { current: Math.min(ctx.experience, 30000), target: 30000 },
    date: ctx.experience >= 30000 ? new Date().toISOString() : undefined,
    unlocked: ctx.experience >= 30000,
  },
  {
    id: 'streak-warrior',
    title: 'Streak Warrior',
    description: 'Reach a 7-day savings streak.',
    icon: '/icons/summary/streak.png',
    accent: 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
    tier: 'Level 1',
    progress: { current: Math.min(ctx.totalStreak, 7), target: 7 },
    date: ctx.totalStreak >= 7 ? new Date().toISOString() : undefined,
    unlocked: ctx.totalStreak >= 7,
  },
  {
    id: 'streak-champion',
    title: 'Streak Champion',
    description: 'Reach a 30-day savings streak.',
    icon: '/icons/summary/streak.png',
    accent: 'linear-gradient(180deg, #FF8A65 0%, #E64A19 100%)',
    tier: 'Level 2',
    progress: { current: Math.min(ctx.totalStreak, 30), target: 30 },
    date: ctx.totalStreak >= 30 ? new Date().toISOString() : undefined,
    unlocked: ctx.totalStreak >= 30,
  },
  {
    id: 'rookie',
    title: 'Rookie',
    description: 'Earn 50 XP. Welcome to Vaquita!',
    icon: '/icons/summary/silver_coin.png',
    accent: 'linear-gradient(180deg, #B0E0FF 0%, #4FC3F7 100%)',
    tier: 'Bronze',
    progress: { current: Math.min(ctx.experience, 50), target: 50 },
    date: ctx.experience >= 50 ? new Date().toISOString() : undefined,
    unlocked: ctx.experience >= 50,
  },
  {
    id: 'committed',
    title: 'Committed',
    description: 'Earn 1,000 XP.',
    icon: '/icons/summary/gold_coin.png',
    accent: 'linear-gradient(180deg, #B39DDB 0%, #5E35B1 100%)',
    tier: 'Silver',
    progress: { current: Math.min(ctx.experience, 1000), target: 1000 },
    date: ctx.experience >= 1000 ? new Date().toISOString() : undefined,
    unlocked: ctx.experience >= 1000,
  },
  {
    id: 'super-saver',
    title: 'Super Saver',
    description: 'Open 5 active deposits at once.',
    icon: '/icons/summary/gold_coin.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
    tier: 'Gold',
    progress: { current: Math.min(ctx.totalDeposits, 5), target: 5 },
    date: ctx.totalDeposits >= 5 ? new Date().toISOString() : undefined,
    unlocked: ctx.totalDeposits >= 5,
  },
];
