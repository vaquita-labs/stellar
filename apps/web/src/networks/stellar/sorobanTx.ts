import type { PollarClient, TransactionState, TxBuildBody } from '@pollar/core';
import { submitAndSettle } from './pollarError';
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
 * machine for modal UIs). `submitAndSettle` turns its three-way outcome into a
 * hash the ledger confirmed, or a throw — so a caller that gets a hash back can
 * safely build the next step on top of it.
 *
 * The pool derives each position id on-chain as `sha256(caller || nonce)`, so
 * callers pass the client-supplied `nonce` (a `u64`) — NOT a precomputed id.
 * `withdraw(caller, nonce)` re-derives the same id.
 */
// Coalesce overlapping invocations of the same contract call into one
// in-flight request. A double-click or re-render that fires two identical
// calls would otherwise open two Freighter popups. Keying by the full request
// signature lets independent deposits/withdraws still run in parallel.
//
// The entry is released as soon as the transaction is broadcast, NOT when it
// finishes confirming: the popup it guards against is long gone by then, and
// holding it through confirmation would fold a deliberate second deposit of the
// same amount (the vault's `deposit` args carry no nonce to tell them apart)
// into the first one's hash, reporting two successes for one movement.
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

  let entry: Promise<{ hash: string }> | null = null;
  const release = () => {
    if (entry && INFLIGHT_REQUESTS.get(key) === entry) INFLIGHT_REQUESTS.delete(key);
  };

  const promise = submitAndSettle(
    client,
    () => client.buildAndSignAndSubmitTx('invoke_contract', params),
    `Pollar ${params.method} failed`,
    {
      onBroadcast: (hash) => {
        console.info(`[${logLabel}] broadcast`, hash);
        release();
      },
    },
  ).finally(release);

  entry = promise;
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
/** Deadline for the whole change_trust round-trip. */
const TRUSTLINE_TIMEOUT_MS = 90_000;

/**
 * Adds a USDC trustline on Stellar testnet via Pollar.
 *
 * Driven off the state machine rather than an awaited outcome, because the flow
 * has to sign the built XDR itself. That means nothing resolves the promise if
 * Pollar goes quiet, so the deadline is what guarantees the caller gets an answer.
 */
export async function addUsdcTrustline(): Promise<{ hash: string }> {
  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound — log in first.');
  const client = binding.client;

  return new Promise<{ hash: string }>((resolve, reject) => {
    let settled = false;
    // Filled in below, read here: `finish` has to exist before the deadline that
    // calls it, and the deadline has to exist before `finish` can clear it. The
    // bag breaks that cycle, and the optional reads keep `finish` safe even if
    // Pollar's callback fires before an assignment lands.
    const pending: { unsubscribe?: () => void; timer?: ReturnType<typeof setTimeout> } = {};
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (pending.timer) clearTimeout(pending.timer);
      pending.unsubscribe?.();
      fn();
    };

    pending.timer = setTimeout(
      () => finish(() => reject(new Error('change_trust timed out waiting for a result'))),
      TRUSTLINE_TIMEOUT_MS,
    );

    pending.unsubscribe = client.onTransactionStateChange((state: TransactionState) => {
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
