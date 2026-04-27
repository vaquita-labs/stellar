import { type DepositStatus, DepositWithdrawalState, Reward, WithdrawalStatus } from './commons';

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
