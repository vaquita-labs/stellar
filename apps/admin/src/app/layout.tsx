import { LogoutButton, Providers } from '@/components';
import { WithHydrated } from '@/core-ui/components';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vaquita App',
  description: 'La forma más segura y divertida de generar ahorros con el poder de la blockchain',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-[100dvh] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <WithHydrated>
          <Providers>
            <LogoutButton />
            <main className="flex-1 min-h-0 overflow-auto">{children}</main>
          </Providers>
        </WithHydrated>
      </body>
    </html>
  );
}
