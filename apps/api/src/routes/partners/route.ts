import { Router } from 'express';
import { getProfileByNickname, sendError, sendSuccess } from '@vaquita/shared';
import { isNicknameFormatValid } from '../../lib/nicknamePolicy';
import { requirePartnerApiKey } from '../../lib/partnerAuth';

const router = Router();

// Server-to-server API for an external application. It does exactly one thing:
// resolve a vaquitag to the Stellar wallet that owns it. Auth, rate limit and
// the notes on growing this to several partners live in lib/partnerAuth.ts.
//
//   GET /api/v1/partners/resolve/:tag      header  x-api-key: <PARTNER_API_KEY>
//
//   200 { status: 'success', data: { tag, walletAddress } }
//   404 { status: 'error', message: 'Vaquita tag does not exist' }
//   400 malformed tag · 401 bad/missing key · 429 rate limited · 503 not enabled
//
// The response carries the wallet and nothing else from the profile, on
// purpose: a partner that needs more gets a new, explicit field, not the DTO.
router.get('/resolve/:tag', async (req, res) => {
  if (!requirePartnerApiKey(req, res)) return;

  // "@juan", "Juan" and "juan" are the same tag.
  const tag = String(req.params.tag ?? '').trim().replace(/^@/, '').toLowerCase();

  // The read-path bound (3-32), so grandfathered long tags still resolve.
  if (!isNicknameFormatValid(tag)) {
    return sendError(res, 'Invalid vaquita tag', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfileByNickname(tag);

  if (!success) {
    req.log.error({ errors, errorMessage, tag }, 'Partner resolve: lookup failed');
    return sendError(res, 'Internal server error', null, 500);
  }

  if (!profileData) {
    req.log.info({ event: 'partner_resolve', tag, found: false }, 'GET /partners/resolve/:tag');
    return sendError(res, 'Vaquita tag does not exist', null, 404);
  }

  req.log.info({ event: 'partner_resolve', tag, found: true }, 'GET /partners/resolve/:tag');
  return sendSuccess(res, { tag, walletAddress: profileData.wallet_address });
});

export default router;
