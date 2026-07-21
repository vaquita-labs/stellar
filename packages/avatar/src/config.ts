import { AVATAR_CATALOG } from './catalog';
import { PALETTES } from './palettes';
import type { AvatarConfig } from './types';

/** Bumped only when a catalog change needs old rows migrated deterministically. */
export const AVATAR_CONFIG_VERSION = 1;

/** The avatar every profile starts with (and falls back to). */
export function defaultAvatarConfig(): AvatarConfig {
  const config: AvatarConfig = { v: AVATAR_CONFIG_VERSION };
  for (const category of AVATAR_CATALOG) {
    config[category.id] = category.defaultPart;
    if (category.colorKey) config[category.colorKey] = category.defaultColor ?? 0;
  }
  return config;
}

/**
 * Turn arbitrary input (a DB JSON blob, a request body, a stale config written
 * before a catalog change) into a config that is guaranteed to render.
 *
 * This is the ONLY validation the API needs: every key is checked against the
 * catalog, unknown part ids fall back to the category default, colour indices
 * are clamped into their palette, and any extra key the client invented is
 * dropped. So a client can never persist a value the renderer chokes on.
 */
export function normalizeAvatarConfig(input: unknown): AvatarConfig {
  const raw: Record<string, unknown> =
    input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

  const config: AvatarConfig = { v: AVATAR_CONFIG_VERSION };

  for (const category of AVATAR_CATALOG) {
    const value = raw[category.id];
    const known = typeof value === 'string' && category.options.some((o) => o.id === value);
    config[category.id] = known ? (value as string) : category.defaultPart;

    if (category.colorKey && category.palette) {
      config[category.colorKey] = clampIndex(
        raw[category.colorKey],
        PALETTES[category.palette].length,
        category.defaultColor ?? 0,
      );
    }
  }

  return config;
}

function clampIndex(value: unknown, length: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n >= length) return fallback;
  return n;
}

/** True when `input` is already a valid, complete config (no coercion needed). */
export function isValidAvatarConfig(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const normalized = normalizeAvatarConfig(input);
  const raw = input as Record<string, unknown>;
  return Object.keys(normalized).every((key) => key === 'v' || raw[key] === normalized[key]);
}

/**
 * A random but coherent avatar. `rand` is injectable so callers can seed it
 * (e.g. derive a stable avatar from a wallet address).
 */
export function randomAvatarConfig(rand: () => number = Math.random): AvatarConfig {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;

  const config: AvatarConfig = { v: AVATAR_CONFIG_VERSION };
  for (const category of AVATAR_CATALOG) {
    config[category.id] = pick(category.options).id;
    if (category.colorKey && category.palette) {
      config[category.colorKey] = Math.floor(rand() * PALETTES[category.palette].length);
    }
  }
  return config;
}

/**
 * Deterministic avatar derived from a string (wallet address, nickname). Used
 * so a profile that never opened the editor still looks like a person instead
 * of everyone sharing one default face.
 */
export function avatarConfigFromSeed(seed: string): AvatarConfig {
  // xorshift32 — tiny, dependency-free, and stable across runtimes.
  let state = 0;
  for (let i = 0; i < seed.length; i++) state = (state * 31 + seed.charCodeAt(i)) | 0;
  state = state || 1;
  return randomAvatarConfig(() => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  });
}

/**
 * The one call every profile read should go through: turn whatever is stored
 * (a config, NULL, legacy junk) into the avatar to render. A profile that never
 * opened the editor gets a stable avatar seeded from its wallet address, so
 * lists look like a crowd of people rather than one repeated default.
 */
export function resolveAvatarConfig(stored: unknown, seed: string): AvatarConfig {
  const hasConfig = !!stored && (typeof stored === 'object' || typeof stored === 'string');
  if (hasConfig) return parseAvatarConfig(stored);
  return seed ? avatarConfigFromSeed(seed) : defaultAvatarConfig();
}

/** Parse a JSON string / JSON value from the DB into a renderable config. */
export function parseAvatarConfig(value: unknown): AvatarConfig {
  if (typeof value === 'string') {
    try {
      return normalizeAvatarConfig(JSON.parse(value));
    } catch {
      return defaultAvatarConfig();
    }
  }
  return normalizeAvatarConfig(value);
}
