'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell } from 'react-icons/fi';
import { useInstallApp, usePushNotifications } from '../../hooks';
import { useModalQueueStore } from '../../stores';
import { Button } from '../atoms';
import { AppModal } from '../molecules';

// "Maybe later" postpones the ask; it does not cancel it. Push is the only way
// to reach someone who is not currently looking at the app, so one dismissal on
// the day they installed should not cost us the channel forever.
//
// The key is versioned (`-v2`) on purpose: the old one was a permanent "seen"
// flag, and bumping it is what re-opens the ask on every device that installed
// the app and dismissed this before. Per device in localStorage, like
// [[useIntroSeen]] / vaquita:install-dismissed.
const SNOOZE_KEY = 'vaquita:push-nudge-snoozed-until-v2';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

// Module-scope store, same shape as [[useInstallApp]]: `useSyncExternalStore`
// wants a snapshot that does not change identity between renders, and reading
// localStorage (or the clock) during render is neither stable nor allowed.
// Starts `true` so the server snapshot and the first client render agree on
// "do not open" — the real value lands on subscribe.
let snoozed = true;
let loaded = false;
const subscribers = new Set<() => void>();

const readSnoozed = (): boolean => {
  const until = Number(window.localStorage.getItem(SNOOZE_KEY));
  return Number.isFinite(until) && until > Date.now();
};

const subscribe = (cb: () => void) => {
  if (!loaded) {
    loaded = true;
    snoozed = readSnoozed();
  }
  subscribers.add(cb);
  return () => subscribers.delete(cb);
};

const snoozeNow = () => {
  window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  snoozed = true;
  subscribers.forEach((cb) => cb());
};

const getSnapshot = () => snoozed;
const getServerSnapshot = () => true;

/**
 * Notification opt-in, asked inside the installed app.
 *
 * It opens as soon as the app is installed: on Chromium `appinstalled` fires in
 * the tab that prompted, so the ask lands right after the install finishes; on
 * iOS nothing fires, so it lands on the first launch from the home screen. Both
 * end in the same place, which on iOS is the only place web push exists at all.
 * The "Turn on" button is the user gesture `Notification.requestPermission()`
 * requires.
 *
 * Only with permission `default` (never asked): `granted` is already handled by
 * <PushSubscriptionSync>, and once `denied` the browser will not reopen its own
 * prompt no matter what we render, so the Settings row explains it instead.
 */
export function PushNudge() {
  const { t } = useTranslation();
  const { isInstalled } = useInstallApp();
  const { supported, permission, enablePush } = usePushNotifications();
  // The home tour owns the whole screen while it runs; this would open on top.
  const homeTourSettled = useModalQueueStore((s) => s.homeTourSettled);
  const isSnoozed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [enabling, setEnabling] = useState(false);

  const handleEnable = async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      await enablePush();
    } finally {
      setEnabling(false);
      // Snoozed either way. On success `permission` is no longer `default`, so
      // this only matters when the request failed and is worth retrying later.
      snoozeNow();
    }
  };

  const open = isInstalled && supported && permission === 'default' && !isSnoozed && homeTourSettled;
  if (!open) return null;

  return (
    <AppModal open onOpenChange={snoozeNow} title={t('onboarding.pushNudge.title', 'Turn on notifications')} size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/30 border border-black text-black">
            <FiBell className="h-5 w-5" />
          </span>
          <p className="text-sm text-black/80">
            {t('onboarding.pushNudge.body', 'Get a heads-up when your savings earn rewards or your streak is about to break.')}
          </p>
        </div>
        <Button type="primary" wFull onPress={handleEnable} isLoading={enabling}>
          {t('onboarding.pushNudge.enable', 'Turn on')}
        </Button>
        <button
          onClick={snoozeNow}
          className="text-sm font-semibold text-black/50 hover:text-black underline underline-offset-2 transition"
        >
          {t('onboarding.pushNudge.later', 'Maybe later')}
        </button>
      </div>
    </AppModal>
  );
}
