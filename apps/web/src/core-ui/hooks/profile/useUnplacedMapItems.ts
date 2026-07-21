import { isHudItem } from '@/core-ui/components/home/edit/hudItems';
import { useConfigStore } from '@/core-ui/stores';
import { useMemo } from 'react';
import { useProfileMapObjectsAvailable } from './useProfileMapObjectsAvailable';
import { useProfileMapObjectsByWallet } from './useProfileMapObjectsByWallet';

/**
 * Cuántas piezas tiene el usuario sin colocar en su mapa: por cada ítem de su
 * colección, lo disponible (gratis del catálogo + comprado) menos lo que ya
 * está puesto. Los ítems de HUD (reloj) no se colocan, así que no cuentan.
 *
 * Se compara contra el mapa GUARDADO del propio wallet, no contra el store:
 * el store puede tener el mapa de otro perfil (vista de explore) y la tienda
 * está oculta mientras se edita, así que no hace falta el estado en vivo.
 */
export const useUnplacedMapItemsCount = (): number => {
  const walletAddress = useConfigStore((s) => s.walletAddress);
  const { data: available } = useProfileMapObjectsAvailable();
  const { data: placed } = useProfileMapObjectsByWallet(walletAddress);

  return useMemo(() => {
    const tiles = placed?.objects ?? [];
    return (available?.objects ?? []).reduce((total, item) => {
      if (isHudItem(item.type)) return total;
      const used = tiles.reduce(
        (count, tile) => count + +(tile.type === item.type && tile.variant === item.variant),
        0
      );
      return total + Math.max(0, item.itemsAvailable - used);
    }, 0);
  }, [available?.objects, placed?.objects]);
};
