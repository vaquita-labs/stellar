'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { DEVICE_LOCAL_ONBOARDINGS, ONBOARDING_FLAGS, type OnboardingKey } from '@/core-ui/config/onboardings';
import { Button, Input, Select } from '@vaquita/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface Row {
  id: number;
  nickname: string | null;
  walletAddress: string;
  email: string | null;
  createdAt: string | null;
  flags: Record<OnboardingKey, boolean>;
}

const PAGE = 50;

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

const shortWallet = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-5)}` : a);
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

export default function OnboardingPage() {
  const queryClient = useQueryClient();
  // `query` is what the user is typing; `q` is what has been submitted. Keeping
  // them apart stops a request per keystroke against the whole profiles table.
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<OnboardingKey | ''>('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (q) params.set('q', q);
  if (pending) params.set('pending', pending);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'onboarding', q, pending, offset],
    queryFn: async () => {
      const res = await fetch(`/api/admin/onboarding?${params}`, { headers: adminHeaders() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? 'Could not load profiles');
      return body.data as { total: number; rows: Row[] };
    },
  });

  const toggle = useMutation({
    mutationFn: async (vars: { walletAddress: string; key: OnboardingKey; value: boolean }) => {
      const res = await fetch('/api/admin/onboarding', {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify(vars),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? 'Could not update the flag');
      return body.data;
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'onboarding'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setQ(query.trim());
  };

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">Onboarding</h1>
      <p className="text-sm text-gray-500 mb-4">
        Which first-run experiences each profile has finished. Clearing a box re-opens that experience for that user the
        next time they open the app — nothing else about the profile changes.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <form onSubmit={submit} className="flex items-end gap-2">
          <Input
            label="Search"
            placeholder="nickname, wallet or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            containerClassName="w-72"
          />
          <Button htmlType="submit">Search</Button>
        </form>

        <Select
          label="Only those missing"
          value={pending}
          onChange={(e) => {
            setOffset(0);
            setPending(e.target.value as OnboardingKey | '');
          }}
        >
          <option value="">— any —</option>
          {ONBOARDING_FLAGS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded border border-black/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              {ONBOARDING_FLAGS.map((f) => (
                <th key={f.key} className="px-3 py-2 font-medium text-center whitespace-nowrap" title={f.description}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={2 + ONBOARDING_FLAGS.length} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={2 + ONBOARDING_FLAGS.length} className="px-3 py-6 text-center text-gray-500">
                  No profiles match.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-black/5">
                <td className="px-3 py-2">
                  <div className="font-medium">{row.nickname ? `@${row.nickname}` : '(no nickname)'}</div>
                  <div className="font-mono text-xs text-gray-500" title={row.walletAddress}>
                    {shortWallet(row.walletAddress)}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{shortDate(row.createdAt)}</td>
                {ONBOARDING_FLAGS.map((f) => {
                  const busy =
                    toggle.isPending &&
                    toggle.variables?.walletAddress === row.walletAddress &&
                    toggle.variables?.key === f.key;
                  return (
                    <td key={f.key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-black disabled:opacity-40"
                        checked={row.flags[f.key]}
                        disabled={busy}
                        aria-label={`${f.label} for ${row.nickname ?? row.walletAddress}`}
                        onChange={(e) =>
                          toggle.mutate({ walletAddress: row.walletAddress, key: f.key, value: e.target.checked })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
        <Button variant="white" onPress={() => setOffset((o) => Math.max(0, o - PAGE))} isDisabled={offset === 0}>
          Previous
        </Button>
        <Button variant="white" onPress={() => setOffset((o) => o + PAGE)} isDisabled={offset + PAGE >= total}>
          Next
        </Button>
        <span>
          {total === 0 ? '0' : `${offset + 1}–${Math.min(offset + PAGE, total)}`} of {total}
        </span>
      </div>

      <div className="mt-8 rounded border border-dashed border-black/25 bg-black/[0.02] p-4">
        <h2 className="text-sm font-semibold">Not resettable from here</h2>
        <p className="mt-1 text-sm text-gray-600">
          These run before there is a signed-in user, or are a choice about the device rather than the account, so they
          live in that browser&apos;s storage and no admin can clear them remotely. Re-showing one means clearing its key
          in that person&apos;s browser.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-600">
          {DEVICE_LOCAL_ONBOARDINGS.map((d) => (
            <li key={d.storageKey}>
              {d.label} — <code className="font-mono text-xs">{d.storageKey}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
