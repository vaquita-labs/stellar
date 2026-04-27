import { isStringJson } from '../../helpers';
import type { Deposit } from '../../types';

/**
 * Interface for log data structure
 */
export interface LogData {
  _type: string;
  address: string;
  blockHash: string;
  blockNumber: number;
  data: string;
  index: number;
  removed: boolean;
  topics: string[];
  transactionHash: string;
  transactionIndex: number;
}

/**
 * Extracts the contract address from a log object
 * @param log - The log object containing contract information
 * @returns The contract address as a string
 */
export function getBaseDepositContractAddress(deposit: Deposit): string {
  try {
    if (!isStringJson(deposit.transaction_event_raw)) {
      return '';
    }
    const transaction = JSON.parse(deposit.transaction_event_raw) as LogData;
    return transaction.address;
  } catch (error) {
    console.error('getStellarDepositContractAddress', error);
    return '';
  }
}
