import { Router } from 'express';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';
import {
  closeDepositIntent,
  getDepositPlatforms,
  getOpenDepositIntent,
  getProfile,
  openDepositIntent,
  sendError,
  sendSuccess,
  toDepositIntentResponseDTO,
} from '@vaquita/shared';

/**
 * "Deposit from another app" waiting cards (`/deposit-intents`).
 *
 * An intent is a UI marker: it never moves or credits money, so the client is
 * allowed to report arrival itself (it sees the balance go up). The profile
 * still always comes from the session, never from the URL or the body.
 */
const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves the session wallet to its profile id, or reports the 404 itself. */
async function resolveProfileId(res: any, req: any): Promise<number | null> {
  const wallet = getSessionWallet(res);
  const { success, errors, errorMessage, profileData } = await getProfile(wallet);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for deposit intents');
    sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
    return null;
  }

  return profileData.id;
}

// GET /api/v1/deposit-intents/open — the waiting card, or null.
router.get('/open', requireSessionWallet, async (req, res) => {
  try {
    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const row = await getOpenDepositIntent(profileId);
    return sendSuccess(res, { intent: row ? toDepositIntentResponseDTO(row) : null });
  } catch (err) {
    req.log.error({ err }, 'Failed to read the open deposit intent');
    return sendError(res, 'Failed to read the open deposit intent', null, 500);
  }
});

// POST /api/v1/deposit-intents — body { platformId }.
router.post('/', requireSessionWallet, async (req, res) => {
  const platformId = typeof req.body?.platformId === 'string' ? req.body.platformId.trim() : '';
  if (!platformId) return sendError(res, 'A platform is required.', null, 400);

  try {
    // Only a platform the catalog currently offers: a disabled one has no
    // tutorial to come back to, so its card would be a dead end.
    const platforms = await getDepositPlatforms();
    if (!platforms.some((p) => p.id === platformId)) {
      return sendError(res, 'Unknown platform.', null, 400);
    }

    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const row = await openDepositIntent({ profileId, walletAddress: getSessionWallet(res), platformId });
    req.log.info({ profileId, depositIntentId: row.id, platformId }, 'Deposit intent opened');
    return sendSuccess(res, toDepositIntentResponseDTO(row));
  } catch (err) {
    req.log.error({ err, platformId }, 'Failed to open a deposit intent');
    return sendError(res, 'Failed to open a deposit intent', null, 500);
  }
});

// POST /api/v1/deposit-intents/:id/arrived and /:id/cancel
for (const [action, status] of [
  ['arrived', 'arrived'],
  ['cancel', 'cancelled'],
] as const) {
  router.post(`/:id/${action}`, requireSessionWallet, async (req, res) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return sendError(res, 'Deposit intent not found.', null, 404);

    try {
      const profileId = await resolveProfileId(res, req);
      if (profileId === null) return;

      const row = await closeDepositIntent({ id, profileId, status });
      if (!row) return sendError(res, 'Deposit intent not found.', null, 404);

      req.log.info({ profileId, depositIntentId: id, status }, 'Deposit intent closed');
      return sendSuccess(res, toDepositIntentResponseDTO(row));
    } catch (err) {
      req.log.error({ err, depositIntentId: id, status }, 'Failed to close a deposit intent');
      return sendError(res, 'Failed to close a deposit intent', null, 500);
    }
  });
}

export default router;
