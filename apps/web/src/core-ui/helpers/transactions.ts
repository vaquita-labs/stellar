import { DepositResponseDTO, DepositWithdrawalState, WithdrawalStatus } from '../types';
import type { ActivityItem, ActivityKind } from './activity';

/**
 * Historial de movimientos del usuario. No hay un endpoint de "transacciones":
 * la lista sale de dos lecturas que ya existen. Los depósitos (la misma query
 * que usa el home) dan las posiciones a plazo con su detalle: cada depósito con
 * lock es un traspaso de los ahorros a una posición, y cada retiro asociado
 * devuelve la plata a los ahorros. El historial on-chain de la billetera (ver
 * `activity.ts`) da todo lo demás: envíos, ahorros flexibles, insignias.
 * `buildMovements` los junta en una sola lista.
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
  /** Número de la posición en el contrato de ahorro a plazo. */
  nonce: string | null;
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
      nonce: deposit.nonce ?? null,
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
        nonce: deposit.nonce ?? null,
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

/**
 * Una fila del historial: un movimiento que la API conoce con su detalle
 * (`app`) o uno leído del historial on-chain de la billetera (`chain`).
 */
export type MovementCategory = 'deposit' | 'withdraw' | 'move' | 'payment' | 'other';
export type Movement = {
  /** Estable y URL-safe: es el segmento de /transactions/[id]. */
  id: string;
  category: MovementCategory;
  status: TransactionStatus;
  timestamp: number;
} & ({ source: 'app'; transaction: AppTransaction } | { source: 'chain'; activity: ActivityItem });

const ACTIVITY_CATEGORY: Record<ActivityKind, MovementCategory> = {
  flexibleIn: 'deposit',
  flexibleOut: 'withdraw',
  lockedIn: 'move',
  lockedOut: 'withdraw',
  sent: 'payment',
  received: 'payment',
  badge: 'other',
  trust: 'other',
  other: 'other',
};

export const activityStatus = (status: ActivityItem['status']): TransactionStatus =>
  status === 'SUCCESS' ? 'completed' : status === 'PENDING' ? 'pending' : 'failed';

const sameHash = (a: string, b: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Cuánto pueden distar el pedido que guarda la API y la transacción on-chain de un mismo movimiento. */
const SAME_MOVEMENT_WINDOW_MS = 10 * 60 * 1000;

/**
 * El movimiento de la API que corresponde a un registro on-chain, si lo hay.
 * Es la misma transacción, así que normalmente comparten hash. Cuando la API
 * guardó otro (pasa con algunos retiros), un movimiento a plazo todavía se
 * reconoce por el número de su posición, el mismo estado y la hora.
 */
export const findTransactionFor = (transactions: AppTransaction[], item: ActivityItem) => {
  const byHash = transactions.find((transaction) => sameHash(transaction.transactionHash, item.hash));
  if (byHash) return byHash;
  const kind = item.kind === 'lockedIn' ? 'move' : item.kind === 'lockedOut' ? 'withdraw' : null;
  if (!kind || !item.nonce) return undefined;
  const status = activityStatus(item.status);
  return transactions.find(
    (transaction) =>
      transaction.kind === kind &&
      transaction.nonce === item.nonce &&
      transaction.status === status &&
      Math.abs(transaction.timestamp - item.timestamp) <= SAME_MOVEMENT_WINDOW_MS,
  );
};

/**
 * Todo lo que pasó, del más nuevo al más viejo. Una posición a plazo figura en
 * las dos lecturas (es la misma transacción): se queda la de la API, que sabe el
 * plazo y las recompensas.
 */
export const buildMovements = (transactions: AppTransaction[], activity: ActivityItem[]): Movement[] => {
  const movements: Movement[] = transactions.map((transaction) => ({
    id: transaction.id,
    category: transaction.kind,
    status: transaction.status,
    timestamp: transaction.timestamp,
    source: 'app',
    transaction,
  }));
  for (const item of activity) {
    if (findTransactionFor(transactions, item)) continue;
    movements.push({
      id: item.id,
      category: ACTIVITY_CATEGORY[item.kind],
      status: activityStatus(item.status),
      timestamp: item.timestamp,
      source: 'chain',
      activity: item,
    });
  }
  return movements.sort((a, b) => b.timestamp - a.timestamp);
};

export const TRANSACTION_KINDS: MovementCategory[] = ['deposit', 'withdraw', 'move', 'payment', 'other'];
export const TRANSACTION_STATUSES: TransactionStatus[] = ['completed', 'pending', 'failed'];

export interface TransactionFilters {
  /** Inicio del rango, inclusive (ms). */
  startDate: number | null;
  /** Fin del rango, inclusive (ms; se compara contra el final del día). */
  endDate: number | null;
  /** Kinds to show (checkboxes). Every kind checked is the default; none checked shows nothing. */
  kinds: MovementCategory[];
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

export const filterMovements = (movements: Movement[], filters: TransactionFilters) =>
  movements.filter((movement) => {
    if (filters.startDate !== null && movement.timestamp < filters.startDate) return false;
    if (filters.endDate !== null && movement.timestamp > endOfDay(filters.endDate)) return false;
    if (!filters.kinds.includes(movement.category)) return false;
    if (!filters.statuses.includes(movement.status)) return false;
    return true;
  });

/** Agrupa por mes (ya vienen ordenados desc) para las cabeceras de la lista. */
export const groupMovementsByMonth = (movements: Movement[]) => {
  const groups: { key: string; timestamp: number; items: Movement[] }[] = [];
  for (const movement of movements) {
    const date = new Date(movement.timestamp);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(movement);
    } else {
      groups.push({ key, timestamp: movement.timestamp, items: [movement] });
    }
  }
  return groups;
};
