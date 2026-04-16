/* eslint-disable @typescript-eslint/no-explicit-any */
import { getStellarWalletsKit } from '@/networks/stellar/kit';
import { rpcCall, submitAndWait } from './rpc';
import { normalizeSignedXdr } from './xdr';

function toBaseUnits(input: string, decimals: number): bigint {
  const [wRaw, fRaw = ''] = input.trim().split('.');
  const w = wRaw.replace(/^0+/, '') || '0';
  const f = fRaw.slice(0, decimals).padEnd(decimals, '0');
  const combined = (w === '' ? '0' : w) + (decimals ? f : '');
  if (!/^\d+$/.test(combined)) throw new Error('Invalid amount');
  return BigInt(combined);
}

function assertHex32(hex: string): string {
  const h = hex.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{32}$/.test(h)) throw new Error('deposit_id must be 32 hex chars (16 bytes)');
  return h;
}

function hexToBytes16(hex: string): Uint8Array {
  const h = assertHex32(hex);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

type Common = {
  address: string;
  rpcUrl: string;
  networkPassphrase: string;
  clientRef: { current: any | null }; // Ref<ContractClient|null>
};

type DepositParams = {
  depositId: string;
  /** If provided, used instead of `amount` */
  humanAmount?: string; // e.g. "1.25"
  /** Raw base units (u128) if you don't pass humanAmount */
  amount?: bigint;
  /** seconds */
  period?: number | string | bigint;
  /** token decimals for humanAmount */
  tokenDecimals?: number; // default 7
  /**
   * How to encode deposit_id for your contract:
   * - "hex16-string"  -> pass validated hex string (32 chars) [DEFAULT]
   * - "hex16-bytes"   -> pass Uint8Array(16)
   * - "u128"          -> pass BigInt
   */
  depositIdEncoding?: 'hex16-string' | 'hex16-bytes' | 'u128';
};

type WithdrawParams = {
  depositId: string;
  depositIdEncoding?: 'hex16-string' | 'hex16-bytes' | 'u128';
};

export function getSorobanTx({ address, rpcUrl, networkPassphrase, clientRef }: Common) {
  const kit = getStellarWalletsKit();

  // Assemble contract call and (optionally) sign auth entries
  const assemble = async (method: string, args: any) => {
    if (!clientRef.current) throw new Error('Contract client not ready');
    const tx = await (clientRef.current as any)[method](args);

    // Some wallets/contracts need non-invoker auth entries to be signed
    let needs: any = false;
    if (typeof tx.needsNonInvokerSigningBy === 'function') {
      try {
        needs = tx.needsNonInvokerSigningBy(address);
      } catch {}
    }
    const mustSign = Array.isArray(needs) ? needs.length > 0 : !!needs;

    if (mustSign && (kit as any).signAuthEntry) {
      try {
        await tx.signAuthEntries(address, async (authXdr: string) => {
          const res = await (kit as any).signAuthEntry(authXdr, {
            address,
            networkPassphrase,
          });
          const signed = normalizeSignedXdr(res, /*isAuth*/ true);
          return signed;
        });
      } catch (err: any) {
        const msg = String(err?.name || err?.message || err);
        if (!/NoUnsignedNonInvokerAuthEntriesError/i.test(msg)) throw err;
        console.warn(`[${method}] no unsigned non-invoker auth entries; continuing.`);
      }
    }

    const unsigned: string = (tx as any).built?.toXDR?.() ?? (await (tx as any).toXDR?.());
    if (typeof unsigned !== 'string') {
      throw new Error('Could not get unsigned XDR from assembled tx');
    }
    return unsigned;
  };

  // Sign a transaction XDR with the wallet
  const sign = async (unsignedXdr: string) => {
    const res = await kit.signTransaction(unsignedXdr, {
      address,
      networkPassphrase,
    });
    return normalizeSignedXdr(res);
  };

  // Send via JSON-RPC and wait
  const send = async (signedXdr: string) => {
    const sendRes = await rpcCall<{ hash: string }>(rpcUrl, 'sendTransaction', {
      transaction: signedXdr,
    });
    const hash = (sendRes as any)?.hash || (typeof sendRes === 'string' ? sendRes : undefined);
    if (!hash) throw new Error('RPC did not return a transaction hash');
    const final = await submitAndWait(rpcUrl, hash);
    if (final.status !== 'SUCCESS') {
      throw new Error(`Tx failed: ${final.status} ${final.resultXdr ?? ''}`);
    }
    return { hash, final };
  };

  // High-level: deposit
  const deposit = async ({
    depositId,
    humanAmount,
    amount,
    period,
    tokenDecimals = 7,
    depositIdEncoding = 'hex16-string',
  }: DepositParams) => {
    if (!address) throw new Error('No connected address');

    // encode deposit_id for different contract specs
    let deposit_id: any;
    if (depositIdEncoding === 'u128') deposit_id = BigInt(depositId);
    else if (depositIdEncoding === 'hex16-bytes') deposit_id = hexToBytes16(depositId);
    else deposit_id = assertHex32(depositId); // default: hex16-string

    const amt =
      humanAmount != null && humanAmount !== ''
        ? toBaseUnits(String(humanAmount), tokenDecimals)
        : amount != null
          ? amount
          : (() => {
              throw new Error('Provide humanAmount or amount');
            })();

    const args = {
      caller: address,
      deposit_id,
      amount: amt,
      period: BigInt(period ?? 604800n),
    };

    const unsigned = await assemble('deposit', args);
    const signed = await sign(unsigned);
    return await send(signed);
  };

  // High-level: withdraw
  const withdraw = async ({ depositId, depositIdEncoding = 'hex16-string' }: WithdrawParams) => {
    if (!address) throw new Error('No connected address');

    let deposit_id: any;
    if (depositIdEncoding === 'u128') deposit_id = BigInt(depositId);
    else if (depositIdEncoding === 'hex16-bytes') deposit_id = hexToBytes16(depositId);
    else deposit_id = assertHex32(depositId);

    const args = {
      caller: address,
      deposit_id,
    };

    const unsigned = await assemble('withdraw', args);
    const signed = await sign(unsigned);
    return await send(signed);
  };

  return { assemble, sign, send, deposit, withdraw };
}
