'use client';

/**
 * Rendering budget for the device the map runs on.
 *
 * The scene's cost is dominated by fill rate — pixels multiplied by antialias —
 * and by the shadow pass, and the heaviest of those cannot be turned down once
 * the WebGL context exists: `antialias` is a context creation attribute. So the
 * tier is resolved before the Canvas mounts and drives the settings that have to
 * be chosen up front. `AdaptiveResolution` trims the resolution further from
 * there whenever the measured frame rate asks for it.
 */

export type DeviceTier = 'low' | 'high';

/** Resolution ceiling per tier: fill rate scales with the SQUARE of the dpr. */
const MAX_DPR: Record<DeviceTier, number> = { low: 1, high: 1.5 };
/** Shadow map resolution per tier, in texels per side. */
const SHADOW_MAP_SIZE: Record<DeviceTier, number> = { low: 512, high: 1024 };
/** At or below these the device is treated as low tier. */
const LOW_MEMORY_GB = 4;
const LOW_CORE_COUNT = 4;

let cachedTier: DeviceTier | null = null;

const resolveTier = (): DeviceTier => {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;

  // Both readings are missing on some browsers (Safari among them), and an
  // absent value is read as "nothing here says to downgrade".
  if (memory !== undefined && memory <= LOW_MEMORY_GB) return 'low';
  if (cores !== undefined && cores <= LOW_CORE_COUNT) return 'low';

  // A coarse pointer means a phone or tablet, where the GPU shares the die and
  // the thermal budget with the CPU however generous the core count looks.
  if (window.matchMedia('(pointer: coarse)').matches) return 'low';

  return 'high';
};

/** The tier is a property of the device, so it is resolved once per session. */
export const getDeviceTier = (): DeviceTier => {
  // Server renders have no device to measure and assume the richer settings;
  // the value is only cached once a real browser has answered.
  if (typeof window === 'undefined') return 'high';
  cachedTier ??= resolveTier();
  return cachedTier;
};

export const getMaxDpr = (): number => MAX_DPR[getDeviceTier()];

export const getShadowMapSize = (): number => SHADOW_MAP_SIZE[getDeviceTier()];

/** Antialias doubles the fill-rate cost, so low tier renders without it. */
export const prefersAntialias = (): boolean => getDeviceTier() === 'high';
