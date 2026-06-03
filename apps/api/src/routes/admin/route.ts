import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import {
  type AchievementAdminPayload,
  achievementCreateSchema,
  achievementPayloadToRow,
  achievementUpdateSchema,
  createAchievement,
  getAchievementByKey,
  getAllAchievements,
  sendError,
  sendSuccess,
  updateAchievement,
} from '@vaquita/shared';

const router = Router();

const asyncHandler = <P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
  fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true; // not configured — open (dev only)
  const provided = req.headers['x-admin-secret'] as string | undefined;
  if (provided !== secret) {
    res.status(403).json({ status: 'error', message: 'Forbidden' });
    return false;
  }
  return true;
}

export { requireAdminSecret };

// ---------------------------------------------------------------------------
// Achievement catalog CRUD (admin). Reads the same `achievements` table the
// public catalog endpoint serves. We soft-delete via `enabled = false` and
// never DELETE rows, so historical claims survive. Validation schemas live in
// @vaquita/shared so this app doesn't need a direct `zod` dependency.
// ---------------------------------------------------------------------------

// GET /admin/achievements — full catalog incl. disabled/hidden rows.
router.get(
  '/achievements',
  asyncHandler(async (req, res) => {
    if (!requireAdminSecret(req, res)) return;
    const { data, error } = await getAllAchievements();
    if (error) return sendError(res, 'Failed to load achievements', error, 500);
    return sendSuccess(res, { achievements: data });
  }),
);

// POST /admin/achievements — create a new badge.
router.post(
  '/achievements',
  asyncHandler(async (req, res) => {
    if (!requireAdminSecret(req, res)) return;

    const parsed = achievementCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Invalid achievement payload', parsed.error.flatten(), 400);
    }
    const { key, ...rest } = parsed.data as AchievementAdminPayload & { key: string };

    const { data: existing } = await getAchievementByKey(key);
    if (existing) {
      return sendError(res, `An achievement with key "${key}" already exists.`, null, 409);
    }

    const { data, error } = await createAchievement({ key, ...achievementPayloadToRow(rest) });
    if (error) return sendError(res, 'Failed to create achievement', error, 500);
    req.log.info({ key }, 'Achievement created (admin)');
    return sendSuccess(res, { achievement: data });
  }),
);

// PATCH /admin/achievements/:key — edit metadata / rule / order / visibility.
router.patch(
  '/achievements/:key',
  asyncHandler(async (req, res) => {
    if (!requireAdminSecret(req, res)) return;
    const { key } = req.params;

    const parsed = achievementUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Invalid achievement payload', parsed.error.flatten(), 400);
    }

    const { data: existing } = await getAchievementByKey(key);
    if (!existing) {
      return sendError(res, `Unknown achievement: ${key}`, null, 404);
    }

    // Guard: `tier` doubles as the Soroban contract symbol used when minting a
    // badge on-chain. Silently changing it on an existing badge can break the
    // mint flow, so require an explicit override.
    const payload = parsed.data as AchievementAdminPayload;
    const wantsTierChange = payload.tier !== undefined && payload.tier !== existing.tier;
    const allowTierChange = (req.body as { allowTierChange?: unknown })?.allowTierChange === true;
    if (wantsTierChange && !allowTierChange) {
      req.log.warn({ key, from: existing.tier, to: payload.tier }, 'Blocked tier change without override');
      return sendError(
        res,
        "Changing 'tier' can break on-chain badge minting (tier is the Soroban contract symbol). Resend with allowTierChange:true to override.",
        null,
        409,
      );
    }

    const { data, error } = await updateAchievement(key, achievementPayloadToRow(payload));
    if (error) return sendError(res, 'Failed to update achievement', error, 500);
    req.log.info({ key }, 'Achievement updated (admin)');
    return sendSuccess(res, { achievement: data });
  }),
);

export default router;
