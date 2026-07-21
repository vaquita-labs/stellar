/**
 * Vaquita avatar palettes.
 *
 * Brand rule: thick black outline on everything, round shapes, simple dark
 * eyes, cheeks, warm palette, cream/pastel backgrounds.
 *
 * Colors are addressed by INDEX (not hex) in the stored config, so a palette
 * can be re-tuned without migrating every profile. Appending is always safe;
 * removing or reordering entries repaints existing avatars, so only append.
 */

/** The single outline/ink color used by every layer. */
export const INK = '#1E1B18';

export const PALETTES = {
  skin: ['#F8D9BC', '#EFBE95', '#D69B66', '#B0713F', '#8A5430', '#5F3A22'],
  hair: ['#1E1B18', '#6B4A2E', '#8B5A2B', '#D9A94C', '#B5502A', '#9A9A98', '#C24B8A', '#4A7FB5'],
  clothes: ['#88C155', '#3E7C59', '#2E5E8C', '#C24B3A', '#E9B84C', '#5B4A8A', '#37393B', '#D96FA8'],
  background: ['#FAF3E3', '#DDEED2', '#CFE4F2', '#F6DFD0', '#E7DDF2', '#F9E8C4'],
  metal: ['#E9B84C', '#D8D8DA', '#E8A0B4', '#49C0F8'],
} as const satisfies Record<string, readonly string[]>;

export type PaletteId = keyof typeof PALETTES;

/** Multiply a hex color by `factor` — used for shadows/highlights on a base color. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * factor) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * factor) | 0;
  const b = Math.min(255, (n & 255) * factor) | 0;
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Pick `index` from a palette, wrapping so an out-of-range value still renders. */
export function paletteColor(palette: PaletteId, index: number): string {
  const colors = PALETTES[palette] as readonly string[];
  const i = Number.isInteger(index) ? ((index % colors.length) + colors.length) % colors.length : 0;
  return colors[i] as string;
}

/** Shared stroke attributes — every shape in the system draws with these. */
export const STROKE = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;
