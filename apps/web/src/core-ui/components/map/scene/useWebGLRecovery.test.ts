/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebGLRecovery } from './useWebGLRecovery';

/** Matches HEALTH_CHECK_MS in the hook. */
const HEALTH_CHECK_MS = 2_000;
/** Matches MAX_ATTEMPTS in the hook. */
const MAX_ATTEMPTS = 3;

type FakeRenderer = {
  gl: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  setContextLost: (lost: boolean) => void;
};

/**
 * The hook only ever asks a renderer for its canvas and whether its context is
 * still alive, so a stub covering those two is enough to drive every path.
 */
const makeRenderer = ({ contextLost = false, attached = true } = {}): FakeRenderer => {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  if (attached) document.body.appendChild(container);

  let lost = contextLost;
  const gl = {
    domElement: canvas,
    getContext: () => ({ isContextLost: () => lost }),
  } as unknown as THREE.WebGLRenderer;

  return { gl, canvas, container, setContextLost: (value: boolean) => (lost = value) };
};

/** Sizes the pair so the canvas measures up to its container, as a live map does. */
const matchCanvasToContainer = ({ canvas, container }: FakeRenderer, size: number) => {
  container.getBoundingClientRect = () => ({ width: size, height: size }) as DOMRect;
  Object.defineProperty(canvas, 'clientWidth', { value: size, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: size, configurable: true });
};

const loseContext = (canvas: HTMLCanvasElement) => {
  const event = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useWebGLRecovery', () => {
  it('rebuilds the canvas when the browser takes the context away', () => {
    const onContextLost = vi.fn();
    const { result } = renderHook(() => useWebGLRecovery({ onContextLost }));
    const first = makeRenderer();

    act(() => result.current.registerRenderer(first.gl));
    const keyBefore = result.current.canvasKey;

    let event!: Event;
    act(() => {
      event = loseContext(first.canvas);
    });

    // Without preventDefault the browser treats the loss as final and hands out
    // no replacement, so the rebuild would land on a dead canvas.
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.canvasKey).not.toBe(keyBefore);
    expect(onContextLost).toHaveBeenCalledWith(1, true);
    expect(result.current.exhausted).toBe(false);
  });

  it('gives up after spending the budget instead of rebuilding forever', () => {
    const onContextLost = vi.fn();
    const { result } = renderHook(() => useWebGLRecovery({ onContextLost }));

    // Every rebuild registers its own renderer, and here each one loses its
    // context immediately: what a page at the browser's context limit does.
    for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
      const renderer = makeRenderer();
      act(() => result.current.registerRenderer(renderer.gl));
      act(() => void loseContext(renderer.canvas));
    }

    expect(result.current.exhausted).toBe(true);
    expect(onContextLost).toHaveBeenLastCalledWith(MAX_ATTEMPTS + 1, false);

    const keyAfterGivingUp = result.current.canvasKey;
    const extra = makeRenderer();
    act(() => result.current.registerRenderer(extra.gl));
    act(() => void loseContext(extra.canvas));
    expect(result.current.canvasKey).toBe(keyAfterGivingUp);
  });

  it('refunds the budget and rebuilds when the reload is asked for', () => {
    const { result } = renderHook(() => useWebGLRecovery());

    for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
      const renderer = makeRenderer();
      act(() => result.current.registerRenderer(renderer.gl));
      act(() => void loseContext(renderer.canvas));
    }
    expect(result.current.exhausted).toBe(true);

    const keyBefore = result.current.canvasKey;
    act(() => result.current.retry());

    expect(result.current.exhausted).toBe(false);
    expect(result.current.canvasKey).not.toBe(keyBefore);
  });

  it('catches a context lost before the hook could listen for the event', () => {
    const onContextLost = vi.fn();
    const { result } = renderHook(() => useWebGLRecovery({ onContextLost }));
    // The renderer exists for a moment before `onCreated` runs: a loss in that
    // window reaches no listener and is only visible by reading the context.
    const dead = makeRenderer({ contextLost: true });

    act(() => result.current.registerRenderer(dead.gl));
    const keyBefore = result.current.canvasKey;

    act(() => vi.advanceTimersByTime(HEALTH_CHECK_MS));

    expect(result.current.canvasKey).not.toBe(keyBefore);
    expect(onContextLost).toHaveBeenCalledWith(1, true);
  });

  it('ignores a canvas the document no longer holds', () => {
    const onContextLost = vi.fn();
    const { result } = renderHook(() => useWebGLRecovery({ onContextLost }));
    // A rebuild in flight leaves the previous renderer behind, and its context
    // is lost by definition. Judging the map by it would spend the whole budget
    // on a single loss and cover a working map with the reload prompt.
    const discarded = makeRenderer({ contextLost: true, attached: false });

    act(() => result.current.registerRenderer(discarded.gl));
    const keyBefore = result.current.canvasKey;

    act(() => vi.advanceTimersByTime(HEALTH_CHECK_MS * 3));

    expect(result.current.canvasKey).toBe(keyBefore);
    expect(onContextLost).not.toHaveBeenCalled();
  });

  it('leaves a healthy canvas alone however long it is watched', () => {
    const onContextLost = vi.fn();
    const { result } = renderHook(() => useWebGLRecovery({ onContextLost }));
    const healthy = makeRenderer();
    matchCanvasToContainer(healthy, 800);

    act(() => result.current.registerRenderer(healthy.gl));
    const keyBefore = result.current.canvasKey;

    act(() => vi.advanceTimersByTime(HEALTH_CHECK_MS * 10));

    expect(result.current.canvasKey).toBe(keyBefore);
    expect(result.current.exhausted).toBe(false);
    expect(onContextLost).not.toHaveBeenCalled();
  });

  it('gives up at once when the browser refuses to hand out a context', () => {
    const onContextLost = vi.fn();
    const { result } = renderHook(() => useWebGLRecovery({ onContextLost }));
    const renderer = makeRenderer();

    act(() => result.current.registerRenderer(renderer.gl));
    act(() => void renderer.canvas.dispatchEvent(new Event('webglcontextcreationerror')));

    // Rebuilding is pointless when the page cannot get a context at all.
    expect(result.current.exhausted).toBe(true);
    expect(onContextLost).toHaveBeenCalledWith(MAX_ATTEMPTS + 1, false);
  });

  it('asks for a fresh measurement when the canvas does not match its container', () => {
    const { result } = renderHook(() => useWebGLRecovery());
    const renderer = makeRenderer();
    // What a canvas rebuilt in a hidden tab looks like: a healthy context at the
    // default size, painting nothing, because no resize was ever delivered.
    renderer.container.getBoundingClientRect = () => ({ width: 800, height: 600 }) as DOMRect;
    Object.defineProperty(renderer.canvas, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(renderer.canvas, 'clientHeight', { value: 150, configurable: true });

    const onResize = vi.fn();
    window.addEventListener('resize', onResize);

    act(() => result.current.registerRenderer(renderer.gl));
    act(() => vi.advanceTimersByTime(HEALTH_CHECK_MS));

    expect(onResize).toHaveBeenCalled();
    window.removeEventListener('resize', onResize);
  });
});
