import { Router } from 'express';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';
import {
  acknowledgeReleaseNote,
  getProfile,
  getRecentReleaseNotes,
  getReleaseNoteImage,
  getUnseenReleaseNote,
  sendError,
  sendSuccess,
} from '@vaquita/shared';

/**
 * Release notes (`/release-notes`) — the "what's new" popup.
 *
 * Two session-gated endpoints for the app plus one public one for the pictures.
 * Authoring lives in the admin panel, behind its own passcode; nothing here
 * writes a note.
 */
const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/release-notes/latest
 *
 * Two fields with two different jobs:
 *
 * - `note` is the note this user has not closed yet, or `null`. It is the
 *   trigger: null means the popup does not open. Returning null rather than a
 *   404 is deliberate — "nothing to show" is the ordinary answer on almost
 *   every load, and the client should not have to tell it apart from a failure.
 * - `notes` is the last three published, whatever the user has seen. They are
 *   what the popup shows once it is open, stacked behind the newest, so that
 *   someone who skipped a launch still finds out what shipped.
 *
 * Both come from one round trip because the client needs them together.
 */
router.get('/latest', requireSessionWallet, async (req, res) => {
  try {
    const { profileData } = await getProfile(getSessionWallet(res));
    const [note, notes] = await Promise.all([
      getUnseenReleaseNote(profileData?.id ?? null),
      getRecentReleaseNotes(),
    ]);
    return sendSuccess(res, { note, notes });
  } catch (err) {
    req.log.error({ err }, 'Failed to read the latest release note');
    return sendError(res, 'Failed to load release notes', null, 500);
  }
});

/**
 * POST /api/v1/release-notes/:id/ack — the user closed the modal.
 *
 * Idempotent, and the marker never moves backwards (see the service): a retried
 * tap, or two tabs acking out of order, converge on the same state.
 */
router.post('/:id/ack', requireSessionWallet, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return sendError(res, 'Unknown release note.', null, 404);

  try {
    const { profileData } = await getProfile(getSessionWallet(res));
    // No profile, nothing to write the marker on. Not an error: the modal was
    // still shown and closed, and the client must not retry forever.
    if (!profileData?.id) return sendSuccess(res, { acknowledged: false });

    await acknowledgeReleaseNote(profileData.id, id);
    return sendSuccess(res, { acknowledged: true });
  } catch (err) {
    req.log.error({ err }, 'Failed to acknowledge a release note');
    return sendError(res, 'Failed to acknowledge the release note', null, 500);
  }
});

/**
 * GET /api/v1/release-notes/images/:id — the carousel bytes.
 *
 * Unauthenticated, like the feedback attachments route and for the same reason:
 * an `<img src>` cannot carry the session header. Unlike those, the content is
 * marketing material written by us and meant to be seen, so the only filter is
 * that its note is published — a draft's screenshots stay unreachable.
 */
router.get('/images/:id', async (req, res) => {
  const id = String(req.params.id ?? '');
  if (!UUID_RE.test(id)) return res.status(404).end();

  try {
    const file = await getReleaseNoteImage(id);
    if (!file) return res.status(404).end();

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.data.length));
    // An hour. The bytes are immutable and editing the carousel mints new ids,
    // so unlike a feedback screenshot there is no takedown to race.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    return res.end(file.data);
  } catch (err) {
    req.log.error({ err }, 'Failed to read a release note image');
    return res.status(500).end();
  }
});

export default router;
