'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { useMapSnapshot } from './useMapSnapshot';

interface MapMiniPreviewProps {
  walletAddress: string;
  /** Optional small label (e.g. "LV 3") pinned to the bottom-left. */
  caption?: string;
  /** Optional badge node (e.g. the rank pill) pinned to the bottom-right. */
  badge?: ReactNode;
}

/** Dotted backdrop — the resting/loading state, identical to the old placeholder. */
function DottedBackdrop() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'radial-gradient(circle, rgba(0,0,0,0.18) 1px, transparent 1.5px)',
        backgroundSize: '14px 14px',
      }}
    />
  );
}

/**
 * Per-card world preview. Assembles the player's real map (terrain, decorations
 * and buildings — never the vaquita) from the stored object data, rendered once
 * to a static image. Because it's a plain <img> living inside the card, it
 * scrolls natively glued to it — no overlay, no float.
 *
 * Lazy: the data + snapshot are only produced once the tile scrolls near the
 * viewport, so a long board stays cheap.
 */
export function MapMiniPreview({ walletAddress, caption, badge }: MapMiniPreviewProps) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = tileRef.current;
    if (!el || isVisible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  const snapshot = useMapSnapshot(walletAddress, isVisible);

  return (
    <div
      ref={tileRef}
      className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl border border-black/10 bg-[#FAF6EE]"
    >
      {snapshot ? (
        // eslint-disable-next-line @next/next/no-img-element -- a runtime-generated
        // data URL; next/image can't optimize it and would only add overhead.
        <img src={snapshot} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <DottedBackdrop />
      )}

      {caption && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
          {caption}
        </span>
      )}

      {badge && <div className="absolute bottom-2 right-2">{badge}</div>}
    </div>
  );
}
