'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';

/**
 * Watches the map and keeps it on screen.
 *
 * Every way the map has been seen to disappear is silent: no exception, no
 * console output, nothing a user could report beyond "it went blank". A page
 * may hold only so many WebGL contexts (~16 in Chrome) and the browser drops the
 * oldest to stay under that budget; a canvas rebuilt while the tab is hidden
 * never gets measured; an ancestor left mid-animation can be transparent or
 * parked off screen while the scene renders at full speed behind it.
 *
 * So the map is inspected on a timer rather than waited on for an event: the
 * context is repaired when it can be, and every episode is reported through
 * `onIssue` / `onRecovered` so the next one leaves a trace instead of a guess.
 */

/** Remounts spent on automatic recovery before the manual reload is offered. */
const MAX_ATTEMPTS = 3;
/** A context that survives this long counts as healthy and refunds the budget. */
const HEALTHY_AFTER_MS = 30_000;
/** How often a visible map is checked. */
const HEALTH_CHECK_MS = 2_000;
/**
 * Consecutive failed checks before an episode is reported. Mounting and layout
 * settle within one pass, and reporting those would bury the real cases.
 */
const CHECKS_BEFORE_REPORTING = 2;
/** Below this an ancestor's opacity leaves nothing for the eye. */
const MIN_VISIBLE_OPACITY = 0.05;

/** Why the map is not on screen, ordered from cheapest to detect. */
export type MapIssue =
  /** The GPU took the context back; nothing can paint until it is rebuilt. */
  | 'context_lost'
  /** The canvas never took its container's size, so it paints into nothing. */
  | 'canvas_unmeasured'
  /** The canvas is laid out entirely outside the viewport. */
  | 'offscreen'
  /** An ancestor is transparent or hidden, so the scene renders unseen. */
  | 'transparent';

export type WebGLRecovery = {
  /** Remount key for the Canvas: a new value builds a fresh context. */
  canvasKey: number;
  /** The automatic budget is spent; the map stays blank until `retry` runs. */
  exhausted: boolean;
  /** Wires a freshly created renderer into the recovery cycle. */
  registerRenderer: (gl: THREE.WebGLRenderer) => void;
  /** Refunds the budget and rebuilds the canvas. */
  retry: () => void;
};

type Options = {
  /** Runs on every loss with the attempt number and whether a rebuild follows. */
  onContextLost?: (attempt: number, willRetry: boolean) => void;
  /** Runs once when the map stops being visible, with what it was measured to be. */
  onIssue?: (issue: MapIssue, detail: { canvas: string; container: string }) => void;
  /** Runs once when the map comes back, with how long the episode lasted. */
  onRecovered?: (issue: MapIssue, seconds: number) => void;
};

