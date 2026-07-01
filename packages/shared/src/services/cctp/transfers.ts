import {
  CCTP_NETWORKS,
  humanUsdcToCctpAmount,
  isValidEvmAddress,
  isValidStellarAddress,
  type CctpNetworkKey,
} from './index';

export type BridgeDirection = 'evm_to_stellar' | 'stellar_to_evm';

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

export interface BridgeTransferRecord {
  id: string;
  direction: BridgeDirection;
  sourceNetwork: CctpNetworkKey;
  destinationNetwork: CctpNetworkKey;
  sourceWallet: string;
  destinationWallet: string;
  amount: string;
  amountRaw: string;
  status: BridgeTransferStatus;
  sourceTxHash?: string | null;
  destinationTxHash?: string | null;
  messageHash?: string | null;
  cctpMessage?: string | null;
  cctpAttestation?: string | null;
  errorReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BridgeTransferRepository {
  create(input: Omit<BridgeTransferRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<BridgeTransferRecord>;
  getById(id: string): Promise<BridgeTransferRecord | null>;
  findBySourceTxHash(sourceTxHash: string): Promise<BridgeTransferRecord | null>;
  listActiveForWallet(walletAddress: string): Promise<BridgeTransferRecord[]>;
  listRecentCompletedForWallet(walletAddress: string, limit: number): Promise<BridgeTransferRecord[]>;
  update(id: string, patch: Partial<BridgeTransferRecord>): Promise<BridgeTransferRecord>;
}

export interface CreateBridgeTransferInput {
  direction: BridgeDirection;
  sourceNetwork: CctpNetworkKey;
  destinationNetwork: CctpNetworkKey;
  sourceWallet: string;
  destinationWallet: string;
  amount: string;
}

export interface AttachSourceTxInput {
  sourceTxHash: string;
  messageHash?: string | null;
}

export interface AttachDestinationTxInput {
  destinationTxHash: string;
}

export interface MarkDestinationRelayFailedInput {
  errorReason: string;
}

export interface CctpAttestationResult {
  status: 'pending' | 'complete' | 'failed';
  message?: string | null;
  attestation?: string | null;
  errorReason?: string | null;
}

const TERMINAL_STATUSES = new Set<BridgeTransferStatus>(['completed', 'failed', 'cancelled']);

const assertTransferShape = (input: CreateBridgeTransferInput) => {
  const sourceNetwork = CCTP_NETWORKS[input.sourceNetwork];
  const destinationNetwork = CCTP_NETWORKS[input.destinationNetwork];
  if (!sourceNetwork) throw new Error(`Unsupported source network: ${input.sourceNetwork}`);
  if (!destinationNetwork) throw new Error(`Unsupported destination network: ${input.destinationNetwork}`);

  if (input.direction === 'evm_to_stellar') {
    if (sourceNetwork.family !== 'evm') throw new Error('Source network must be EVM for EVM to Stellar bridge transfers');
    if (destinationNetwork.family !== 'stellar') throw new Error('Destination network must be Stellar for EVM to Stellar bridge transfers');
    if (!isValidEvmAddress(input.sourceWallet)) throw new Error('Invalid source EVM wallet');
    if (!isValidStellarAddress(input.destinationWallet)) throw new Error('Invalid destination Stellar wallet');
  } else {
    if (sourceNetwork.family !== 'stellar') throw new Error('Source network must be Stellar for Stellar to EVM bridge transfers');
    if (destinationNetwork.family !== 'evm') throw new Error('Destination network must be EVM for Stellar to EVM bridge transfers');
    if (!isValidStellarAddress(input.sourceWallet)) throw new Error('Invalid source Stellar wallet');
    if (!isValidEvmAddress(input.destinationWallet)) throw new Error('Invalid destination EVM wallet');
  }
  if (input.sourceNetwork === input.destinationNetwork) {
    throw new Error('Source and destination networks must differ');
  }
  if (sourceNetwork.environment !== destinationNetwork.environment) {
    throw new Error('Source and destination CCTP environments must match');
  }
};

const assertMutable = (row: BridgeTransferRecord) => {
  if (TERMINAL_STATUSES.has(row.status)) throw new Error(`Bridge transfer is terminal: ${row.status}`);
};

export const createBridgeTransfer = async (
  repo: BridgeTransferRepository,
  input: CreateBridgeTransferInput,
): Promise<BridgeTransferRecord> => {
  assertTransferShape(input);
  const amountRaw = humanUsdcToCctpAmount(input.amount).toString();
  if (amountRaw === '0') throw new Error('Bridge amount is too small');

  return repo.create({
    ...input,
    amountRaw,
    status: 'source_awaiting_signature',
    sourceTxHash: null,
    destinationTxHash: null,
    messageHash: null,
    cctpMessage: null,
    cctpAttestation: null,
    errorReason: null,
  });
};

export const attachBridgeSourceTx = async (
  repo: BridgeTransferRepository,
  id: string,
  input: AttachSourceTxInput,
): Promise<BridgeTransferRecord> => {
  const row = await repo.getById(id);
  if (!row) throw new Error('Bridge transfer not found');

  if (row.sourceTxHash) {
    if (row.sourceTxHash === input.sourceTxHash && (row.messageHash ?? null) === (input.messageHash ?? null)) {
      return row;
    }
    assertMutable(row);
    throw new Error('Bridge transfer already has a different source transaction');
  }
  assertMutable(row);

  const duplicate = await repo.findBySourceTxHash(input.sourceTxHash);
  if (duplicate && duplicate.id !== id) throw new Error('Source transaction is already attached');

  return repo.update(id, {
    sourceTxHash: input.sourceTxHash,
    messageHash: input.messageHash ?? null,
    status: 'attestation_pending',
  });
};

export const refreshBridgeTransfer = async (
  repo: BridgeTransferRepository,
  id: string,
  getAttestation: (row: BridgeTransferRecord) => Promise<CctpAttestationResult>,
): Promise<BridgeTransferRecord> => {
  const row = await repo.getById(id);
  if (!row) throw new Error('Bridge transfer not found');
  if (row.status !== 'attestation_pending') return row;

  const result = await getAttestation(row);
  if (result.status === 'pending') {
    if (result.errorReason && result.errorReason !== row.errorReason) {
      return repo.update(id, { errorReason: result.errorReason });
    }
    return row;
  }
  if (result.status === 'failed') {
    return repo.update(id, {
      status: 'needs_review',
      errorReason: result.errorReason ?? 'CCTP attestation failed',
    });
  }
  if (!result.message || !result.attestation) {
    return repo.update(id, {
      status: 'needs_review',
      errorReason: 'CCTP attestation response is missing message or attestation',
    });
  }

  return repo.update(id, {
    status: 'ready_to_complete',
    cctpMessage: result.message,
    cctpAttestation: result.attestation,
    errorReason: null,
  });
};

export const attachBridgeDestinationTx = async (
  repo: BridgeTransferRepository,
  id: string,
  input: AttachDestinationTxInput,
): Promise<BridgeTransferRecord> => {
  const row = await repo.getById(id);
  if (!row) throw new Error('Bridge transfer not found');

  if (row.destinationTxHash) {
    if (row.destinationTxHash === input.destinationTxHash) return row;
    assertMutable(row);
    throw new Error('Bridge transfer already has a different destination transaction');
  }
  assertMutable(row);

  return repo.update(id, {
    destinationTxHash: input.destinationTxHash,
    status: 'completed',
    errorReason: null,
  });
};

export const markBridgeDestinationRelayFailed = async (
  repo: BridgeTransferRepository,
  id: string,
  input: MarkDestinationRelayFailedInput,
): Promise<BridgeTransferRecord> => {
  const row = await repo.getById(id);
  if (!row) throw new Error('Bridge transfer not found');
  assertMutable(row);
  return repo.update(id, {
    status: 'needs_review',
    errorReason: input.errorReason,
  });
};

export const listActiveBridgeTransfers = (
  repo: BridgeTransferRepository,
  walletAddress: string,
): Promise<BridgeTransferRecord[]> => repo.listActiveForWallet(walletAddress);

export const listRecentCompletedBridgeTransfers = (
  repo: BridgeTransferRepository,
  walletAddress: string,
  limit = 3,
): Promise<BridgeTransferRecord[]> => repo.listRecentCompletedForWallet(walletAddress, limit);
