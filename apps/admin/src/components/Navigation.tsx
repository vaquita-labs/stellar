'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const navItems = [
  { href: '/home', icon: '/icons/home.svg', label: 'Home' },
  { href: '/leaderboard', icon: '/icons/leaderboard.svg', label: 'Leaderboard' },
  // { href: "/pools", icon: "/icons/pools.svg", label: "Pools" },
  { href: '/profile', icon: '/icons/profile.svg', label: 'Profile' },
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
        <Image src={icon} alt={label} width={isMobile ? 42 : 24} height={isMobile ? 42 : 24} />
        {!isMobile && <span>{label}</span>}
      </div>
    </Link>
  );
}

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 border-r-2 border-[#B97204] z-50">
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
    <nav className="md:hidden fixed bottom-0 left-0 w-full h-24 border-t-2 border-[#E7E7E5] flex justify-around items-center z-50 bg-white">
      {navItems.map(({ href, icon, label }) => (
        <NavLink key={href} href={href} icon={icon} label={label} isActive={pathname.startsWith(href)} isMobile />
      ))}
    </nav>
  );
}
