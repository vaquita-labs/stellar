import { Router } from 'express';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';
import {
  CCTP_NETWORKS,
  createSavedWallet,
  deleteSavedWallet,
  getProfile,
  getSavedWallets,
  sendError,
  sendSuccess,
  toSavedWalletResponseDTO,
  updateSavedWallet,
} from '@vaquita/shared';

/**
 * Saved payout wallets (`/wallets/saved`).
 *
 * These rows are the destination of real money, so the profile they belong to is
 * taken from the session token — never from the URL or the body. A request can
 * only ever touch the wallets of whoever signed the challenge.
 */
const router = Router();

const LABEL_MAX = 60;
const ADDRESS_MAX = 128;
const MEMO_MAX = 64;

// Whitelist derived from the networks the product actually supports, so adding a
// chain in one place doesn't leave this route silently rejecting it.
const SUPPORTED_NETWORKS = new Set<string>(Object.keys(CCTP_NETWORKS));

// Ids are UUIDs. Prisma throws an opaque P2023 on a malformed one, which would
// surface as a 500 for what is really just "no such wallet" — check it up front.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';

type Validated = { label: string; address: string; memo: string | null; network: string };

/** Validates a create payload, returning either the cleaned fields or a user-facing message. */
function validateCreate(body: unknown): { ok: true; value: Validated } | { ok: false; message: string } {
  const raw = (body ?? {}) as { label?: unknown; address?: unknown; memo?: unknown; network?: unknown };

  const labelResult = validateLabel(raw.label);
  if (!labelResult.ok) return labelResult;

  const address = typeof raw.address === 'string' ? raw.address.trim() : '';
  if (!address) return { ok: false, message: 'An address is required.' };
  if (address.length > ADDRESS_MAX) {
    return { ok: false, message: `The address must be at most ${ADDRESS_MAX} characters.` };
  }
  if (/\s/.test(address)) return { ok: false, message: 'The address cannot contain spaces.' };

  // Memo is optional: some exchanges require a memo/tag to credit the deposit,
  // most self-custody wallets need none. A blank memo collapses to null.
  const memoRaw = typeof raw.memo === 'string' ? raw.memo.trim() : '';
  if (memoRaw.length > MEMO_MAX) {
    return { ok: false, message: `The memo must be at most ${MEMO_MAX} characters.` };
  }
  const memo = memoRaw.length > 0 ? memoRaw : null;

  const network = typeof raw.network === 'string' ? raw.network.trim() : '';
  if (!network) return { ok: false, message: 'A network is required.' };
  if (!SUPPORTED_NETWORKS.has(network)) {
    return { ok: false, message: `Unsupported network: ${network}` };
  }

  return { ok: true, value: { label: labelResult.value.label, address, memo, network } };
}

function validateLabel(value: unknown): { ok: true; value: { label: string } } | { ok: false; message: string } {
  const label = typeof value === 'string' ? value.trim() : '';
  if (!label) return { ok: false, message: 'A name is required.' };
  if (label.length > LABEL_MAX) {
    return { ok: false, message: `The name must be at most ${LABEL_MAX} characters.` };
  }
  return { ok: true, value: { label } };
}

/** Resolves the session wallet to its profile id, or reports the 404 itself. */
async function resolveProfileId(res: any, req: any): Promise<number | null> {
  const wallet = getSessionWallet(res);
  const { success, errors, errorMessage, profileData } = await getProfile(wallet);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for saved wallets');
    sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
    return null;
  }

  return profileData.id;
}

// ---------------------------------------------------------------------------
// GET /api/v1/wallets/saved
// ---------------------------------------------------------------------------

router.get('/', requireSessionWallet, async (req, res) => {
  try {
    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const rows = await getSavedWallets(profileId);
    return sendSuccess(res, { savedWallets: rows.map(toSavedWalletResponseDTO) });
  } catch (err) {
    req.log.error({ err }, 'Failed to list saved wallets');
    return sendError(res, 'Failed to list saved wallets', null, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/wallets/saved
// ---------------------------------------------------------------------------

router.post('/', requireSessionWallet, async (req, res) => {
  const validation = validateCreate(req.body);
  if (!validation.ok) return sendError(res, validation.message, null, 400);

  try {
    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const row = await createSavedWallet({ profileId, ...validation.value });
    req.log.info({ profileId, savedWalletId: row.id }, 'Saved wallet created');
    return sendSuccess(res, toSavedWalletResponseDTO(row));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return sendError(res, 'You already saved that address for this network.', null, 409);
    }
    req.log.error({ err }, 'Failed to create saved wallet');
    return sendError(res, 'Failed to create saved wallet', null, 500);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/wallets/saved/:id
// ---------------------------------------------------------------------------

router.patch('/:id', requireSessionWallet, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return sendError(res, 'Saved wallet not found.', null, 404);

  const validation = validateLabel((req.body ?? {}).label);
  if (!validation.ok) return sendError(res, validation.message, null, 400);

  try {
    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const row = await updateSavedWallet(id, profileId, { label: validation.value.label });
    if (!row) return sendError(res, 'Saved wallet not found.', null, 404);

    req.log.info({ profileId, savedWalletId: id }, 'Saved wallet renamed');
    return sendSuccess(res, toSavedWalletResponseDTO(row));
  } catch (err) {
    req.log.error({ err, savedWalletId: id }, 'Failed to update saved wallet');
    return sendError(res, 'Failed to update saved wallet', null, 500);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/wallets/saved/:id
// ---------------------------------------------------------------------------

router.delete('/:id', requireSessionWallet, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return sendError(res, 'Saved wallet not found.', null, 404);

  try {
    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const deleted = await deleteSavedWallet(id, profileId);
    if (!deleted) return sendError(res, 'Saved wallet not found.', null, 404);

    req.log.info({ profileId, savedWalletId: id }, 'Saved wallet deleted');
    return sendSuccess(res, { id });
  } catch (err) {
    req.log.error({ err, savedWalletId: id }, 'Failed to delete saved wallet');
    return sendError(res, 'Failed to delete saved wallet', null, 500);
  }
});

export default router;
