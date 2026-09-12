// Shared across frontend and backend

import type { AvatarConfig } from '@vaquita/avatar';

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
  /** Issuer (G-address) of the asset behind contractAddress. */
  issuer: string | null;
  /** Blend V2 pool that accepts this token as reserve. */
  blendPoolContractAddress: string | null;
  /** DeFindex vault this token is deposited into (shared with the locked pool). */
  defindexVaultContractAddress: string | null;
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
  /** Bundle version of the Privacy Policy / Terms / Risk Disclosure the user
   *  must currently have accepted. Served from config so a revision re-gates
   *  everyone without a frontend deploy. */
  legalPolicyVersion: string;
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
  nonce?: string | null;
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

// Notification toggles offered on the profile Notifications page. `push` and
// `email` are delivery channels; the rest pick which activity gets notified.
export type NotificationPreferenceKey = 'push' | 'email' | 'deposits' | 'streaks' | 'friends';

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

// Served whenever the profile row's JSON is NULL (user never changed anything)
// and used to fill keys missing from a partially-saved object.
//
// Both delivery channels are on by default: notifications are how the product
// reaches someone who is not currently looking at it, and a channel nobody
// opted into is a channel that does not exist. A key the user actually toggled
// is stored and spread over this, so an explicit `false` always wins — turning
// a default on never overrides a decision someone made.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  email: true,
  deposits: true,
  streaks: true,
  friends: false,
};

export interface ProfileResponseDTO {
  /** Id interno del perfil. OPCIONAL a propósito: sólo lo llena el endpoint de
   *  un perfil solo, no los mappers de lista. Existe para que el cliente tenga
   *  una clave de usuario que no sea la dirección de la wallet (analytics). */
  id?: string;
  networkName: string;
  walletAddress: string;
  email: string;
  fullName: string;
  nickname: string;
  /** The user's character avatar (see @vaquita/avatar). Always resolved
   *  server-side — a profile that never opened the editor gets a stable
   *  wallet-seeded avatar, so clients never have to guess a fallback. */
  avatarConfig: AvatarConfig;
  onboardingCompleted: boolean;
  tutorialCompleted: boolean;
  /** The user has seen the guided tour of the home screen. */
  homeTourCompleted: boolean;
  cryptoSavvy: boolean;
  /** Legal bundle version this profile last accepted, '' if never. The client
   *  gate compares it to `ProjectConfigResponseDTO.legalPolicyVersion` by
   *  string equality — any mismatch re-gates. Populated only by the
   *  single-profile endpoints the gate reads; list endpoints leave it ''. */
  legalAcceptedVersion: string;
  // Per-user display preferences (option ids from the project config lists).
  // Empty string until the user picks one.
  language: string;
  currency: string;
  // Always a full object: defaults merged over whatever the user saved. The
  // `email` channel reads as false while the profile has no email address.
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
  /** Display name: full name, else nickname, else a shortened wallet. */
  name: string;
  /** `@handle` derived from the nickname (or a shortened wallet fallback). */
  handle: string;
  nickname: string;
  fullName: string;
  /** The user's character avatar (see @vaquita/avatar). Always resolved
   *  server-side — a profile that never opened the editor gets a stable
   *  wallet-seeded avatar, so clients never have to guess a fallback. */
  avatarConfig: AvatarConfig;
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
  /** True after a follow, false after an unfollow. */
  following: boolean;
}

/**
 * A suggested vaquero for the "Friend suggestions" rail. `followedBy` names the
 * mutual friend who connects the viewer to this suggestion (friend-of-a-friend);
 * it is '' for suggestions added by the random fill.
 */
export interface FriendSuggestionDTO extends FriendDTO {
  followedBy: string;
}

export interface FriendSuggestionsResponseDTO {
  networkName: string;
  suggestions: FriendSuggestionDTO[];
}

export interface SuggestionDismissResponseDTO {
  viewerWallet: string;
  dismissedWallet: string;
}

