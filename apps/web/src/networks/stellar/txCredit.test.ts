import { Address, Keypair, nativeToScVal, rpc, StrKey, xdr } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTransferCredit } from './txCredit';

const OPTIONS = { rpcUrl: 'https://rpc.test' };

// These generated unions expose no named arm factories, so both are built by
// selecting the arm through its discriminant.
const EXT = () => new xdr.ExtensionPoint(0);
const body = (v0: xdr.ContractEventV0) => new xdr.ContractEventBody(0, v0);
// `contractId` is declared as the opaque `xdr.Hash` but is a 32-byte Buffer at
// runtime, the mirror of the cast `txCredit` needs when reading it back.
const contractIdOf = (c: string) => StrKey.decodeContract(c) as unknown as xdr.Hash;

const USDC = StrKey.encodeContract(Buffer.alloc(32, 1));
const OTHER_TOKEN = StrKey.encodeContract(Buffer.alloc(32, 2));
const USER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
const SOMEONE_ELSE = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 4)).publicKey();
const POOL = StrKey.encodeContract(Buffer.alloc(32, 5));

/** A SEP-41 `transfer` event as the SAC and the vault both emit it. */
const transferEvent = (token: string, from: string, to: string, amount: bigint, extraTopics: xdr.ScVal[] = []) =>
  new xdr.ContractEvent({
    ext: EXT(),
    contractId: contractIdOf(token),
    type: xdr.ContractEventType.contract(),
    body: body(
      new xdr.ContractEventV0({
        topics: [
          nativeToScVal('transfer', { type: 'symbol' }),
          new Address(from).toScVal(),
          new Address(to).toScVal(),
          ...extraTopics,
        ],
        data: nativeToScVal(amount, { type: 'i128' }),
      }),
    ),
  });

/** An event that is not a transfer at all (the pool emits several per call). */
const otherEvent = (token: string) =>
  new xdr.ContractEvent({
    ext: EXT(),
    contractId: contractIdOf(token),
    type: xdr.ContractEventType.contract(),
    body: body(
      new xdr.ContractEventV0({
        topics: [nativeToScVal('withdraw', { type: 'symbol' }), new Address(POOL).toScVal()],
        data: nativeToScVal(1n, { type: 'i128' }),
      }),
    ),
  });

const stubTx = (result: { status: rpc.Api.GetTransactionStatus; events?: xdr.ContractEvent[][] } | Error) =>
  vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(async () => {
    if (result instanceof Error) throw result;
    return {
      status: result.status,
      events: { contractEventsXdr: result.events ?? [], transactionEventsXdr: [] },
    } as unknown as Awaited<ReturnType<rpc.Server['getTransaction']>>;
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readTransferCredit', () => {
  it('reads the amount the user received', async () => {
    stubTx({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      events: [[transferEvent(USDC, POOL, USER, 2_830_008_070n)]],
    });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBe(2_830_008_070n);
  });

  it('reads the SAC event shape that carries the asset as a fourth topic', async () => {
    stubTx({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      events: [[transferEvent(USDC, POOL, USER, 500n, [nativeToScVal('USDC:GISSUER', { type: 'string' })])]],
    });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBe(500n);
  });

  it('adds up several legs that land on the user', async () => {
    // A multi-strategy vault pays out in more than one transfer.
    stubTx({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      events: [[transferEvent(USDC, POOL, USER, 300n), transferEvent(USDC, POOL, USER, 700n)]],
    });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBe(1_000n);
  });

  it('ignores the legs that do not end at the user', async () => {
    // The vault collects from its strategy before paying out; only the last leg
    // is what the user actually received.
    stubTx({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      events: [
        [
          transferEvent(USDC, POOL, SOMEONE_ELSE, 900n),
          transferEvent(USDC, POOL, USER, 100n),
        ],
      ],
    });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBe(100n);
  });

  it('ignores transfers of a different token', async () => {
    stubTx({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      events: [[transferEvent(OTHER_TOKEN, POOL, USER, 999n)]],
    });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBeNull();
  });

  it('ignores events that are not transfers', async () => {
    stubTx({ status: rpc.Api.GetTransactionStatus.SUCCESS, events: [[otherEvent(USDC)]] });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBeNull();
  });

  it('sums across operation groups', async () => {
    stubTx({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      events: [[transferEvent(USDC, POOL, USER, 40n)], [transferEvent(USDC, POOL, USER, 2n)]],
    });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBe(42n);
  });

  it('says nothing when the chain has not seen the transaction', async () => {
    stubTx({ status: rpc.Api.GetTransactionStatus.NOT_FOUND });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBeNull();
  });

  it('says nothing when the transaction failed', async () => {
    stubTx({ status: rpc.Api.GetTransactionStatus.FAILED });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBeNull();
  });

  it('says nothing when the meta carries no events', async () => {
    stubTx({ status: rpc.Api.GetTransactionStatus.SUCCESS, events: [] });
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBeNull();
  });

  it('says nothing when the RPC is unreachable', async () => {
    stubTx(new Error('rpc down'));
    await expect(readTransferCredit('HASH', USDC, USER, OPTIONS)).resolves.toBeNull();
  });

  it('says nothing without a hash, and never calls the RPC', async () => {
    const spy = stubTx({ status: rpc.Api.GetTransactionStatus.SUCCESS });
    await expect(readTransferCredit('', USDC, USER, OPTIONS)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
