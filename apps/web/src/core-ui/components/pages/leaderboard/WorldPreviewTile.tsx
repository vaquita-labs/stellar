'use client';

/**
 * Minimal placeholder for a player's world preview.
 *
 * Until the backend stores a real snapshot per user, this tile is just a
 * clean dotted square — no gradient, no decorative artwork — so the focus
 * of each card stays on the player's identity and stats.
 */

interface WorldPreviewTileProps {
  /** Optional small label (e.g., "LV 3") pinned to the bottom-right. */
  caption?: string;
}

export function WorldPreviewTile({ caption }: WorldPreviewTileProps) {
  return (
    <div
      className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl border border-black/10 bg-[#FAF6EE]"
      aria-hidden
    >
      {/* Dotted texture — single-tone, no gradient. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(0,0,0,0.18) 1px, transparent 1.5px)',
          backgroundSize: '14px 14px',
        }}
      />

      {caption && (
        <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
          {caption}
        </span>
      )}
    </div>
  );
}
