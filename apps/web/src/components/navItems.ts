export type NavItem = { id: 'home' | 'world' | 'cards'; icon: string; label: string; href: string };

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

export const isNavItemActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