export const useWebGLRecovery = ({ onContextLost, onIssue, onRecovered }: Options = {}): WebGLRecovery => {
  const [canvasKey, setCanvasKey] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const attemptsRef = useRef(0);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  /** The episode being lived through: what is wrong, since when, for how many checks. */
  const episodeRef = useRef<{ issue: MapIssue; since: number; checks: number; reported: boolean } | null>(null);
  // Read through refs so `registerRenderer` keeps a stable identity: it is
  // handed to the Canvas's `onCreated`, which runs once per context.
  const onContextLostRef = useRef(onContextLost);
  const onIssueRef = useRef(onIssue);
  const onRecoveredRef = useRef(onRecovered);

  useEffect(() => {
    onContextLostRef.current = onContextLost;
    onIssueRef.current = onIssue;
    onRecoveredRef.current = onRecovered;
  }, [onContextLost, onIssue, onRecovered]);

  /** Spends one rebuild from the budget, or gives up once it runs out. */
  const spendAttempt = useCallback(() => {
    if (!mountedRef.current) return;

    attemptsRef.current += 1;
    const willRetry = attemptsRef.current <= MAX_ATTEMPTS;
    onContextLostRef.current?.(attemptsRef.current, willRetry);

    if (!willRetry) {
      setExhausted(true);
      return;
    }
    setCanvasKey((key) => key + 1);
  }, []);

  const registerRenderer = useCallback(
    (gl: THREE.WebGLRenderer) => {
      // A rebuild registers its renderer while the listeners of the discarded
      // canvas are still attached.
      detachRef.current?.();

      glRef.current = gl;
      const canvas = gl.domElement;
      let healthyTimer = 0;

      const handleContextLost = (event: Event) => {
        // Without preventDefault the browser treats the loss as final and
        // refuses to hand out a replacement context.
        event.preventDefault();
        window.clearTimeout(healthyTimer);
        spendAttempt();
      };

      // How a page at the context limit fails: the browser hands out no context
      // at all, with no exception thrown and nothing logged.
      const handleCreationError = () => {
        window.clearTimeout(healthyTimer);
        attemptsRef.current = MAX_ATTEMPTS;
        spendAttempt();
      };

      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextcreationerror', handleCreationError);
      healthyTimer = window.setTimeout(() => {
        attemptsRef.current = 0;
      }, HEALTHY_AFTER_MS);

      detachRef.current = () => {
        window.clearTimeout(healthyTimer);
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextcreationerror', handleCreationError);
      };
    },
    [spendAttempt],
  );

  const retry = useCallback(() => {
    attemptsRef.current = 0;
    setExhausted(false);
    setCanvasKey((key) => key + 1);
  }, []);

  useEffect(() => {
    /** Walks up from the canvas looking for an ancestor that hides everything. */
    const isHiddenByAncestor = (canvas: HTMLCanvasElement): boolean => {
      for (let node: HTMLElement | null = canvas; node && node !== document.body; node = node.parentElement) {
        const style = window.getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none') return true;
        if (Number(style.opacity) < MIN_VISIBLE_OPACITY) return true;
      }
      return false;
    };

    /** What is wrong with the map right now, or null when it is on screen. */
    const findIssue = (): MapIssue | null => {
      const gl = glRef.current;
      const canvas = gl?.domElement;
      const container = canvas?.parentElement;
      if (!gl || !canvas || !container) return null;
      // A rebuild in flight still has the previous renderer in `glRef`, and its
      // context is lost by definition. Judging the map by a canvas the document
      // no longer holds would spend the whole budget on a single loss.
      if (!canvas.isConnected) return null;

      if (gl.getContext().isContextLost()) return 'context_lost';

      const box = container.getBoundingClientRect();
      // A container laid out to nothing is a screen in transition, not a fault.
      if (box.width < 1 || box.height < 1) return null;

      if (Math.abs(canvas.clientWidth - box.width) >= 1 || Math.abs(canvas.clientHeight - box.height) >= 1) {
        return 'canvas_unmeasured';
      }

      // Catches a container parked outside the viewport by an animation that
      // never ran: the scene keeps rendering where nobody can see it.
      const rect = canvas.getBoundingClientRect();
      const offscreen = rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth;
      if (offscreen) return 'offscreen';

      if (isHiddenByAncestor(canvas)) return 'transparent';

      return null;
    };

    const describe = (): { canvas: string; container: string } => {
      const canvas = glRef.current?.domElement;
      const container = canvas?.parentElement;
      const box = container?.getBoundingClientRect();
      return {
        canvas: canvas ? `${canvas.width}x${canvas.height}` : 'none',
        container: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none',
      };
    };

    const inspectCanvas = () => {
      // A hidden tab has nothing to repair yet, and rebuilding there would spend
      // the budget on a map nobody is looking at.
      if (document.visibilityState !== 'visible') return;

      const issue = findIssue();
      const episode = episodeRef.current;

      if (!issue) {
        if (episode?.reported) {
          onRecoveredRef.current?.(episode.issue, Math.round((Date.now() - episode.since) / 1000));
        }
        episodeRef.current = null;
        return;
      }

      if (episode?.issue === issue) {
        episode.checks += 1;
      } else {
        episodeRef.current = { issue, since: Date.now(), checks: 1, reported: false };
      }

      const current = episodeRef.current;
      if (current && !current.reported && current.checks >= CHECKS_BEFORE_REPORTING) {
        current.reported = true;
        onIssueRef.current?.(issue, describe());
      }

      // Repair what can be repaired. `offscreen` and `transparent` are someone
      // else's layout, so they are only reported.
      if (issue === 'context_lost') spendAttempt();
      if (issue === 'canvas_unmeasured') window.dispatchEvent(new Event('resize'));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      requestAnimationFrame(inspectCanvas);
    };

    // `onCreated` can land after this effect, leaving nothing to inspect on the
    // first pass, so the check repeats on a timer rather than running once.
    const frame = requestAnimationFrame(inspectCanvas);
    const poll = window.setInterval(inspectCanvas, HEALTH_CHECK_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [canvasKey, spendAttempt]);

  useEffect(() => {
    mountedRef.current = true;
    // Nothing is torn down here on purpose. React runs this cleanup on every
    // remount in development, and the canvas outlives it: releasing the context
    // or dropping the listeners at that point would leave a live map with a dead
    // context and no way back. R3F already releases the context when the Canvas
    // unmounts for real, and the listeners live on a canvas that goes with it.
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { canvasKey, exhausted, registerRenderer, retry };
};
