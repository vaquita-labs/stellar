import { Router } from 'express';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';
import {
  createSavedBankAccount,
  deleteSavedBankAccount,
  getProfile,
  getSavedBankAccounts,
  sendError,
  sendSuccess,
  toSavedBankAccountResponseDTO,
} from '@vaquita/shared';

/**
 * Saved bank accounts for the fiat off-ramp (`/wallets/saved-banks`).
 *
 * Same rule as `/wallets/saved`, and it matters more here: `fields` carries the
 * user's name, tax ID and account number, so the profile always comes from the
 * session token — never from the URL or the body. There is no read path that
 * takes a wallet or a profile id from the request.
 *
 * There is no PATCH. Saving over an existing name in the same country IS the
 * edit (see `createSavedBankAccount`): the provider decides which fields a
 * corridor asks for, so a partial update of an arbitrary key set would only
 * ever be a way to leave an account half-corrected.
 */
const router = Router();

const LABEL_MAX = 60;
const CURRENCY_MAX = 8;
const RAIL_MAX = 16;
const FIELD_KEY_MAX = 64;
const FIELD_VALUE_MAX = 256;
// The provider asks for a handful of fields per corridor; anything past this is
// not a form being filled in.
const MAX_FIELDS = 40;

const COUNTRY_RE = /^[A-Z]{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Validated = {
  label: string;
  country: string;
  currency: string;
  rail: string | null;
  fields: Record<string, string>;
};

/** Validates a create payload, returning either the cleaned fields or a user-facing message. */
function validateCreate(body: unknown): { ok: true; value: Validated } | { ok: false; message: string } {
  const raw = (body ?? {}) as {
    label?: unknown;
    country?: unknown;
    currency?: unknown;
    rail?: unknown;
    fields?: unknown;
  };

  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (!label) return { ok: false, message: 'A name is required.' };
  if (label.length > LABEL_MAX) return { ok: false, message: `The name must be at most ${LABEL_MAX} characters.` };

  const country = typeof raw.country === 'string' ? raw.country.trim().toUpperCase() : '';
  if (!COUNTRY_RE.test(country)) return { ok: false, message: 'A two-letter country code is required.' };

  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  if (!currency) return { ok: false, message: 'A currency is required.' };
  if (currency.length > CURRENCY_MAX) {
    return { ok: false, message: `The currency must be at most ${CURRENCY_MAX} characters.` };
  }

  // The rail is whatever the quote published. It is not whitelisted here: the
  // set of rails is the provider's, and a new one must not become an error the
  // user cannot act on.
  const railRaw = typeof raw.rail === 'string' ? raw.rail.trim() : '';
  if (railRaw.length > RAIL_MAX) return { ok: false, message: `The rail must be at most ${RAIL_MAX} characters.` };
  const rail = railRaw.length > 0 ? railRaw : null;

  const fieldsRaw = raw.fields;
  if (!fieldsRaw || typeof fieldsRaw !== 'object' || Array.isArray(fieldsRaw)) {
    return { ok: false, message: 'The account details are required.' };
  }

  const entries = Object.entries(fieldsRaw as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, message: 'The account details are required.' };
  if (entries.length > MAX_FIELDS) return { ok: false, message: 'Too many account details.' };

  const fields: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (key.length > FIELD_KEY_MAX) return { ok: false, message: 'Invalid account details.' };
    // Only strings: the ramp form produces nothing else, and accepting objects
    // here would let arbitrary JSON into a column we hand straight back.
    if (typeof value !== 'string') return { ok: false, message: 'Invalid account details.' };
    const trimmed = value.trim();
    if (trimmed.length > FIELD_VALUE_MAX) return { ok: false, message: 'Invalid account details.' };
    if (trimmed.length > 0) fields[key] = trimmed;
  }

  if (Object.keys(fields).length === 0) return { ok: false, message: 'The account details are required.' };

  return { ok: true, value: { label, country, currency, rail, fields } };
}

/** Resolves the session wallet to its profile id, or reports the 404 itself. */
async function resolveProfileId(res: any, req: any): Promise<number | null> {
  const wallet = getSessionWallet(res);
  const { success, errors, errorMessage, profileData } = await getProfile(wallet);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, wallet }, 'Profile not resolved for saved bank accounts');
    sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
    return null;
  }

  return profileData.id;
}

// ---------------------------------------------------------------------------
// GET /api/v1/wallets/saved-banks
// ---------------------------------------------------------------------------

router.get('/', requireSessionWallet, async (req, res) => {
  try {
    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const rows = await getSavedBankAccounts(profileId);
    return sendSuccess(res, { savedBankAccounts: rows.map(toSavedBankAccountResponseDTO) });
  } catch (err) {
    req.log.error({ err }, 'Failed to list saved bank accounts');
    return sendError(res, 'Failed to list saved bank accounts', null, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/wallets/saved-banks
// ---------------------------------------------------------------------------

router.post('/', requireSessionWallet, async (req, res) => {
  const validation = validateCreate(req.body);
  if (!validation.ok) return sendError(res, validation.message, null, 400);

  try {
    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const row = await createSavedBankAccount({ profileId, ...validation.value });
    // Deliberately not logging `fields`: it is the user's identity document and
    // account number, and logs travel further than the database does.
    req.log.info(
      { profileId, savedBankAccountId: row.id, country: row.country, rail: row.rail },
      'Saved bank account stored',
    );
    return sendSuccess(res, toSavedBankAccountResponseDTO(row));
  } catch (err) {
    req.log.error({ err }, 'Failed to save bank account');
    return sendError(res, 'Failed to save bank account', null, 500);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/wallets/saved-banks/:id
// ---------------------------------------------------------------------------

router.delete('/:id', requireSessionWallet, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return sendError(res, 'Saved bank account not found.', null, 404);

  try {
    const profileId = await resolveProfileId(res, req);
    if (profileId === null) return;

    const deleted = await deleteSavedBankAccount(id, profileId);
    if (!deleted) return sendError(res, 'Saved bank account not found.', null, 404);

    req.log.info({ profileId, savedBankAccountId: id }, 'Saved bank account deleted');
    return sendSuccess(res, { id });
  } catch (err) {
    req.log.error({ err, savedBankAccountId: id }, 'Failed to delete saved bank account');
    return sendError(res, 'Failed to delete saved bank account', null, 500);
  }
});

export default router;
