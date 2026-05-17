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
  /** Optional: DeFindex vault Soroban contract id (per network/token). Falls back to `STELLAR_DEFINDEX_VAULT_CONTRACT` env. */
  defindex_vault_contract_address?: string,
  token_decimals: number,
  lock_period: string,
  aave_pool_contract_address: string,
  aave_token_symbol: string,
  aave_token_contract_address: string,
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
  created_at: string,
  updated_at: string,
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
