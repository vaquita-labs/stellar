import type { PollarClient, TransactionState, TxBuildBody } from '@pollar/core';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';

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

type Common = {
  address: string;
  contractId: string;
};

type DepositParams = {
  depositId: string;
  humanAmount?: string;
  amount?: bigint;
  period?: number | string | bigint;
  tokenDecimals?: number;
};

type WithdrawParams = {
  depositId: string;
};

type InvokeContractParams = Extract<TxBuildBody, { operation: 'invoke_contract' }>['params'];

/**
 * Invoke a Vaquita pool method via Pollar's `/tx/build` + `signAndSubmitTx` pipeline.
 *
 * We subscribe to Pollar's transaction state machine BEFORE calling `buildTx`
 * so the `built` callback (which carries the unsigned XDR) triggers
 * `signAndSubmitTx` and the eventual `success` carries back the on-chain hash.
 *
 * `deposit_id` in the Vaquita pool is a `String`, NOT a `BytesN<16>` (see
 * `contracts/vaquita-pool/src/lib.rs`), so callers pass the 32-char hex string
 * verbatim under `{ type: 'string' }`.
 */
async function invokeViaPollar(
  client: PollarClient,
  params: InvokeContractParams,
  logLabel: string,
): Promise<{ hash: string }> {
  return new Promise<{ hash: string }>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      fn();
    };

    const unsubscribe = client.onTransactionStateChange((state: TransactionState) => {
      console.info(`[${logLabel}] state`, state.step, state);
      if (state.step === 'built' && state.buildData?.unsignedXdr) {
        void client.signAndSubmitTx(state.buildData.unsignedXdr).catch((err: unknown) => {
          finish(() => reject(err instanceof Error ? err : new Error(String(err))));
        });
        return;
      }
      if (state.step === 'success') {
        finish(() => resolve({ hash: state.hash }));
        return;
      }
      if (state.step === 'error') {
        finish(() => reject(new Error(state.details ?? `Pollar ${params.method} failed`)));
        return;
      }
    });

    client.buildTx('invoke_contract', params).catch((err: unknown) => {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
  });
}

function requirePollarClient(): PollarClient {
  const binding = getPollarBinding();
  if (!binding) {
    throw new Error(
      'Pollar adapter is not bound yet — make sure <PollarBridge> ran after login.',
    );
  }
  return binding.client;
}

export function getSorobanTx({ address, contractId }: Common) {
  const deposit = async ({
    depositId,
    humanAmount,
    amount,
    period,
    tokenDecimals = 7,
  }: DepositParams) => {
    if (!address) throw new Error('No connected address');

    const amt =
      humanAmount != null && humanAmount !== ''
        ? toBaseUnits(String(humanAmount), tokenDecimals)
        : amount != null
          ? amount
          : (() => {
              throw new Error('Provide humanAmount or amount');
            })();

    const client = requirePollarClient();
    console.info('[sorobanTx:deposit] routing via Pollar buildTx', { depositId, amt, contractId });
    return await invokeViaPollar(
      client,
      {
        contractId,
        method: 'deposit',
        args: [
          { type: 'address', value: address },
          { type: 'string',  value: assertHex32(depositId) },
          { type: 'i128',    value: amt.toString() },
          { type: 'u64',     value: BigInt(period ?? 604800n).toString() },
        ],
      },
      'pollar-deposit',
    );
  };

  const withdraw = async ({ depositId }: WithdrawParams) => {
    if (!address) throw new Error('No connected address');

    const client = requirePollarClient();
    console.info('[sorobanTx:withdraw] routing via Pollar buildTx', { depositId, contractId });
    return await invokeViaPollar(
      client,
      {
        contractId,
        method: 'withdraw',
        args: [
          { type: 'address', value: address },
          { type: 'string',  value: assertHex32(depositId) },
        ],
      },
      'pollar-withdraw',
    );
  };

  return { deposit, withdraw };
}
