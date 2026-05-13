/* eslint-disable @typescript-eslint/no-explicit-any */
import { rpcCall, submitAndWait } from './rpc';
import { requireActiveAdapter } from './wallet/registry';
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
  humanAmount?: string;
  amount?: bigint;
  period?: number | string | bigint;
  tokenDecimals?: number;
  depositIdEncoding?: 'hex16-string' | 'hex16-bytes' | 'u128';
};

type WithdrawParams = {
  depositId: string;
  depositIdEncoding?: 'hex16-string' | 'hex16-bytes' | 'u128';
};

export function getSorobanTx({ address, rpcUrl, networkPassphrase, clientRef }: Common) {
  const assemble = async (method: string, args: any) => {
    if (!clientRef.current) throw new Error('Contract client not ready');
    const tx = await (clientRef.current as any)[method](args);

    let needs: any = false;
    if (typeof tx.needsNonInvokerSigningBy === 'function') {
      try {
        needs = tx.needsNonInvokerSigningBy(address);
      } catch {}
    }
    const mustSign = Array.isArray(needs) ? needs.length > 0 : !!needs;

    if (mustSign) {
      const adapter = requireActiveAdapter();
      if (!adapter.signAuthEntry) {
        throw new Error(
          `[${method}] requires non-invoker auth entry signing, but adapter "${adapter.id}" does not support it.`,
        );
      }
      try {
        await tx.signAuthEntries(address, async (authXdr: string) => {
          const signed = await adapter.signAuthEntry!(authXdr, { address, networkPassphrase });
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

  const sign = async (unsignedXdr: string) => {
    const adapter = requireActiveAdapter();
    const res = await adapter.signTransaction(unsignedXdr, { address, networkPassphrase });
    return normalizeSignedXdr(res);
  };

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

  /** Run the full sign+submit pipeline, branching on whether the adapter submits internally. */
  const signAndSubmit = async (unsignedXdr: string) => {
    const adapter = requireActiveAdapter();
    if (adapter.submitsOnSign && adapter.signAndSubmitTransaction) {
      const { hash } = await adapter.signAndSubmitTransaction(unsignedXdr, { address, networkPassphrase });
      const final = await submitAndWait(rpcUrl, hash);
      if (final.status !== 'SUCCESS') {
        throw new Error(`Tx failed: ${final.status} ${final.resultXdr ?? ''}`);
      }
      return { hash, final };
    }
    const signed = await sign(unsignedXdr);
    return await send(signed);
  };

  const deposit = async ({
    depositId,
    humanAmount,
    amount,
    period,
    tokenDecimals = 7,
    depositIdEncoding = 'hex16-string',
  }: DepositParams) => {
    if (!address) throw new Error('No connected address');

    let deposit_id: any;
    if (depositIdEncoding === 'u128') deposit_id = BigInt(depositId);
    else if (depositIdEncoding === 'hex16-bytes') deposit_id = hexToBytes16(depositId);
    else deposit_id = assertHex32(depositId);

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
    return await signAndSubmit(unsigned);
  };

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
    return await signAndSubmit(unsigned);
  };

  return { assemble, sign, send, signAndSubmit, deposit, withdraw };
}
