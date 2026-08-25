import { Router } from 'express';
import {
  getLatestAcceptance,
  getProfile,
  getRequiredPolicyVersion,
  LEGAL_DOCUMENT_VERSIONS,
  recordAcceptance,
  sendError,
  sendSuccess,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * Legal acceptance (`/legal`).
 *
 * Both routes use `requireSessionWallet`, never `requireWalletSession`. That is
 * the whole point: `requireWalletSession` honours the `WALLET_AUTH_ENFORCE`
 * escape hatch and waves unauthenticated mutations through with a warning when
 * it is off, which would let an acceptance be written for a wallet nobody
 * proved control of. `requireSessionWallet` has no such hatch, and taking the
 * wallet from the session means the URL carries nothing to spoof.
 *
 * An acceptance is evidence, so it is only ever appended — there is no update
 * or delete path here by design.
 */
const router = Router();

/** Coarse country code from an upstream proxy, when one is configured. */
const readCountryCode = (headerValue: unknown): string | null => {
  if (typeof headerValue !== 'string') return null;
  const code = headerValue.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
};

/**
 * What the caller must accept, and what they have accepted. Drives the client
 * gate's "is this user current?" check without exposing anyone else's record.
 */
router.get('/status', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  req.log.info({ walletAddress }, 'GET /legal/status');

  const requiredVersion = await getRequiredPolicyVersion();

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);
  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const latest = await getLatestAcceptance(profileData.id);
    return sendSuccess(res, {
      requiredVersion,
      documentVersions: LEGAL_DOCUMENT_VERSIONS,
      acceptedVersion: latest?.policyVersion ?? '',
      acceptedAt: latest?.acceptedAt ?? '',
      jurisdictionAttested: latest?.jurisdictionAttested ?? false,
      upToDate: !!latest && latest.policyVersion === requiredVersion,
    });
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to read legal acceptance');
    return sendError(res, 'Failed to read legal acceptance', err, 500);
  }
});

router.post('/accept', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);
  const { policyVersion, jurisdictionAttested, locale } = req.body ?? {};
  req.log.info({ walletAddress, policyVersion, jurisdictionAttested }, 'POST /legal/accept');

  if (typeof policyVersion !== 'string' || !policyVersion.trim()) {
    return sendError(res, 'policyVersion must be a non-empty string.', null, 400);
  }
  // The attestation is a representation the user makes, not a checkbox we can
  // default: an absent or false value is a refusal, not a partial acceptance.
  if (jurisdictionAttested !== true) {
    return sendError(
      res,
      'jurisdictionAttested must be true — eligibility must be affirmed to use the Service.',
      null,
      400,
    );
  }
  if (locale !== undefined && typeof locale !== 'string') {
    return sendError(res, 'locale must be a string.', null, 400);
  }

  // Reject a stale version rather than recording it. A client running an older
  // bundle would otherwise write a row claiming the user accepted terms they
  // were never shown.
  const requiredVersion = await getRequiredPolicyVersion();
  if (policyVersion !== requiredVersion) {
    return sendError(
      res,
      `Stale policy version '${policyVersion}' — the current version is '${requiredVersion}'. Reload and review again.`,
      null,
      400,
    );
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);
  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const acceptance = await recordAcceptance({
      profileId: profileData.id,
      walletAddress,
      policyVersion: requiredVersion,
      acceptedDocuments: { ...LEGAL_DOCUMENT_VERSIONS },
      jurisdictionAttested: true,
      countryCode:
        readCountryCode(req.headers['cf-ipcountry']) ??
        readCountryCode(req.headers['x-country-code']),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      locale: typeof locale === 'string' ? locale : null,
    });

    req.log.info(
      { profileId: profileData.id, acceptanceId: acceptance.id, policyVersion: requiredVersion },
      'Legal acceptance recorded',
    );
    return sendSuccess(res, {
      acceptedVersion: requiredVersion,
      acceptedAt: acceptance.acceptedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to record legal acceptance');
    return sendError(res, 'Failed to record legal acceptance', err, 500);
  }
});

export default router;
