import { clientEnv } from '@/core-ui/config/clientEnv';

// Same-origin route handler inside this admin app (see
// src/app/api/admin/contract-events/route.ts). We still echo the admin secret so
// the server-side guard passes when ADMIN_SECRET is configured.
const CONTRACT_EVENTS_URL = '/api/admin/contract-events';

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** One on-chain contract event, flattened for the GenericTable. */
export interface ContractEventRow extends Record<string, unknown> {
  /** topic[0] symbol: deposit, withdraw, lp_add, upg_prop, init, … */
  type: string;
  ledgerClosedAt: string;
  ledger: number;
  depositId: string;
  wallet: string;
  token: string;
  amount: string;
  amountRaw: string;
  shares: string;
  reward: string;
  /** Full decoded payload as JSON (for non-deposit/withdraw events). */
  details: string;
  contractId: string;
  txHash: string;
  /** 'yes' | 'no' for deposit/withdraw, '' for other event types. */
  inDb: string;
}

export interface ReviewContractSummary {
  total: number;
  deposits: number;
  withdrawals: number;
  missingInDb: number;
  scanned: number;
  byType: Record<string, number>;
  contractIds: string[];
  rpcUrl: string;
  ledgerRange: { startLedger: number; endLedger: number };
  retention: {
    oldestLedger: number;
    oldestLedgerCloseTime: string;
    latestLedger: number;
    latestLedgerCloseTime: string;
  };
  truncated: boolean;
  warnings: string[];
}

export interface ReviewContractResponse {
  rows: ContractEventRow[];
  summary: ReviewContractSummary;
}

export interface ReviewContractParams {
  from: string;
  to: string;
  contractAddress?: string;
}

/** POST the date range and get back the pool transactions for that window. */
export const reviewContract = async (params: ReviewContractParams): Promise<ReviewContractResponse> => {
  const response = await fetch(CONTRACT_EVENTS_URL, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(params),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return body.data as ReviewContractResponse;
};
