'use client';

import { useFriendSuggestions, useToggleFollow } from '@/core-ui/hooks';
import type { FriendSuggestionDTO } from '@/core-ui/types';
import { toast } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import React, { useState } from 'react';
import {
  FiArrowLeft,
  FiBookOpen,
  FiChevronRight,
  FiLoader,
  FiSearch,
  FiShare2,
  FiX,
} from 'react-icons/fi';

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function ActionRow({
  icon,
  label,
  onPress,
  href,
  disabled,
  soon,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  href?: string;
  disabled?: boolean;
  soon?: boolean;
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
      {soon && (
        <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-black border border-black border-b-2 rounded-full px-2.5 py-0.5 shrink-0">
          Soon
        </span>
      )}
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
  loading,
  onToggleFollow,
  onDismiss,
}: {
  suggestion: FriendSuggestionDTO;
  followed: boolean;
  loading: boolean;
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
          src={suggestion.avatarUrl || '/vaquita/vaquita_isotipo.svg'}
          alt={suggestion.name}
          width={56}
          height={56}
          className="object-contain"
        />
      </div>

      <div className="text-center min-w-0 w-full px-1">
        <p className="text-sm font-extrabold text-black truncate">{suggestion.name}</p>
        <p className="text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
          {suggestion.followedBy ? (
            <>
              Followed by <span className="font-semibold text-gray-600">{suggestion.followedBy}</span>
            </>
          ) : (
            'Suggested for you'
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggleFollow}
        disabled={loading}
        aria-busy={loading}
        aria-pressed={followed}
        className={`mt-1 w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider border border-black border-b-3 transition ${
          loading ? 'opacity-70 cursor-wait' : 'hover:-translate-y-0.5'
        } ${
          followed ? 'bg-white text-black hover:bg-white/80' : 'bg-primary text-black hover:bg-primary/80'
        }`}
      >
        {loading && <FiLoader className="h-3 w-3 animate-spin" />}
        {followed ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function FriendsPage() {
  const { data, isLoading } = useFriendSuggestions();
  const toggleFollow = useToggleFollow();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);

  const suggestions = data?.suggestions ?? [];
  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.walletAddress));

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

  const handleToggleFollow = (wallet: string) => {
    const isFollowing = following.has(wallet);
    // Optimistically flip the button; roll back on error.
    setFollowing((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(wallet);
      else next.add(wallet);
      return next;
    });
    setPendingWallet(wallet);
    toggleFollow.mutate(
      { targetWallet: wallet, isFollowing },
      {
        onError: () => {
          setFollowing((prev) => {
            const next = new Set(prev);
            if (isFollowing) next.add(wallet);
            else next.delete(wallet);
            return next;
          });
        },
        onSettled: () => setPendingWallet(null),
      },
    );
  };

  const dismiss = (wallet: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(wallet);
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6 pb-12">
        {/* Header: back arrow on the left + centered title. The title is
            absolutely centered on the row so it stays optically balanced
            regardless of the back-button width. */}
        <header className="relative flex items-center justify-center h-9">
          <Link
            href="/profile"
            aria-label="Back"
            className="absolute left-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
          >
            <FiArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg sm:text-xl font-extrabold text-black tracking-tight">
            Find your friends
          </h1>
        </header>

        {/* Find actions */}
        <section className="flex flex-col gap-3">
          <ActionRow
            icon={<FiBookOpen className="h-5 w-5" />}
            label="Choose from contacts"
            href="/profile/friends/contacts"
            soon
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
          </div>

          {isLoading ? (
            <div className="flex gap-3 overflow-hidden" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="shrink-0 w-40 sm:w-44 h-[164px] rounded-2xl border border-black border-b-2 bg-white animate-pulse"
                />
              ))}
            </div>
          ) : visibleSuggestions.length === 0 ? (
            <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-black">No suggestions right now</p>
              <p className="text-xs text-gray-500 mt-1">Check back soon for new vaqueros to follow.</p>
            </div>
          ) : (
            // Bleed the carousel out to the viewport edges and re-add the page
            // padding inside as scroll padding. That way snap-start lands the
            // first card flush with the content gutter instead of leaving it
            // half-cropped behind the page padding.
            <div
              className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:-mx-6 px-4 sm:px-6 scroll-px-4 sm:scroll-px-6 [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.3)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-black/30 [&::-webkit-scrollbar-thumb]:rounded-full snap-x snap-mandatory"
              aria-label="Friend suggestions"
            >
              {visibleSuggestions.map((s) => (
                <div key={s.walletAddress} className="snap-start">
                  <SuggestionCard
                    suggestion={s}
                    followed={following.has(s.walletAddress)}
                    loading={pendingWallet === s.walletAddress}
                    onToggleFollow={() => handleToggleFollow(s.walletAddress)}
                    onDismiss={() => dismiss(s.walletAddress)}
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
