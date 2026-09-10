import { Networks, StrKey } from '@stellar/stellar-sdk';
import { Prisma, prisma } from '@vaquita/db';
import type { SorobanNetwork } from '../stellar/rpc';
import { getWalletPositions, type WalletPositionConfig } from '../stellar/wallet-positions';
import { getVaquitaPositionsByWalletToken, positionKey } from './vaquitaPositions';

/**
 * Refreshes the on-chain snapshot in `wallet_balances`.
 *
 * This is what makes "top DeFindex passive-yield depositors" answerable from
 * Postgres alone: the dashboard reads rows, never the chain. The trade-off is
 * that the numbers are only as fresh as the last run, which is why every result
 * carries `scrapedAt` and the caller is expected to show it.
 *
 * Reads are SEQUENTIAL and throttled on purpose. Measured against the free
 * public mainnet RPC: 404 ms and 1.1 requests per wallet, zero 429s over 274
 * requests at ~2.7 req/s — and 75-100% 429s at concurrency 5 or more. Going
 * parallel here does not make it faster, it makes it fail.
 */

// Tunables (env with safe defaults) — public RPC is rate-limited, so go gentle.
const SCRAPE_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? 300);
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Default RPC resolver, loaded lazily and on purpose.
 *
 * `../stellar/rpc` pulls in `config/env`, which `process.exit(1)`s on a missing
 * var at MODULE LOAD. A static import would therefore run during
 * `next build` in apps/admin — where those vars are deliberately absent — and
 * kill the build. Callers that already resolved an endpoint (admin does) pass
 * `resolveRpcUrl` and never reach this.
 */
const defaultResolveRpcUrl = async (network: SorobanNetwork): Promise<string> => {
  const { requireSorobanRpcUrl } = await import('../stellar/rpc');
  return requireSorobanRpcUrl(network);
};

export const isScrapableWallet = (address: string) =>
  StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address);

/** Read one wallet, retrying with exponential backoff (public-RPC 429 friendly). */
async function readWithBackoff(wallet: string, cfg: WalletPositionConfig) {
  let attempt = 0;
  for (;;) {
    try {
      return await getWalletPositions(wallet, cfg);
    } catch (e) {
      attempt++;
      if (attempt > MAX_RETRIES) throw e;
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
    }
  }
}

export type WalletBalanceResult = {
  wallet: string;
  tokenId: number;
  blendUsdc: number;
  vaultUsdc: number;
  lastError: string | null;
};

export type VaultAccrualInput = {
  /** The running total so far. */
  priorUsdcHours: number;
  /** Vault balance recorded at `priorObservedAt`. */
  priorVaultUsdc: number;
  /** When that balance was last read successfully, or null if never. */
  priorObservedAt: Date | null;
  /** Vault balance just read. */
  vaultUsdc: number;
  /** When it was just read. */
  observedAt: Date;
};

/**
 * Integrates the vault balance over the interval since the last successful
 * read, and returns the new running total of USDC-hours.
 *
 * Vault XP is `sqrt` of this. For a balance held steady at `A` for `T` hours
 * the total is `A * T`, and `sqrt(A * T) === sqrt(A) * sqrt(T)` — the same
 * number `depositExperience` gives a locked deposit, so vault and pool XP share
 * one scale with no correction factor.
 *
 * Three properties fall out of the shape rather than out of remembering to
 * check for them:
 *
 * - **Monotonic.** The result is never below `priorUsdcHours`, so XP derived
 *   from it can only grow. Withdrawing stops accrual; it never claws XP back.
 * - **Cadence-independent.** Summing `min * elapsed` over any partition of an
 *   interval gives the same total while the balance holds, so a user who opens
 *   the app hourly earns exactly what one who opens it weekly earns for the
 *   same money. XP is not a reward for opening the app.
 * - **`min()` is the anti-gaming term.** Money deposited moments before a read
 *   cannot back-credit hours it was not there for. Where the balance moves,
 *   `min` under-credits — always against the user's favour, never for it.
 *
 * A first observation (`priorObservedAt === null`) credits nothing; it only
 * establishes the baseline the next one integrates from.
 */
