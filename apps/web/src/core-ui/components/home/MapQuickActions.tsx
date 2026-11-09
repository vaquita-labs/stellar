'use client';

import { useHudHint, useUnplacedMapItemsCount } from '@/core-ui/hooks';
import { EditionMode, useMapStore } from '@/core-ui/stores';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { FOCUS_RING_CLASSES } from '../molecules/PressableButton';
import { HOME_TOUR_ANCHOR_QUICK_ACTIONS } from '../organisms/Tutorial/homeTourConfig';

/**
 * Accesos rápidos del mundo, en una fila arriba de la de racha/monedas/estrellas
 * (antes flotaban apilados a la derecha, sobre el mapa). La tienda abre el modo
 * edición del mapa (no navega), mientras que el leaderboard y explorar van a su
 * propia ruta con back propio. Orden: explorar, leaderboard, tienda.
 *
 * Cada acceso es un [QuickAction]: ícono ilustrado grande + etiqueta, cada uno
 * con su color.
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
    // The shop edits the 3D world, which lives on /world.
    if (pathname !== '/world') {
      router.push('/world');
    }
    setIsEditingMap(true);
    setEditMode(EditionMode.SELECT);
  };

  return (
    <div ref={hintRef} data-tutorial={HOME_TOUR_ANCHOR_QUICK_ACTIONS} className="grid grid-cols-3 gap-2">
      <QuickAction
        href="/explore"
        tone="sky"
        icon="/icons/navigation/world.webp"
        label={t('shell.nav.explore', 'Explore')}
      />
      <QuickAction
        href="/leaderboard"
        tone="gold"
        icon="/icons/navigation/leaderboard.png"
        label={t('shell.nav.leaderboard', 'Leaderboard')}
      />
      <QuickAction
        onClick={openShop}
        tone="orange"
        icon="/icons/navigation/shop.png"
        label={t('shell.nav.shop', 'Shop')}
        ariaLabel={
          hasUnplacedItems ? t('shell.nav.shopWithItems', '{{count}} items to place', { count: unplacedItems }) : undefined
        }
        // Piezas esperando a ser colocadas: la tienda late y muestra cuántas.
        highlighted={hasUnplacedItems}
        badge={hasUnplacedItems ? (unplacedItems > 99 ? '99+' : String(unplacedItems)) : undefined}
      />
    </div>
  );
};

/** Cada acceso tiene su color, tomado de su propio ícono: el mundo, el podio, el toldo. */
const TONE_CLASSES = {
  sky: 'bg-[#D6F0FF] hover:bg-[#C2E8FF]',
  gold: 'bg-[#FFEDB0] hover:bg-[#FFE694]',
  orange: 'bg-[#FFD9B8] hover:bg-[#FFCDA3]',
} as const;

interface QuickActionProps {
  icon: string;
  label: string;
  tone: keyof typeof TONE_CLASSES;
  /** Si se define, se renderiza como <Link> en vez de <button>. */
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
  highlighted?: boolean;
  badge?: string;
}

/**
 * Un acceso de la fila: el primo con color de [PressableButton] (mismo borde
 * negro con la base gruesa y el mismo hundido), con el ícono ilustrado grande.
 * Como tres chips blancos iguales la fila se leía como un filtro; con un color
 * por destino se lee como lo que es, las tres puertas del mundo.
 */
function QuickAction({ icon, label, tone, href, onClick, ariaLabel, highlighted = false, badge }: QuickActionProps) {
  const className = [
    'relative flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-1.5',
    'border border-black border-b-[3px] text-[13px] font-bold text-black transition',
    'active:translate-y-[2px] active:border-b-[1px]',
    TONE_CLASSES[tone],
    FOCUS_RING_CLASSES,
  ].join(' ');

  const content = (
    <>
      <Image src={icon} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 object-contain" priority />
      <span className="truncate">{label}</span>
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center shadow-md">
          {badge}
        </span>
      )}
    </>
  );

  return (
    <div className="relative flex">
      {highlighted && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -m-1 animate-pulse rounded-xl bg-amber-300/70 blur-sm motion-reduce:animate-none"
        />
      )}
      {href ? (
        <Link href={href} aria-label={ariaLabel} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
          {content}
        </button>
      )}
    </div>
  );
}
