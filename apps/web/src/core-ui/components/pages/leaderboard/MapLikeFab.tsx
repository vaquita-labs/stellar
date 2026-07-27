'use client';

import { useLikedMapWallets, useMapLikeCount, useToggleMapLike } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiHeart } from 'react-icons/fi';

/** Emojis "más usados por la chaviza". El like sigue siendo uno solo (el corazón
 *  del mapa, `useMapLikes`); esta lista es sólo el confeti que revienta al darlo,
 *  para que la interacción se sienta viva y no sólo un contador. */
const REACTION_EMOJIS = ['❤️', '😂', '🔥', '😭', '✨', '🥺', '💀', '😎', '🙌', '💯'];

type Particle = { id: number; emoji: string; drift: number; spin: number; delay: number; scale: number };

/**
 * Botón flotante (esquina inferior derecha) para dar corazón al mapa de este
 * perfil. Reusa el mismo sistema persistido que las cards del leaderboard
 * (`useLikedMapWallets` / `useMapLikeCount` / `useToggleMapLike`): estado lleno
 * en rojo, toggle optimista, y deshabilitado en el propio mapa (el server lo
 * rechaza). Al dar like revienta un puñado variado de emojis hacia arriba.
 */
export function MapLikeFab({ walletAddress }: { walletAddress: string }) {
  const { t } = useTranslation();
  const { walletAddress: viewerWallet } = useConfigStore();
  const { data: likedWallets } = useLikedMapWallets();
  const { data: likeCount } = useMapLikeCount(walletAddress);
  const toggleLike = useToggleMapLike();

  const liked = likedWallets?.has(walletAddress.toLowerCase()) ?? false;
  const isOwnMap = !!viewerWallet && viewerWallet.toLowerCase() === walletAddress.toLowerCase();
  const disabled = isOwnMap || !viewerWallet;

  const [particles, setParticles] = useState<Particle[]>([]);
  const seq = useRef(0);

  const burst = useCallback(() => {
    const batch: Particle[] = Array.from({ length: 7 }, () => {
      seq.current += 1;
      return {
        id: seq.current,
        emoji: REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)],
        // Sesgado hacia la izquierda: el botón vive pegado al borde derecho, así
        // los emojis brotan hacia adentro y no se cortan contra la orilla.
        drift: Math.round((Math.random() - 0.65) * 140),
        spin: Math.round((Math.random() - 0.5) * 90),
        delay: Math.round(Math.random() * 140),
        scale: 0.9 + Math.random() * 0.7,
      };
    });
    setParticles((prev) => [...prev, ...batch]);
    // La animación dura ~1.1s (+delay); sacamos el lote pasado ese tiempo para
    // no acumular nodos muertos si el usuario spamea el corazón.
    const ids = new Set(batch.map((p) => p.id));
    window.setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !ids.has(p.id)));
    }, 1400);
  }, []);

  const handleTap = () => {
    if (disabled) return;
    // Revienta sólo al dar like, no al quitarlo.
    if (!liked) burst();
    toggleLike.mutate({ targetWallet: walletAddress, isLiked: liked });
  };

  return (
    <div className="absolute bottom-4 right-4 z-20">
      {/* Capa de emojis: brotan desde el centro del botón hacia arriba. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute select-none text-2xl will-change-transform"
            style={
              {
                animation: `emoji-burst 1.1s ease-out ${p.delay}ms forwards`,
                '--drift': `${p.drift}px`,
                '--spin': `${p.spin}deg`,
                '--scale': p.scale,
              } as React.CSSProperties
            }
          >
            {p.emoji}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={handleTap}
        disabled={disabled}
        aria-pressed={liked}
        aria-label={liked ? t('leaderboard.card.unlike', 'Unlike') : t('leaderboard.card.like', 'Like')}
        className={`relative flex items-center gap-1.5 rounded-full border border-black border-b-4 bg-white px-4 py-2.5 shadow-lg transition active:translate-y-0.5 active:border-b-2 disabled:opacity-60 ${
          disabled ? '' : 'hover:-translate-y-0.5'
        }`}
      >
        <FiHeart
          className={`h-5 w-5 transition ${liked ? 'scale-110 fill-red-500 text-red-500' : 'text-black'}`}
        />
        <span className="text-sm font-extrabold text-black tabular-nums">{likeCount ?? 0}</span>
      </button>
    </div>
  );
}
