import type { TFunction } from 'i18next';
import { MapObjectType } from '../../../types';

/**
 * Nombre localizado de un ítem de mapa (type + variant). Busca la clave
 * específica de la variante y cae al nombre genérico del tipo. Para agregar
 * el nombre de un ítem nuevo: `home.catalog.objects.<type>.<variant>` (o
 * `.default`) en los tres locales.
 */
export function getMapItemName(t: TFunction, type: MapObjectType, variant: number): string {
  const fallback = t(`home.catalog.objects.${type}.default`, type);
  return t(`home.catalog.objects.${type}.${variant}`, fallback);
}
