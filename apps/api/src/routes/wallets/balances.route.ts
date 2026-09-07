import { Router } from 'express';
import { sendError, sendSuccess } from '@vaquita/shared';
import {
  LAZY_REFRESH_MAX_AGE_MS,
  getSupportedTokenIds,
  lazyRefreshWalletBalances,
} from '@vaquita/shared/services/wallets/onchainBalances';
import { prisma } from '@vaquita/db';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * On-chain balance snapshot for the caller's own wallet (`/wallets/balances`).
 *
 * This replaces a scheduled sweep that read every registered profile every six
 * hours. Reads are sequential against a rate-limited public RPC (~1.7 s each),
 * so that job grew with the user base while spending almost all of it on
 * wallets that had not moved. Refreshing on interaction makes the cost track
 * activity instead, and reads the wallet that just did something.
 *
 * The wallet is always the session's. Taking it from the body or a path param
 * would turn this into a way to make the API perform RPC reads against any
 * address a caller cares to name.
 *
 * Most triggers are server-side, on the handlers that already know money moved
 * (deposit confirm, withdrawal confirm, on-ramp and off-ramp settlement). This
 * endpoint exists for the ones that are not: supplying the DeFindex vault
 * ("passive yield") settles entirely in the browser and has no server handler
 * at all, and "the app was opened" is a client-side fact.
 */
const router = Router();

router.post('/refresh', requireSessionWallet, async (req, res) => {
  const wallet = getSessionWallet(res);

  // `force` skips the staleness gate, for a caller that knows the balance just
  // changed. Everything else accepts a snapshot up to LAZY_REFRESH_MAX_AGE_MS
  // old, so reloading the app repeatedly costs one RPC read.
  const { force } = (req.body ?? {}) as { force?: unknown };
  const maxAgeMs = force === true ? 0 : LAZY_REFRESH_MAX_AGE_MS;

  try {
    const refreshed = await lazyRefreshWalletBalances(wallet, { maxAgeMs });

    // Scoped to supported tokens: rows for a retired token are never refreshed
    // again, and in production two tokens shared one DeFindex vault, so an
    // unscoped read double-counts.
    const tokenIds = await getSupportedTokenIds();
    const rows = tokenIds.length
      ? await prisma.walletBalance.findMany({
          where: { walletAddress: wallet, tokenId: { in: tokenIds } },
          select: {
            tokenId: true,
            blendUsdc: true,
            vaultUsdc: true,
            vaultUsdcHours: true,
            scrapedAt: true,
            observedAt: true,
            lastError: true,
          },
          orderBy: { tokenId: 'asc' },
        })
      : [];

    return sendSuccess(res, {
      refreshed,
      balances: rows.map((row) => ({
        tokenId: row.tokenId,
        blendUsdc: Number(row.blendUsdc),
        vaultUsdc: Number(row.vaultUsdc),
        vaultUsdcHours: Number(row.vaultUsdcHours),
        // The vault figure is a snapshot, never live: `scrapedAt` ships with it
        // so a caller can show how old the number is.
        scrapedAt: row.scrapedAt?.toISOString() ?? null,
        observedAt: row.observedAt?.toISOString() ?? null,
        lastError: row.lastError,
      })),
    });
  } catch (err) {
    req.log.error({ err }, 'Failed to refresh wallet balances');
    return sendError(res, 'Failed to refresh wallet balances', null, 500);
  }
});

export default router;
