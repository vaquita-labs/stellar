'use client';

import { BackToAdmin } from '@/components';
import { usePathname } from 'next/navigation';

// Wraps every /admin route. Shows the "Back to admin" link on the section pages
// but not on the /admin landing itself. Kept height-safe (h-full + min-h-0) so
// full-height children like the listening view keep their scroll behaviour.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRoot = pathname === '/admin';

  return (
    <div className="flex h-full flex-col">
      {!isRoot && (
        <div className="p-4 pb-0">
          <BackToAdmin />
        </div>
      )}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
