import { sweepOpenDepositIntents } from '@vaquita/shared';
import { logger } from './logger';

/**
 * Checks open "Deposit from another app" intents against Horizon on a timer, so
 * a user who closed the app while waiting still gets the in-app notification
 * and the push when the USDC lands.
 *
 * Every PM2 instance runs one; that is safe because an intent is closed with an
 * atomic `status = 'open'` guard and only the instance that closed it notifies.
 * A run never overlaps the previous one, and the timer is unref'd so it never
 * keeps the process alive on its own.
 */
export const startDepositIntentWatcher = (intervalMs: number): NodeJS.Timeout => {
  let inFlight = false;

  const run = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const { checked, arrived } = await sweepOpenDepositIntents();
      if (arrived > 0) logger.info({ checked, arrived }, 'deposit intents arrived on chain');
    } catch (err) {
      logger.error({ err }, 'deposit intent watcher run failed');
    } finally {
      inFlight = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();
  return timer;
};
