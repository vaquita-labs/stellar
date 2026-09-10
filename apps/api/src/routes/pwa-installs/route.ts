import { Router } from 'express';
import {
  prismaPwaInstallRepository,
  pwaInstallSchema,
  recordPwaInstall,
  sendError,
  sendSuccess,
  toPwaInstallPlatform,
} from '@vaquita/shared';
import { getSessionWallet, requireSessionWallet } from '../../lib/walletAuth';

/**
 * The record of who is running Vaquita as an installed app (`/pwa-installs`).
 *
 * Push is the reason it exists: on iOS a web app cannot receive a notification
 * until it has been added to the home screen, so the install is the gate in
 * front of everything the notification roadmap wants to do. Nothing counted it
 * before — `push_subscriptions` counts the later, smaller step of permission
 * being granted.
 *
 * Three things worth knowing about this endpoint:
 *
 * - **The client calls it on every launch, not once.** There is no install
 *   event to listen for on iOS, only `display-mode: standalone`, so the report
 *   is "this app is installed and running now". The row is keyed on profile and
 *   platform, so repeated calls move `last_seen_at` and nothing else.
 * - **The wallet comes from the session.** `requireSessionWallet` rejects an
 *   unauthenticated call even when `WALLET_AUTH_ENFORCE=false` — that flag only
 *   relaxes routes whose subject is already named in the URL, and this one has
 *   no such param.
 * - **A wallet with no profile is a success, not a 404.** Launches happen
 *   before onboarding writes a profile, and the next one records normally.
 */
const router = Router();

router.post('/', requireSessionWallet, async (req, res) => {
  const walletAddress = getSessionWallet(res);

  const parsed = pwaInstallSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    req.log.warn({ walletAddress, issues: parsed.error.issues }, 'POST /pwa-installs rejected');
    return sendError(res, 'Invalid install report', parsed.error.issues, 400);
  }
  const platform = toPwaInstallPlatform(parsed.data.platform);

  try {
    const { data, error } = await recordPwaInstall(prismaPwaInstallRepository, {
      walletAddress,
      platform,
      userAgent: req.get('user-agent') ?? null,
    });
    if (error) {
      req.log.error({ err: error, walletAddress, platform }, 'Failed to record PWA install');
      return sendError(res, 'Failed to record install', error, 500);
    }

    // Only the first observation is news; the rest are launches.
    if (data.inserted) req.log.info({ walletAddress, platform }, 'PWA install recorded');

    return sendSuccess(res, { recorded: data.record != null, inserted: data.inserted }, 'install recorded');
  } catch (err) {
    req.log.error({ err, walletAddress, platform }, 'Failed to record PWA install');
    return sendError(res, 'Failed to record install', err, 500);
  }
});

export default router;
