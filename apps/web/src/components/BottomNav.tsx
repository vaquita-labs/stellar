'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { FiCreditCard, FiGrid, FiHome } from 'react-icons/fi';

type Item = { id: 'home' | 'cards' | 'apps'; icon: IconType; label: string; href: string };

const ITEMS: Item[] = [
  { id: 'home', href: '/home', icon: FiHome, label: 'Home' },
  { id: 'cards', href: '/tarjetas', icon: FiCreditCard, label: 'Cards' },
  { id: 'apps', href: '/apps', icon: FiGrid, label: 'Apps' },
];

/**
 * The three places of the app on a phone: home, the card and apps (the fun
 * things to do with Vaquita; help is a header button). Part of the
 * shell's column (not fixed over the page), so every screen ends above it and
 * nothing is covered. A plain tab bar: icon over label, the active one in the
 * app's orange. Desktop keeps the sidebar.
 */
export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label={t('shell.nav.primaryAriaLabel', 'Primary')}
      className="md:hidden shrink-0 border-t border-black/5 bg-background pb-[env(safe-area-inset-bottom)]"
    >
      {/* A plain tab bar: icon over label; the active one inside a small Vaquita chip. */}
      <ul className="mx-auto flex h-[3.75rem] max-w-xl items-stretch">
        {ITEMS.map((item) => {
          const { id, icon: Icon, label } = item;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const className = 'flex flex-1 items-center justify-center transition active:translate-y-[1px]';
          // The active place is a small Vaquita chip around icon and label: soft
          // orange, black hairline, the thicker base the app's buttons carry.
          // The others are just icon and label, faded.
          const inner = (
            <span
              className={
                'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] ' +
                (active
                  ? 'border border-black border-b-2 bg-primary/40 font-bold text-black'
                  : 'border border-transparent border-b-2 font-semibold text-black/40')
              }
            >
              <Icon className="h-6 w-6 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
              <span>{t(`shell.nav.${id}`, label)}</span>
            </span>
          );
          return (
            <li key={id} className="flex flex-1">
              <Link href={item.href} aria-current={active ? 'page' : undefined} className={className}>
                {inner}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
