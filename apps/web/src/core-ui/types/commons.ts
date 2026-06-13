// Shared across frontend and backend

export enum WithdrawalStatus {
  INITIATED = 'initiated',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

export enum DepositStatus {
  INITIATED = 'initiated',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

export enum DepositWithdrawalState {
  NONE = 'none',
  DEPOSIT_PROCESSING = 'deposit_processing',
  DEPOSIT_FAILED = 'deposit_failed',
  DEPOSIT_SUCCESS = 'deposit_success',
  WITHDRAW_PROCESSING = 'withdraw_processing',
  WITHDRAW_FAILED = 'withdraw_failed',
  WITHDRAW_SUCCESS_EARLY = 'withdraw_success_early',
  WITHDRAW_SUCCESS = 'withdraw_success',
}

export interface CurrencyDTO {
  id: string;
  label: string;
  hint?: string;
}

export interface LanguageDTO {
  id: string;
  label: string;
  hint?: string;
}

export interface NetworkResponseDTO {
  networkName: string;
  type: string;
  networkPassphrase: string | null;
  badgesContractAddress?: string;
  tokens: {
    isGas: boolean;
    isNative: boolean;
    isSupported: boolean;
    symbol: string;
    name: string;
    decimals: number;
    lockPeriods: number[];
    contractAddress: string;
    vaquitaContractAddress: string;
  }[];
  currencies: CurrencyDTO[];
  languages: LanguageDTO[];
}

export interface DepositSummaryResponseDTO {
  id: number;
  state: DepositWithdrawalState;
  amount: number;
  tokenSymbol: string;
  inLockPeriod: boolean;
  lockPeriod: number;
  vaquitaContractAddress: string;
}

export type TotalSummaryDepositsResponseDTO = {
  [key: string]: {
    [key in DepositWithdrawalState]: {
      totalCount: number;
      totalAmount: number;
    };
  };
};

export interface DepositWithdrawalResponseDTO {
  createdTimestamp: number;
  id: number;
  status: WithdrawalStatus;
  transactionHash: string;
  updatedTimestamp: number;
  confirmedTimestamp: number;
}

export interface DepositResponseDTO extends DepositSummaryResponseDTO {
  status: DepositStatus;
  walletAddress: string;
  withdrawals: DepositWithdrawalResponseDTO[];
  transactionHash: string;
  depositIdHex: string;
  vaquitaInterest: number;
  protocolInterest: number;
  /**
   * Stellar: same as `vaultInterest` (DeFindex vault accrual).
   */
  blendInterest: number;
  /** Stellar testnet only: vault NAV accrual. Omitted on other networks. */
  vaultInterest?: number;
  createdTimestamp: number;
  updatedTimestamp: number;
  serverTimestamp: number;
  confirmedTimestamp: number;
}

export type TotalDepositsResponseDTO = {
  [key: string]: {
    [key in DepositWithdrawalState]: {
      totalCount: number;
      totalAmount: number;
      totalProtocolInterest: number;
      totalBlendInterest: number;
      totalVaquitaInterest: number;
      totalProtocolApy: number;
      totalBlendApy: number;
      totalVaquitaApy: number;
    };
  };
};

// Notification toggles offered on the profile Notifications page. `push` and
// `email` are delivery channels; the rest pick which activity gets notified.
export type NotificationPreferenceKey = 'push' | 'email' | 'deposits' | 'streaks' | 'friends';

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

// Mirrors the API defaults — used while the profile query is loading.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  email: false,
  deposits: true,
  streaks: true,
  friends: false,
};

export interface ProfileResponseDTO {
  networkName: string;
  walletAddress: string;
  email: string;
  fullName: string;
  nickname: string;
  avatarUrl: string;
  onboardingCompleted: boolean;
  tutorialCompleted: boolean;
  cryptoSavvy: boolean;
  // Per-user display preferences (option ids from the project config lists).
  // Empty string until the user picks one.
  language: string;
  currency: string;
  // Always a full object: the API merges defaults over whatever the user saved
  // and forces the email channel off while the profile has no email address.
  notificationPreferences: NotificationPreferences;
  // Account creation timestamp (ISO 8601). Empty string when unknown.
  createdAt: string;
}

export interface ProfileExperienceResponseDTO {
  networkName: string;
  walletAddress: string;
  experience: number;
}

export interface ProfileRewardsResponseDTO {
  networkName: string;
  walletAddress: string;
  rewards: {
    name: string;
    amount: number;
  }[];
}

export interface ProfileStreakResponseDTO {
  networkName: string;
  walletAddress: string;
  yesterdayStreak: number;
  todayStreak: boolean;
  days: number[];
}

/**
 * A vaquero shown in the friend search / follow list. `level` is always 0 for
 * now (no level system yet); `streak` and `followers` are computed live.
 * `isFollowing` is relative to the viewer who made the request.
 */
export interface FriendDTO {
  walletAddress: string;
  name: string;
  handle: string;
  nickname: string;
  fullName: string;
  avatarUrl: string;
  level: number;
  streak: number;
  followers: number;
  isFollowing: boolean;
}

export interface FriendSearchResponseDTO {
  networkName: string;
  query: string;
  results: FriendDTO[];
}

export interface FollowResponseDTO {
  followerWallet: string;
  followeeWallet: string;
  following: boolean;
}

/**
 * A suggested vaquero for the "Friend suggestions" rail. `followedBy` names the
 * mutual friend who connects the viewer to this suggestion; '' for random fills.
 */
export interface FriendSuggestionDTO extends FriendDTO {
  followedBy: string;
}

export interface FriendSuggestionsResponseDTO {
  networkName: string;
  suggestions: FriendSuggestionDTO[];
}

export interface FollowCountsResponseDTO {
  networkName: string;
  walletAddress: string;
  following: number;
  followers: number;
}

export interface FollowingWalletsResponseDTO {
  networkName: string;
  walletAddress: string;
  /** Wallet addresses the viewer currently follows. */
  following: string[];
}

/** A list of vaqueros (the viewer's followers or following), for the modal. */
export interface FriendListResponseDTO {
  networkName: string;
  walletAddress: string;
  results: FriendDTO[];
}

export type MapObject = {
  position: [number, number, number];
  type: MapObjectType;
  variant: number;
  rotation: [number, number, number];
};

export interface ProfileMapObjectsResponseDTO {
  networkName: string;
  walletAddress: string;
  objects: MapObject[];
}

export interface ProfileMapObjectsAvailableResponseDTO {
  networkName: string;
  walletAddress: string;
  objects: {
    price: number;
    itemsAvailable: number;
    type: MapObjectType;
    variant: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  }[];
}

export interface ProfileAverageResponseDTO {
  email: string;
  fullName: string;
  nickname: string;
  avatarUrl: string;
  walletAddress: string;
  totalSums: number;
  lastSum: number;
  count: number;
  timestamp: number;
  delay: number;
  badges: number;
  // Real per-profile gamification signals served by the leaderboard endpoint
  // (replaced the wallet-hash placeholder). `streak` is the display streak
  // (yesterdayStreak + today's check-in); `experience` is total XP, from which
  // the UI derives level (every 100 XP = +1 level).
  streak: number;
  experience: number;
}

export interface LeaderboardResponseDTO {
  position: number;
  walletAddress: string;
  nickname: string;
  avatarUrl: string;
  badges: number;
  streak: number;
  experience: number;
  score: number;
  activeAmount: number;
  cycleId: number;
  cycleStart: number;
  cycleEnd: number;
  cycleStatus: 'current' | 'last_closed' | 'historical';
}

export interface RewardResponseDTO {
  key: Reward;
  name: string;
  amountToCollect: number;
  amount: number;
}

export enum Reward {
  GOLD_COIN = 'gold-coin',
  EXPERIENCE = 'experience',
}

export enum Achievement {
  BETA_TESTER = 'beta-tester',
  ROOKIE = 'rookie',
  WEEK_WARRIOR = 'week-warrior',
  FIRST_DEPOSIT = 'first-deposit',
  FIRST_FRIEND = 'first-friend',
  SAVINGS_STARTER = 'savings-starter',
  TRIO_SAVER = 'trio-saver',
  MONTH_MASTER = 'month-master',
  EXPLORER = 'explorer',
  STREAK_MASTER = 'streak-master',
  WHALE = 'whale',
  SAVINGS_BARON = 'savings-baron',
  CENTURY_SAVER = 'century-saver',
  THIRD_PLACE = 'third-place',
  SECOND_PLACE = 'second-place',
  FIRST_PLACE = 'first-place',
}

export interface AchievementResponseDTO {
  key: Achievement;
  name: string;
  description: string;
  tier: string;
  coinReward: number;
  /** True when eligibility or claim has occurred on the server. */
  unlocked: boolean;
  /** ISO timestamp of the claim, or null if not yet claimed. */
  claimedAt: string | null;
  /** True when the badge has been minted on-chain (a confirmed badge_claims row). */
  minted: boolean;
  /** On-chain mint transaction hash, or null when not minted. Lets clients link
   *  an already-minted badge to its stellar.expert tx without a re-mint. */
  transactionHash: string | null;
  claimState: 'locked' | 'claimable' | 'pending_mint' | 'claimed' | 'minted';
  claimCycleId: number | null;
  awardCycleId: number | null;
  /** Catalog visual metadata, embedded so logged-in views need only this list.
   *  `icon` may be a relative path or an absolute (admin-uploaded) URL. */
  icon: string | null;
  accent: string | null;
  displayOrder: number;
}

export interface ProfileAchievementsResponseDTO {
  networkName: string;
  walletAddress: string;
  achievements: AchievementResponseDTO[];
}

export interface ClaimAchievementResponseDTO {
  achievementKey: Achievement;
  coinReward: number;
  claimedAt: string;
}

export enum MapObjectType {
  GRASS = 'grass',
  WATER = 'water',
  BUSH = 'bush',
  ROCK = 'rock',
  TREE = 'tree',
  ROAD = 'road',
  BANK = 'bank',
  BARN = 'barn',
  LEADERBOARD = 'leaderboard',
  EMPTY = 'empty',
}
