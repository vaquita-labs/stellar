'use client';

import { DesktopSidebar, MobileNavigation } from '@/components';
import { ConfigProvider, LoaderScreen, ProfileDataProvider } from '@/core-ui/components';
import { useMapStore, useResize } from '@/core-ui/stores';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { ListenDepositsChanges } from './ListenDepositsChanges';
import { WalletProviderSync } from './WalletProviderSync';

const Main = ({ children, withSidebar }: { children: ReactNode; withSidebar: boolean }) => {
  return (
    <main
      className={`flex-1 flex flex-col${withSidebar ? ' md:ml-64' : ''}`}
      style={{ height: 'var(--100VH)', minHeight: 'var(--100VH)', maxHeight: 'var(--100VH)', overflow: 'hidden' }}
    >
      <WalletProviderSync />
      <ConfigProvider>
        <ProfileDataProvider>{children}</ProfileDataProvider>
      </ConfigProvider>
      <ListenDepositsChanges />
    </main>
  );
};

/**
 * App chrome: shows the loader while the auth-gate is undecided, otherwise the
 * sidebar / main / bottom-navigation layout. Navigation visibility is derived
 * from the current route plus the map-editing state.
 */
export function AppShell({
  children,
  isPublicRoute,
  showLoader,
}: {
  children: ReactNode;
  isPublicRoute: boolean;
  showLoader: boolean;
}) {
  const { ref } = useResize();
  const pathname = usePathname();

  // Show the bottom navbar on `/profile` itself, but hide it on any deeper
  // profile sub-route (settings, edit, wallet, friends, notifications, …).
  const isProfileSubRoute = pathname?.startsWith('/profile/') ?? false;
  const isShopRoute = pathname?.startsWith('/shop') ?? false;
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const hideNavigation = isShopRoute || isEditingMap;

  if (showLoader) {
    return <LoaderScreen withImage />;
  }

  return (
    <div className="flex bg-background" style={{ overflow: 'hidden' }} ref={ref}>
      {!isPublicRoute && !hideNavigation && <DesktopSidebar />}
      <Main withSidebar={!isPublicRoute && !hideNavigation}>{children}</Main>
      {!isPublicRoute && !isProfileSubRoute && !hideNavigation && <MobileNavigation />}
    </div>
  );
}
