import { clientEnv } from '@/core-ui/config/clientEnv';
import { useCallback } from 'react';

export type BridgeDirection = 'evm_to_stellar' | 'stellar_to_evm';
export type BridgeNetworkKey =
  | 'ethereum'
  | 'ethereum-sepolia'
  | 'base'
  | 'base-sepolia'
  | 'stellar'
  | 'stellar-testnet';

export type BridgeTransferStatus =
  | 'source_awaiting_signature'
  | 'source_confirming'
  | 'attestation_pending'
  | 'ready_to_complete'
  | 'destination_awaiting_signature'
  | 'destination_confirming'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'needs_review';

export interface BridgeTransfer {
  id: string;
  direction: BridgeDirection;
  sourceNetwork: BridgeNetworkKey;
  destinationNetwork: BridgeNetworkKey;
  sourceWallet: string;
  destinationWallet: string;
  amount: string;
  amountRaw: string;
  status: BridgeTransferStatus;
  sourceTxHash?: string | null;
  destinationTxHash?: string | null;
  cctpMessage?: string | null;
  cctpAttestation?: string | null;
  errorReason?: string | null;
  updatedAt: string;
}

export interface BridgeFeeQuote {
  finalityThreshold: number;
  minimumFeeBps: number;
  maxFeeRaw: string;
}

const apiUrl = (path: string) => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/bridge${path}`;

const readData = async <T>(response: Response): Promise<T> => {
  const json = await response.json();
  if (!response.ok || json?.status === 'error') {
    throw new Error(json?.message ?? 'Bridge request failed');
  }
  return json.data as T;
};

export const useBridgeTransfers = () => {
  const listTransfers = useCallback(async (wallet: string) => {
    if (!wallet) return [];
    const response = await fetch(apiUrl(`/transfers?wallet=${encodeURIComponent(wallet)}`));
    return readData<BridgeTransfer[]>(response);
  }, []);

  const createTransfer = useCallback(async (payload: {
    direction: BridgeDirection;
    sourceNetwork: BridgeNetworkKey;
    destinationNetwork: BridgeNetworkKey;
    sourceWallet: string;
    destinationWallet: string;
    amount: string;
  }) => {
    const response = await fetch(apiUrl('/transfers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return readData<BridgeTransfer>(response);
  }, []);

  const attachSourceTx = useCallback(async (id: string, payload: { sourceTxHash: string; messageHash?: string }) => {
    const response = await fetch(apiUrl(`/transfers/${id}/source-tx`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return readData<BridgeTransfer>(response);
  }, []);

  const getFeeQuote = useCallback(async (payload: {
    sourceNetwork: BridgeNetworkKey;
    destinationNetwork: BridgeNetworkKey;
    amountRaw: string;
  }) => {
    const params = new URLSearchParams({
      sourceNetwork: payload.sourceNetwork,
      destinationNetwork: payload.destinationNetwork,
      amountRaw: payload.amountRaw,
      finalityThreshold: '1000',
    });
    const response = await fetch(apiUrl(`/fees?${params.toString()}`));
    return readData<BridgeFeeQuote>(response);
  }, []);

  const refreshTransfer = useCallback(async (id: string) => {
    const response = await fetch(apiUrl(`/transfers/${id}/refresh`), { method: 'POST' });
    return readData<BridgeTransfer>(response);
  }, []);

  const attachDestinationTx = useCallback(async (id: string, destinationTxHash: string) => {
    const response = await fetch(apiUrl(`/transfers/${id}/destination-tx`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationTxHash }),
    });
    return readData<BridgeTransfer>(response);
  }, []);

  return { listTransfers, createTransfer, attachSourceTx, refreshTransfer, attachDestinationTx, getFeeQuote };
};
