import * as Ably from 'ably';
import { Router } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/ably/token
// ---------------------------------------------------------------------------

/**
 * Issues a short-lived Ably TokenRequest so the browser never holds the Ably
 * API key. Consumed by the web client's `authUrl`, which expects the raw
 * TokenRequest JSON (NOT the standard `{ success, data }` envelope).
 *
 * Capabilities are scoped to the channels the app actually uses:
 *   - `logs`              → publish (console mirroring)
 *   - `register-customer` → publish + subscribe (session registration)
 *   - `deposits-changes`  → subscribe (deposit cache invalidation)
 *
 * 200 TokenRequest
 * 500 ABLY_API_KEY missing or token generation failed
 */
router.get('/token', async (req, res) => {
  req.log.info('GET /ably/token');

  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    req.log.error('ABLY_API_KEY is not configured');
    return res.status(500).json({ success: false, message: 'Ably is not configured' });
  }

  try {
    const rest = new Ably.Rest({ key: apiKey });
    const tokenRequest = await rest.auth.createTokenRequest({
      capability: {
        logs: ['publish'],
        'register-customer': ['publish', 'subscribe'],
        'deposits-changes': ['subscribe'],
      },
    });
    return res.status(200).json(tokenRequest);
  } catch (err: any) {
    req.log.error({ err }, 'Failed to create Ably token request');
    return res.status(500).json({ success: false, message: err?.message ?? 'Failed to create Ably token' });
  }
});

export default router;
