'use client';

import { Button } from '@vaquita/ui';
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
    <Button
      variant="white"
      size="sm"
      className="fixed top-2 right-2 z-50"
      onPress={onLogout}
      isDisabled={loading}
      isLoading={loading}
    >
      Logout
    </Button>
  );
}