export const accrueVaultUsdcHours = (input: VaultAccrualInput): number => {
  const prior = Math.max(input.priorUsdcHours || 0, 0);
  if (!input.priorObservedAt) return prior;

  const elapsedHours = (input.observedAt.getTime() - input.priorObservedAt.getTime()) / 3_600_000;
  // A clock that went backwards, or two reads in the same millisecond. Either
  // way there is no interval to integrate over.
  if (!(elapsedHours > 0)) return prior;

  const held = Math.min(Math.max(input.priorVaultUsdc || 0, 0), Math.max(input.vaultUsdc || 0, 0));
  return prior + held * elapsedHours;
};

export type RefreshWalletBalancesInput = {
  /** Explicit wallets to read. Skips profile pagination entirely (retry-failed). */
  wallets?: string[];
  /** How many profiles to read in this batch. */
  limit?: number;
  /** Offset-based paging, for the admin panel's "scrape next page" button. */
  offset?: number;
  /**
   * Keyset paging, for the scheduled job: the last profile id already handled.
   * Preferred over `offset` for a full sweep — a profile created mid-run shifts
   * every later offset and silently skips a wallet.
   */
  afterProfileId?: number;
  /** Cooperative stop, so a runner can respect a wall-clock budget. */
  shouldStop?: () => boolean;
  onProgress?: (done: number, total: number) => void;
  /**
   * Where the Soroban endpoint comes from. Optional — omit it and the shared
   * env config decides. apps/admin passes its own so that `next build` never
   * evaluates that config (see `defaultResolveRpcUrl`).
   */
  resolveRpcUrl?: (network: SorobanNetwork) => string | Promise<string>;
};

export type RefreshWalletBalancesOutput = {
  /** Live profiles, i.e. how much there is to get through in total. */
  total: number;
  scraped: number;
  results: WalletBalanceResult[];
  /** Next `offset`, or null when the sweep is done. */
  nextOffset: number | null;
  /** Next `afterProfileId`, or null when the sweep is done. */
  nextProfileId: number | null;
  /** True when `shouldStop` cut the batch short. */
  stopped: boolean;
};

/**
 * Reads a page of profiles (or an explicit wallet list) and upserts one
 * snapshot per (wallet, token). Token ids are never mixed — even two tokens on
 * the same contract get their own row, because their locked-pool deposits
 * differ by token_id.
 */
