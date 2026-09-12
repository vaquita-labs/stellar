import { DepositResponseDTO, DepositWithdrawalState, WithdrawalStatus } from '../types';

/**
 * Historial de movimientos del usuario. No hay un endpoint de "transacciones":
 * la lista se deriva de la misma query de depósitos que ya usa el home (sin
 * fetch extra ni cache nueva). Cada depósito con lock es un traspaso de los
 * ahorros (Blend) a una posición, y cada retiro asociado devuelve la plata a
 * los ahorros.
 */

/**
 * `move`: savings → locked position (one entry, even though on-chain it is a
 * Blend withdrawal plus a pool deposit). `withdraw`: position → savings.
 * `deposit`: wallet → savings; nothing produces it yet, it waits on the vault
 * flows being readable from the API.
 */
export type TransactionKind = 'deposit' | 'withdraw' | 'move';
export type TransactionStatus = 'completed' | 'pending' | 'failed';

/** Un paso del estado de la transacción; `key` se traduce en la pantalla de detalle. */
export interface TransactionHistoryEntry {
  key: 'moveRequested' | 'moveConfirmed' | 'moveFailed' | 'withdrawRequested' | 'withdrawConfirmed' | 'withdrawFailed';
  timestamp: number;
}

export interface AppTransaction {
  /** Estable y URL-safe: es el segmento de /transactions/[id]. */
  id: string;
  depositId: number;
  kind: TransactionKind;
  status: TransactionStatus;
  /** Retiro anticipado: se pierden las recompensas. */
  early: boolean;
  /** Monto movido (siempre positivo; el signo lo da `kind`). */
  amount: number;
  /** Recompensas cobradas en el retiro (0 en depósitos y retiros anticipados). */
  interest: number;
  tokenSymbol: string;
  lockPeriod: number;
  timestamp: number;
  transactionHash: string;
  history: TransactionHistoryEntry[];
}

const depositStatus = (state: DepositWithdrawalState): TransactionStatus => {
  if (state === DepositWithdrawalState.DEPOSIT_PROCESSING) return 'pending';
  if (state === DepositWithdrawalState.DEPOSIT_FAILED) return 'failed';
  return 'completed';
};

const withdrawalStatus = (status: WithdrawalStatus): TransactionStatus => {
  if (status === WithdrawalStatus.INITIATED) return 'pending';
  if (status === WithdrawalStatus.FAILED) return 'failed';
  return 'completed';
};

const depositEarnings = (deposit: DepositResponseDTO) =>
  (deposit.vaquitaInterest ?? 0) + (deposit.protocolInterest ?? 0) + (deposit.blendInterest ?? 0);

/** Movimientos (traspasos a posición + retiros) ordenados del más nuevo al más viejo. */
export const buildTransactions = (deposits: DepositResponseDTO[]): AppTransaction[] => {
  const transactions: AppTransaction[] = [];

  for (const deposit of deposits) {
    if (deposit.state === DepositWithdrawalState.NONE) continue;

    const status = depositStatus(deposit.state);
    const history: TransactionHistoryEntry[] = [{ key: 'moveRequested', timestamp: deposit.createdTimestamp }];
    if (status === 'completed') {
      history.push({ key: 'moveConfirmed', timestamp: deposit.confirmedTimestamp || deposit.createdTimestamp });
    } else if (status === 'failed') {
      history.push({ key: 'moveFailed', timestamp: deposit.updatedTimestamp || deposit.createdTimestamp });
    }

    transactions.push({
      id: `d-${deposit.id}`,
      depositId: deposit.id,
      kind: 'move',
      status,
      early: false,
      amount: deposit.amount,
      interest: 0,
      tokenSymbol: deposit.tokenSymbol,
      lockPeriod: deposit.lockPeriod,
      timestamp: deposit.createdTimestamp,
      transactionHash: deposit.transactionHash ?? '',
      history,
    });

    const early = deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY;
    for (const withdrawal of deposit.withdrawals ?? []) {
      const wStatus = withdrawalStatus(withdrawal.status);
      const interest = early || wStatus !== 'completed' ? 0 : depositEarnings(deposit);
      const wHistory: TransactionHistoryEntry[] = [{ key: 'withdrawRequested', timestamp: withdrawal.createdTimestamp }];
      if (wStatus === 'completed') {
        wHistory.push({
          key: 'withdrawConfirmed',
          timestamp: withdrawal.confirmedTimestamp || withdrawal.updatedTimestamp || withdrawal.createdTimestamp,
        });
      } else if (wStatus === 'failed') {
        wHistory.push({
          key: 'withdrawFailed',
          timestamp: withdrawal.updatedTimestamp || withdrawal.createdTimestamp,
        });
      }

      transactions.push({
        id: `w-${deposit.id}-${withdrawal.id}`,
        depositId: deposit.id,
        kind: 'withdraw',
        status: wStatus,
        early,
        amount: deposit.amount + interest,
        interest,
        tokenSymbol: deposit.tokenSymbol,
        lockPeriod: deposit.lockPeriod,
        timestamp: withdrawal.createdTimestamp,
        transactionHash: withdrawal.transactionHash ?? '',
        history: wHistory,
      });
    }
  }

  return transactions.sort((a, b) => b.timestamp - a.timestamp);
};

export const TRANSACTION_KINDS: TransactionKind[] = ['deposit', 'withdraw', 'move'];
export const TRANSACTION_STATUSES: TransactionStatus[] = ['completed', 'pending', 'failed'];

export interface TransactionFilters {
  /** Inicio del rango, inclusive (ms). */
  startDate: number | null;
  /** Fin del rango, inclusive (ms; se compara contra el final del día). */
  endDate: number | null;
  /** Kinds to show (checkboxes). Every kind checked is the default; none checked shows nothing. */
  kinds: TransactionKind[];
  /** Statuses to show (checkboxes). Same rule as `kinds`. */
  statuses: TransactionStatus[];
}

/** Every kind and status checked, no date range: the list shows everything. */
export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  startDate: null,
  endDate: null,
  kinds: TRANSACTION_KINDS,
  statuses: TRANSACTION_STATUSES,
};

export const hasActiveFilters = (filters: TransactionFilters) =>
  filters.startDate !== null ||
  filters.endDate !== null ||
  filters.kinds.length < TRANSACTION_KINDS.length ||
  filters.statuses.length < TRANSACTION_STATUSES.length;

const endOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

export const filterTransactions = (transactions: AppTransaction[], filters: TransactionFilters) =>
  transactions.filter((transaction) => {
    if (filters.startDate !== null && transaction.timestamp < filters.startDate) return false;
    if (filters.endDate !== null && transaction.timestamp > endOfDay(filters.endDate)) return false;
    if (!filters.kinds.includes(transaction.kind)) return false;
    if (!filters.statuses.includes(transaction.status)) return false;
    return true;
  });

/** Agrupa por mes (ya vienen ordenadas desc) para las cabeceras de la lista. */
export const groupTransactionsByMonth = (transactions: AppTransaction[]) => {
  const groups: { key: string; timestamp: number; items: AppTransaction[] }[] = [];
  for (const transaction of transactions) {
    const date = new Date(transaction.timestamp);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(transaction);
    } else {
      groups.push({ key, timestamp: transaction.timestamp, items: [transaction] });
    }
  }
  return groups;
};
