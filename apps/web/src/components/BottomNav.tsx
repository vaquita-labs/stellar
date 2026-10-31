'use client';

import { useCardsStore } from '@/core-ui/stores';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { FiCreditCard, FiHome, FiMaximize } from 'react-icons/fi';

type Item = { id: 'home' | 'qr' | 'cards'; icon: IconType; label: string } & ({ href: string } | { action: 'cards' });

const ITEMS: Item[] = [
  { id: 'home', href: '/home', icon: FiHome, label: 'Home' },
  { id: 'qr', href: '/qr', icon: FiMaximize, label: 'QR' },
  // The card screen is a sheet, not a route: it opens over whatever is on screen.
  { id: 'cards', action: 'cards', icon: FiCreditCard, label: 'Cards' },
];

/**
 * The three places of the app on a phone: home, paying by QR and the card.
 * Part of the shell's column (not fixed over the page), so every screen ends
 * above it and nothing is covered. Desktop keeps the sidebar.
 */
export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname() ?? '';
  const cardsOpen = useCardsStore((s) => s.open);
  const openCards = useCardsStore((s) => s.openCards);
  return (
    <nav
      aria-label={t('shell.nav.primaryAriaLabel', 'Primary')}
      className="md:hidden shrink-0 border-t border-black/10 bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch">
        {ITEMS.map((item) => {
          const { id, icon: Icon, label } = item;
          const active =
            'href' in item ? !cardsOpen && (pathname === item.href || pathname.startsWith(`${item.href}/`)) : cardsOpen;
          const inner = (
            <>
              <span
                className={
                  'flex h-9 w-9 items-center justify-center rounded-full border ' +
                  (active ? 'border-black border-b-2 bg-primary text-black' : 'border-transparent text-gray-500')
                }
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className={'text-[11px] font-semibold ' + (active ? 'text-black' : 'text-gray-500')}>
                {t(`shell.nav.${id}`, label)}
              </span>
            </>
          );
          const className = 'flex flex-1 flex-col items-center justify-center gap-1 transition active:translate-y-0.5';
          return (
            <li key={id} className="flex flex-1">
              {'href' in item ? (
                <Link href={item.href} aria-current={active ? 'page' : undefined} className={className}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={openCards} aria-pressed={active} className={className}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