export async function refreshWalletBalances(
  input: RefreshWalletBalancesInput = {},
): Promise<RefreshWalletBalancesOutput> {
  const limit = Math.max(1, Math.min(500, Number(input.limit ?? 10)));
  const offset = Math.max(0, Number(input.offset ?? 0));

  const tokens = await prisma.token.findMany({ where: { isSupported: true, deletedAt: null } });
  if (!tokens.length) throw new Error('No supported token configured');

  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  const networkPassphrase = config?.networkPassphrase === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET;
  const network: SorobanNetwork = networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet';
  const rpcUrl = await (input.resolveRpcUrl ?? defaultResolveRpcUrl)(network);
  const cfgFor = (token: (typeof tokens)[number]): WalletPositionConfig => ({
    rpcUrl,
    networkPassphrase,
    vaultId: token.defindexVaultContractAddress ?? '',
    blendPoolId: token.blendPoolContractAddress ?? null,
    usdcId: token.contractAddress?.split(',')?.[0] ?? '',
    decimals: token.decimals ?? 7,
  });

  // Soft-deleted profiles are not people we can still reach, and counting them
  // made the admin panel's progress bar stop short of 100%.
  const total = await prisma.profile.count({ where: { deletedAt: null } });

  const useExplicit = Array.isArray(input.wallets) && input.wallets.length > 0;
  const page = useExplicit
    ? []
    : await prisma.profile.findMany({
        where: {
          deletedAt: null,
          ...(input.afterProfileId ? { id: { gt: input.afterProfileId } } : {}),
        },
        orderBy: { id: 'asc' },
        ...(input.afterProfileId ? {} : { skip: offset }),
        take: limit,
        select: { id: true, walletAddress: true },
      });

  // Profile id travels WITH the wallet: filtering out unscrapable addresses
  // desynchronises a parallel array from `page`, and the keyset cursor would
  // then either skip profiles or, if a whole page is filtered out, never
  // advance at all.
  const entries: { id: number | null; wallet: string }[] = useExplicit
    ? input.wallets!.filter(isScrapableWallet).map((wallet) => ({ id: null, wallet }))
    : page.filter((p) => isScrapableWallet(p.walletAddress)).map((p) => ({ id: p.id, wallet: p.walletAddress }));
  const wallets = entries.map((e) => e.wallet);

  const positions = await getVaquitaPositionsByWalletToken(wallets);

  // The rows as they stand before this run, keyed by (wallet, token). The
  // accumulator integrates between the PREVIOUS successful read and this one,
  // so the write needs the old balance and the old timestamp — an upsert alone
  // cannot see them. One query for the whole batch; each key is written once
  // per run, so nothing here goes stale mid-loop.
  const priorRows = wallets.length
    ? await prisma.walletBalance.findMany({
        where: { walletAddress: { in: wallets } },
        select: { walletAddress: true, tokenId: true, vaultUsdc: true, vaultUsdcHours: true, observedAt: true },
      })
    : [];
  const priorByKey = new Map(priorRows.map((r) => [positionKey(r.walletAddress, r.tokenId), r]));

  // De-dupe identical on-chain reads within the batch.
  const readCache = new Map<string, Promise<{ blendUsdc: number; vaultUsdc: number }>>();

  // Credit each balance to exactly ONE row, and credit the two halves
  // independently. `vault_usdc` is the df-token balance, so it depends only on
  // the vault; `blend_usdc` depends only on the pool and the underlying token.
  // Two tokens can (and in production do) point at the same vault while
  // differing on the Blend pool — de-duping on the whole config would still
  // write the vault balance twice and make a plain SUM(vault_usdc) across the
  // table count the same money twice. The duplicate still gets its row, because
  // its locked-pool positions are its own; only the shared half is zeroed.
  const creditedVault = new Set<string>();
  const creditedBlend = new Set<string>();

  const results: WalletBalanceResult[] = [];
  let stopped = false;
  let lastProfileId: number | null = null;

  for (let i = 0; i < entries.length; i++) {
    if (input.shouldStop?.()) {
      stopped = true;
      break;
    }
    const wallet = entries[i]!.wallet;
    for (const token of tokens) {
      const cfg = cfgFor(token);
      const vaquitaPositions = (positions.get(positionKey(wallet, token.id)) ??
        []) as unknown as Prisma.InputJsonValue;
      try {
        const cacheKey = `${wallet}|${cfg.vaultId}|${cfg.blendPoolId}|${cfg.usdcId}`;
        let read = readCache.get(cacheKey);
        if (!read) {
          read = readWithBackoff(wallet, cfg);
          readCache.set(cacheKey, read);
        }
        const shared = await read;

        const vaultKey = `${wallet}|${cfg.vaultId}`;
        const blendKey = `${wallet}|${cfg.blendPoolId}|${cfg.usdcId}`;
        const vaultUsdc = creditedVault.has(vaultKey) ? 0 : shared.vaultUsdc;
        const blendUsdc = creditedBlend.has(blendKey) ? 0 : shared.blendUsdc;
        creditedVault.add(vaultKey);
        creditedBlend.add(blendKey);

        // Fold the elapsed interval into the XP accumulator before overwriting
        // the balance it was measured against. The de-dupe above matters here:
        // the second token sharing a vault sees `vaultUsdc = 0` on both sides
        // of the `min`, so it accrues nothing and the same money is never
        // counted twice.
        const prior = priorByKey.get(positionKey(wallet, token.id));
        const observedAt = new Date();
        const vaultUsdcHours = accrueVaultUsdcHours({
          priorUsdcHours: Number(prior?.vaultUsdcHours ?? 0),
          priorVaultUsdc: Number(prior?.vaultUsdc ?? 0),
          priorObservedAt: prior?.observedAt ?? null,
          vaultUsdc,
          observedAt,
        });

        // The current row and the history row are written together so the two
        // cannot diverge: every reading that reaches `wallet_balances` is also
        // kept, and nothing is kept that was not applied. `observedAt` is the
        // same instant on both, which is what makes a history row usable on its
        // own — the balance, the accumulator and the time it was measured.
        //
        // Only the success path writes history. The failure branch below leaves
        // the balance alone on purpose, and a row there would be a fake zero
        // that anything reading deltas would take for a withdrawal.
        await prisma.$transaction([
          prisma.walletBalance.upsert({
            where: { walletAddress_tokenId: { walletAddress: wallet, tokenId: token.id } },
            create: { walletAddress: wallet, tokenId: token.id, blendUsdc, vaultUsdc, vaultUsdcHours, vaquitaPositions, scrapedAt: observedAt, observedAt },
            update: { blendUsdc, vaultUsdc, vaultUsdcHours, vaquitaPositions, scrapedAt: observedAt, observedAt, lastError: null },
          }),
          prisma.walletBalanceHistory.create({
            data: { walletAddress: wallet, tokenId: token.id, blendUsdc, vaultUsdc, vaultUsdcHours, observedAt },
          }),
        ]);
        results.push({ wallet, tokenId: token.id, blendUsdc, vaultUsdc, lastError: null });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'read failed';
        await prisma.walletBalance.upsert({
          where: { walletAddress_tokenId: { walletAddress: wallet, tokenId: token.id } },
          create: { walletAddress: wallet, tokenId: token.id, blendUsdc: 0, vaultUsdc: 0, vaquitaPositions, scrapedAt: new Date(), lastError: message },
          // The stale balance is left in place: a snapshot from an hour ago is
          // closer to the truth than a zero, and `lastError` is what says the
          // number cannot be trusted. `vaultUsdcHours` and `observedAt` are
          // left alone for the same reason — a failed read is not an
          // observation, so the next success integrates across the whole gap
          // instead of losing it. This is why `observedAt` exists separately
          // from `scrapedAt`, which is bumped right here on a failure.
          update: { vaquitaPositions, scrapedAt: new Date(), lastError: message },
        });
        results.push({ wallet, tokenId: token.id, blendUsdc: 0, vaultUsdc: 0, lastError: message });
      }
    }
    lastProfileId = entries[i]!.id ?? lastProfileId;
    input.onProgress?.(i + 1, entries.length);
    if (i < entries.length - 1) await sleep(SCRAPE_DELAY_MS);
  }

  // A page whose every wallet was unscrapable still has to move the cursor, or
  // the sweep re-reads it forever.
  if (!useExplicit && !stopped && page.length > 0) lastProfileId = page[page.length - 1]!.id;

  const exhausted = useExplicit || stopped || page.length < limit;
  return {
    total,
    scraped: results.length,
    results,
    nextOffset: useExplicit || stopped ? null : offset + limit < total ? offset + limit : null,
    nextProfileId: exhausted && !stopped ? null : lastProfileId,
    stopped,
  };
}

