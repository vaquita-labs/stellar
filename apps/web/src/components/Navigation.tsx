'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const navItems = [
  { href: '/home', icon: '/icons/home.png', label: 'Home' },
  { href: '/leaderboard', icon: '/icons/leaderboard.png', label: 'Leaderboard' },
  // { href: "/pools", icon: "/icons/pools.svg", label: "Pools" },
  { href: '/profile', icon: '/icons/profile.png', label: 'Profile' },
];

function NavLink({
  href,
  icon,
  label,
  isActive,
  isMobile = false,
}: {
  href: string;
  icon: string;
  label: string;
  isActive: boolean;
  isMobile?: boolean;
}) {
  const baseStyle = 'flex font-medium rounded-lg px-3 py-2';
  const activeStyle = 'bg-[#DDF4FF] border-2 border-[#84D8FF]';
  const inactiveStyle = 'text-black hover:text-primary';

  const combinedStyles = `${baseStyle} ${isActive ? activeStyle : inactiveStyle}`;
  return (
    <Link href={href} className={combinedStyles}>
      <div className={`flex ${isMobile ? 'flex-col items-center gap-1' : 'flex-row items-center gap-2'}`}>
        <Image src={icon} alt={label} width={isMobile ? 44 : 40} height={isMobile ? 44 : 40} />
        {!isMobile && <span>{label}</span>}
      </div>
    </Link>
  );
}

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 border-r-2 border-[#B97204] z-10">
      <div className="flex flex-col w-full h-full">
        <div className="h-24 flex items-center px-6">
          <Logo />
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-4 py-2">
          <ul className="flex flex-col gap-2">
            {navItems.map(({ href, icon, label }) => (
              <li key={href}>
                <NavLink href={href} icon={icon} label={label} isActive={pathname.startsWith(href)} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 h-18  flex justify-around items-center z-10  bg-background w-full rounded-t-lg  backdrop-blur-xl shadow-[0_-10px_30px_rgba(15,23,42,0.18)]">
      {navItems.map(({ href, icon, label }) => (
        <NavLink key={href} href={href} icon={icon} label={label} isActive={pathname.startsWith(href)} isMobile />
      ))}
    </nav>
  );
}
