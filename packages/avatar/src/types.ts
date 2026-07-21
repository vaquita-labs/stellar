import type { PaletteId } from './palettes';

/**
 * Everything a part needs to draw itself. Parts never read the raw config —
 * they get already-resolved colors, so adding a new palette slot later doesn't
 * touch a single existing part.
 */
export interface PartContext {
  /** Resolved color of the part's own palette slot (its category's `palette`). */
  color: string;
  /** Resolved skin tone — ears, cheeks and anything that blends with the face. */
  skin: string;
  /** Resolved hair color — brows and hair-adjacent accessories. */
  hair: string;
}

export type PartRenderer = (ctx: PartContext) => string;

export interface AvatarPart {
  /** Stable id persisted in the DB. Never rename one — add a new part instead. */
  id: string;
  render: PartRenderer;
  /**
   * Hides the category's own `hairBehaviour: 'clip'` handling — hats that sit
   * on top of the skull clip the hair so only the sides/back show.
   */
  coversHair?: boolean;
}

export interface AvatarCategory {
  /** Stable id; also the config key that stores the selected part id. */
  id: string;
  /** Painter's-algorithm z-order. Lower draws first (further back). */
  layer: number;
  /** Emoji shown on the editor tab strip. */
  icon: string;
  /** i18n key suffix, resolved by the client as `avatar.category.<i18nKey>`. */
  i18nKey: string;
  /** Palette the part's main color comes from (omit for colorless parts). */
  palette?: PaletteId;
  /** Config key holding the palette index. Required whenever `palette` is set. */
  colorKey?: string;
  /** Part id selected when the stored value is missing or unknown. */
  defaultPart: string;
  /** Palette index used when the stored color is missing or invalid. */
  defaultColor?: number;
  /**
   * A category with a single fixed option (head, neck) is drawn but never shown
   * in the editor.
   */
  hidden?: boolean;
  /** Editor renders a color-only swatch row with no part grid. */
  colorOnly?: boolean;
  /** How the option thumbnail is framed in the editor grid. */
  preview?: 'head' | 'bust';
  options: AvatarPart[];
}

/**
 * The persisted avatar. Part categories store a part id (string), color slots
 * store a palette index (number), so the JSON stays small and human-readable.
 * `v` lets a future catalog change migrate old rows deterministically.
 */
export interface AvatarConfig {
  v: number;
  [key: string]: string | number;
}
