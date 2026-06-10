'use client';

import { Modal } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiLoader, FiUserPlus, FiX } from 'react-icons/fi';
import {
  useFollowCounts,
  useFollowList,
  useIsMobile,
  useToggleFollow,
  type FollowListKind,
} from '../../../hooks';
import type { FriendDTO } from '../../../types';

interface FollowListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which tab to show first when the modal opens. */
  initialTab: FollowListKind;
}

/* ------------------------------------------------------------------ */
/* Row                                                                */
/* ------------------------------------------------------------------ */

function FriendRow({
  friend,
  pending,
  onToggleFollow,
  onNavigate,
}: {
  friend: FriendDTO;
  pending: boolean;
  onToggleFollow: () => void;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-black/10 bg-white">
      <Link
        href={`/leaderboard/${friend.walletAddress}`}
        onClick={onNavigate}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <div className="relative h-11 w-11 rounded-full bg-[#FFE7C7] border border-black/15 flex items-center justify-center overflow-hidden shrink-0">
          {friend.avatarUrl ? (
            // Real uploaded photo: fill the circle (object-cover), same as ProfilePage.
            <Image
              src={friend.avatarUrl}
              alt={friend.name}
              fill
              sizes="44px"
              className="object-cover"
            />
          ) : (
            <Image
              src="/vaquita/vaquita_isotipo.svg"
              alt={friend.name}
              width={36}
              height={36}
              className="object-contain"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-black truncate">{friend.name}</p>
          <p className="text-xs text-gray-500 truncate">{friend.handle}</p>
          <p className="text-[11px] font-bold text-gray-400 tabular-nums mt-0.5">
            {t('social.search.followers', { count: friend.followers })}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={onToggleFollow}
        disabled={pending}
        aria-busy={pending}
        aria-pressed={friend.isFollowing}
        className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-extrabold uppercase tracking-wider border border-black border-b-2 transition shrink-0 ${
          pending ? 'opacity-70 cursor-wait' : 'hover:-translate-y-0.5'
        } ${
          friend.isFollowing
            ? 'bg-white text-black hover:bg-white/80'
            : 'bg-primary text-black hover:bg-primary/80'
        }`}
      >
        {pending ? (
          <FiLoader className="h-3.5 w-3.5 animate-spin" />
        ) : friend.isFollowing ? (
          <FiCheck className="h-3.5 w-3.5" />
        ) : (
          <FiUserPlus className="h-3.5 w-3.5" />
        )}
        {friend.isFollowing ? t('social.search.following') : t('social.search.follow')}
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* List body for one tab                                              */
/* ------------------------------------------------------------------ */

function TabBody({
  kind,
  enabled,
  onNavigate,
}: {
  kind: FollowListKind;
  enabled: boolean;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const { data: friends = [], isLoading, isError, isFetching } = useFollowList(kind, enabled);
  const toggleFollow = useToggleFollow();

  // The wallet whose Follow button is mid-flight — held until both the mutation
  // and the list refetch it triggers settle, so the spinner spans the round trip.
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  useEffect(() => {
    if (pendingWallet && !toggleFollow.isPending && !isFetching) {
      setPendingWallet(null);
    }
  }, [pendingWallet, toggleFollow.isPending, isFetching]);

  const onToggleFollow = (friend: FriendDTO) => {
    setPendingWallet(friend.walletAddress);
    toggleFollow.mutate({ targetWallet: friend.walletAddress, isFollowing: friend.isFollowing });
  };

  if (isLoading) {
    return (
      <ul className="flex flex-col gap-2.5 px-4" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="h-[72px] rounded-2xl border border-black/10 bg-white animate-pulse" />
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <p className="px-6 py-10 text-center text-sm font-bold text-gray-500">
        {t('profilePages.profile.followListError', "Couldn't load the list. Try again.")}
      </p>
    );
  }

  if (friends.length === 0) {
    const isFollowing = kind === 'following';
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm font-extrabold text-black">
          {isFollowing
            ? t('profilePages.profile.followingEmptyTitle', 'Not following anyone yet')
            : t('profilePages.profile.followersEmptyTitle', 'No followers yet')}
        </p>
        <p className="mt-1 text-xs text-gray-500 max-w-xs mx-auto">
          {isFollowing
            ? t('profilePages.profile.followingEmptyBody', 'Follow vaqueros from the leaderboard to see them here.')
            : t('profilePages.profile.followersEmptyBody', "When vaqueros follow you, they'll show up here.")}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5 px-4">
      {friends.map((f) => (
        <FriendRow
          key={f.walletAddress}
          friend={f}
          pending={pendingWallet === f.walletAddress}
          onToggleFollow={() => onToggleFollow(f)}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */

/**
 * The /profile follow modal. Two tabs — Following and Followers — each a live
 * `FriendDTO` list with a working follow/unfollow toggle. Lists are only
 * fetched while the modal is open (and only the active tab), and the toggle
 * reconciles counts + lists through `useToggleFollow`.
 */
export function FollowListModal({ open, onOpenChange, initialTab }: FollowListModalProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<FollowListKind>(initialTab);
  const { data: counts } = useFollowCounts();

  // Re-sync the active tab to the one the user tapped each time the modal opens.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const handleClose = () => onOpenChange(false);

  const TabButton = ({ value, label, count }: { value: FollowListKind; label: string; count: number }) => {
    const active = tab === value;
    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        aria-pressed={active}
        className={`flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-sm font-extrabold uppercase tracking-wider border-b-2 transition ${
          active ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'
        }`}
      >
        {label}
        <span className="tabular-nums">{count}</span>
      </button>
    );
  };

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
      className="bg-black/70 backdrop-blur-sm data-[exiting=true]:duration-300"
    >
      <Modal.Container
        size={isMobile ? 'full' : 'md'}
        placement={isMobile ? 'bottom' : 'center'}
        scroll="inside"
        className={isMobile ? 'p-0! m-0!' : 'p-4!'}
      >
        <Modal.Dialog
          className={
            isMobile
              ? 'bg-background m-0! p-0! rounded-t-3xl border-0 max-h-dvh data-[exiting=true]:duration-300'
              : 'bg-background p-0! rounded-3xl border border-black border-b-2 w-full max-w-md h-[min(620px,90dvh)] data-[exiting=true]:duration-300'
          }
        >
          <div className={`flex flex-col w-full ${isMobile ? 'h-full min-h-dvh' : 'h-full'}`}>
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-end px-4 py-3 bg-background">
              <button
                type="button"
                onClick={handleClose}
                aria-label={t('common.close', 'Close')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-stretch px-4 border-b border-black/10">
              <TabButton
                value="following"
                label={t('profilePages.profile.following', 'Following')}
                count={counts?.following ?? 0}
              />
              <TabButton
                value="followers"
                label={t('profilePages.profile.followers', 'Followers')}
                count={counts?.followers ?? 0}
              />
            </div>

            {/* Body — only the active tab fetches, both stay mounted to keep state. */}
            <div className="flex-1 overflow-y-auto py-3">
              {tab === 'following' ? (
                <TabBody kind="following" enabled={open} onNavigate={handleClose} />
              ) : (
                <TabBody kind="followers" enabled={open} onNavigate={handleClose} />
              )}
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
