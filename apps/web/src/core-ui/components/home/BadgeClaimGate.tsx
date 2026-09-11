'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildServerAchievements } from '../../data/profile-badges';
import { useProfileAchievements } from '../../hooks';
import { useConfigStore, useModalQueueStore } from '../../stores';
import { AchievementModal } from '../pages/profile/AchievementModal';

/**
 * Badges already offered, per browser session rather than per device: the coins
 * stay unclaimed until the user acts on them, so closing the sheet costs the
 * offer for this run of the app and no longer. It also keeps a plain navigation
 * back to the home map from re-opening the same sheet.
 */
const PROMPTED_KEY = 'vaquita:badge-claim-prompted';

const readPrompted = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(PROMPTED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const persistPrompted = (ids: Set<string>) => {
  try {
    window.sessionStorage.setItem(PROMPTED_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode / storage disabled: the badge is simply offered again later.
  }
};

/**
 * Opens the claim sheet on the home map when the wallet has a badge waiting, so
 * the reward isn't buried in /profile/achievements.
 *
 * Eligibility comes from the server's `claimState` and nothing else.
 * `buildAchievements` recomputes `unlocked` for the built-in milestones out of
 * live client signals (streak, deposits, XP) and those lag the backend by a
 * refetch — prompting off them would open a sheet whose mint the contract then
 * refuses. {@link buildServerAchievements} trusts the badge response as-is,
 * which is exactly the question being asked here.
 *
 * One badge per visit to the home: several can come due at once (a new wallet
 * unlocks three on its first deposit) and chaining sheets would read as a
 * modal storm. The rest keep their pulsing halo on the achievements page.
 */
export function BadgeClaimGate() {
  const router = useRouter();
  const { network, walletAddress } = useConfigStore();
  const { data, isFetching, isFetchedAfterMount } = useProfileAchievements();

  // The full-screen prompts of the home go first; the version notes wait behind
  // this one. `HomePage` takes the turn on entry — this component mounts after
  // the game clock syncs, and by then a note would already have been shown.
  const pushNudgeSettled = useModalQueueStore((s) => s.pushNudgeSettled);
  const vaultPromptSettled = useModalQueueStore((s) => s.vaultPromptSettled);
  const homeTourSettled = useModalQueueStore((s) => s.homeTourSettled);
  const setBadgeClaimSettled = useModalQueueStore((s) => s.setBadgeClaimSettled);

  // Latched on open and held until the user closes. Claiming flips the badge to
  // `minted`, so it stops being the candidate below: driving the sheet off
  // `candidate` would tear it down mid coin-reveal.
  const [promptedId, setPromptedId] = useState<string | null>(null);
  // One offer per visit: latched when the user closes the sheet, so a second
  // badge coming due right after a claim doesn't chain another sheet.
  const [served, setServed] = useState(false);
  const offeredRef = useRef<Set<string> | null>(null);

  const badges = useMemo(() => buildServerAchievements(data?.achievements), [data?.achievements]);
  const candidate = useMemo(
    () => badges.find((b) => b.claimState === 'claimable' || b.claimState === 'pending_mint') ?? null,
    [badges],
  );

  // Without a badges contract on the active network the sheet renders no claim
  // button (`canClaim` in AchievementModal), so there is nothing to offer.
  const hasContract = !!network?.badgesContractAddress;
  const ourTurn = pushNudgeSettled && vaultPromptSettled && homeTourSettled;

  // Nothing may be decided off the react-query cache restored from disk: a
  // badge claimed in an earlier session (or on another device) still reads
  // `claimable` there, and acting on it burns the one offer of this visit on a
  // sheet that opens straight into "share your badge". So we wait for the
  // refetch this mount always fires. Mirrors the query's own `enabled` — a
  // query that never runs would otherwise park the turn forever, and the
  // version notes queued behind it would never open.
  const listRunning = !!network?.networkName && !!walletAddress;
  const listFresh = !listRunning || (isFetchedAfterMount && !isFetching);

  // Deciding and releasing live in the same effect on purpose: split in two,
  // whichever ran second in a commit would read the other's work as already
  // committed and release the turn on the same tick the sheet opens.
  useEffect(() => {
    if (offeredRef.current === null) offeredRef.current = readPrompted();
    // A sheet on screen, one already served this visit, or a list that is not
    // trustworthy yet: hold the turn.
    if (promptedId || served || !listFresh || !ourTurn) return;

    const offer = hasContract && candidate && !offeredRef.current.has(candidate.id) ? candidate : null;
    if (!offer) {
      setBadgeClaimSettled(true);
      return;
    }

    offeredRef.current.add(offer.id);
    persistPrompted(offeredRef.current);
    setPromptedId(offer.id);
  }, [promptedId, served, listFresh, ourTurn, hasContract, candidate, setBadgeClaimSettled]);

  // Resolved on every render so the open sheet reflects the badge as it is now:
  // the row survives the claim (its `claimState` becomes `minted`), which is
  // what lets the modal move on to its minted screen.
  const selected = promptedId ? (badges.find((b) => b.id === promptedId) ?? null) : null;

  // Mounted only from the moment there is something to show, and kept mounted
  // afterwards: the modal retains the last badge it rendered so the sheet can
  // slide out, and unmounting it on close would cut that animation off. Before
  // the first offer it stays out of the tree so the home doesn't carry its
  // queries (rewards, minted badges) for nothing.
  if (!promptedId && !served) return null;

  // Closing hands the queue back so the version notes can take their turn.
  const dismiss = () => {
    setServed(true);
    setPromptedId(null);
    setBadgeClaimSettled(true);
  };

  return (
    <AchievementModal
      achievement={selected}
      unlocked={selected?.unlocked ?? true}
      open={!!promptedId}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      // Only the badges the prompt didn't offer are left behind on the map, and
      // from here the trophy room is three taps away.
      onViewAchievements={() => {
        dismiss();
        router.push('/profile/achievements');
      }}
    />
  );
}
