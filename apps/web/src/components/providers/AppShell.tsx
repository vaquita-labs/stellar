'use client';

import { DesktopSidebar } from '@/components';
import { BootLoader, ConfigProvider, ProfileDataProvider } from '@/core-ui/components';
import { useMapStore, useResize } from '@/core-ui/stores';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { ListenDepositsChanges } from './ListenDepositsChanges';
import { ListenNotificationsChanges } from './ListenNotificationsChanges';
import { PostHogIdentify } from './PostHogIdentify';
import { WalletProviderSync } from './WalletProviderSync';

const Main = ({ children, withSidebar }: { children: ReactNode; withSidebar: boolean }) => {
  return (
    <main
      className={`flex-1 flex flex-col${withSidebar ? ' md:ml-64' : ''}`}
      style={{ height: 'var(--100VH)', minHeight: 'var(--100VH)', maxHeight: 'var(--100VH)', overflow: 'hidden' }}
    >
      <WalletProviderSync />
      <PostHogIdentify />
      <ConfigProvider>
        <ProfileDataProvider>{children}</ProfileDataProvider>
      </ConfigProvider>
      <ListenDepositsChanges />
      <ListenNotificationsChanges />
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

  // The bottom mobile navbar was removed: Shop and Leaderboard now live as
  // floating actions under the daily-reward chest on the home map. The desktop
  // sidebar stays, hidden while editing the map or on the /shop route.
  const isShopRoute = pathname?.startsWith('/shop') ?? false;
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const hideNavigation = isShopRoute || isEditingMap;

  if (showLoader) {
    return <BootLoader />;
  }

  return (
    <div className="flex bg-background" style={{ overflow: 'hidden' }} ref={ref}>
      {!isPublicRoute && !hideNavigation && <DesktopSidebar />}
      <Main withSidebar={!isPublicRoute && !hideNavigation}>{children}</Main>
    </div>
  );
}
