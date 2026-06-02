import * as Ably from 'ably';
import { type Request, type Response, Router } from 'express';
import { requireAdminSecret } from '../admin/route';

const router = Router();

/**
 * Issues a short-lived Ably TokenRequest with the given capability and writes it
 * to the response. The browser consumes this via `authUrl`, which expects the
 * raw TokenRequest JSON (NOT the standard `{ success, data }` envelope).
 */
async function issueTokenRequest(req: Request, res: Response, capability: NonNullable<Ably.TokenParams['capability']>) {
  const apiKey = process.env.ABLY_KEY;
  if (!apiKey) {
    req.log.error('ABLY_KEY is not configured');
    return res.status(500).json({ success: false, message: 'Ably is not configured' });
  }

  try {
    const rest = new Ably.Rest({ key: apiKey });
    const tokenRequest = await rest.auth.createTokenRequest({ capability });
    return res.status(200).json(tokenRequest);
  } catch (err: any) {
    req.log.error({ err }, 'Failed to create Ably token request');
    return res.status(500).json({ success: false, message: err?.message ?? 'Failed to create Ably token' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/ably/token  — public web client
// ---------------------------------------------------------------------------

/**
 * Capabilities scoped to what the web app uses. Deliberately NO `subscribe` on
 * `logs`: clients only mirror their own console there, they must not be able to
 * read other clients' logs.
 *   - `logs`              → publish (console mirroring)
 *   - `register-customer` → publish + subscribe (session registration)
 *   - `deposits-changes`  → subscribe (deposit cache invalidation)
 *
 * 200 TokenRequest · 500 ABLY_KEY missing / generation failed
 */
router.get('/token', async (req, res) => {
  req.log.info('GET /ably/token');
  return issueTokenRequest(req, res, {
    logs: ['publish'],
    'register-customer': ['publish', 'subscribe'],
    'deposits-changes': ['subscribe'],
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/ably/admin-token  — admin dashboard (gated by ADMIN_SECRET)
// ---------------------------------------------------------------------------

/**
 * Admin monitoring token. Grants `subscribe` on `logs` so the dashboard can read
 * the aggregated client logs — a capability intentionally withheld from the
 * public token. Protected by the same `x-admin-secret` header the admin app
 * already sends on its write calls (open when ADMIN_SECRET is unset, dev only).
 *
 * 200 TokenRequest · 403 bad/missing secret · 500 ABLY_KEY missing / failed
 */
router.get('/admin-token', async (req, res) => {
  req.log.info('GET /ably/admin-token');
  if (!requireAdminSecret(req, res)) return;
  return issueTokenRequest(req, res, {
    logs: ['subscribe'],
    'register-customer': ['publish', 'subscribe'],
  });
});

export default router;
