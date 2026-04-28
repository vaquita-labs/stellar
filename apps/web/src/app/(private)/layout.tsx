import { AuthButtons } from '@/components';
import { RequireAuth } from '@/core-ui/components';

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      {/* <div className="">
        <AuthButtons />
      </div> */}
      <main className="flex-1 min-h-0 overflow-auto">{children}</main>
    </RequireAuth>
  );
}
