import { StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  buildCctpForwarderHookData,
  CCTP_DOMAIN,
  humanUsdcToCctpAmount,
  prepareEvmDepositForBurnWithHookToStellar,
  stellarStrkeyToBytes32,
} from './index';

const evmUsdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const makeContract = (fill: number) => StrKey.encodeContract(Buffer.alloc(32, fill));
const makeAccount = (fill: number) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, fill));

describe('CCTP configuration and Stellar helpers', () => {
  it('prepares an EVM burn-with-hook for Stellar through CctpForwarder', () => {
    const forwarder = makeContract(7);
    const recipient = makeAccount(9);

    const params = prepareEvmDepositForBurnWithHookToStellar({
      amount: humanUsdcToCctpAmount('0.1234567'),
      cctpForwarderStrkey: forwarder,
      burnToken: evmUsdc,
      maxFee: 0n,
      minFinalityThreshold: 2000,
      forwardRecipientStrkey: recipient,
    });

    expect(params).toMatchObject({
      amount: 123456n,
      destinationDomain: CCTP_DOMAIN.STELLAR,
      mintRecipient: stellarStrkeyToBytes32(forwarder),
      burnToken: evmUsdc,
      destinationCaller: stellarStrkeyToBytes32(forwarder),
      maxFee: 0n,
      minFinalityThreshold: 2000,
    });
    expect(params.hookData).toBe(buildCctpForwarderHookData(recipient));
  });

  it('rejects invalid Stellar recipients before building hook data', () => {
    expect(() => buildCctpForwarderHookData('not-a-stellar-address')).toThrow(/invalid stellar/i);
  });

  it('uses six-decimal CCTP amounts regardless of Stellar display precision', () => {
    expect(humanUsdcToCctpAmount('1')).toBe(1_000_000n);
    expect(humanUsdcToCctpAmount('0.1234567')).toBe(123_456n);
    expect(humanUsdcToCctpAmount('0.0000009')).toBe(0n);
  });
});
