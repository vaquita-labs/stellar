'use client';

import { EditionMode, useMapStore } from '@/core-ui/stores';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

/**
 * Accesos rápidos que flotan sobre el mapa, apilados debajo del cofre. Sustituyen
 * a la barra de navegación inferior: la tienda abre el modo edición del mapa (no
 * navega), mientras que el leaderboard y explorar van a su propia ruta con back
 * propio. Orden: leaderboard, explorar, tienda.
 */
export const MapQuickActions = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const setIsEditingMap = useMapStore((s) => s.setIsEditingMap);
  const setEditMode = useMapStore((s) => s.setEditMode);

  const openShop = () => {
    if (pathname !== '/home') {
      router.push('/home');
    }
    setIsEditingMap(true);
    setEditMode(EditionMode.SELECT);
  };

  return (
    <div className="flex flex-col items-center gap-2">
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

      <button
        type="button"
        onClick={openShop}
        aria-label={t('shell.nav.shop', 'Shop')}
        className="bg-transparent active:scale-95 transition-transform"
      >
        <Image
          src="/icons/navigation/shop.png"
          alt={t('shell.nav.shop', 'Shop')}
          width={40}
          height={40}
          className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]"
          priority
        />
      </button>
    </div>
  );
};
