import { Providers } from '@/components';
import { WithHydrated } from '@/core-ui/components';
import type { Metadata } from 'next';
import './globals.css';

// Next only honors a `viewport` exported from a layout/page — the standalone
// viewport.ts file does nothing unless re-exported here.
export { viewport } from './viewport';

export const metadata: Metadata = {
  title: 'Vaquita App',
  description: 'La forma más segura y divertida de generar ahorros con el poder de la blockchain',
  applicationName: 'Vaquita',
  // iOS ignores the manifest for Add to Home Screen; these tags make the
  // installed shortcut open full-screen with the right name and icon.
  appleWebApp: { capable: true, title: 'Vaquita', statusBarStyle: 'default' },
  icons: { apple: '/icons/pwa/apple-touch-icon.png' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {process?.env?.NODE_ENV !== 'development' && (
          <script
            defer
            src="/umami.js"
            data-website-id="df3ddd20-0ec1-446f-9b53-47a51458c1b9"
            data-host-url="https://analytics.oscargauss.com"
          ></script>
        )}
      </head>
      <body className="min-h-dvh flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-background">
        <WithHydrated>
          <Providers>{children}</Providers>
        </WithHydrated>
        {/* <Analytics /> */}
        {/* <SpeedInsights /> */}
      </body>
    </html>
  );
}
