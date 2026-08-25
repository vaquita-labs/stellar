import { Providers } from '@/components';
import { BootLoader, WithHydrated } from '@/core-ui/components';
import type { Metadata } from 'next';
import './globals.css';

// Next only honors a `viewport` exported from a layout/page — the standalone
// viewport.ts file does nothing unless re-exported here.
export { viewport } from './viewport';

export const metadata: Metadata = {
  title: 'Vaquita App',
  description: 'La forma más divertida de generar ahorros con el poder de la blockchain',
  applicationName: 'Vaquita',
  // iOS ignores the manifest for Add to Home Screen; these tags make the
  // installed shortcut open full-screen with the right name and icon.
  appleWebApp: { capable: true, title: 'Vaquita', statusBarStyle: 'default' },
  icons: { apple: '/icons/pwa/apple-touch-icon.png' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Umami analytics (prod only). The tracker is self-hosted at /va.js (avoids
  // URL-based blockers); data-host-url points events back at the Umami server.
  // Set NEXT_PUBLIC_UMAMI_WEBSITE_ID per environment; when unset, no tracking
  // script is rendered.
  //
  // Decided as a boolean before it reaches JSX, and rendered through a ternary,
  // so <head> never receives a string child. `cond && envVar && <script/>`
  // evaluates to the env var itself when it is defined but empty — and React
  // hydrates a string child of <head> by comparing it against the real head's
  // textContent, which carries the title and every inline script. That never
  // matches, so React fails hydration on a singleton and rebuilds the document
  // from scratch, dropping the server's <title>, meta tags and stylesheets.
  const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const trackWithUmami = process.env.NODE_ENV !== 'development' && !!umamiWebsiteId;

  return (
    // stellar-wallets-kit escribe variables --swk-* como style inline en <html>
    // apenas se importa en el cliente (efecto de módulo en su state/effects.js).
    // El server nunca corre eso, así que el <html> difiere entre server y client:
    // suppressHydrationWarning silencia ESE nivel (solo atributos del <html>, no
    // sus hijos), que es justo el mismatch esperado del tema aplicado en cliente.
    <html lang="es" suppressHydrationWarning>
      <head>
        {trackWithUmami ? (
          <script
            defer
            src="/va.js"
            data-website-id={umamiWebsiteId}
            data-host-url="https://umami.vaquita.fi"
          ></script>
        ) : null}
      </head>
      <body className="min-h-dvh flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-background">
        {/* Primera pantalla de todas: se ve mientras rehidrata el estado
            persistido, antes de que monte ningún provider. Usa el mismo
            BootLoader que los gates de más adentro para que el arranque sea UNA
            pantalla continua y no una vaquita seguida de otra cosa. */}
        <WithHydrated fallback={<BootLoader />}>
          <Providers>{children}</Providers>
        </WithHydrated>
        {/* <Analytics /> */}
        {/* <SpeedInsights /> */}
      </body>
    </html>
  );
}
