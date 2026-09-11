'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
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
const subscribers = new Set<() => void>();

const subscribe = (cb: () => void) => {
  // Re-read on every transition from zero subscribers to one, not once per tab.
  // This component used to live in the private layout, which mounts once and
  // never unmounts; it now mounts with `/home`, so it unmounts on every
  // navigation away and remounts on the way back. A value cached for the life
  // of the tab would freeze at whatever the first mount saw and never re-arm.
  if (subscribers.size === 0) canAsk = canAskNow();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
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
 * Mounted by `HomePage`, not by the private layout. That layout never unmounts
 * on a client navigation, so a sheet opened from it appeared over whatever page
 * the user had walked to — the reported case was `/profile`. Living on `/home`
 * is also what makes the queue turn meaningful: the components it must precede
 * are all mounted there.
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
  // Nothing to wait for: this is the head of the modal queue. See the store's
  // header for why the permission ask goes before decisions worth more money.
  const setPushNudgeSettled = useModalQueueStore((s) => s.setPushNudgeSettled);
  const allowed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [enabling, setEnabling] = useState(false);

  // Same read as <PushSubscriptionSync>: only an explicit `false` opts out.
  const pushPreferred = data?.notificationPreferences?.push !== false;

  /**
   * Releases the queue turn `HomePage` took on this component's behalf.
   *
   * Deliberately NOT derived from `open`. `allowed` arrives through
   * `useSyncExternalStore`, and on the first mount its value is still the server
   * snapshot (`false`) while effects flush — so an `if (!open)` here would hand
   * the turn to the release notes one tick before this sheet opens on top of
   * them. `canAskNow()` answers the same question with no subscription lag, and
   * an effect is a legal place to read storage.
   */
  useEffect(() => {
    if (!supported || permission !== 'default' || !pushPreferred || !canAskNow()) {
      setPushNudgeSettled(true);
    }
  }, [supported, permission, pushPreferred, setPushNudgeSettled]);

  // The three exits the user can take — turned on, "maybe later", dismissed —
  // all end here: the browser prompt has had its chance, and whatever queued
  // behind the sheet may now open.
  const settle = () => {
    askedNow();
    setPushNudgeSettled(true);
  };

  const handleEnable = async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      await enablePush();
    } finally {
      setEnabling(false);
      // Marked either way. On success `permission` is no longer `default`, so
      // this only matters when the request failed and is worth retrying later.
      settle();
    }
  };

  const open = supported && permission === 'default' && pushPreferred && allowed;
  if (!open) return null;

  return (
    <AppModal open onOpenChange={settle} title={t('onboarding.pushNudge.title', 'Turn on notifications')} size="sm">
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
          onClick={settle}
          className="text-sm font-semibold text-black/50 hover:text-black underline underline-offset-2 transition"
        >
          {t('onboarding.pushNudge.later', 'Maybe later')}
        </button>
      </div>
    </AppModal>
  );
}
