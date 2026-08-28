import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vaquita Growth Metrics',
  description: 'Users, deposits and engagement over time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-[100dvh] flex-col">{children}</body>
    </html>
  );
}
