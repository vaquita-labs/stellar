'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';
import { isNavItemActive, NAV_ITEMS } from './navItems';

/**
 * The desktop side of `BottomNav`: the same three places (home, the 3D world
 * and the card) with the same look, laid out as rows instead of tabs. The
 * active place is the Vaquita chip (soft orange, black hairline, thicker base);
 * the others are just icon and label. Shop, leaderboard, explore and the daily
 * chest live inside the world, like on a phone.
 */
export function DesktopSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname() ?? '';

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 border-r border-black/10 bg-white z-10">
      <div className="flex flex-col w-full h-full">
        <div className="h-24 flex items-center px-6">
          <Logo />
        </div>

        <nav aria-label={t('shell.nav.primaryAriaLabel', 'Primary')} className="flex-1 overflow-y-auto px-4 py-2">
          <ul className="flex flex-col gap-1.5">
            {NAV_ITEMS.map(({ id, href, icon, label }) => {
              const active = isNavItemActive(pathname, href);
              return (
                <li key={id}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-base transition active:translate-y-[1px] ' +
                      (active
                        ? 'border border-black border-b-[3px] bg-primary/40 font-bold text-black'
                        : 'border border-transparent border-b-[3px] font-semibold text-black/50 hover:bg-black/5 hover:text-black')
                    }
                  >
                    <Image src={icon} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
                    <span>{t(`shell.nav.${id}`, label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
