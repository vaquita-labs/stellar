'use client';

import { getJson } from '@/core-ui/api/http';
import { toast } from '@heroui/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggleFollow } from '../../hooks';
import { useConfigStore } from '../../stores';

/**
 * Follow deep links (`?follow=<wallet>` — the URL encoded in profile QRs and
 * share links) must survive the whole signup funnel: an unregistered scanner
 * gets bounced through /login, the username prompt and /tutorial, and every
 * one of those hops rewrites the URL. So the link is handled in two halves:
 *
 * - `FollowLinkCapture` runs on every (private) route BEFORE the auth gate.
 *   It stashes the target wallet in localStorage and strips the param, so the
 *   intent survives login redirects, onboarding and refreshes.
 * - `PendingFollowConsumer` runs INSIDE the gates (authenticated + username
 *   chosen), executes the follow once the viewer's wallet exists, and clears
 *   the stash. For a brand-new user this fires right after onboarding — they
 *   leave the funnel already following the vaquero whose QR they scanned.
 */

const PENDING_FOLLOW_KEY = 'vaquita-pending-follow';

/** Stellar public keys: `G` + 55 base32 chars. */
const STELLAR_WALLET_RE = /^G[A-Z2-7]{55}$/;

export function FollowLinkCapture() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('follow')?.trim();
    if (!target || !STELLAR_WALLET_RE.test(target.toUpperCase())) return;
    try {
      localStorage.setItem(PENDING_FOLLOW_KEY, target);
    } catch {
      // Storage unavailable (private mode quota) — the param stays in the URL
      // and a later mount retries, so worst case the link just needs a reload.
      return;
    }
    params.delete('follow');
    const rest = params.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname);
  }, [pathname, router]);

  return null;
}

export function PendingFollowConsumer() {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const toggleFollow = useToggleFollow();
  // One attempt per mount — the stash is cleared up-front so a flaky request
  // can't retrigger follows on every navigation.
  const handledRef = useRef(false);

  useEffect(() => {
    if (!walletAddress || handledRef.current) return;
    let target: string | null = null;
    try {
      target = localStorage.getItem(PENDING_FOLLOW_KEY)?.trim() || null;
    } catch {
      return;
    }
    if (!target) return;
    handledRef.current = true;
    try {
      localStorage.removeItem(PENDING_FOLLOW_KEY);
    } catch {
      // Best effort — the self-check below keeps a stale value harmless.
    }
    if (target.toUpperCase() === walletAddress.toUpperCase()) return;
    const wallet = target;
    void (async () => {
      try {
        // 404 → null: stale or malformed link; fail silently.
        const profile = await getJson<{ nickname?: string | null }>(
          `/profile/wallet/${encodeURIComponent(wallet)}`,
          [404]
        );
        if (!profile) return;
        await toggleFollow.mutateAsync({ targetWallet: wallet, isFollowing: false });
        const nick = profile.nickname?.trim();
        const handle = nick ? `@${nick.replace(/\s+/g, '')}` : `@vaquero${wallet.slice(-4)}`;
        toast.success(t('social.share.nowFollowing', { handle }));
      } catch {
        // A broken link shouldn't error whatever page the user landed on.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, t]);

  return null;
}
