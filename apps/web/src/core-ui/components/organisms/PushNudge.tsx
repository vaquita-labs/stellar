'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell } from 'react-icons/fi';
import { useProfileData, usePushNotifications } from '../../hooks';
import { installPlatform } from '../../hooks/useInstallApp';
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
 * anything — is asked too. On iOS the ask still lands on the first launch from
 * the home screen, which there is the only place web push exists at all.
 *
 * Two ways of asking, and the platform decides which:
 *
 * - **Not iOS.** No sheet at all. An effect calls `enablePush()` on mount and
 *   the browser draws its own permission dialog. A sheet asking permission to
 *   ask permission is one dialog too many where the OS dialog opens by itself.
 * - **iOS.** The sheet stays. Safari opens its dialog only from a real tap, so
 *   with no button there is no tap and the channel is lost outright.
 * - **The browsers that refuse quietly.** Firefox and desktop Safari also
 *   demand a gesture and reject the call; `enablePush` catches that and returns
 *   `'error'`. So the direct path renders the sheet after all when the result
 *   is `'error'` AND the permission is still `default`. A dismissed Chrome
 *   dialog also leaves `default`, which is why the test is the returned
 *   `'error'` and not the permission alone.
 *
 * The trade is deliberate: the sheet was a warm-up that kept a "no" from being
 * spent cheaply (the OS dialog is answered once, and on iOS a refusal is
 * permanent). Asking cold converts more of the people who would have said yes
 * now, and burns more of the ones who would have said yes later.
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
  // The direct ask never reached the OS dialog (a browser that wants a gesture).
  // Independent of `allowed`, which the direct attempt has already spent.
  const [gestureNeeded, setGestureNeeded] = useState(false);
  // One attempt per mount, and one in React's development double-effect.
  const asked = useRef(false);

  // Read during render on purpose: it is pure, and it is `'other'` on the
  // server, where nothing opens anyway (`allowed` is the server snapshot).
  const isIos = installPlatform() === 'ios';

  // Same read as <PushSubscriptionSync>: only an explicit `false` opts out.
  const pushPreferred = data?.notificationPreferences?.push !== false;

  /**
   * The queue turn `HomePage` took on this component's behalf, plus the direct
   * ask on the platforms that take one.
   *
   * The turn is deliberately NOT released from `open`. `allowed` arrives through
   * `useSyncExternalStore`, and on the first mount its value is still the server
   * snapshot (`false`) while effects flush — so an `if (!open)` here would hand
   * the turn to the release notes one tick before the sheet opens on top of
   * them. `canAskNow()` answers the same question with no subscription lag, and
   * an effect is a legal place to read storage.
   *
   * Off iOS the turn is released immediately even though the ask is in flight:
   * the OS dialog is drawn by the browser, above the page, so nothing in-app can
   * cover it and nothing is gained by holding the others back. On iOS the sheet
   * is an ordinary in-app modal and keeps the turn until it is answered.
   */
  useEffect(() => {
    if (!supported || permission !== 'default' || !pushPreferred || !canAskNow()) {
      setPushNudgeSettled(true);
      return;
    }
    if (isIos) return;

    setPushNudgeSettled(true);
    if (asked.current) return;
    asked.current = true;
    // Marked before the dialog resolves, not after: a navigation away while it
    // is open must not spend a second ask on the way back.
    askedNow();
    void enablePush().then((result) => {
      if (result === 'error' && Notification.permission === 'default') setGestureNeeded(true);
    });
  }, [supported, permission, pushPreferred, isIos, enablePush, setPushNudgeSettled]);

  // The three exits the user can take — turned on, "maybe later", dismissed —
  // all end here: the browser prompt has had its chance, and whatever queued
  // behind the sheet may now open.
  const settle = () => {
    askedNow();
    setGestureNeeded(false);
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

  const eligible = supported && permission === 'default' && pushPreferred;
  // `allowed` gates the iOS sheet, which has not asked yet. The fallback sheet
  // is gated on `gestureNeeded` alone, because the attempt that raised it has
  // already consumed the day's ask.
  const open = eligible && (gestureNeeded || (isIos && allowed));
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
