import type { PollarClient, TransactionState, TxBuildBody } from '@pollar/core';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';

// TEST — remove before mainnet
const USDC_TESTNET_ISSUER = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56';

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

type MintBadgeParams = {
  address: string;
  badgeContractId: string;
  badgeType: string;
  cycleId: number;
  expiry: number;
  signature: string; // base64-encoded BytesN<64>
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
// If Pollar never emits success/error (e.g. user closes Freighter without
// signing), unsubscribe after this many ms so the listener doesn't stay
// alive and double-sign the next attempt's `built` event.
const POLLAR_TX_TIMEOUT_MS = 120_000;

async function invokeViaPollar(
  client: PollarClient,
  params: InvokeContractParams,
  logLabel: string,
): Promise<{ hash: string }> {
  return new Promise<{ hash: string }>((resolve, reject) => {
    let settled = false;
    let signed = false;
    let unsubscribe: (() => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe?.();
      fn();
    };

    unsubscribe = client.onTransactionStateChange((state: TransactionState) => {
      console.info(`[${logLabel}] state`, state.step, state);
      // `onTransactionStateChange` is a global subscription, so an orphaned
      // listener from a previous attempt would also fire here on the next
      // `built` and trigger another Freighter popup. Guard with `signed` so
      // each listener only ever signs the first `built` it sees.
      if (state.step === 'built' && state.buildData?.unsignedXdr && !signed) {
        signed = true;
        // Don't catch — let state.step 'success'/'error' be the authoritative
        // outcome. signAndSubmitTx can reject on transient network errors even
        // when the tx lands; catching here races against the success state.
        void client.signAndSubmitTx(state.buildData.unsignedXdr);
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

    timeoutId = setTimeout(() => {
      finish(() => reject(new Error(`Pollar ${params.method} timed out`)));
    }, POLLAR_TX_TIMEOUT_MS);

    // Pollar retries 401s internally and communicates the real outcome via
    // onTransactionStateChange (success / error). Only log here — calling
    // finish() would reject the promise and unsubscribe before the retry lands.
    void client.buildTx('invoke_contract', params).catch((err: unknown) => {
      console.warn(`[${logLabel}] buildTx error (Pollar may retry):`, err);
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

/**
 * Calls `mint_badge` on the Vaquita Badges contract via Pollar.
 * The user's wallet pays XLM fees directly (fee-bump is handled separately).
 */
export async function mintBadge({
  address,
  badgeContractId,
  badgeType,
  cycleId,
  expiry,
  signature,
}: MintBadgeParams): Promise<{ hash: string }> {
  if (!address) throw new Error('No connected address');
  const client = requirePollarClient();
  console.info('[sorobanTx:mintBadge] routing via Pollar buildTx', { badgeType, cycleId, badgeContractId });
  return invokeViaPollar(
    client,
    {
      contractId: badgeContractId,
      method: 'mint_badge',
      args: [
        { type: 'address', value: address },
        { type: 'symbol',  value: badgeType },
        { type: 'u32',     value: cycleId },
        { type: 'u64',     value: expiry.toString() },
        { type: 'bytes',   value: signature },
      ],
    },
    'pollar-mint-badge',
  );
}

// TEST — remove before mainnet
/** Adds a USDC trustline on Stellar testnet via Pollar. */
export async function addUsdcTrustline(): Promise<{ hash: string }> {
  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound — log in first.');
  const client = binding.client;

  return new Promise<{ hash: string }>((resolve, reject) => {
    let settled = false;
    let signed = false;
    // Use `let` + optional chaining so finish() is safe even if the Pollar
    // callback fires synchronously before the assignment completes.
    let unsubscribe: (() => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe?.();
      fn();
    };

    unsubscribe = client.onTransactionStateChange((state: TransactionState) => {
      if (state.step === 'built' && state.buildData?.unsignedXdr && !signed) {
        signed = true;
        void client.signAndSubmitTx(state.buildData.unsignedXdr);
        return;
      }
      if (state.step === 'success') {
        finish(() => resolve({ hash: state.hash }));
        return;
      }
      if (state.step === 'error') {
        finish(() => reject(new Error(state.details ?? 'change_trust failed')));
        return;
      }
    });

    timeoutId = setTimeout(() => {
      finish(() => reject(new Error('change_trust timed out')));
    }, POLLAR_TX_TIMEOUT_MS);

    void client
      .buildTx('change_trust', {
        asset: { type: 'credit_alphanum4', code: 'USDC', issuer: USDC_TESTNET_ISSUER },
      } as TxBuildBody['params'])
      .catch((err: unknown) => {
        console.warn('[pollar-change-trust] buildTx error (Pollar may retry):', err);
      });
  });
}
