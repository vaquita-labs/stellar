'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type VolumeLevel = 0 | 1 | 2 | 3;

const VOLUME_LEVELS: Record<VolumeLevel, number> = {
  0: 0.2, // Volumen normal
  1: 0.1, // Volumen bajo
  2: 0.05, // Volumen muy bajo
  3: 0, // Mute
};

const VOLUME_ICONS: Record<VolumeLevel, string> = {
  0: '🔊', // Volumen normal
  1: '🔉', // Volumen medio
  2: '🔈', // Volumen bajo
  3: '🔇', // Mute
};

export function BackgroundMusic() {
  const { t } = useTranslation();
  const volumeTitles: Record<VolumeLevel, string> = {
    0: t('home.music.normal', 'Normal volume'),
    1: t('home.music.low', 'Low volume'),
    2: t('home.music.veryLow', 'Very low volume'),
    3: t('home.music.mute', 'Mute music'),
  };
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volumeLevel, setVolumeLevel] = useState<VolumeLevel>(0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    
    const audio = audioRef.current;
    if (!audio) return;

    audio.loop = true;
    audio.volume = VOLUME_LEVELS[volumeLevel];

    // Iniciar reproducción si no está en mute
    if (volumeLevel !== 3) {
      audio.play().catch(() => {});
    }
  }, [volumeLevel, isMounted]);

  const handleVolumeClick = () => {
    setVolumeLevel((current) => {
      // Ciclar: 0 -> 1 -> 2 -> 3 -> 0
      return ((current + 1) % 4) as VolumeLevel;
    });
  };

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <audio ref={audioRef} src="/audio/bg.mp3" preload="auto" />
      <button
        id="music-toggle-button"
        className="absolute top-14 md:top-12 right-16 md:right-24 z-10 w-12 h-12 md:w-20 md:h-20 flex items-center justify-center rounded-lg bg-transparent hover:opacity-80 transition-opacity"
        onClick={handleVolumeClick}
        title={volumeTitles[volumeLevel]}
      >
        <div className="text-2xl md:text-4xl">{VOLUME_ICONS[volumeLevel]}</div>
      </button>
    </>
  );
}

