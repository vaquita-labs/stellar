import { Providers } from '@/components';
import { WithHydrated } from '@/core-ui/components';
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
