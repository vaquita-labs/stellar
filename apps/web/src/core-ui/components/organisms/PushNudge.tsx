'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell } from 'react-icons/fi';
import { useProfileData, usePushNotifications } from '../../hooks';
import { useModalQueueStore } from '../../stores';
import { Button } from '../atoms';
import { AppModal } from '../molecules';
import { canAskNow, markAsked } from './pushNudgeSchedule';

// Module-scope store, same shape as [[useInstallApp]]: `useSyncExternalStore`
// wants a snapshot that does not change identity between renders, and reading
// storage (or the clock) during render is neither stable nor allowed. The
// schedule itself lives in [[pushNudgeSchedule]], which is where the two keys
// and the 24h floor are explained.
//
// Starts `false` so the server snapshot and the first client render agree on
// "do not open" — the real value lands on subscribe.
let canAsk = false;
let loaded = false;
const subscribers = new Set<() => void>();

const subscribe = (cb: () => void) => {
  if (!loaded) {
    loaded = true;
    canAsk = canAskNow();
  }
  subscribers.add(cb);
  return () => subscribers.delete(cb);
};

const askedNow = () => {
  markAsked();
  canAsk = false;
  subscribers.forEach((cb) => cb());
};

const getSnapshot = () => canAsk;
const getServerSnapshot = () => false;

/**
 * Notification opt-in, asked wherever push can actually reach the user.
 *
 * The gate is capability, not installation: `supported` already requires a
 * service worker, `PushManager`, `Notification` and a VAPID key, so an iOS
 * Safari tab (where web push simply does not exist) drops out on its own, while
 * an Android or desktop tab — which can receive push without installing
 * anything — is now asked instead of being skipped. On iOS the ask still lands
 * on the first launch from the home screen, which there is the only place web
 * push exists at all. The "Turn on" button is the user gesture
 * `Notification.requestPermission()` requires.
 *
 * It re-arms on every app launch, at most once a day: one dismissal on the day
 * someone installed the app should not cost the channel forever.
 *
 * Three things keep it from nagging the wrong person:
 * - permission `granted` is already handled silently by <PushSubscriptionSync>,
 *   which also re-creates a subscription the browser has evicted;
 * - once `denied` the browser will not reopen its own prompt no matter what we
 *   render, so the Settings row explains it instead;
 * - a profile that turned push off in Settings is left alone, on every device.
 */
export function PushNudge() {
  const { t } = useTranslation();
  const { supported, permission, enablePush } = usePushNotifications();
  const { data } = useProfileData();
  // The home tour owns the whole screen while it runs; this would open on top.
  const homeTourSettled = useModalQueueStore((s) => s.homeTourSettled);
  const allowed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [enabling, setEnabling] = useState(false);

  // Same read as <PushSubscriptionSync>: only an explicit `false` opts out.
  const pushPreferred = data?.notificationPreferences?.push !== false;

  const handleEnable = async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      await enablePush();
    } finally {
      setEnabling(false);
      // Marked either way. On success `permission` is no longer `default`, so
      // this only matters when the request failed and is worth retrying later.
      askedNow();
    }
  };

  const open = supported && permission === 'default' && pushPreferred && allowed && homeTourSettled;
  if (!open) return null;

  return (
    <AppModal open onOpenChange={askedNow} title={t('onboarding.pushNudge.title', 'Turn on notifications')} size="sm">
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
          onClick={askedNow}
          className="text-sm font-semibold text-black/50 hover:text-black underline underline-offset-2 transition"
        >
          {t('onboarding.pushNudge.later', 'Maybe later')}
        </button>
      </div>
    </AppModal>
  );
}
