import { CCTP_NETWORKS } from './index';
import type { BridgeTransferRecord, CctpAttestationResult } from './transfers';

const DEFAULT_IRIS_MAINNET = 'https://iris-api.circle.com';
const DEFAULT_IRIS_TESTNET = 'https://iris-api-sandbox.circle.com';

const irisBaseUrlFor = (row: BridgeTransferRecord): string => {
  if (process.env.CIRCLE_CCTP_IRIS_BASE_URL) return process.env.CIRCLE_CCTP_IRIS_BASE_URL;
  return CCTP_NETWORKS[row.sourceNetwork]?.environment === 'testnet'
    ? DEFAULT_IRIS_TESTNET
    : DEFAULT_IRIS_MAINNET;
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
  if (status !== 'complete') return { status: 'pending' };

  return {
    status: 'complete',
    message: message.message ?? null,
    attestation: message.attestation ?? null,
  };
};
