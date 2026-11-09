'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, NAV_ITEMS } from './navItems';

/**
 * The three places of the app on a phone: home, the 3D world and the card
 * (help is a header button). Part of the shell's column (not
 * fixed over the page), so every screen ends above it and nothing is covered.
 * A plain tab bar: the app's colored icon over its label, the active one inside
 * a small Vaquita chip. Desktop shows the same three as a sidebar
 * (`DesktopSidebar`).
 */
export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label={t('shell.nav.primaryAriaLabel', 'Primary')}
      className="md:hidden shrink-0 border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch">
        {NAV_ITEMS.map((item) => {
          const { id, icon, label } = item;
          const active = isNavItemActive(pathname, item.href);
          const className = 'flex flex-1 items-center justify-center transition active:translate-y-[1px]';
          // The active place is a small Vaquita chip around icon and label: soft
          // orange, black hairline, the thicker base the app's buttons carry.
          // The others are just icon and label; the icon keeps its colors.
          const inner = (
            <span
              className={
                'flex flex-col items-center rounded-lg px-3 py-0.5 text-[11px] leading-tight ' +
                (active
                  ? 'border border-black border-b-2 bg-primary/40 font-bold text-black'
                  : 'border border-transparent border-b-2 font-semibold text-black/50')
              }
            >
              <Image src={icon} alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" />
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
