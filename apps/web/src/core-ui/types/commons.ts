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
  /** True when eligibility or claim has occurred on the server. */
  unlocked: boolean;
  /** ISO timestamp of the claim, or null if not yet claimed. */
  claimedAt: string | null;
  /** True when the badge has been minted on-chain (a confirmed badge_claims row). */
  minted: boolean;
  /** On-chain mint transaction hash, or null when not minted. Lets clients link
   *  an already-minted badge to its stellar.expert tx without a re-mint. */
  transactionHash: string | null;
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
