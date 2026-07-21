import { describe, expect, it } from 'vitest';
import { AVATAR_CATALOG, SKIN_COLOR_KEY } from './catalog';
import { composeAvatarSvg, composeOptionPreview } from './compose';
import { avatarConfigFromSeed, defaultAvatarConfig, normalizeAvatarConfig, parseAvatarConfig, randomAvatarConfig } from './config';
import { PALETTES } from './palettes';

describe('normalizeAvatarConfig', () => {
  it('fills a complete config from nothing', () => {
    const config = normalizeAvatarConfig(undefined);
    for (const category of AVATAR_CATALOG) {
      expect(config[category.id]).toBe(category.defaultPart);
      if (category.colorKey) expect(typeof config[category.colorKey]).toBe('number');
    }
    expect(config[SKIN_COLOR_KEY]).toBe(2);
  });

  it('falls back on unknown part ids and drops unknown keys', () => {
    const config = normalizeAvatarConfig({ hair: 'mullet-that-does-not-exist', wings: 'dragon' });
    expect(config['hair']).toBe('short');
    expect(config['wings']).toBeUndefined();
  });

  it('rejects out-of-range and non-integer colour indices', () => {
    expect(normalizeAvatarConfig({ hairColor: 999 })['hairColor']).toBe(0);
    expect(normalizeAvatarConfig({ hairColor: -1 })['hairColor']).toBe(0);
    expect(normalizeAvatarConfig({ hairColor: 1.5 })['hairColor']).toBe(0);
    expect(normalizeAvatarConfig({ hairColor: 3 })['hairColor']).toBe(3);
  });

  it('never lets injected markup through (values are ids, not strings)', () => {
    const config = normalizeAvatarConfig({ hair: '"><script>alert(1)</script>' });
    expect(composeAvatarSvg(config)).not.toContain('script');
  });

  it('parses JSON strings and survives malformed JSON', () => {
    expect(parseAvatarConfig(JSON.stringify({ hair: 'afro' }))['hair']).toBe('afro');
    expect(parseAvatarConfig('{ not json')).toEqual(defaultAvatarConfig());
  });
});

describe('composeAvatarSvg', () => {
  it('renders every catalog option without throwing', () => {
    for (const category of AVATAR_CATALOG) {
      for (const option of category.options) {
        const svg = composeAvatarSvg({ [category.id]: option.id });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('</svg>');
        expect(composeOptionPreview(defaultAvatarConfig(), category.id, option.id)).toContain('<svg');
      }
    }
  });

  it('clips hair only under a covering hat', () => {
    expect(composeAvatarSvg({ hair: 'afro', hat: 'beanie' })).toContain('clip-path');
    expect(composeAvatarSvg({ hair: 'afro', hat: 'crown' })).not.toContain('clip-path="url(');
  });

  it('scopes clipPath ids so several avatars can share a page', () => {
    expect(composeAvatarSvg({ hat: 'cap' }, { idSuffix: '-a' })).toContain('vq-hair-under-hat-a');
  });

  it('omits the background when asked', () => {
    const svg = composeAvatarSvg(defaultAvatarConfig(), { background: false });
    expect(svg).not.toContain('<rect width="200" height="200"');
  });
});

describe('generated configs', () => {
  it('random configs are always valid', () => {
    for (let i = 0; i < 50; i++) {
      const config = randomAvatarConfig();
      expect(normalizeAvatarConfig(config)).toEqual(config);
    }
  });

  it('seeded configs are deterministic and valid', () => {
    const a = avatarConfigFromSeed('GABC123');
    expect(a).toEqual(avatarConfigFromSeed('GABC123'));
    expect(normalizeAvatarConfig(a)).toEqual(a);
    expect(a).not.toEqual(avatarConfigFromSeed('GXYZ789'));
  });
});

describe('catalog integrity', () => {
  it('has unique category ids, unique part ids and valid defaults', () => {
    const categoryIds = new Set<string>();
    for (const category of AVATAR_CATALOG) {
      expect(categoryIds.has(category.id)).toBe(false);
      categoryIds.add(category.id);

      const partIds = new Set<string>();
      for (const option of category.options) {
        expect(partIds.has(option.id)).toBe(false);
        partIds.add(option.id);
      }
      expect(partIds.has(category.defaultPart)).toBe(true);

      if (category.palette) {
        expect(category.colorKey).toBeTruthy();
        expect(category.defaultColor ?? 0).toBeLessThan(PALETTES[category.palette].length);
      }
    }
  });

  it('gives every category a distinct layer', () => {
    const layers = AVATAR_CATALOG.map((c) => c.layer);
    expect(new Set(layers).size).toBe(layers.length);
  });
});
