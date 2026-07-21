import { EARRINGS, GLASSES, HATS } from './parts/accessories';
import { CLOTHES } from './parts/clothes';
import { BACKGROUNDS, BROWS, EYES, HEADS, MOUTHS, NECKS } from './parts/face';
import { FACIAL_HAIR, HAIR } from './parts/hair';
import type { AvatarCategory } from './types';

/**
 * THE catalog. Everything else in this package — the composer, the config
 * validator, the randomiser and the editor UI — is generated from this array,
 * so adding new cosmetics is a data change, not a code change:
 *
 *   1. Author the SVG part in `parts/` (respect the 200x200 grid anchors).
 *   2. Push it onto an existing category's `options`, or add a whole new
 *      category here with its own `layer`, `icon` and `i18nKey`.
 *   3. Add the i18n strings (`avatar.category.*` / `avatar.part.*`).
 *
 * Nothing else needs to change: the API validates against this list, the editor
 * grows a tab/option automatically, and old configs keep rendering because
 * unknown values fall back to `defaultPart`.
 *
 * Compatibility rules: part ids are persisted, so never rename or remove one —
 * append instead. Same for palette entries (see palettes.ts).
 */
/**
 * The skin tone is a palette slot the head, neck and ears all read rather than
 * a layer of its own — hence the empty renderer. Modelling it as a category
 * anyway means the config validator and the editor pick it up for free instead
 * of every consumer special-casing it.
 */
export const SKIN_COLOR_KEY = 'skinColor';
export const DEFAULT_SKIN_COLOR = 2;

export const AVATAR_CATALOG: AvatarCategory[] = [
  {
    id: 'skin',
    layer: -10,
    icon: '🙂',
    i18nKey: 'skin',
    palette: 'skin',
    colorKey: SKIN_COLOR_KEY,
    defaultPart: 'default',
    defaultColor: DEFAULT_SKIN_COLOR,
    colorOnly: true,
    options: [{ id: 'default', render: () => '' }],
  },
  {
    id: 'background',
    layer: 0,
    icon: '🎨',
    i18nKey: 'background',
    palette: 'background',
    colorKey: 'backgroundColor',
    defaultPart: 'solid',
    defaultColor: 0,
    colorOnly: true,
    options: BACKGROUNDS,
  },
  { id: 'neck', layer: 10, icon: '', i18nKey: 'neck', defaultPart: 'default', hidden: true, options: NECKS },
  {
    id: 'clothes',
    layer: 20,
    icon: '👕',
    i18nKey: 'clothes',
    palette: 'clothes',
    colorKey: 'clothesColor',
    defaultPart: 'turtleneck',
    defaultColor: 0,
    preview: 'bust',
    options: CLOTHES,
  },
  { id: 'head', layer: 30, icon: '', i18nKey: 'head', defaultPart: 'default', hidden: true, options: HEADS },
  { id: 'eyes', layer: 40, icon: '👀', i18nKey: 'eyes', defaultPart: 'normal', preview: 'head', options: EYES },
  { id: 'brows', layer: 45, icon: '', i18nKey: 'brows', defaultPart: 'default', hidden: true, options: BROWS },
  { id: 'mouth', layer: 50, icon: '👄', i18nKey: 'mouth', defaultPart: 'smile', preview: 'head', options: MOUTHS },
  {
    id: 'facialHair',
    layer: 60,
    icon: '🧔',
    i18nKey: 'facialHair',
    palette: 'hair',
    colorKey: 'facialHairColor',
    defaultPart: 'none',
    defaultColor: 0,
    preview: 'head',
    options: FACIAL_HAIR,
  },
  {
    id: 'hair',
    layer: 70,
    icon: '💇',
    i18nKey: 'hair',
    palette: 'hair',
    colorKey: 'hairColor',
    defaultPart: 'short',
    defaultColor: 0,
    preview: 'head',
    options: HAIR,
  },
  {
    id: 'earrings',
    layer: 75,
    icon: '💎',
    i18nKey: 'earrings',
    palette: 'metal',
    colorKey: 'earringsColor',
    defaultPart: 'none',
    defaultColor: 0,
    preview: 'head',
    options: EARRINGS,
  },
  { id: 'glasses', layer: 80, icon: '👓', i18nKey: 'glasses', defaultPart: 'none', preview: 'head', options: GLASSES },
  { id: 'hat', layer: 90, icon: '🧢', i18nKey: 'hat', defaultPart: 'none', preview: 'head', options: HATS },
];

/** Categories in draw order (back to front). */
export const CATALOG_BY_LAYER = [...AVATAR_CATALOG].sort((a, b) => a.layer - b.layer);

/** Categories the editor shows, in tab order. */
export const EDITABLE_CATEGORIES = AVATAR_CATALOG.filter((c) => !c.hidden);

export function getCategory(id: string): AvatarCategory | undefined {
  return AVATAR_CATALOG.find((c) => c.id === id);
}
