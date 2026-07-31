import type { PollarClient, TransactionState, TxBuildBody } from '@pollar/core';
import { describeOutcomeError, runWithErrorCapture } from './pollarError';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';

// TEST — remove before mainnet
const USDC_TESTNET_ISSUER = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56';

export function toBaseUnits(input: string, decimals: number): bigint {
  const [wRaw, fRaw = ''] = input.trim().split('.');
  const w = wRaw.replace(/^0+/, '') || '0';
  const f = fRaw.slice(0, decimals).padEnd(decimals, '0');
  const combined = (w === '' ? '0' : w) + (decimals ? f : '');
  if (!/^\d+$/.test(combined)) throw new Error('Invalid amount');
  return BigInt(combined);
}

function assertU64(value: bigint | number | string): string {
  const n = BigInt(value);
  if (n < 0n || n > 0xffffffffffffffffn) throw new Error('nonce must be a u64');
  return n.toString();
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
  nonce: bigint | number | string;
  humanAmount?: string;
  amount?: bigint;
  period?: number | string | bigint;
  tokenDecimals?: number;
};

type WithdrawParams = {
  nonce: bigint | number | string;
};

type InvokeContractParams = Extract<TxBuildBody, { operation: 'invoke_contract' }>['params'];

/**
 * Invoke a Vaquita pool method via Pollar's `buildAndSignAndSubmitTx`, which
 * does build → sign → submit in one awaitable call (for external wallets it
 * composes `buildTx` + `signAndSubmitTx` internally and still drives the state
 * machine for modal UIs). We just `await` it and read the returned outcome —
 * no manual `onTransactionStateChange` subscription needed.
 *
 * The pool derives each position id on-chain as `sha256(caller || nonce)`, so
 * callers pass the client-supplied `nonce` (a `u64`) — NOT a precomputed id.
 * `withdraw(caller, nonce)` re-derives the same id.
 */
// Coalesce overlapping invocations of the same contract call into one
// in-flight request. A double-click or re-render that fires two identical
// calls would otherwise open two Freighter popups. Keying by the full request
// signature lets independent deposits/withdraws still run in parallel.
const INFLIGHT_REQUESTS = new Map<string, Promise<{ hash: string }>>();

function requestKey(params: InvokeContractParams): string {
  return `${params.contractId}:${params.method}:${JSON.stringify(params.args)}`;
}

export async function invokeViaPollar(
  client: PollarClient,
  params: InvokeContractParams,
  logLabel: string,
): Promise<{ hash: string }> {
  const key = requestKey(params);
  const existing = INFLIGHT_REQUESTS.get(key);
  if (existing) {
    console.warn(`[${logLabel}] duplicate call coalesced into in-flight request`);
    return existing;
  }

  const promise = (async () => {
    const { outcome, lastError } = await runWithErrorCapture(client, () =>
      client.buildAndSignAndSubmitTx('invoke_contract', params),
    );
    console.info(`[${logLabel}] outcome`, outcome.status, outcome);
    if (outcome.status === 'error') {
      throw new Error(describeOutcomeError(outcome, lastError, `Pollar ${params.method} failed`));
    }
    // Both 'success' (ledger-confirmed) and 'pending' (Horizon ack) carry a hash.
    return { hash: outcome.hash };
  })().finally(() => {
    INFLIGHT_REQUESTS.delete(key);
  });

  INFLIGHT_REQUESTS.set(key, promise);
  return promise;
}

export function requirePollarClient(): PollarClient {
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
    nonce,
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
    console.info('[sorobanTx:deposit] routing via Pollar buildTx', { nonce, amt, contractId });
    return await invokeViaPollar(
      client,
      {
        contractId,
        method: 'deposit',
        args: [
          { type: 'address', value: address },
          { type: 'u64',     value: assertU64(nonce) },
          { type: 'i128',    value: amt.toString() },
          { type: 'u64',     value: BigInt(period ?? 604800n).toString() },
        ],
      },
      'pollar-deposit',
    );
  };

  const withdraw = async ({ nonce }: WithdrawParams) => {
    if (!address) throw new Error('No connected address');

    const client = requirePollarClient();
    console.info('[sorobanTx:withdraw] routing via Pollar buildTx', { nonce, contractId });
    return await invokeViaPollar(
      client,
      {
        contractId,
        method: 'withdraw',
        args: [
          { type: 'address', value: address },
          { type: 'u64',     value: assertU64(nonce) },
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
    // Use `let` + optional chaining so finish() is safe even if the Pollar
    // callback fires synchronously before the assignment completes.
    let unsubscribe: (() => void) | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      fn();
    };

    unsubscribe = client.onTransactionStateChange((state: TransactionState) => {
      if (state.step === 'built' && state.buildData?.unsignedXdr) {
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

    void client
      .buildTx('change_trust', {
        asset: { type: 'credit_alphanum4', code: 'USDC', issuer: USDC_TESTNET_ISSUER },
      } as TxBuildBody['params'])
      .catch((err: unknown) => {
        console.warn('[pollar-change-trust] buildTx error (Pollar may retry):', err);
      });
  });
}
