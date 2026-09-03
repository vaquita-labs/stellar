import { afterEach, describe, expect, it, vi } from 'vitest';

type DeviceStub = {
  memory?: number;
  cores?: number;
  coarsePointer?: boolean;
};

/**
 * The tier is resolved once and cached, so every case needs the module fresh.
 * Globals are stubbed before the import because the browser is read the first
 * time a caller asks for the tier.
 */
const loadTier = async ({ memory, cores, coarsePointer = false }: DeviceStub) => {
  vi.resetModules();
  vi.stubGlobal('navigator', { deviceMemory: memory, hardwareConcurrency: cores });
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({ matches: query.includes('coarse') ? coarsePointer : false }),
  });
  return import('./deviceTier');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getDeviceTier', () => {
  it('reads a server render as high tier, where there is no device to measure', async () => {
    // The node environment has no `window`, which is what SSR looks like.
    vi.resetModules();
    const { getDeviceTier } = await import('./deviceTier');
    expect(getDeviceTier()).toBe('high');
  });

  it('downgrades a device reporting 4 GB or less', async () => {
    const { getDeviceTier } = await loadTier({ memory: 4, cores: 16 });
    expect(getDeviceTier()).toBe('low');
  });

  it('downgrades a device reporting 4 cores or fewer', async () => {
    const { getDeviceTier } = await loadTier({ memory: 32, cores: 4 });
    expect(getDeviceTier()).toBe('low');
  });

  it('downgrades a coarse pointer even when memory and cores look generous', async () => {
    // A phone shares the die and the thermal budget between GPU and CPU, so a
    // healthy core count says nothing about the frame budget.
    const { getDeviceTier } = await loadTier({ memory: 32, cores: 12, coarsePointer: true });
    expect(getDeviceTier()).toBe('low');
  });

  it('keeps a desktop with a fine pointer at high tier', async () => {
    const { getDeviceTier } = await loadTier({ memory: 32, cores: 12 });
    expect(getDeviceTier()).toBe('high');
  });

  it('keeps high tier when the browser reports neither memory nor cores', async () => {
    // Safari exposes neither, and a missing reading is no reason to downgrade.
    const { getDeviceTier } = await loadTier({ memory: undefined, cores: undefined });
    expect(getDeviceTier()).toBe('high');
  });

  it('answers from the same reading for the rest of the session', async () => {
    const { getDeviceTier } = await loadTier({ memory: 32, cores: 12 });
    expect(getDeviceTier()).toBe('high');

    // The Canvas is created once from this value: a tier that changed underneath
    // would leave the settings and the reading disagreeing.
    vi.stubGlobal('navigator', { deviceMemory: 2, hardwareConcurrency: 2 });
    expect(getDeviceTier()).toBe('high');
  });

  it('resolves against the browser after a server render answered high', async () => {
    vi.resetModules();
    const tier = await import('./deviceTier');
    expect(tier.getDeviceTier()).toBe('high');

    // Answering 'high' with no window must not be remembered as the device's
    // tier, or hydration would leave every phone on the desktop settings.
    vi.stubGlobal('navigator', { deviceMemory: 2, hardwareConcurrency: 2 });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(tier.getDeviceTier()).toBe('low');
  });
});

describe('rendering settings per tier', () => {
  it('renders low tier at 1x without antialias and with a smaller shadow map', async () => {
    const { getMaxDpr, getShadowMapSize, prefersAntialias } = await loadTier({ memory: 2, cores: 2 });
    expect(getMaxDpr()).toBe(1);
    expect(prefersAntialias()).toBe(false);
    expect(getShadowMapSize()).toBe(512);
  });

  it('allows high tier the full resolution, antialias and shadow map', async () => {
    const { getMaxDpr, getShadowMapSize, prefersAntialias } = await loadTier({ memory: 32, cores: 12 });
    expect(getMaxDpr()).toBe(1.5);
    expect(prefersAntialias()).toBe(true);
    expect(getShadowMapSize()).toBe(1024);
  });
});
