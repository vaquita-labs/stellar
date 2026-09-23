'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { getMaxDpr } from './deviceTier';

/** Floor: never render below CSS resolution. */
const MIN_DPR = 1;
/** Ceiling: the device tier's own cap, the same one the Canvas is created with. */
const maxDpr = () => Math.min(Math.max(window.devicePixelRatio, MIN_DPR), getMaxDpr());

/** Granularity of the dpr, in steps: each setDpr reallocates the framebuffer. */
const DPR_STEPS = 20;

/**
 * The dpr rides drei's own 0..1 `factor`, which moves one `step` per round of
 * ~2.5s, so a device that is merely busy loses a little sharpness and only one
 * that cannot keep up walks all the way down to 1x.
 *
 * `bounds` is fixed instead of derived from the measured refresh rate: drei's
 * default asks a 120 Hz screen for 100 fps before it returns any resolution,
 * which no phone sustains, and the scene would never climb back out of MIN_DPR.
 *
 * `flipflops` is generous and there is no `onFallback`: reaching it stops the
 * sampling and leaves the dpr wherever it settled, instead of pinning the rest
 * of the session to the floor over a few rounds of load-time jank.
 */
export const AdaptiveResolution = () => {
  const setDpr = useThree((state) => state.setDpr);
  const applied = useRef(-1);

  // drei resets its own `lastFactor` on every render, so `onChange` also fires
  // for a factor that did not move; quantising and comparing absorbs that.
  const apply = (factor: number) => {
    const next = Math.round((MIN_DPR + factor * (maxDpr() - MIN_DPR)) * DPR_STEPS) / DPR_STEPS;
    if (next === applied.current) return;
    applied.current = next;
    setDpr(next);
  };

  return (
    <PerformanceMonitor factor={1} step={0.15} bounds={() => [45, 58]} onChange={({ factor }) => apply(factor)} flipflops={8} />
  );
};