/** Hearts a profile's 3D world has collected. */
export interface MapLikeCountResponseDTO {
  networkName: string;
  walletAddress: string;
  likes: number;
}

/** Wallets whose map the viewer already liked — seeds the feed's heart buttons. */
export interface LikedMapWalletsResponseDTO {
  networkName: string;
  walletAddress: string;
  wallets: string[];
}

/** Result of toggling a heart, with the owner's fresh total. */
export interface MapLikeResponseDTO {
  likerWallet: string;
  ownerWallet: string;
  liked: boolean;
  likes: number;
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

export type NotificationTypeDTO = 'deposit' | 'reward' | 'streak' | 'friend' | 'system';

/**
 * One row of the in-app notifications feed. `messageKey` + `params` map to the
 * frontend i18n entries (`notificationsCenter.messages.<messageKey>.{title,body}`)
 * so copy stays translatable; `link` is the in-app route opened on tap ('' = none).
 */
export interface NotificationDTO {
  id: string;
  type: NotificationTypeDTO;
  messageKey: string;
  params: Record<string, string | number>;
  link: string;
  read: boolean;
  /** epoch ms */
  createdAt: number;
}

export interface NotificationsResponseDTO {
  networkName: string;
  walletAddress: string;
  notifications: NotificationDTO[];
  unread: number;
}

/** A list of vaqueros (the viewer's followers or following), for the modal. */
export interface FriendListResponseDTO {
  networkName: string;
  walletAddress: string;
  results: FriendDTO[];
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
    /** Placeable units: global freeItems + units purchased by this profile. */
    itemsAvailable: number;
    /** Units purchased by this profile (subset of itemsAvailable). */
    owned: number;
    type: MapObjectType;
    variant: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  }[];
}

export interface PurchaseMapItemResponseDTO {
  type: MapObjectType;
  variant: number;
  quantity: number;
  /** Units of this item the profile owns after the purchase. */
  owned: number;
  /** Gold-coin balance after the purchase. */
  goldBalance: number;
}

export interface ProfileAverageResponseDTO {
  email: string;
  fullName: string;
  nickname: string;
  /** The user's character avatar (see @vaquita/avatar). Always resolved
   *  server-side — a profile that never opened the editor gets a stable
   *  wallet-seeded avatar, so clients never have to guess a fallback. */
  avatarConfig: AvatarConfig;
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
  /** The user's character avatar (see @vaquita/avatar). Always resolved
   *  server-side — a profile that never opened the editor gets a stable
   *  wallet-seeded avatar, so clients never have to guess a fallback. */
  avatarConfig: AvatarConfig;
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
  EXPERIENCE = 'experience',
}

export enum Achievement {
  BETA_TESTER = 'beta_tester',
  ROOKIE = 'rookie',
  WEEK_WARRIOR = 'week_warrior',
  FIRST_DEPOSIT = 'first_deposit',
  FIRST_FRIEND = 'first_friend',
  SAVINGS_STARTER = 'savings_starter',
  TRIO_SAVER = 'trio_saver',
  MONTH_MASTER = 'month_master',
  EXPLORER = 'explorer',
  STREAK_MASTER = 'streak_master',
  WHALE = 'whale',
  SAVINGS_BARON = 'savings_baron',
  CENTURY_SAVER = 'century_saver',
  THIRD_PLACE = 'third_place',
  SECOND_PLACE = 'second_place',
  FIRST_PLACE = 'first_place',
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
  xpReward: number;
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
  WINDMILL = 'windmill',
  WELL = 'well',
  LAMP = 'lamp',
  LEADERBOARD = 'leaderboard',
  /** Monumento conmemorativo "Summit São Paulo 2026". */
  SUMMIT = 'summit',
  /** Ítem de HUD (no se coloca en el mapa): desbloquea la card de la hora. */
  CLOCK = 'clock',
  // Tipos-paraguas para escalar decoraciones (ver apps/web tiles/objects/<cat>).
  DECORATION = 'decoration',
  SEASONAL = 'seasonal',
  COLLECTIBLE = 'collectible',
  EMPTY = 'empty',
}

