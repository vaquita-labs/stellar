import { Router } from 'express';
import { resolveAttribution, sendError, sendSuccess } from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * First-touch campaign attribution (`/attribution`).
 *
 * The client captures `?ref=` and the `utm_*` parameters on the very first
 * visit and parks them in localStorage; this endpoint is where that blob is
 * cashed in, once, after the user authenticates. It cannot run at landing time
 * because the profile does not exist yet — profile rows are created by an
 * implicit upsert on the first authenticated API touch.
 *
 * `requireSessionWallet`, deliberately: unlike the older referral route (which
 * takes the wallet from the URL and is noted in its own header as unauthed),
 * attribution writes a column that decides who gets credit for a signup. The
 * wallet has to come from the session token.
 *
 * Idempotent by construction — `resolveAttribution` no-ops on an already
 * attributed profile — so a client that retries, or one that flushes on two
 * tabs at once, cannot overwrite a first touch.
 */
const router = Router();

/**
 * POST /api/v1/attribution
 * { code?, utmSource?, utmMedium?, utmCampaign?, utmContent?, utmTerm?, referrer?, landedAt? }
 */
router.post('/', requireSessionWallet, async (req, res) => {
  const wallet = getSessionWallet(res);
  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    // Every field is validated and truncated inside `sanitizeAttribution`;
    // unknown keys are dropped rather than stored.
    const result = await resolveAttribution(wallet, body);

    req.log.info(
      { applied: result.applied, campaignCode: result.campaignCode ?? null },
      'Attribution resolved'
    );

    return sendSuccess(res, {
      applied: result.applied,
      campaignCode: result.campaignCode ?? null,
      referred: Boolean(result.referrerWallet),
    });
  } catch (err) {
    req.log.error({ err }, 'Failed to resolve attribution');
    return sendError(res, 'Failed to record attribution', null, 500);
  }
});

export default router;
