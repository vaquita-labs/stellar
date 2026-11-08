'use client';

import { usePollar } from '@pollar/react';
import { useEffect, useRef } from 'react';
import { useCosignStore } from '../../../stores';
import { CosignSheet } from './CosignSheet';

/**
 * What to do with the approval sheet when the pending-request count changes.
 * `previous === null` is the first observation: a request that already existed
 * when this host mounted still has to open the sheet. Later, only a new
 * request opens it, so dismissing the sheet does not immediately reopen it.
 */
export function cosignSheetAction(previous: number | null, count: number): 'open' | 'close' | 'stay' {
  if (previous === null) return count > 0 ? 'open' : 'stay';
  if (count > previous) return 'open';
  if (count === 0 && previous > 0) return 'close';
  return 'stay';
}

/**
 * Mounts Vaquita's approval sheet and opens it when the SDK would have opened
 * its own: a request that waits for this device's vote and that no signing call
 * is handling by itself (a new account on another chain, an asset to enable, a
 * ramp step). Closes it when the last request is settled elsewhere.
 *
 * Pollar reads `/cosign/requests` only on the transition into a session. An
 * account-creation vote that appears afterwards (the wallet is already
 * `CREATING`) never reaches this sheet, so the account never becomes signable.
 */
export function CosignHost() {
  const { cosign, wallet, isAuthenticated, getClient } = usePollar();
  const open = useCosignStore((s) => s.open);
  const openCosign = useCosignStore((s) => s.openCosign);
  const closeCosign = useCosignStore((s) => s.closeCosign);

  const count = cosign.pending.length;
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const action = cosignSheetAction(previous.current, count);
    if (action === 'open') openCosign();
    else if (action === 'close') closeCosign();
    previous.current = count;
  }, [count, openCosign, closeCosign]);

  const creating = isAuthenticated && wallet?.provisioning === 'CREATING';
  useEffect(() => {
    if (!creating) return;
    const client = getClient();
    let cancelled = false;
    const pull = () => {
      if (!cancelled) void client.cosign.pending().catch(() => undefined);
    };
    pull();
    const timer = setInterval(pull, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [creating, getClient]);

  return <CosignSheet open={open} onClose={closeCosign} />;
}
