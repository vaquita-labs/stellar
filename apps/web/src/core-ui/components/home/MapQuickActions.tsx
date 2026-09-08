'use client';

import { useHudHint, useUnplacedMapItemsCount } from '@/core-ui/hooks';
import { EditionMode, useMapStore } from '@/core-ui/stores';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { MapIconButton } from '../molecules/MapIconButton';
import { HOME_TOUR_ANCHOR_QUICK_ACTIONS } from '../organisms/Tutorial/homeTourConfig';

/**
 * Accesos rápidos que flotan sobre el mapa, apilados debajo del cofre. Sustituyen
 * a la barra de navegación inferior: la tienda abre el modo edición del mapa (no
 * navega), mientras que el leaderboard y explorar van a su propia ruta con back
 * propio. Orden: explorar, leaderboard, tienda.
 *
 * Cada acceso es un [MapIconButton]: círculo con el borde de la app, etiqueta
 * debajo y el mismo hundido que el resto de los botones.
 */
export const MapQuickActions = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const setIsEditingMap = useMapStore((s) => s.setIsEditingMap);
  const setEditMode = useMapStore((s) => s.setEditMode);
  // Piezas compradas/regaladas que todavía no están en el mapa: la tienda
  // brilla para avisar que hay algo para colocar (típico del primer ingreso,
  // donde el mapa arranca vacío y ya hay ítems gratis esperando).
  const unplacedItems = useUnplacedMapItemsCount();
  const hasUnplacedItems = unplacedItems > 0;
  const hintRef = useHudHint();

  const openShop = () => {
    if (pathname !== '/home') {
      router.push('/home');
    }
    setIsEditingMap(true);
    setEditMode(EditionMode.SELECT);
  };

  return (
    <div ref={hintRef} data-tutorial={HOME_TOUR_ANCHOR_QUICK_ACTIONS} className="flex flex-col items-center gap-2">
      <MapIconButton
        href="/explore"
        label={t('shell.nav.explore', 'Explore')}
        ariaLabel={t('shell.nav.explore', 'Explore')}
        icon={<Image src="/icons/navigation/world.webp" alt="" width={28} height={28} className="object-contain" priority />}
      />

      <MapIconButton
        href="/leaderboard"
        label={t('shell.nav.leaderboard', 'Leaderboard')}
        ariaLabel={t('shell.nav.leaderboard', 'Leaderboard')}
        icon={
          <Image src="/icons/navigation/leaderboard.png" alt="" width={28} height={28} className="object-contain" priority />
        }
      />

      <MapIconButton
        onClick={openShop}
        label={t('shell.nav.shop', 'Shop')}
        ariaLabel={
          hasUnplacedItems
            ? t('shell.nav.shopWithItems', '{{count}} items to place', { count: unplacedItems })
            : t('shell.nav.shop', 'Shop')
        }
        highlighted={hasUnplacedItems}
        icon={<Image src="/icons/navigation/shop.png" alt="" width={28} height={28} className="object-contain" priority />}
        badge={
          hasUnplacedItems ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center shadow-md">
              {unplacedItems > 99 ? '99+' : unplacedItems}
            </span>
          ) : null
        }
      />
    </div>
  );
};
