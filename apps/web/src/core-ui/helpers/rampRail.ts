import type { TFunction } from 'i18next';

/**
 * Nombre del rail tal como lo devuelve Pollar → nombre con el que la gente lo
 * conoce. "ACH" es el caso que motivó esto: es la sigla del sistema de
 * compensación bancaria de Estados Unidos, no algo que un usuario en Bolivia
 * reconozca; lo que él ve del otro lado es una transferencia a su cuenta.
 *
 * Un rail que no esté en el mapa se muestra tal cual: Pix y Bre-B son marcas
 * que la gente sí conoce, y traducirlas sería peor.
 */
const RAIL_LABELS: Record<string, { key: string; fallback: string }> = {
  ACH: { key: 'wallet.fiat.rail.ach', fallback: 'Bank Transfer' },
};

/** Normaliza lo que manda el proveedor: llega en cualquier caja y con separadores. */
const normalize = (rail: string) => rail.trim().toUpperCase().replace(/[\s_-]+/g, '');

export function railLabel(rail: string | null | undefined, t: TFunction): string {
  const raw = (rail ?? '').trim();
  if (!raw) return '';
  const entry = RAIL_LABELS[normalize(raw)];
  return entry ? t(entry.key, entry.fallback) : raw;
}
