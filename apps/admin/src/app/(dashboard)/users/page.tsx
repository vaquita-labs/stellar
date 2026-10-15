'use client';

import { useAdminMe } from '@/core-ui/hooks/useAdminMe';
import { Button, Input, Select } from '@vaquita/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

type Role = 'operator' | 'read-only';
interface Row {
  email: string;
  role: Role;
  createdAt: string;
  createdBy: string;
  disabledAt: string | null;
}

const headers: HeadersInit = { 'Content-Type': 'application/json' };
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

// Who may write in this console. Entry is decided by Cloudflare Access; this
// page only assigns a role to an admitted email and can disable one person.
export default function UsersPage() {
  const queryClient = useQueryClient();
  const me = useAdminMe();
  const isOperator = me.data?.role === 'operator';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('read-only');
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users');
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? 'Could not load users');
      return body.data.users as Row[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'me'] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/users', { method: 'POST', headers, body: JSON.stringify({ email, role }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? 'Could not add the user');
    },
    onSuccess: () => {
      setEmail('');
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: async (vars: { email: string; role?: Role; disabled?: boolean }) => {
      const res = await fetch('/api/admin/users', { method: 'PATCH', headers, body: JSON.stringify(vars) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? 'Could not update the user');
    },
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const bootstrap = users.data?.length === 0;

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-sm text-gray-500">
          Who may change things here. Entry is decided by Cloudflare Access; an admitted email with no row is read-only.
          {me.data ? ` You are ${me.data.email} (${me.data.role}).` : ''}
        </p>
        {bootstrap ? (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            No users listed yet, so everyone Cloudflare Access admits is an operator. Add yourself first; from then on
            only listed operators may write.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      {isOperator ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Input
            id="new-user-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@vaquita.fi"
            className="min-w-72"
          />
          <Select id="new-user-role" label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="read-only">read-only</option>
            <option value="operator">operator</option>
          </Select>
          <Button htmlType="submit" isDisabled={!email || add.isPending}>
            Add
          </Button>
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Added</th>
              <th className="py-2 pr-4">By</th>
              <th className="py-2 pr-4">Status</th>
              {isOperator ? <th className="py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => {
              const self = u.email === me.data?.email;
              return (
                <tr key={u.email} className="border-t border-gray-200">
                  <td className="py-2 pr-4 font-mono">{u.email}</td>
                  <td className="py-2 pr-4">{u.role}</td>
                  <td className="py-2 pr-4">{shortDate(u.createdAt)}</td>
                  <td className="py-2 pr-4 font-mono">{u.createdBy}</td>
                  <td className="py-2 pr-4">{u.disabledAt ? `disabled ${shortDate(u.disabledAt)}` : 'active'}</td>
                  {isOperator ? (
                    <td className="flex gap-2 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={self || update.isPending}
                        onPress={() => update.mutate({ email: u.email, role: u.role === 'operator' ? 'read-only' : 'operator' })}
                      >
                        Make {u.role === 'operator' ? 'read-only' : 'operator'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={self || update.isPending}
                        onPress={() => update.mutate({ email: u.email, disabled: !u.disabledAt })}
                      >
                        {u.disabledAt ? 'Enable' : 'Disable'}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {users.data?.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-gray-500">
                  Nobody listed.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