/** A payout wallet the user saved for the withdraw flow. */
export interface SavedWalletResponseDTO {
  id: string;
  label: string;
  address: string;
  /** Optional destination memo/tag (exchanges that require one); null when unset. */
  memo: string | null;
  network: string;
  createdTimestamp: number;
  updatedTimestamp: number;
}

export interface SavedWalletsResponseDTO {
  savedWallets: SavedWalletResponseDTO[];
}

/** A bank account the user saved for the fiat off-ramp. */
export interface SavedBankAccountResponseDTO {
  id: string;
  label: string;
  /** ISO-3166 alpha-2 of the corridor the account belongs to. */
  country: string;
  currency: string;
  /** Payout rail of the quote it was saved with; null when the provider didn't publish one. */
  rail: string | null;
  /** `{ [field.key]: value }`, shaped by the quote's `requiredFields`. */
  fields: Record<string, string>;
  createdTimestamp: number;
  updatedTimestamp: number;
}

export interface SavedBankAccountsResponseDTO {
  savedBankAccounts: SavedBankAccountResponseDTO[];
}

/**
 * A bug report or a piece of feedback sent from the Concierge.
 *
 * `userAgent` and `walletAddress` are deliberately absent: the DTO is what the
 * admin inbox renders, and neither is needed to triage a report on screen.
 */
export interface FeedbackPostResponseDTO {
  id: string;
  /** 'bug' | 'feedback' */
  kind: string;
  title: string;
  details: string;
  /** 'open' | 'planned' | 'in_progress' | 'done' | 'closed' */
  status: string;
  /**
   * 'pending' | 'approved' | 'flagged' | 'rejected'. The reporter is told when
   * their report is held: it is not on the board, and silence would read as the
   * submit having failed.
   */
  moderationStatus: string;
  /** UI language at submit time — tells the triager which locale the copy came from. */
  locale: string | null;
  /** In-app route the report was opened from. A path, never a full URL. */
  appPath: string | null;
  createdTimestamp: number;
  updatedTimestamp: number;
}

/**
 * Referral summary for a wallet. Counts only.
 *
 * There was an APY-boost tier table here, plus a total/pending earnings pair.
 * Nothing ever applied the bonus to a rate and no payout ledger was ever built,
 * so every one of those fields was a hard-coded zero being rendered as if it
 * meant something. They are gone rather than left to rot: the invite screen
 * shows what is true, which is how many friends joined and how many are saving.
 */
export interface ReferralSummaryResponseDTO {
  walletAddress: string;
  /** The vaquitag this user shares to invite others. It IS their tag. */
  code: string;
  /** Everyone this user referred (attributed), regardless of activity. */
  referrals: number;
  /** Referred users that currently hold a live deposit. */
  activeReferrals: number;
}

/** One referrer on the in-app board. Counts only — never what anyone holds. */
export interface ReferrerLeaderboardRowDTO {
  /** 1-based rank over every referrer, so a pinned row states a true position. */
  position: number;
  walletAddress: string;
  /** Always set: a profile with no nickname is dropped before ranking. */
  nickname: string;
  /** Resolved avatar choices, ready to render. Never null. */
  avatarConfig: AvatarConfig;
  /** Friends who joined through this referrer's link. The ranking key. */
  referrals: number;
  /** How many of them are currently saving, in either product. */
  activeReferrals: number;
  isCurrentUser: boolean;
}

/**
 * The referrer board: the top slice plus the viewer's own row.
 *
 * `me` is sent whether or not the viewer is inside `rows`, so the client can
 * pin it below the board without a second request. It is null when the viewer
 * has referred nobody, or has no nickname and therefore no place on a public
 * board.
 */
export interface ReferrerLeaderboardResponseDTO {
  rows: ReferrerLeaderboardRowDTO[];
  me: ReferrerLeaderboardRowDTO | null;
  /** Every referrer with a nickname and at least one friend joined. */
  total: number;
}
