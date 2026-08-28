import { Nav } from '@/components/Nav';
import { getServerEnv } from '@/lib/serverEnv';

export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav envLabel={getServerEnv().METRICS_ENV_LABEL} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">{children}</main>
    </div>
  );
}
