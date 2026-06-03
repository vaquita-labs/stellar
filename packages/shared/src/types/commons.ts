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

export interface NetworkResponseDTO {
  name: string;
  type: string;
  chainId: number;
  badgesContractAddress?: string;
  tokens: {
    isGas: boolean;
    isNative: boolean;
    isSupported: boolean;
    symbol: string;
    name: string;
    decimals: number;
    lockPeriod: number[];
    contractAddress: string;
    vaquitaContractAddress: string;
  }[];
}

export interface ProjectConfigTokenDTO {
  isGas: boolean;
  isNative: boolean;
  isSupported: boolean;
  symbol: string;
  name: string;
  decimals: number;
  lockPeriods: number[];
  contractAddress: string;
  vaquitaContractAddress: string;
}

/**
 * A fiat display currency offered in the UI (Preferences page). Sourced from
 * the singleton `config` row so the option list is backend-driven, not hardcoded.
 */
export interface ProjectConfigCurrencyDTO {
  id: string;
  label: string;
  hint?: string;
}

/**
 * A UI language offered in the Preferences page. Sourced from the singleton
 * `config` row so the option list is backend-driven, not hardcoded.
 */
export interface ProjectConfigLanguageDTO {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Single-network project configuration (replaces the per-network NetworkResponseDTO).
 * `chainId` (EVM leftover) is replaced by `networkPassphrase` (Stellar).
 */
export interface ProjectConfigResponseDTO {
  networkName: string;
  networkPassphrase: string | null;
  badgesContractAddress?: string;
  tokens: ProjectConfigTokenDTO[];
  currencies: ProjectConfigCurrencyDTO[];
  languages: ProjectConfigLanguageDTO[];
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
  /** Stellar testnet only: vault NAV accrual (gross underlying minus principal). Omitted on other networks. */
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

export type MapObject = {
  position: [ number, number, number ];
  type: MapObjectType;
  variant: number;
  rotation: [ number, number, number ];
}

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
  // Current active-deposit balance for the wallet, computed on the fly from the
  // `deposits` table. `totalSums === lastSum` and `count === 1` now — the old
  // 30-day snapshot series (profiles_deposits) was removed. Kept on the DTO so
  // the leaderboard's `totalSums / count` ranking keeps working unchanged.
  totalSums: number;
  lastSum: number;
  count: number;
  timestamp: number;
  delay: number;
  badges: number;
}

export interface UserBalanceResponseDTO {
  balances: {
    balance: number;
    networkName: string;
    tokenSymbol: string;
  }[];
  wallet: { walletAddress: string };
}

export interface RewardResponseDTO {
  key: Reward;
  name: string;
  amountToCollect: number;
  amount: number;
}

export enum Reward {
  GOLD_COIN = 'gold-coin',
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
  /** True when the user has met the eligibility rule OR has already claimed it. */
  unlocked: boolean;
  /** ISO timestamp of the claim, or null if not yet claimed. */
  claimedAt: string | null;
}

export interface ProfileAchievementsResponseDTO {
  networkName: string;
  walletAddress: string;
  achievements: AchievementResponseDTO[];
}

/** A single badge in the public, user-agnostic catalog. This is the shape the
 *  web app reads instead of a hardcoded list — driven by the admin-editable
 *  `achievements` table. `icon` may be a relative path ('/icons/...') or an
 *  absolute URL (admin-uploaded). */
export interface CatalogAchievementResponseDTO {
  key: string;
  name: string;
  description: string;
  tier: string;
  coinReward: number;
  icon: string | null;
  accent: string | null;
  unlockType: 'rule' | 'redeem_code' | 'manual' | 'cycle_rank';
  displayOrder: number;
}

export interface AchievementsCatalogResponseDTO {
  achievements: CatalogAchievementResponseDTO[];
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
