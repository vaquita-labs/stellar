import { AuthButtons, Providers } from '@/components';
import { WithHydrated } from '@/core-ui/components';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vaquita App',
  description: 'La forma más segura y divertida de generar ahorros con el poder de la blockchain',
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
      <body className="min-h-dvh flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <WithHydrated>
          <Providers>
            <div className="h-14 shrink-0 flex justify-end">
              <AuthButtons />
            </div>
            <main className="flex-1 min-h-0 overflow-auto">{children}</main>
          </Providers>
        </WithHydrated>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
