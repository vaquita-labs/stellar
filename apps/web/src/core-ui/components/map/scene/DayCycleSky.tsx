'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getGameDayProgress, useDayCycleStore } from '@/core-ui/stores';
import { useMapStore } from '@/core-ui/stores';

type SkyKey = {
  at: number;
  sky: string;
  fog: string;
  ambient: number;
  directional: number;
  sunColor: string;
  sunPos: [number, number, number];
};

// Keyframes retimados a un día estándar (progress = fracción de 24h): noche
// cerrada hasta ~04:48, amanecer 06:00, mediodía 12:00, atardecer 18:00 y de
// nuevo noche hacia ~19:12. Así la luz del mapa coincide con la hora real.
const KEYS: SkyKey[] = [
  { at: 0.0, sky: '#0a1030', fog: '#0a1030', ambient: 0.45, directional: 0.0, sunColor: '#bcd3ff', sunPos: [0, 20, 0] }, // 00:00
  { at: 0.2, sky: '#1a1850', fog: '#1f1c5a', ambient: 0.5, directional: 0.0, sunColor: '#bcd3ff', sunPos: [-18, 2, 0] }, // 04:48
  { at: 0.25, sky: '#ffb37a', fog: '#ffd1a3', ambient: 0.7, directional: 0.7, sunColor: '#ffc785', sunPos: [-16, 5, 0] }, // 06:00
  { at: 0.3, sky: '#9fd6f5', fog: '#cfeaf7', ambient: 0.85, directional: 1.25, sunColor: '#fff4d6', sunPos: [-12, 12, -3] }, // 07:12
  { at: 0.5, sky: '#74c5ee', fog: '#bde2f3', ambient: 1.0, directional: 1.5, sunColor: '#ffffff', sunPos: [0, 20, -4] }, // 12:00
  { at: 0.7, sky: '#7fc6e8', fog: '#cae3f0', ambient: 0.85, directional: 1.25, sunColor: '#fff1d0', sunPos: [12, 12, -3] }, // 16:48
  { at: 0.75, sky: '#f08a55', fog: '#f4b88c', ambient: 0.7, directional: 0.7, sunColor: '#ff9a5a', sunPos: [16, 5, 0] }, // 18:00
  { at: 0.8, sky: '#3a2960', fog: '#4a3873', ambient: 0.55, directional: 0.0, sunColor: '#9c87c4', sunPos: [18, 2, 0] }, // 19:12
  { at: 1.0, sky: '#0a1030', fog: '#0a1030', ambient: 0.45, directional: 0.0, sunColor: '#bcd3ff', sunPos: [0, 20, 0] }, // 24:00
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

const interpolate = (progress: number) => {
  let next = 0;
  for (let i = 0; i < KEYS.length; i++) {
    if (KEYS[i].at >= progress) {
      next = i;
      break;
    }
    next = i;
  }
  if (next === 0) next = 1;
  const a = KEYS[next - 1];
  const b = KEYS[next];
  const span = b.at - a.at;
  const t = span === 0 ? 0 : (progress - a.at) / span;
  return {
    sky: tmpA.set(a.sky).lerp(tmpB.set(b.sky), t).getStyle(),
    fog: tmpA.set(a.fog).lerp(tmpB.set(b.fog), t).getStyle(),
    ambient: a.ambient + (b.ambient - a.ambient) * t,
    directional: a.directional + (b.directional - a.directional) * t,
    sunColor: tmpA.set(a.sunColor).lerp(tmpB.set(b.sunColor), t).getStyle(),
    sunPos: [
      a.sunPos[0] + (b.sunPos[0] - a.sunPos[0]) * t,
      a.sunPos[1] + (b.sunPos[1] - a.sunPos[1]) * t,
      a.sunPos[2] + (b.sunPos[2] - a.sunPos[2]) * t,
    ] as [number, number, number],
  };
};

// Renderizar el shadow map cuesta un pase completo de la escena; con la luz
// moviéndose tan lento basta refrescarlo ~10 veces por segundo en lugar de 60
// (WorldMap pone gl.shadowMap.autoUpdate = false al crear el canvas).
const SHADOW_UPDATE_INTERVAL = 0.1;

export const DayCycleSky = () => {
  const { scene, gl } = useThree();
  const editingObjectPosition = useMapStore((s) => s.editingObjectPosition);

  const ambientRef = useRef<THREE.AmbientLight>(null);
  const directionalRef = useRef<THREE.DirectionalLight>(null);
  const shadowElapsedRef = useRef(0);

  const skyColor = useMemo(() => new THREE.Color('#9fd6f5'), []);
  // La niebla arranca lejos y usa el color del cielo para que el agua del horizonte
  // se funda con el cielo (horizonte natural, sin franja blanca).
  const fog = useMemo(() => new THREE.Fog('#9fd6f5', 60, 220), []);

  useEffect(() => {
    scene.background = skyColor;
    scene.fog = fog;
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene, skyColor, fog]);

  useFrame((_, delta) => {
    // La luz del mapa sigue el reloj de JUEGO: a medianoche se ve oscuro, a
    // mediodía claro, así el sol y la hora que muestra MapClock coinciden. El
    // día es largo (config game_day_length_ms) para que la transición sea
    // lenta y natural. Se escribe al store para que la vaquita (que lee
    // dayProgress) siga el mismo día (duerme de noche).
    const progress = getGameDayProgress();
    useDayCycleStore.getState().setDayProgress(progress);
    const values = interpolate(progress);

    skyColor.set(values.sky);
    // La niebla siempre toma el color del cielo para un horizonte sin costura
    // (el agua lejana se funde con el cielo como en la realidad).
    fog.color.set(values.sky);

    const editDimAmbient = editingObjectPosition ? 0.6 : 1;
    const editDimDirectional = editingObjectPosition ? 0.5 : 1;

    if (ambientRef.current) {
      ambientRef.current.intensity = values.ambient * editDimAmbient;
    }
    if (directionalRef.current) {
      directionalRef.current.intensity = values.directional * editDimDirectional;
      directionalRef.current.color.set(values.sunColor);
      directionalRef.current.position.set(values.sunPos[0], values.sunPos[1], values.sunPos[2]);
    }

    shadowElapsedRef.current += delta;
    if (shadowElapsedRef.current >= SHADOW_UPDATE_INTERVAL) {
      shadowElapsedRef.current = 0;
      // De noche la directional está en 0 y no hay sombra visible: se saltea
      // el pase entero (~40% del ciclo de juego gratis). El umbral > 0 cubre
      // el fade del atardecer, así la sombra se sigue actualizando mientras
      // todavía se ve desvanecerse.
      if (values.directional > 0.001) {
        gl.shadowMap.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.8} />
      <directionalLight
        ref={directionalRef}
        castShadow
        intensity={1.2}
        position={[3, 15, -15]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001}
      />
    </>
  );
};
