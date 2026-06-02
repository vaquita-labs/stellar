import { type Achievement, type DepositStatus, DepositWithdrawalState, Reward, WithdrawalStatus } from './commons';

export interface Token {
  id: number,
  name: string,
  symbol: string,
  decimals: number,
}

export interface TokenNetwork {
  is_native: boolean,
  is_gas: boolean,
  is_supported: boolean,
  tokens: Token,
  contract_address: string,
  vaquita_contract_address: string,
  defindex_vault_contract_address?: string,
  token_decimals: number,
  lock_period: string,
}

export interface Network {
  id: number
  name: string,
  layer: string,
  type: string,
  chain_id: number,
  smart_contract_env: string,
  languages: string,
  tokens_networks: TokenNetwork[],
  origins: string,
  order: number,
  badges_contract_address?: string,
}

export interface Deposit {
  id: number,
  wallet_address: string,
  amount: number,
  status: DepositStatus,
  network_id: number,
  lock_period: number,
  token_id: number,
  deposit_id_hex: string,
  transaction_hash: string,
  transaction_event_raw: string,
  vaquita_contract_address: string,
  withdrawals: {
    confirmed_at: string,
    created_at: string,
    deposit_id: number,
    id: number,
    status: WithdrawalStatus,
    reward: number,
    transaction_event_raw: string,
    transaction_hash: string,
    updated_at: string,
  }[],
  tokens: Token | null,
  created_at: string,
  updated_at: string,
  confirmed_at: string,
}

export interface DepositWithState extends Deposit {
  state: DepositWithdrawalState,
}

export interface Profile {
  id: number,
  network_id: number,
  email: string,
  full_name: string,
  nickname: string,
  wallet_address: string,
  onboarding_completed: boolean,
  tutorial_completed: boolean,
  crypto_savvy: boolean,
  created_at?: string,
  updated_at?: string,
}

export interface AchievementDocument {
  id: number,
  key: Achievement,
  name: string,
  description: string,
  tier: string,
  coin_reward: number,
  /** Optional redemption code. Hidden + code-gated badges are claimable only
   *  via the "Redeem code" flow (POST /achievements/redeem). NULL for regular
   *  eligibility-driven achievements. */
  code?: string | null,
  /** When TRUE, the achievement is filtered out of the public catalog response
   *  unless the user has already claimed it. */
  hidden?: boolean,
  /** Controls whether the claim endpoint re-signs on demand ('auto') or requires
   *  admin intervention ('manual'). Defaults to 'auto'. */
  refresh_policy: 'auto' | 'manual',
  /** TRUE for leaderboard badges — eligibility is tied to a specific closed
   *  cycle's rank, not live signals. */
  cycle_scoped: boolean,
  /** How the badge unlocks. 'rule' is evaluated by the rules engine against the
   *  live eligibility signals; 'cycle_rank' keeps the leaderboard special-case;
   *  'redeem_code'/'manual' are claim-driven. Defaults to 'rule'. */
  unlock_type: BadgeUnlockType,
  /** Rule definition evaluated by the rules engine. Present only when
   *  `unlock_type === 'rule'`; NULL otherwise. */
  rule?: BadgeRule | null,
  /** Public icon path (e.g. '/icons/achievements/rookie.png') or absolute URL. */
  icon?: string | null,
  /** CSS gradient used as the halo behind the icon in the UI. */
  accent?: string | null,
  /** Ascending sort order in the catalog UI. */
  display_order: number,
  /** Soft-delete flag. Disabled badges are hidden from the public catalog, but
   *  their historical claims survive — we never DELETE rows. */
  enabled: boolean,
  created_at: string,
  updated_at: string,
}

/** How a badge becomes claimable. See {@link AchievementDocument.unlock_type}. */
export type BadgeUnlockType = 'rule' | 'redeem_code' | 'manual' | 'cycle_rank';

/** Comparison operators supported by the rules engine. Numeric ops compare the
 *  signal as a number; date ops (`before`/`after`) compare it as a timestamp. */
export type BadgeRuleOp = '>=' | '>' | '<=' | '<' | '==' | 'before' | 'after';

/** A single condition: `<signal> <op> <value>`. `signal` must be a key the
 *  signal registry knows how to resolve (see the rules engine). */
export interface BadgeRuleCondition {
  signal: string,
  op: BadgeRuleOp,
  value: number | string,
}

/** A rule definition. Currently an AND of conditions; extensible to OR later. */
export interface BadgeRule {
  all: BadgeRuleCondition[],
}

export interface ProfileAchievement {
  id: number,
  profile_id: number,
  achievement_id: number,
  claimed_at: string,
  achievements?: AchievementDocument,
}

export interface RewardDocument {
  id: number,
  name: string,
  key: Reward,
  created_at: string,
  updated_at: string,
}

export interface ProfileReward {
  id: number,
  name: string,
  created_at: string,
  updated_at: string,
  type: string,
  amount: number,
  rewards: RewardDocument,
}
