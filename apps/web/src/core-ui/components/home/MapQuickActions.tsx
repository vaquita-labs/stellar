'use client';

import { useUnplacedMapItemsCount } from '@/core-ui/hooks';
import { EditionMode, useMapStore } from '@/core-ui/stores';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

/**
 * Accesos rápidos que flotan sobre el mapa, apilados debajo del cofre. Sustituyen
 * a la barra de navegación inferior: la tienda abre el modo edición del mapa (no
 * navega), mientras que el leaderboard y explorar van a su propia ruta con back
 * propio. Orden: explorar, leaderboard, tienda.
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

  const openShop = () => {
    if (pathname !== '/home') {
      router.push('/home');
    }
    setIsEditingMap(true);
    setEditMode(EditionMode.SELECT);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Link href="/explore" aria-label={t('shell.nav.explore', 'Explore')} className="active:scale-95 transition-transform">
        <Image
          src="/icons/navigation/world.png"
          alt={t('shell.nav.explore', 'Explore')}
          width={40}
          height={40}
          className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]"
          priority
        />
      </Link>

      <Link
        href="/leaderboard"
        aria-label={t('shell.nav.leaderboard', 'Leaderboard')}
        className="active:scale-95 transition-transform"
      >
        <Image
          src="/icons/navigation/leaderboard.png"
          alt={t('shell.nav.leaderboard', 'Leaderboard')}
          width={40}
          height={40}
          className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]"
          priority
        />
      </Link>

      <button
        type="button"
        onClick={openShop}
        aria-label={
          hasUnplacedItems
            ? t('shell.nav.shopWithItems', '{{count}} items to place', { count: unplacedItems })
            : t('shell.nav.shop', 'Shop')
        }
        className="relative bg-transparent active:scale-95 transition-transform"
      >
        {hasUnplacedItems && (
          <span
            aria-hidden
            className="absolute inset-0 -m-1 rounded-full bg-amber-300/40 blur-md animate-pulse motion-reduce:animate-none"
          />
        )}
        <Image
          src="/icons/navigation/shop.png"
          alt={t('shell.nav.shop', 'Shop')}
          width={40}
          height={40}
          className={`relative object-contain ${
            hasUnplacedItems
              ? 'drop-shadow-[0_0_8px_rgba(252,211,77,0.95)]'
              : 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]'
          }`}
          priority
        />
        {hasUnplacedItems && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center shadow-md">
            {unplacedItems > 99 ? '99+' : unplacedItems}
          </span>
        )}
      </button>
    </div>
  );
};
