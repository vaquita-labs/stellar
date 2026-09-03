'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';

/**
 * Keeps the map's WebGL context alive across losses.
 *
 * A page may hold only so many WebGL contexts (~16 in Chrome) and the browser
 * drops the oldest ones to stay under that budget; mobile browsers also drop
 * them while the page sits in the background. Neither path raises a JS error —
 * the canvas just stops painting and the map reads as a blank rectangle — so
 * recovery hangs on the `webglcontextlost` event, and the Canvas is rebuilt
 * through `canvasKey` to obtain a fresh context.
 */

/** Remounts spent on automatic recovery before the manual reload is offered. */
const MAX_ATTEMPTS = 3;
/** A context that survives this long counts as healthy and refunds the budget. */
const HEALTHY_AFTER_MS = 30_000;
/** How often a visible map is checked for a loss that reached no listener. */
const HEALTH_CHECK_MS = 2_000;

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
};

export const useWebGLRecovery = ({ onContextLost }: Options = {}): WebGLRecovery => {
  const [canvasKey, setCanvasKey] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const attemptsRef = useRef(0);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  // Read through a ref so `registerRenderer` keeps a stable identity: it is
  // handed to the Canvas's `onCreated`, which runs once per context.
  const onContextLostRef = useRef(onContextLost);

  useEffect(() => {
    onContextLostRef.current = onContextLost;
  }, [onContextLost]);

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

  // Two states leave a canvas that never paints, and neither announces itself:
  //
  // - A context lost between the renderer being built and this hook wiring
  //   itself to it reaches no listener, so the state is read from the context
  //   directly rather than waited for as an event.
  // - R3F sizes the canvas from a ResizeObserver on its container, and those
  //   callbacks are not delivered while the tab is hidden: a canvas rebuilt in
  //   the background keeps the 300x150 default even once its context is healthy.
  //
  // Both are checked after every rebuild and whenever the tab comes back.
  useEffect(() => {
    const inspectCanvas = () => {
      // A hidden tab has nothing to repair yet, and rebuilding there would spend
      // the budget on a map nobody is looking at.
      if (document.visibilityState !== 'visible') return;

      const gl = glRef.current;
      const canvas = gl?.domElement;
      const container = canvas?.parentElement;
      if (!gl || !canvas || !container) return;
      // A rebuild in flight still has the previous renderer in `glRef`, and its
      // context is lost by definition. Judging the map by a canvas the document
      // no longer holds would spend the whole budget on a single loss.
      if (!canvas.isConnected) return;

      if (gl.getContext().isContextLost()) {
        spendAttempt();
        return;
      }

      const { width, height } = container.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      if (Math.abs(canvas.clientWidth - width) < 1 && Math.abs(canvas.clientHeight - height) < 1) return;

      window.dispatchEvent(new Event('resize'));
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
