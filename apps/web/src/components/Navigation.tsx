'use client';

import { EditionMode, useMapStore } from '@/core-ui/stores';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';

const navItems = [
  { id: 'home', href: '/home', icon: '/icons/navigation/home.png', label: 'Home' },
  { id: 'shop', href: '/shop', icon: '/icons/navigation/shop.png', label: 'Shop' },
  { id: 'leaderboard', href: '/leaderboard', icon: '/icons/navigation/leaderboard.png', label: 'Leaderboard' },
  // { href: "/pools", icon: "/icons/pools.svg", label: "Pools" },
  { id: 'profile', href: '/profile', icon: '/icons/navigation/profile.png', label: 'Profile' },
];

function NavLink({
  href,
  icon,
  label,
  isActive,
  isMobile = false,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  isActive: boolean;
  isMobile?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  // Mobile uses a tighter, padding-light pill so the whole nav can be shorter.
  const baseStyle = isMobile
    ? 'flex font-medium rounded-lg px-2 py-1'
    : 'flex font-medium rounded-lg px-3 py-2';
  const activeStyle = 'bg-[#DDF4FF] border-2 border-[#84D8FF]';
  const inactiveStyle = 'text-black hover:text-primary';

  const combinedStyles = `${baseStyle} ${isActive ? activeStyle : inactiveStyle}`;
  return (
    <Link href={href} className={combinedStyles} onClick={onClick}>
      <div className={`flex ${isMobile ? 'flex-col items-center gap-0.5' : 'flex-row items-center gap-2'}`}>
        <Image src={icon} alt={label} width={isMobile ? 40 : 40} height={isMobile ? 40 : 40} />
        {!isMobile && <span>{label}</span>}
      </div>
    </Link>
  );
}

function useShopNavHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const setIsEditingMap = useMapStore((s) => s.setIsEditingMap);
  const setEditMode = useMapStore((s) => s.setEditMode);

  return (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (pathname !== '/home') {
      router.push('/home');
    }
    setIsEditingMap(true);
    setEditMode(EditionMode.SELECT);
  };
}

export function DesktopSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const handleShopClick = useShopNavHandler();
  const isEditingMap = useMapStore((s) => s.isEditingMap);

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 border-r-2 border-[#B97204] z-10">
      <div className="flex flex-col w-full h-full">
        <div className="h-24 flex items-center px-6">
          <Logo />
        </div>

        <nav aria-label={t('shell.nav.primaryAriaLabel', 'Primary')} className="flex-1 overflow-y-auto px-4 py-2">
          <ul className="flex flex-col gap-2">
            {navItems.map(({ id, href, icon, label }) => {
              const isShop = href === '/shop';
              const isActive = isShop ? isEditingMap : pathname.startsWith(href);
              return (
                <li key={href}>
                  <NavLink
                    href={href}
                    icon={icon}
                    label={t(`shell.nav.${id}`, label)}
                    isActive={isActive}
                    onClick={isShop ? handleShopClick : undefined}
                  />
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const handleShopClick = useShopNavHandler();
  const isEditingMap = useMapStore((s) => s.isEditingMap);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 h-16 flex justify-around items-center z-10 bg-background w-full rounded-t-lg backdrop-blur-xl shadow-[0_-10px_30px_rgba(15,23,42,0.18)]">
      {navItems.map(({ id, href, icon, label }) => {
        const isShop = href === '/shop';
        const isActive = isShop ? isEditingMap : pathname.startsWith(href);
        return (
          <NavLink
            key={href}
            href={href}
            icon={icon}
            label={t(`shell.nav.${id}`, label)}
            isActive={isActive}
            isMobile
            onClick={isShop ? handleShopClick : undefined}
          />
        );
      })}
    </nav>
  );
}
