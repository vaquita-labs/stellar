import { CCTP_NETWORKS, type CctpNetworkKey } from './index';
import type { BridgeTransferRecord, CctpAttestationResult } from './transfers';

const DEFAULT_IRIS_MAINNET = 'https://iris-api.circle.com';
const DEFAULT_IRIS_TESTNET = 'https://iris-api-sandbox.circle.com';

const irisBaseUrlForEnvironment = (environment: 'mainnet' | 'testnet'): string => {
  if (process.env.CIRCLE_CCTP_IRIS_BASE_URL) return process.env.CIRCLE_CCTP_IRIS_BASE_URL;
  return environment === 'testnet' ? DEFAULT_IRIS_TESTNET : DEFAULT_IRIS_MAINNET;
};

const irisBaseUrlFor = (row: BridgeTransferRecord): string => {
  return irisBaseUrlForEnvironment(CCTP_NETWORKS[row.sourceNetwork]?.environment ?? 'mainnet');
};

export interface CctpFeeQuote {
  finalityThreshold: number;
  minimumFeeBps: number;
  maxFeeRaw: string;
}

export const calculateCctpMaxFeeRaw = (amountRaw: bigint, minimumFeeBps: number): bigint => {
  if (minimumFeeBps <= 0) return 0n;
  const feeBps = BigInt(Math.ceil(minimumFeeBps));
  const numerator = amountRaw * feeBps;
  const fee = (numerator + 9_999n) / 10_000n;
  return fee > 0n ? fee : 1n;
};

export const fetchCircleCctpFeeQuote = async ({
  sourceNetwork,
  destinationNetwork,
  amountRaw,
  finalityThreshold = 1000,
}: {
  sourceNetwork: CctpNetworkKey;
  destinationNetwork: CctpNetworkKey;
  amountRaw: bigint;
  finalityThreshold?: number;
}): Promise<CctpFeeQuote> => {
  const source = CCTP_NETWORKS[sourceNetwork];
  const destination = CCTP_NETWORKS[destinationNetwork];
  if (!source) throw new Error(`Unsupported source network ${sourceNetwork}`);
  if (!destination) throw new Error(`Unsupported destination network ${destinationNetwork}`);
  if (source.environment !== destination.environment) {
    throw new Error('Source and destination CCTP environments must match');
  }

  const baseUrl = irisBaseUrlForEnvironment(source.environment).replace(/\/$/, '');
  const url = `${baseUrl}/v2/burn/USDC/fees/${source.domain}/${destination.domain}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Circle Iris fee quote returned ${response.status}`);

  const body = await response.json() as any;
  const rows = Array.isArray(body) ? body : [];
  const quote = rows.find((row) => Number(row?.finalityThreshold) === finalityThreshold);
  if (!quote) throw new Error(`Circle Iris did not return a fee quote for finality ${finalityThreshold}`);

  const minimumFeeBps = Number(quote.minimumFee);
  if (!Number.isFinite(minimumFeeBps) || minimumFeeBps < 0) {
    throw new Error('Circle Iris returned an invalid fee quote');
  }

  return {
    finalityThreshold,
    minimumFeeBps,
    maxFeeRaw: calculateCctpMaxFeeRaw(amountRaw, minimumFeeBps).toString(),
  };
};

export const fetchCircleCctpAttestation = async (
  row: BridgeTransferRecord,
): Promise<CctpAttestationResult> => {
  if (!row.sourceTxHash) return { status: 'pending' };

  const source = CCTP_NETWORKS[row.sourceNetwork];
  if (!source) return { status: 'failed', errorReason: `Unsupported source network ${row.sourceNetwork}` };

  const baseUrl = irisBaseUrlFor(row).replace(/\/$/, '');
  const url = `${baseUrl}/v2/messages/${source.domain}?transactionHash=${encodeURIComponent(row.sourceTxHash)}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });

  if (response.status === 404) return { status: 'pending' };
  if (!response.ok) {
    return { status: 'failed', errorReason: `Circle Iris returned ${response.status}` };
  }

  const body = await response.json() as any;
  const message = Array.isArray(body?.messages) ? body.messages[0] : null;
  if (!message) return { status: 'pending' };

  const status = String(message.status ?? '').toLowerCase();
  if (status !== 'complete') {
    const delayReason = typeof message.delayReason === 'string' ? message.delayReason : null;
    if (delayReason === 'insufficient_fee') {
      return {
        status: 'failed',
        errorReason: 'Circle Iris blocked attestation: insufficient_fee. The source burn maxFee was too low for Fast Transfer.',
      };
    }
    return {
      status: 'pending',
      errorReason: delayReason ? `Circle Iris pending: ${delayReason}` : null,
    };
  }

  return {
    status: 'complete',
    message: message.message ?? null,
    attestation: message.attestation ?? null,
  };
};
