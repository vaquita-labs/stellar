'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileData, useRestProfile } from '../../../hooks';
import { useModalQueueStore } from '../../../stores';
import { ProfileResponseDTO } from '../../../types';
import { PressableButton } from '../../molecules/PressableButton';
import { HOME_TOUR_STEPS, HomeTourStep } from './homeTourConfig';
import { TutorialFocusLock } from './TutorialFocusLock';

/** How often to look for the anchors and for a modal that outranks the tour. */
const POLL_MS = 200;

/**
 * How long to keep waiting for every anchor before starting with whichever ones
 * are up. The header, the map and the action row mount at different times, so
 * measuring immediately would drop steps that were only late; waiting forever
 * would mean no tour at all on a layout where some anchor never appears.
 */
const ANCHOR_WAIT_MS = 2500;

/** Below this many resolvable steps the tour is not worth showing at all. */
const MIN_STEPS = 2;

/**
 * Guided tour of the REAL home: one coach mark per button, in the order the
 * user meets them — the money buttons first, then the balance, the daily chest,
 * the side rail, and finally profile and help, which sit next to each other.
 *
 * Every step is explanatory, not an instruction: the element is dimmed into a
 * cutout and made *unclickable* (`blockTarget`), because a tap on the real
 * profile button would navigate away and lose the tour. The user moves with the
 * card's own button.
 *
 * Steps whose anchor is not on screen are dropped before the tour starts, so the
 * progress dots always match what the user is actually going to see. That covers
 * the desktop layout, where the chest and the side rail live in the sidebar
 * instead of over the map, and the map's edit mode, where the action row is
 * unmounted entirely.
 */
export function HomeTour() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useProfileData();
  const { saveProfileFlags } = useRestProfile();
  const queryClient = useQueryClient();

  const setHomeTourSettled = useModalQueueStore((s) => s.setHomeTourSettled);
  // The notification permission is the one ask that expires, so it goes first.
  // The `[role="dialog"]` poll below would already defer to the open sheet; this
  // flag is what stops the tour starting in the gap before the sheet opens.
  const pushNudgeSettled = useModalQueueStore((s) => s.pushNudgeSettled);

  const [steps, setSteps] = useState<HomeTourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  // The profile answered and the user has not seen the tour.
  //
  // Deliberately NOT gated on `vaultPromptSettled`: that flag is only released
  // once the custodial balance loads or errors, and when neither happens it
  // stays false forever — which would mean no tour at all, silently. What we
  // actually need is narrower and is checked below: do not draw coach marks
  // while a modal is on screen.
  const wanted = !isLoading && !isError && !!data && !done && !data.homeTourCompleted;

  // Steps that resolved to nothing are already gone; under this many, what is
  // left is not a tour and the user is better off with no overlay at all.
  const showing = wanted && !!steps && steps.length >= MIN_STEPS;

  // `HomePage` takes the queue turn before the map even mounts (see the comment
  // there). Here we give it back — the moment we know the tour is not coming,
  // or as soon as it ends — so the badge sheet and the release notes can open.
  useEffect(() => {
    if (!wanted || (!!steps && steps.length < MIN_STEPS)) setHomeTourSettled(true);
  }, [wanted, steps, setHomeTourSettled]);

  // Decide once which steps this screen can actually show, then start.
  //
  // Waits for a modal to close first: the idle-funds prompt is a decision about
  // the user's money and the coach marks must not cover it. Starts as soon as
  // every anchor is up — no fixed delay to guess at — and settles for whichever
  // ones exist after `ANCHOR_WAIT_MS`, which is what makes the desktop layout
  // (no chest, no side rail over the map) show a shorter tour instead of none.
  const waitStartedAt = useRef(0);
  useEffect(() => {
    if (!wanted || steps || !pushNudgeSettled) return;
    waitStartedAt.current = Date.now();
    const id = window.setInterval(() => {
      if (document.querySelector('[role="dialog"]')) return;
      const found = HOME_TOUR_STEPS.filter((s) => document.querySelector(s.spotlight));
      if (found.length === HOME_TOUR_STEPS.length || Date.now() - waitStartedAt.current >= ANCHOR_WAIT_MS) {
        setSteps(found);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [wanted, steps, pushNudgeSettled]);

  const finish = useCallback(() => {
    // Marked locally first: the tour disappears on the tap, it does not wait for
    // the round trip, and a failed write only costs the user seeing it again.
    setDone(true);
    void saveProfileFlags({ homeTourCompleted: true });
    queryClient.setQueryData<ProfileResponseDTO>(['profile', data?.networkName, data?.walletAddress, 'profile-data'], (old) =>
      old ? { ...old, homeTourCompleted: true } : old,
    );
  }, [saveProfileFlags, queryClient, data?.networkName, data?.walletAddress]);

  const step = steps && index < steps.length ? steps[index] : null;
  const isLast = !!steps && index === steps.length - 1;

  const footer = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {!isLast && (
          <PressableButton variant="ghost" size="md" onClick={finish} className="px-3">
            <span className="text-sm text-black/60">{t('homeTour.skip', 'Skip')}</span>
          </PressableButton>
        )}
        <PressableButton
          variant="success"
          size="md"
          onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
          className="flex-1"
        >
          <span className="text-base font-medium text-black">
            {isLast ? t('homeTour.done', 'Got it') : t('homeTour.next', 'Next')}
          </span>
        </PressableButton>
      </div>
    ),
    [isLast, finish, t],
  );

  if (!showing || !step) return null;

  return (
    <TutorialFocusLock
      key={step.id}
      selector={step.spotlight}
      pad={step.pad}
      pinTop={step.pinTop}
      blockTarget
      title={t(step.titleKey)}
      message={t(step.bodyKey)}
      footer={footer}
      dotIndex={index}
      dotCount={steps.length}
    />
  );
}
