export type NavItem = {
  id: 'home' | 'world' | 'cards' | 'portfolio' | 'profile';
  icon: string;
  label: string;
  href: string;
};

/**
 * The three places of the app, the same on every screen size: the bottom bar on
 * a phone (`BottomNav`) and the sidebar on a desktop (`DesktopSidebar`).
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', href: '/home', icon: '/icons/navigation/home.png', label: 'Home' },
  // The 3D world (map, the vaquita, the shop) lives on /world.
  { id: 'world', href: '/world', icon: '/icons/navigation/world.webp', label: 'World' },
  { id: 'cards', href: '/cards', icon: '/icons/navigation/cards.svg', label: 'Cards' },
];

/**
 * The desktop sidebar has room for more: the three places plus the portfolio
 * and the profile, which on a phone are reached from the home screen instead.
 */
export const DESKTOP_NAV_ITEMS: NavItem[] = [
  ...NAV_ITEMS,
  { id: 'portfolio', href: '/portafolio', icon: '/icons/navigation/portfolio.svg', label: 'Portfolio' },
  // Covers every /profile/* sub-page (achievements, settings…) via isNavItemActive.
  // The sidebar draws the user's own avatar instead of this icon.
  { id: 'profile', href: '/profile', icon: '/icons/profile.png', label: 'Profile' },
];

export const isNavItemActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
