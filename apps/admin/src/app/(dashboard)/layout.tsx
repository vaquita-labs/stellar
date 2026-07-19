import { BackToAdmin } from '@/components';

// Wraps every admin section route (tokens, deposits, badges, listening,
// contract-events). The index lives at `/` outside this route group, so every
// route here is a section and always gets the "Back to admin" link. Kept
// height-safe (h-full + min-h-0) so full-height children like the listening
// view keep their scroll behaviour.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-4 pb-0">
        <BackToAdmin />
      </div>
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
