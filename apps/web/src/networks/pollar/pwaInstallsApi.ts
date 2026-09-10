'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { authFetch } from '@/networks/stellar/walletSession';

/**
 * Tells the server this app is running installed, and on what.
 *
 * There is no install event to forward. Chromium fires `appinstalled` once, in
 * the tab that prompted, and an installed app launches in `display-mode:
 * standalone`; iOS fires nothing at all, so standalone is its only signal. This
 * POST therefore reports a state ("installed and running now"), not an event,
 * and it is sent on every launch. The server keys the row on profile and
 * platform, so repeated calls move a timestamp and write nothing new.
 *
 * Best-effort, like `vaultFlowsApi`: a failed report costs a row in a dashboard
 * and nothing else, so it never retries and never surfaces. Unlike a vault flow
 * there is nothing irrecoverable about missing one — the next launch reports
 * the same thing.
 */

const base = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/pwa-installs`;

export type PwaInstallPlatform = 'android' | 'ios' | 'desktop' | 'other';

export async function reportPwaInstall(walletAddress: string, platform: PwaInstallPlatform): Promise<boolean> {
  try {
    const response = await authFetch(
      base(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      },
      walletAddress,
    );
    return response.ok;
  } catch (err) {
    console.warn('[pwaInstalls] could not report the install:', err);
    return false;
  }
}
