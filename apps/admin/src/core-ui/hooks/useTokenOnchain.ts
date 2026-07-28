import { clientEnv } from '@/core-ui/config/clientEnv';

// Same-origin route handler inside this admin app (see
// src/app/api/admin/tokens/onchain/route.ts). We still echo the admin secret so
// the server-side guard passes when ADMIN_SECRET is configured.
const TOKEN_ONCHAIN_URL = '/api/admin/tokens/onchain';

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

export interface OnchainPosition {
  depositIdHex: string;
  amount: string;
  amountFormatted: string;
  shares: string;
  lockPeriodSeconds: number;
  /** Unix seconds when the lock matures. */
  finalizationTime: number;
}

export interface OnchainHolder {
  address: string;
  totalAmount: string;
  totalAmountFormatted: string;
  positions: OnchainPosition[];
}

export interface OnchainPeriod {
  periodSeconds: number;
  totalDeposits: string;
  totalDepositsFormatted: string;
  rewardPool: string;
  rewardPoolFormatted: string;
}

export interface TokenOnchainSnapshot {
  network: 'mainnet' | 'testnet';
  pool: string;
  token: { symbol: string; decimals: number | null; contractAddress: string | null };
  paused: boolean | null;
  positionCount: number | null;
  protocolFees: string | null;
  protocolFeesFormatted: string | null;
  earlyWithdrawalFeeBps: string | null;
  /** Token balance sitting idle in the pool contract itself. */
  idleBalance: string | null;
  idleBalanceFormatted: string | null;
  /** The pool's DeFindex vault position (where the deposits actually sit). */
  vault: {
    address: string | null;
    shares: string | null;
    underlying: string | null;
    underlyingFormatted: string | null;
  };
  periods: OnchainPeriod[];
  /** Live on-chain positions grouped by owner address, biggest first. */
  holders: OnchainHolder[];
  coverage: {
    dbDepositIds: number;
    livePositions: number;
    positionCountOnChain: number | null;
  };
  warnings: string[];
}

/** Read the on-chain snapshot of a token's Vaquita pool (balances + holders). */
export const fetchTokenOnchain = async (tokenId: number): Promise<TokenOnchainSnapshot> => {
  const response = await fetch(`${TOKEN_ONCHAIN_URL}?id=${tokenId}`, { headers: adminHeaders() });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return body.data as TokenOnchainSnapshot;
};
