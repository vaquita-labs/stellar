'use client';

import { toast } from '@heroui/react';
import Image from 'next/image';
import React, { useMemo, useState } from 'react';
import { FiCheck, FiSearch, FiUserPlus } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

type Contact = { id: string; name: string; handle: string };

const CONTACTS: Contact[] = [
  { id: 'c-1', name: 'Bianka Arce', handle: '@biankarce' },
  { id: 'c-2', name: 'Carlos Jhesid', handle: '@cjhesid' },
  { id: 'c-3', name: 'Andrea Alvarez', handle: '@aalvarez' },
  { id: 'c-4', name: 'Mateo Velez', handle: '@mateovz' },
  { id: 'c-5', name: 'Sofía Castro', handle: '@sofic' },
  { id: 'c-6', name: 'Daniela Páez', handle: '@danip' },
  { id: 'c-7', name: 'Tomás León', handle: '@tomasl' },
  { id: 'c-8', name: 'Valentina Ruiz', handle: '@valeruiz' },
  { id: 'c-9', name: 'Felipe Gómez', handle: '@felipego' },
  { id: 'c-10', name: 'Camila Mora', handle: '@camora' },
];

export function ChooseContactsPage() {
  const [query, setQuery] = useState('');
  const [invited, setInvited] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CONTACTS;
    return CONTACTS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q)
    );
  }, [query]);

  const toggleInvite = (contact: Contact) => {
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(contact.id)) {
        next.delete(contact.id);
        toast.success(`Removed ${contact.name} (mock)`, { timeout: 1500 });
      } else {
        next.add(contact.id);
        toast.success(`Invite sent to ${contact.name} (mock)`, { timeout: 1500 });
      }
      return next;
    });
  };

  return (
    <MockedSubPageLayout
      title="Choose from contacts"
      subtitle="Browse vaqueros you already know and invite them to save with you."
      backHref="/profile/friends"
    >
      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 h-4 w-4" />
        <input
          type="search"
          inputMode="search"
          placeholder="Search by name or handle…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-12 pl-10 pr-3 rounded-md bg-white border border-black border-b-2 text-sm font-medium text-black placeholder:text-gray-400 outline-none focus:border-primary"
        />
      </div>

      {/* List */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
            Contacts
          </h2>
          <span className="text-[11px] font-bold text-gray-500 tabular-nums">
            {filtered.length} found
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
            <p className="text-sm font-bold text-black">No matches</p>
            <p className="text-xs text-gray-500 mt-1">Try a different name.</p>
          </div>
        ) : (
          <ul className="rounded-2xl border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
            {filtered.map((c) => {
              const isInvited = invited.has(c.id);
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-11 w-11 rounded-full bg-[#FFE7C7] border-2 border-black flex items-center justify-center overflow-hidden shrink-0">
                    <Image
                      src="/vaquita/vaquita_isotipo.svg"
                      alt={c.name}
                      width={36}
                      height={36}
                      className="object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-black truncate">{c.name}</p>
                    <p className="text-xs text-gray-500 truncate">{c.handle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleInvite(c)}
                    className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-extrabold uppercase tracking-wider border border-black border-b-2 transition hover:-translate-y-0.5 ${
                      isInvited
                        ? 'bg-white text-black hover:bg-white/80'
                        : 'bg-primary text-black hover:bg-primary/80'
                    }`}
                  >
                    {isInvited ? (
                      <>
                        <FiCheck className="h-3.5 w-3.5" />
                        Invited
                      </>
                    ) : (
                      <>
                        <FiUserPlus className="h-3.5 w-3.5" />
                        Invite
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </MockedSubPageLayout>
  );
}
