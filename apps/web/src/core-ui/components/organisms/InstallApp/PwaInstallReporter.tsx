'use client';

import { useEffect, useRef } from 'react';
import { useConfigStore } from '@/core-ui/stores';
import { reportPwaInstall } from '@/networks/pollar/pwaInstallsApi';
import { useInstallApp } from '../../../hooks/useInstallApp';

/**
 * Tells the backend that this wallet is running the installed app.
 *
 * There is nothing to ask the browser: no API answers "is this installed?".
 * What we get instead are two half-signals, and this reports on both.
 * `isInstalled` covers the Chromium `appinstalled` event, which fires once, in
 * the tab that prompted, and never again. `isStandalone` covers every launch
 * from the home screen — and on iOS that is the ONLY signal there will ever be,
 * because Safari fires nothing when the user adds the app.
 *
 * So the row it writes is an observation of state, not an event: "this wallet
 * had the app open in standalone at this moment". The backend upserts on
 * (profile, platform) and only moves `last_seen_at`, so reporting on every
 * launch is the intended behaviour, not waste. The ref keeps it to one call per
 * mount; a wallet switch reports again, which is right, since the install
 * belongs to the profile, not the device.
 *
 * Failures are dropped on purpose. The next launch reports the same thing.
 */
export function PwaInstallReporter() {
  const { walletAddress } = useConfigStore();
  const { isInstalled, isStandalone, platform } = useInstallApp();
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    if (!isInstalled && !isStandalone) return;
    if (reported.current === walletAddress) return;
    reported.current = walletAddress;
    void reportPwaInstall(walletAddress, platform);
  }, [walletAddress, isInstalled, isStandalone, platform]);

  return null;
}
