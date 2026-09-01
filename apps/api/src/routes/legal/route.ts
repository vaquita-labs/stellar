import { Router, type Request } from 'express';
import {
  getLatestAcceptance,
  getProfile,
  getRequiredPolicyVersion,
  isValidStellarAddress,
  LEGAL_DOCUMENT_VERSIONS,
  recordAcceptance,
  sendError,
  sendSuccess,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet, verifySessionToken } from '../../lib/walletAuth';

/**
 * Legal acceptance (`/legal`).
 *
 * `GET /status` still requires a wallet session: it reads back somebody's
 * record, so the caller has to be that somebody.
 *
 * `POST /accept` deliberately does NOT. It used to sit behind
 * `requireSessionWallet`, which meant the acceptance could only be written
 * after the wallet had signed the SEP-10 challenge that mints a session token —
 * and on a freshly created wallet that signature fails often enough that new
 * users were left stuck on the gate with "we could not record your acceptance"
 * and no way past it. The gate is blocking, so a broken write is a broken
 * signup. We take the wallet from the session when the request happens to carry
 * a valid one, and from the body otherwise.
 *
 * The cost is real and worth stating: an acceptance row written without a
 * session proves that *someone* ticked the boxes from that browser, not that
 * the wallet's owner did. The row still carries the wallet, the versions, the
 * user agent and the timestamp; what it no longer carries is cryptographic
 * proof of control. Anyone can POST an acceptance for a wallet that is not
 * theirs. That is a deliberate trade — unblock signup now — and it should be
 * reversed once the wallet-session handshake is reliable on new wallets.
 *
 * An acceptance is evidence, so it is only ever appended — there is no update
 * or delete path here by design.
 */
const router = Router();

/**
 * Wallet the acceptance belongs to: the signed session when there is one, the
 * body when there is not. Prefers the session so a request that *does* prove
 * control cannot be talked out of it by a mismatched body field.
 */
const resolveAcceptingWallet = (req: Request): string | null => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const sessionWallet = verifySessionToken(token);
  if (sessionWallet) return sessionWallet;

  const raw = (req.body ?? {}).walletAddress;
  const candidate = typeof raw === 'string' ? raw.trim() : '';
  return isValidStellarAddress(candidate) ? candidate : null;
};

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

router.post('/accept', async (req, res) => {
  const walletAddress = resolveAcceptingWallet(req);
  const { policyVersion, jurisdictionAttested, locale } = req.body ?? {};
  req.log.info({ walletAddress, policyVersion, jurisdictionAttested }, 'POST /legal/accept');

  if (!walletAddress) {
    return sendError(res, 'walletAddress must be a valid Stellar address.', null, 400);
  }
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
