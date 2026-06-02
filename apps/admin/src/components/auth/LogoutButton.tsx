'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

// Discreet fixed logout control. Hidden on the login screen. In "open mode"
// (no ADMIN_PASSCODE configured) it is harmless — logout simply clears an
// absent cookie.
export function LogoutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (pathname === '/login') return null;

  const onLogout = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      className="fixed top-2 right-2 z-50 rounded-md border border-black border-b-3 bg-white px-3 py-1 text-xs font-semibold text-black transition hover:bg-primary disabled:opacity-50"
    >
      {loading ? '…' : 'Logout'}
    </button>
  );
}
