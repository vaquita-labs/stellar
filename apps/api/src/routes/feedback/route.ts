import { Router } from 'express';
import {
  countRecentFeedbackPosts,
  createFeedbackPost,
  DETAILS_MAX,
  FEEDBACK_HOURLY_LIMIT,
  getProfile,
  isFeedbackKind,
  sendError,
  sendSuccess,
  TITLE_MAX,
  toFeedbackPostResponseDTO,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * Feedback and bug reports sent from inside the app (`/feedback`).
 *
 * Submit-only. The inbox lives in `apps/admin`, which reads Prisma directly, so
 * there is no admin-authenticated read path to protect here.
 *
 * The wallet comes from the session token, never from the body: a report is
 * attributed to whoever filed it, and letting the client name the author would
 * make every report worthless as a thing to reply to.
 */
const router = Router();

const APP_PATH_MAX = 200;
const USER_AGENT_MAX = 400;
const LOCALE_RE = /^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/;

/**
 * The in-app route the form was opened from, normalized to a path. Anything
 * with a scheme, a host or a query string is dropped rather than sanitized:
 * this field exists to say "the user was on /portfolio", and a query string
 * could carry whatever the page happened to have in the URL.
 */
function cleanAppPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (/[?#]/.test(trimmed)) return null;
  return trimmed.slice(0, APP_PATH_MAX);
}

/**
 * POST /api/v1/feedback  { kind, title, details, appPath? }
 *
 * Files one report. `locale` and `userAgent` are read off the request rather
 * than the body — they describe the client, and the client has no reason to be
 * the one asserting them.
 */
router.post('/', requireSessionWallet, async (req, res) => {
  const body = (req.body ?? {}) as { kind?: unknown; title?: unknown; details?: unknown; appPath?: unknown };

  const kind = body.kind;
  if (!isFeedbackKind(kind)) return sendError(res, 'A report kind is required.', null, 400);

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return sendError(res, 'A title is required.', null, 400);
  if (title.length > TITLE_MAX) return sendError(res, `The title must be at most ${TITLE_MAX} characters.`, null, 400);

  const details = typeof body.details === 'string' ? body.details.trim() : '';
  if (details.length > DETAILS_MAX) {
    return sendError(res, `The details must be at most ${DETAILS_MAX} characters.`, null, 400);
  }

  const wallet = getSessionWallet(res);

  try {
    // A profile is expected but not required: the report is keyed by wallet and
    // has to land even if the profile row is missing, which is exactly the kind
    // of broken state someone would be filing a bug about.
    const { profileData } = await getProfile(wallet);
    const profileId = profileData?.id ?? null;

    if (profileId !== null) {
      const recent = await countRecentFeedbackPosts(profileId);
      if (recent >= FEEDBACK_HOURLY_LIMIT) {
        return sendError(res, 'Too many reports sent in the last hour. Please try again later.', null, 429);
      }
    }

    // The profile's own language setting first — that is the copy the user was
    // actually reading. Accept-Language is only the fallback, for a report filed
    // before the profile ever saved one.
    const acceptLanguage = (String(req.headers['accept-language'] ?? '').split(',')[0] ?? '').trim();
    const language = (profileData?.language ?? '').trim() || acceptLanguage;

    const row = await createFeedbackPost({
      profileId,
      walletAddress: wallet,
      kind,
      title,
      details,
      locale: LOCALE_RE.test(language) ? language : null,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, USER_AGENT_MAX) || null,
      appPath: cleanAppPath(body.appPath),
    });

    // Deliberately not logging `title`/`details`: they are the user's own words,
    // and reports about a payment or an account belong in the table the admin
    // reads, not in logs that travel further.
    req.log.info({ profileId, feedbackPostId: row.id, kind: row.kind }, 'Feedback post stored');
    return sendSuccess(res, toFeedbackPostResponseDTO(row));
  } catch (err) {
    req.log.error({ err }, 'Failed to store feedback post');
    return sendError(res, 'Failed to send your report', null, 500);
  }
});

export default router;
