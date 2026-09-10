'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/users', label: 'Users' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/referrals', label: 'Referrals' },
  { href: '/deposits', label: 'Deposits' },
  { href: '/ramps', label: 'Ramps' },
  { href: '/retention', label: 'Retention' },
  { href: '/engagement', label: 'Engagement' },
  { href: '/report', label: 'Weekly report' },
];

export function Nav({ envLabel }: { envLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
    <header className="flex flex-wrap items-center gap-3 border-b border-black/10 bg-white px-4 py-2">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/assets/logo/logo-mobile.png" alt="Vaquita" width={90} height={24} priority />
        <span className="text-sm font-semibold text-black">Growth</span>
      </Link>
      <span
        className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-black/70"
        title="METRICS_ENV_LABEL"
      >
        {envLabel}
      </span>
      <nav className="flex flex-wrap items-center gap-1">
        {links.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active ? 'bg-black text-white' : 'text-black/70 hover:bg-black/5'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onLogout}
        disabled={loading}
        className="ml-auto rounded-md border border-black/15 bg-white px-3 py-1 text-xs font-medium text-black/70 hover:bg-black/5 disabled:opacity-50"
      >
        Logout
      </button>
    </header>
  );
}
