'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const FRAMES = [
  '/vaquita-loading/loading1.svg',
  '/vaquita-loading/loading2.svg',
  '/vaquita-loading/loading3.svg',
  '/vaquita-loading/loading4.svg',
];
const FRAME_MS = 150;

// Module scope, like <LoaderScreen>: the loader is mounted by several gates in
// a row (boot → route → clock → map), and each mount picks the walk up where
// the last one left it instead of restarting from the first frame.
const frameRef = { current: 0 };

/** Soft CSS clouds (no image to wait for: a loader has to be there at once). */
const CLOUDS = [
  { top: '12%', width: 150, duration: 46, delay: -8, opacity: 0.85 },
  { top: '27%', width: 96, duration: 62, delay: -40, opacity: 0.6 },
  { top: '68%', width: 128, duration: 54, delay: -22, opacity: 0.7 },
  { top: '84%', width: 84, duration: 70, delay: -55, opacity: 0.5 },
];

interface WorldLoaderProps {
  /**
   * `false` (default): the loader IS the screen (boot gates, the route's
   * `loading`). `true`: it covers its positioned parent, over the world that
   * is booting underneath.
   */
  overlay?: boolean;
  /** Fade out; `onGone` fires when the fade ends so the owner can unmount it. */
  leaving?: boolean;
  onGone?: () => void;
}

/**
 * Loading screen of the 3D world (/world). The world is the slowest screen of
 * the app to open — the three.js bundle, the WebGL context, the map — and it
 * used to show while it was half built: the dashboard's skeleton first, then an
 * empty sea, then the island popping in. Every stage of that boot renders THIS
 * instead (see <BootLoader>, the route's `loading.tsx` and <HomePage>), so what
 * the user sees is one screen from the tap until the map is drawn: the sky,
 * the vaquita walking and a bar that says it is working.
 */
export function WorldLoader({ overlay = false, leaving = false, onGone }: WorldLoaderProps) {
  const { t } = useTranslation();
  const [frame, setFrame] = useState(frameRef.current);

  useEffect(() => {
    const id = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % FRAMES.length;
      setFrame(frameRef.current);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      // Alto explícito cuando es la pantalla: también se monta como raíz del
      // AppShell, donde no hereda el alto del <main> (igual que <HomeSkeleton>).
      style={overlay ? undefined : { height: 'var(--100VH)', maxHeight: 'var(--100VH)' }}
      className={
        'flex w-full flex-col items-center justify-center overflow-hidden px-6 text-center ' +
        'bg-gradient-to-b from-[#7FC0D6] to-[#B4D6DF] transition-opacity duration-500 ' +
        (overlay ? 'absolute inset-0 z-40 ' : 'relative ') +
        (leaving ? 'pointer-events-none opacity-0' : 'opacity-100')
      }
      onTransitionEnd={(event) => {
        if (leaving && event.target === event.currentTarget) onGone?.();
      }}
    >
      {CLOUDS.map((cloud) => (
        <span
          key={cloud.top}
          aria-hidden
          className="world-loader-cloud pointer-events-none absolute left-0"
          style={{
            top: cloud.top,
            width: cloud.width,
            opacity: cloud.opacity,
            animationDuration: `${cloud.duration}s`,
            animationDelay: `${cloud.delay}s`,
          }}
        />
      ))}

      {/* The vaquita, in the round frame the app's buttons share: black
          hairline, thicker base. The four frames stay mounted and only their
          opacity changes, so no frame is ever fetched mid-walk. */}
      <div className="relative h-40 w-40 overflow-hidden rounded-full border-2 border-black border-b-[6px] bg-white shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
        {FRAMES.map((src, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- tiny local SVG frames; next/image would add a request per frame
          <img
            key={src}
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full scale-[0.8] object-contain"
            style={{ opacity: index === frame ? 1 : 0 }}
          />
        ))}
      </div>

      <p className="relative mt-6 text-xl font-extrabold text-black">{t('home.map.loadingTitle', 'Loading world…')}</p>

      <div
        aria-hidden
        className="relative mt-5 h-3.5 w-52 overflow-hidden rounded-full border border-black border-b-2 bg-white"
      >
        <span className="world-loader-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary" />
      </div>
    </div>
  );
}