/**
 * The tokens the scraper actually refreshes — and therefore the only rows of
 * `wallet_balances` that mean anything.
 *
 * Retiring a token (`is_supported = false`) does not delete its snapshot rows,
 * and the loop above never visits them again, so they freeze at whatever they
 * held that day. Production had two USDC tokens pointing at the SAME DeFindex
 * vault, so an unfiltered read counted that vault balance twice. Every READ of
 * the table goes through this; the writer keeps its own query because it needs
 * the whole token row, not just the id.
 */
export async function getSupportedTokenIds(): Promise<number[]> {
  const tokens = await prisma.token.findMany({
    where: { isSupported: true, deletedAt: null },
    select: { id: true },
  });
  return tokens.map((t) => t.id);
}

/** When the snapshot was last refreshed, and how much of it is untrustworthy. */
export async function getWalletBalancesFreshness(): Promise<{
  scrapedAt: string | null;
  rows: number;
  errored: number;
}> {
  const tokenIds = await getSupportedTokenIds();
  const supported = { tokenId: { in: tokenIds } };
  const [aggregate, errored] = await Promise.all([
    prisma.walletBalance.aggregate({ where: supported, _max: { scrapedAt: true }, _count: { _all: true } }),
    prisma.walletBalance.count({ where: { ...supported, lastError: { not: null } } }),
  ]);
  return {
    scrapedAt: aggregate._max.scrapedAt?.toISOString() ?? null,
    rows: aggregate._count._all,
    errored,
  };
}

