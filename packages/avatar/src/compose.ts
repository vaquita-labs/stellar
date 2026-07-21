import { AVATAR_CATALOG, CATALOG_BY_LAYER, SKIN_COLOR_KEY } from './catalog';
import { normalizeAvatarConfig } from './config';
import { paletteColor } from './palettes';
import type { AvatarConfig, PartContext } from './types';

/** Hair is clipped to this box when a hat covers the skull. */
const HAIR_CLIP_ID = 'vq-hair-under-hat';

export interface ComposeOptions {
  /** Draw the background layer. Off for the profile banner, which paints its own. */
  background?: boolean;
  /** SVG viewBox — narrow it to crop (e.g. head-only thumbnails). */
  viewBox?: string;
  /** Extra attributes on the root <svg>. */
  className?: string;
  /**
   * Suffix appended to internal ids (clipPath). Required when several avatars
   * are inlined on the same page, otherwise the first clipPath wins for all.
   */
  idSuffix?: string;
}

/** Framing presets used by the profile banner and the editor thumbnails. */
export const AVATAR_VIEWBOX = {
  full: '0 0 200 200',
  /** Head + shoulders, matching the profile banner crop. Starts at y=2 so the
   *  tallest headwear (the crown's top gem sits at y≈8) never gets clipped. */
  bust: '20 2 160 158',
  /** Head only, for list rows and option thumbnails. */
  head: '26 4 148 152',
} as const;

/**
 * Render a config to a standalone SVG string.
 *
 * Layers are drawn in catalog order, so z-ordering is a property of the data —
 * a new category only needs to declare its `layer`.
 */
export function composeAvatarSvg(input: AvatarConfig | unknown, options: ComposeOptions = {}): string {
  const config = normalizeAvatarConfig(input);
  const { background = true, viewBox = AVATAR_VIEWBOX.full, className, idSuffix = '' } = options;

  const skin = paletteColor('skin', config[SKIN_COLOR_KEY] as number);
  const hairColor = colorFor(config, 'hair');
  const clipId = `${HAIR_CLIP_ID}${idSuffix}`;

  const hatCoversHair = (() => {
    const hats = AVATAR_CATALOG.find((c) => c.id === 'hat');
    const selected = hats?.options.find((o) => o.id === config['hat']);
    return selected?.coversHair === true;
  })();

  const layers = CATALOG_BY_LAYER.map((category) => {
    if (category.id === 'background' && !background) return '';

    const part = category.options.find((o) => o.id === config[category.id]);
    if (!part) return '';

    const ctx: PartContext = {
      color: category.palette ? paletteColor(category.palette, config[category.colorKey as string] as number) : skin,
      skin,
      hair: hairColor,
    };
    const svg = part.render(ctx);
    if (!svg) return '';

    // Hair is the only layer a hat interacts with; keeping the rule here (not
    // inside each hat) means a new covering hat just sets `coversHair`.
    if (category.id === 'hair' && hatCoversHair) {
      return `<g clip-path="url(#${clipId})">${svg}</g>`;
    }
    return svg;
  }).join('\n');

  const classAttr = className ? ` class="${className}"` : '';
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg"${classAttr}>
<defs><clipPath id="${clipId}"><rect x="25" y="68" width="150" height="132"/></clipPath></defs>
${layers}
</svg>`;
}

function colorFor(config: AvatarConfig, categoryId: string): string {
  const category = AVATAR_CATALOG.find((c) => c.id === categoryId);
  if (!category?.palette || !category.colorKey) return '#000000';
  return paletteColor(category.palette, config[category.colorKey] as number);
}

/**
 * A single option rendered on a neutral head/bust, for the editor grid. Draws
 * only the layers needed as context so the option itself reads clearly.
 */
export function composeOptionPreview(
  config: AvatarConfig | unknown,
  categoryId: string,
  partId: string,
  idSuffix = '',
): string {
  const base = normalizeAvatarConfig(config);
  const category = AVATAR_CATALOG.find((c) => c.id === categoryId);
  if (!category) return '';

  const preview: AvatarConfig = { ...base, [categoryId]: partId };
  const isBust = category.preview === 'bust';

  // Neutralise everything that would compete with the option being previewed.
  if (!isBust) {
    for (const other of AVATAR_CATALOG) {
      if (other.id === categoryId || other.hidden || other.id === 'background') continue;
      // Keep the face readable: eyes/mouth stay unless they ARE the option.
      if (other.id === 'eyes' || other.id === 'mouth') continue;
      const hasNone = other.options.some((o) => o.id === 'none');
      if (hasNone) preview[other.id] = 'none';
    }
  }

  return composeAvatarSvg(preview, {
    background: false,
    viewBox: isBust ? '24 100 152 100' : AVATAR_VIEWBOX.head,
    idSuffix,
  });
}

/** `data:` URL form — for <img src> / og:image / anywhere a URL is required. */
export function avatarDataUrl(config: AvatarConfig | unknown, options: ComposeOptions = {}): string {
  const svg = composeAvatarSvg(config, options);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
