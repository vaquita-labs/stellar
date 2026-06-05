import { RequireAuth, UsernameGate } from '@/core-ui/components';

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <UsernameGate>
        <main className="flex-1 min-h-0 overflow-auto">{children}</main>
      </UsernameGate>
    </RequireAuth>
  );
}
