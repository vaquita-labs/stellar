'use client';

import { usePollar } from '@pollar/react';
import { useEffect, useRef } from 'react';
import { useCosignStore } from '../../../stores';
import { CosignSheet } from './CosignSheet';

/**
 * Mounts Vaquita's approval sheet and opens it when the SDK would have opened
 * its own: a request that waits for this device's vote and that no signing call
 * is handling by itself (a new account on another chain, an asset to enable, a
 * ramp step). Closes it when the last request is settled elsewhere.
 */
export function CosignHost() {
  const { cosign } = usePollar();
  const open = useCosignStore((s) => s.open);
  const openCosign = useCosignStore((s) => s.openCosign);
  const closeCosign = useCosignStore((s) => s.closeCosign);

  const count = cosign.pending.length;
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) openCosign();
    else if (count === 0 && previous.current > 0) closeCosign();
    previous.current = count;
  }, [count, openCosign, closeCosign]);

  return <CosignSheet open={open} onClose={closeCosign} />;
}
