import { Router } from 'express';
import {
  ATTACHMENTS_MAX,
  countRecentFeedbackPosts,
  createFeedbackPost,
  decodeAttachment,
  DETAILS_MAX,
  FEEDBACK_HOURLY_LIMIT,
  type FeedbackAttachmentInput,
  getFeedbackAttachment,
  getProfile,
  isFeedbackKind,
  isFeedbackSort,
  listFeedbackBoard,
  sendError,
  sendSuccess,
  TITLE_MAX,
  toFeedbackPostResponseDTO,
  toggleFeedbackVote,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * Feedback and bug reports sent from inside the app (`/feedback`).
 *
 * Three surfaces: filing a report, the public board where other users can second
 * one, and the bytes of an attached screenshot. Triage still happens in
 * `apps/admin`, which reads Prisma directly, so no admin-authenticated read path
 * exists here.
 *
 * The wallet comes from the session token, never from the body: a report is
 * attributed to whoever filed it, and letting the client name the author would
 * make every report worthless as a thing to reply to.
 */
const router = Router();

const APP_PATH_MAX = 200;
const USER_AGENT_MAX = 400;
const LOCALE_RE = /^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * POST /api/v1/feedback  { kind, title, details, appPath?, attachments? }
 *
 * Files one report. `locale` and `userAgent` are read off the request rather
 * than the body — they describe the client, and the client has no reason to be
 * the one asserting them.
 *
 * `attachments` is an array of base64 (or data-URL) images. The client already
 * downscales them; everything here re-checks anyway, because "the client
 * shrinks it first" is a performance argument, never a validation one.
 */
router.post('/', requireSessionWallet, async (req, res) => {
  const body = (req.body ?? {}) as {
    kind?: unknown;
    title?: unknown;
    details?: unknown;
    appPath?: unknown;
    attachments?: unknown;
  };

  const kind = body.kind;
  if (!isFeedbackKind(kind)) return sendError(res, 'A report kind is required.', null, 400);

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return sendError(res, 'A title is required.', null, 400);
  if (title.length > TITLE_MAX) return sendError(res, `The title must be at most ${TITLE_MAX} characters.`, null, 400);

  const details = typeof body.details === 'string' ? body.details.trim() : '';
  if (details.length > DETAILS_MAX) {
    return sendError(res, `The details must be at most ${DETAILS_MAX} characters.`, null, 400);
  }

  const rawAttachments = body.attachments;
  if (rawAttachments !== undefined && !Array.isArray(rawAttachments)) {
    return sendError(res, 'Attachments must be a list.', null, 400);
  }
  const list = Array.isArray(rawAttachments) ? rawAttachments : [];
  if (list.length > ATTACHMENTS_MAX) {
    return sendError(res, `At most ${ATTACHMENTS_MAX} images can be attached.`, null, 400);
  }

  const attachments: FeedbackAttachmentInput[] = [];
  for (const [index, raw] of list.entries()) {
    const decoded = decodeAttachment(raw);
    // Say which one failed: with three files in the form, "an attachment is too
    // large" is not something a user can act on.
    if (!decoded.ok) return sendError(res, `Image ${index + 1}: ${decoded.reason}`, null, 400);
    attachments.push(decoded.value);
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
      attachments,
    });

    // Deliberately not logging `title`/`details`: they are the user's own words,
    // and reports about a payment or an account belong in the table the admin
    // reads, not in logs that travel further.
    req.log.info(
      { profileId, feedbackPostId: row.id, kind: row.kind, attachments: attachments.length },
      'Feedback post stored',
    );
    return sendSuccess(res, toFeedbackPostResponseDTO(row));
  } catch (err) {
    req.log.error({ err }, 'Failed to store feedback post');
    return sendError(res, 'Failed to send your report', null, 500);
  }
});

/**
 * GET /api/v1/feedback/board?kind=bug&sort=top|new
 *
 * The Canny-style board. Session-gated like the rest of the app, but the payload
 * is the narrow `listFeedbackBoard` shape: no wallet, no user-agent, no locale.
 * The viewer's profile is only used to mark which entries they already voted on.
 */
router.get('/board', requireSessionWallet, async (req, res) => {
  const kindParam = req.query.kind;
  const sortParam = req.query.sort;

  try {
    const { profileData } = await getProfile(getSessionWallet(res));
    const entries = await listFeedbackBoard({
      ...(isFeedbackKind(kindParam) ? { kind: kindParam } : {}),
      sort: isFeedbackSort(sortParam) ? sortParam : 'top',
      viewerProfileId: profileData?.id ?? null,
    });
    return sendSuccess(res, { entries });
  } catch (err) {
    req.log.error({ err }, 'Failed to list the feedback board');
    return sendError(res, 'Failed to load the board', null, 500);
  }
});

/**
 * POST /api/v1/feedback/:id/vote — toggles this profile's vote.
 *
 * A toggle rather than separate add/remove verbs because that is the button the
 * user sees, and because the unique `(post_id, profile_id)` makes it idempotent
 * on the way in: a retried tap converges on the same state either way.
 */
router.post('/:id/vote', requireSessionWallet, async (req, res) => {
  const id = String(req.params.id ?? '');
  if (!UUID_RE.test(id)) return sendError(res, 'Unknown report.', null, 404);

  try {
    const { profileData } = await getProfile(getSessionWallet(res));
    // Unlike filing a report, voting needs a profile: the vote is keyed by it,
    // and there is nothing sensible to key an anonymous vote on.
    if (!profileData?.id) return sendError(res, 'A profile is required to vote.', null, 403);

    const result = await toggleFeedbackVote({ postId: id, profileId: profileData.id });
    if (!result.ok) {
      return result.reason === 'own-post'
        ? sendError(res, 'You cannot upvote your own report.', null, 403)
        : sendError(res, 'Unknown report.', null, 404);
    }
    return sendSuccess(res, { voteCount: result.voteCount, hasVoted: result.hasVoted });
  } catch (err) {
    req.log.error({ err }, 'Failed to toggle a feedback vote');
    return sendError(res, 'Failed to register your vote', null, 500);
  }
});

/**
 * GET /api/v1/feedback/attachments/:id — the image bytes.
 *
 * Unauthenticated on purpose: this is what an `<img src>` on the board hits, and
 * an image tag cannot carry the session header. The id is a random uuid and the
 * response carries only the picture — no title, no author, nothing that ties it
 * back to a wallet — so an unguessed URL leaks nothing and a guessed one is a
 * screenshot already visible to every logged-in user on the board.
 *
 * Bytes never change once written, so the response is immutable-cacheable.
 */
router.get('/attachments/:id', async (req, res) => {
  const id = String(req.params.id ?? '');
  if (!UUID_RE.test(id)) return res.status(404).end();

  try {
    const file = await getFeedbackAttachment(id);
    if (!file) return res.status(404).end();

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.data.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // The response is an image and nothing else; refuse to be interpreted as
    // anything a browser might execute.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    return res.end(file.data);
  } catch (err) {
    req.log.error({ err }, 'Failed to read a feedback attachment');
    return res.status(500).end();
  }
});

export default router;
