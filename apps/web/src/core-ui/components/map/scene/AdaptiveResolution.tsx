'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { getMaxDpr } from './deviceTier';

// El fill-rate escala con el CUADRADO del dpr (ver el comentario del Canvas en
// WorldMap): pasar de 1.5 a 1 recorta ~55% de los píxeles. En máquinas con GPU
// integrada eso es la diferencia entre 20 y 60 fps, y en máquinas rápidas no
// queremos pagar el costo visual. Por eso la resolución es adaptativa y no un
// valor fijo más bajo.

/** Piso: nunca renderizar por debajo de la resolución CSS. */
const MIN_DPR = 1;
/** Ceiling: the device tier's own cap, the same one the Canvas is created with. */
const maxDpr = () => Math.min(Math.max(window.devicePixelRatio, MIN_DPR), getMaxDpr());

/**
 * Arranca al tope y deja que drei mida el FPS real: si se sostiene bajo
 * (umbral por defecto ~50 fps sobre rondas de ~2.5s, tolerante al jank de
 * carga), baja a MIN_DPR; si vuelve a sobrar GPU, sube. Tras `flipflops`
 * oscilaciones queda clavado abajo (onFallback) para no parpadear en máquinas
 * que quedan justo en el borde.
 */
export const AdaptiveResolution = () => {
  const setDpr = useThree((state) => state.setDpr);
  return (
    <PerformanceMonitor
      onDecline={() => setDpr(MIN_DPR)}
      onIncline={() => setDpr(maxDpr())}
      flipflops={2}
      onFallback={() => setDpr(MIN_DPR)}
    />
  );
};
