'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? 'Invalid passcode');
        return;
      }
      // Only honour same-origin relative paths to avoid open-redirects.
      const from = params.get('from');
      router.replace(from && from.startsWith('/') ? from : '/admin');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm flex flex-col gap-4 rounded-lg border border-black border-b-4 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-black">Admin access</h1>
        <p className="text-sm text-black/60">Enter the passcode to continue.</p>
      </div>

      <input
        type="password"
        autoFocus
        autoComplete="off"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        placeholder="Passcode"
        className="w-full rounded-md border border-black px-4 py-2 text-black outline-none focus:border-primary"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading || passcode.length === 0}
        className="w-full rounded-md border border-black border-b-3 bg-primary px-5 py-2 text-sm font-semibold text-black transition hover:bg-primary/80 disabled:opacity-50"
      >
        {loading ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
