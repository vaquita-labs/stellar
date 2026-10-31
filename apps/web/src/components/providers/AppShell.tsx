'use client';

import { DesktopSidebar } from '@/components';
import { BottomNav } from '@/components/BottomNav';
import { BootLoader, ConfigProvider, ProfileDataProvider } from '@/core-ui/components';
import { useMapStore, useResize } from '@/core-ui/stores';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { ListenDepositsChanges } from './ListenDepositsChanges';
import { ListenNotificationsChanges } from './ListenNotificationsChanges';
import { PostHogIdentify } from './PostHogIdentify';
import { WalletProviderSync } from './WalletProviderSync';

const Main = ({
  children,
  withSidebar,
  withBottomNav,
}: {
  children: ReactNode;
  withSidebar: boolean;
  withBottomNav: boolean;
}) => {
  return (
    <main
      className={`flex-1 flex flex-col${withSidebar ? ' md:ml-64' : ''}`}
      style={{ height: 'var(--100VH)', minHeight: 'var(--100VH)', maxHeight: 'var(--100VH)', overflow: 'hidden' }}
    >
      <WalletProviderSync />
      <PostHogIdentify />
      <ConfigProvider>
        <ProfileDataProvider>
          {/* The page takes what the bottom bar leaves: the bar is a row of
              this column, never an overlay, so no screen ends under it. */}
          <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
          {withBottomNav && <BottomNav />}
        </ProfileDataProvider>
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

  // On a phone the three places of the app (home, QR, help) are a bottom bar
  // (`BottomNav`); shop and leaderboard stay as floating actions on the home.
  // Desktop keeps the sidebar. Both hide while editing the map or on /shop.
  const isShopRoute = pathname?.startsWith('/shop') ?? false;
  // Screens that are a destination of their own, left with their back arrow:
  // the scanner (camera and all) and the help center with its chat. Cards is a
  // tab of the bar, so the bar stays there.
  const isScanRoute = (pathname?.startsWith('/qr') || pathname?.startsWith('/concierge')) ?? false;
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const hideNavigation = isShopRoute || isEditingMap;

  if (showLoader) {
    return <BootLoader />;
  }

  return (
    <div className="flex bg-background" style={{ overflow: 'hidden' }} ref={ref}>
      {!isPublicRoute && !hideNavigation && <DesktopSidebar />}
      <Main withSidebar={!isPublicRoute && !hideNavigation} withBottomNav={!isPublicRoute && !hideNavigation && !isScanRoute}>
        {children}
      </Main>
    </div>
  );
}
