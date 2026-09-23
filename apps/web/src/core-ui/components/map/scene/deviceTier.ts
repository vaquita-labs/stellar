'use client';

/**
 * Rendering budget for the device the map runs on.
 *
 * The scene's cost is dominated by fill rate — pixels multiplied by antialias —
 * and by the shadow pass. Antialias is the one setting that cannot be turned
 * down once the WebGL context exists, because it is a context creation
 * attribute, so the tier is resolved before the Canvas mounts and drives the
 * settings that have to be chosen up front. The dpr it hands out is only a
 * ceiling: `AdaptiveResolution` rides it down from there whenever the measured
 * frame rate asks for it.
 */

export type DeviceTier = 'low' | 'mobile' | 'high';

/**
 * Resolution ceiling per tier. Fill rate scales with the SQUARE of the dpr, but
 * what costs is the pixel COUNT, and a phone's canvas is a fraction of a
 * desktop's: a 393pt screen at 2x draws fewer pixels than a laptop at 1x. So a
 * phone is capped by what its own screen shows, not by the desktop's ratio, and
 * 1x on a 3x panel reads as blur for a budget nobody was spending.
 */
const MAX_DPR: Record<DeviceTier, number> = { low: 1, mobile: 2, high: 2 };
/** Shadow map resolution per tier, in texels per side. */
const SHADOW_MAP_SIZE: Record<DeviceTier, number> = { low: 512, mobile: 512, high: 1024 };
/** At or below these the device is treated as low tier. */
const LOW_MEMORY_GB = 4;
const LOW_CORE_COUNT = 4;

let cachedTier: DeviceTier | null = null;

const resolveTier = (): DeviceTier => {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;

  // `deviceMemory` is missing on some browsers (Safari among them), and an
  // absent value is read as "nothing here says to downgrade". The core count is
  // the reading that does answer on iOS, and it is what separates the phones
  // that cannot afford the resolution from the ones that can.
  if (memory !== undefined && memory <= LOW_MEMORY_GB) return 'low';
  if (cores !== undefined && cores <= LOW_CORE_COUNT) return 'low';

  // A coarse pointer means a phone or tablet, where the GPU shares the die and
  // the thermal budget with the CPU however generous the core count looks: it
  // gets the cheap context settings, but not the 1x resolution its screen
  // cannot hide.
  if (window.matchMedia('(pointer: coarse)').matches) return 'mobile';

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

/**
 * Antialias doubles the fill-rate cost and buys the least where the dpr is
 * already high: rendering 2x into a 3x panel supersamples interiors and
 * textures, which MSAA never reaches. Below high tier the budget goes to
 * resolution instead.
 */
export const prefersAntialias = (): boolean => getDeviceTier() === 'high';
