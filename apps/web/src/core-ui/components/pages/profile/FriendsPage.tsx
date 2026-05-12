'use client';

import { toast } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import {
  FiArrowLeft,
  FiBookOpen,
  FiChevronRight,
  FiSearch,
  FiShare2,
  FiX,
} from 'react-icons/fi';

/* ------------------------------------------------------------------ */
/* Mock friend suggestions                                            */
/* ------------------------------------------------------------------ */

type Suggestion = {
  id: string;
  name: string;
  followedBy: string;
};

const buildSuggestions = (): Suggestion[] => [
  { id: 's-1', name: 'Rafaela.', followedBy: 'Bianka Arce' },
  { id: 's-2', name: 'Zulma', followedBy: 'Carlos Jhesid L.' },
  { id: 's-3', name: 'Camilo', followedBy: 'Andrea Alvarez' },
  { id: 's-4', name: 'Daniela', followedBy: 'Mateo Velez' },
  { id: 's-5', name: 'Tomás', followedBy: 'Sofía Castro' },
];

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function ActionRow({
  icon,
  label,
  onPress,
  href,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const inner = (
    <div
      className={`flex items-center gap-3 px-4 py-4 rounded-2xl border border-black border-b-2 bg-white transition ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:bg-[#FFF7E6] cursor-pointer'
      }`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
        {icon}
      </span>
      <p className="text-[15px] font-extrabold text-black flex-1 min-w-0 truncate">{label}</p>
      <FiChevronRight className="text-gray-500 shrink-0" />
    </div>
  );

  if (disabled) return <div aria-disabled>{inner}</div>;
  if (href) return <Link href={href}>{inner}</Link>;
  return (
    <button type="button" onClick={onPress} className="block w-full text-left bg-transparent">
      {inner}
    </button>
  );
}

function SuggestionCard({
  suggestion,
  followed,
  onToggleFollow,
  onDismiss,
}: {
  suggestion: Suggestion;
  followed: boolean;
  onToggleFollow: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="relative shrink-0 w-40 sm:w-44 rounded-2xl border border-black border-b-2 bg-white p-3 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        className="absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-black hover:bg-black/5 transition bg-transparent"
      >
        <FiX className="h-3.5 w-3.5" />
      </button>

      <div className="h-16 w-16 rounded-full bg-[#FFE7C7] border-2 border-black border-b-4 flex items-center justify-center overflow-hidden mt-1">
        <Image
          src="/vaquita/vaquita_isotipo.svg"
          alt={suggestion.name}
          width={56}
          height={56}
          className="object-contain"
        />
      </div>

      <div className="text-center min-w-0 w-full px-1">
        <p className="text-sm font-extrabold text-black truncate">{suggestion.name}</p>
        <p className="text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
          Followed by <span className="font-semibold text-gray-600">{suggestion.followedBy}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={onToggleFollow}
        className={`mt-1 w-full h-9 inline-flex items-center justify-center rounded-md text-[11px] font-extrabold uppercase tracking-wider border border-black border-b-3 transition hover:-translate-y-0.5 ${
          followed
            ? 'bg-white text-black hover:bg-white/80'
            : 'bg-primary text-black hover:bg-primary/80'
        }`}
      >
        {followed ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function FriendsPage() {
  const suggestions = useMemo(buildSuggestions, []);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));

  const handleShareLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://vaquita.finance';
    const text = 'Follow me on Vaquita 🐮';
    try {
      if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: unknown }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: 'Vaquita',
          text,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(`${text} — ${url}`);
      toast.success('Follow link copied to clipboard');
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      if (message && !message.toLowerCase().includes('abort')) {
        toast.danger('Could not share', { description: message });
      }
    }
  };

  const toggleFollow = (id: string) => {
    setFollowing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6 pb-12">
        {/* Header: back arrow + left-aligned title (Duolingo-style) */}
        <header className="flex flex-col gap-4">
          <Link
            href="/profile"
            aria-label="Back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
          >
            <FiArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
            Find your friends
          </h1>
        </header>

        {/* Find actions */}
        <section className="flex flex-col gap-3">
          <ActionRow
            icon={<FiBookOpen className="h-5 w-5" />}
            label="Choose from contacts"
            href="/profile/friends/contacts"
          />
          <ActionRow
            icon={<FiSearch className="h-5 w-5" />}
            label="Search by name"
            href="/profile/friends/search"
          />
          <ActionRow
            icon={<FiShare2 className="h-5 w-5" />}
            label="Share follow link"
            onPress={handleShareLink}
          />
        </section>

        {/* Friend suggestions */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base sm:text-lg font-extrabold text-black">Friend suggestions</h2>
            <button
              type="button"
              className="text-xs font-extrabold uppercase tracking-wider text-primary hover:text-primary/80 transition bg-transparent"
              aria-label="View all suggestions"
            >
              View all
            </button>
          </div>

          {visibleSuggestions.length === 0 ? (
            <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-black">No more suggestions right now</p>
              <p className="text-xs text-gray-500 mt-1">Check back soon for new vaqueros to follow.</p>
            </div>
          ) : (
            <div
              className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.3)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-black/30 [&::-webkit-scrollbar-thumb]:rounded-full snap-x"
              aria-label="Friend suggestions"
            >
              {visibleSuggestions.map((s) => (
                <div key={s.id} className="snap-start">
                  <SuggestionCard
                    suggestion={s}
                    followed={following.has(s.id)}
                    onToggleFollow={() => toggleFollow(s.id)}
                    onDismiss={() => dismiss(s.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