/**
 * Default staleness a passive trigger accepts before spending an RPC read.
 *
 * Matched to the throttle `sampleVaultTvl` already uses for the analogous
 * read-Soroban-on-the-side-of-a-request pattern: long enough that reloading the
 * app repeatedly costs one read, short enough that a balance shown beside a
 * `scrapedAt` is not embarrassing.
 */
export const LAZY_REFRESH_MAX_AGE_MS = 10 * 60 * 1000;

/** In-flight lazy refreshes, keyed by wallet. */
const lazyInFlight = new Map<string, Promise<boolean>>();

export type LazyRefreshInput = {
  /**
   * How stale the snapshot may be before it is worth a read. Money-moved
   * triggers pass `0` to force one; passive triggers leave the default.
   */
  maxAgeMs?: number;
  resolveRpcUrl?: (network: SorobanNetwork) => string | Promise<string>;
};

/**
 * Refresh one wallet's snapshot, on the side of whatever the user was doing.
 *
 * This is what replaced the scheduled sweep: cost is proportional to activity
 * instead of to registered users, and the wallet that just moved money is
 * exactly the one that gets read. Two properties make it safe to call from
 * anywhere:
 *
 * - **TTL gate.** Inside `maxAgeMs` it returns without touching the chain, so a
 *   handler can call it unconditionally.
 * - **Single-flight.** Concurrent triggers for the same wallet — a deposit
 *   confirmation and an app open landing together — share one read. That, not
 *   the steady-state rate, is what trips the public RPC's 429s.
 *
 * Resolves `true` when a read actually happened. Callers should invoke it
 * detached (`void`) and swallow failures: a balance snapshot must never delay
 * or fail the request that triggered it.
 */
export async function lazyRefreshWalletBalances(
  wallet: string,
  input: LazyRefreshInput = {},
): Promise<boolean> {
  if (!isScrapableWallet(wallet)) return false;

  const existing = lazyInFlight.get(wallet);
  if (existing) return existing;

  const maxAgeMs = Math.max(0, Number(input.maxAgeMs ?? LAZY_REFRESH_MAX_AGE_MS));

  const run = (async () => {
    // Freshness is judged on `scrapedAt`, not `observedAt`: a wallet whose
    // reads keep failing should still be rate-limited, or a broken RPC turns
    // every request into a retry storm.
    if (maxAgeMs > 0) {
      const tokenIds = await getSupportedTokenIds();
      const recent = await prisma.walletBalance.findFirst({
        where: { walletAddress: wallet, tokenId: { in: tokenIds }, scrapedAt: { gt: new Date(Date.now() - maxAgeMs) } },
        select: { id: true },
      });
      if (recent) return false;
    }

    await refreshWalletBalances({
      wallets: [wallet],
      ...(input.resolveRpcUrl ? { resolveRpcUrl: input.resolveRpcUrl } : {}),
    });
    return true;
  })();

  lazyInFlight.set(wallet, run);
  try {
    return await run;
  } finally {
    lazyInFlight.delete(wallet);
  }
}
