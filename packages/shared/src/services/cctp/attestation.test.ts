import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateCctpMaxFeeRaw, fetchCircleCctpAttestation, fetchCircleCctpFeeQuote } from './attestation';
import type { BridgeTransferRecord } from './transfers';

const transfer: BridgeTransferRecord = {
  id: '1',
  direction: 'evm_to_stellar',
  sourceNetwork: 'ethereum-sepolia',
  destinationNetwork: 'stellar-testnet',
  sourceWallet: '0x1111111111111111111111111111111111111111',
  destinationWallet: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  amount: '1',
  amountRaw: '1000000',
  status: 'attestation_pending',
  sourceTxHash: '0xsource',
  destinationTxHash: null,
  messageHash: null,
  cctpMessage: null,
  cctpAttestation: null,
  errorReason: null,
  createdAt: new Date('2026-06-29T00:00:00.000Z'),
  updatedAt: new Date('2026-06-29T00:00:00.000Z'),
};

describe('Circle CCTP attestation helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rounds minimum fee bps into USDC minor units', () => {
    expect(calculateCctpMaxFeeRaw(1_000_000n, 1)).toBe(100n);
    expect(calculateCctpMaxFeeRaw(100_000n, 1)).toBe(10n);
    expect(calculateCctpMaxFeeRaw(1n, 1)).toBe(1n);
    expect(calculateCctpMaxFeeRaw(1_000_000n, 0)).toBe(0n);
  });

  it('fetches the fast transfer fee quote for the selected domains', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      { finalityThreshold: 1000, minimumFee: 1 },
      { finalityThreshold: 2000, minimumFee: 0 },
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const quote = await fetchCircleCctpFeeQuote({
      sourceNetwork: 'ethereum-sepolia',
      destinationNetwork: 'stellar-testnet',
      amountRaw: 1_000_000n,
      finalityThreshold: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/0/27',
      { headers: { accept: 'application/json' } },
    );
    expect(quote).toEqual({
      finalityThreshold: 1000,
      minimumFeeBps: 1,
      maxFeeRaw: '100',
    });
  });

  it('moves insufficient fee responses to reviewable failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      messages: [{
        status: 'pending_confirmations',
        delayReason: 'insufficient_fee',
      }],
    }), { status: 200 })));

    await expect(fetchCircleCctpAttestation(transfer)).resolves.toEqual({
      status: 'failed',
      errorReason: 'Circle Iris blocked attestation: insufficient_fee. The source burn maxFee was too low for Fast Transfer.',
    });
  });

  it('surfaces non-terminal Circle pending delay reasons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      messages: [{
        status: 'pending_confirmations',
        delayReason: 'finality_threshold',
      }],
    }), { status: 200 })));

    await expect(fetchCircleCctpAttestation(transfer)).resolves.toEqual({
      status: 'pending',
      errorReason: 'Circle Iris pending: finality_threshold',
    });
  });
});
