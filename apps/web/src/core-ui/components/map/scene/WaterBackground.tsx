'use client';

import { TILE_HEIGHT } from '@/core-ui/components/map/constants';
import { getPalette } from '@/core-ui/components/map/tiles/palette';
import { WAVE_MOTION } from '@/core-ui/components/map/tiles/recipe';
import { WorldType } from '@/core-ui/types';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';

// Sube-y-baja de las olas contra el acantilado: amplitud chica (que apenas se
// note) y ciclo lento. El signo alterna cresta/valle vía el atributo aWave.
const WAVE_MOTION_AMPLITUDE = 0.012;
const WAVE_MOTION_SPEED = 1.3;

interface WaterBackgroundProps {
  worldType?: WorldType;
}

export const WaterBackground = ({ worldType = WorldType.FOREST }: WaterBackgroundProps) => {
  useFrame(({ clock }) => {
    WAVE_MOTION.value = Math.sin(clock.elapsedTime * WAVE_MOTION_SPEED) * WAVE_MOTION_AMPLITUDE;
  });

  const waterMesh = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1000, 1000, 2, 1);
    // Océano de la misma familia que el agua de los tiles (palette.water) para
    // que no se lean dos aguas distintas, pero un paso más profundo y aún
    // distinto del cielo para que se note el "sobre agua".
    const material = new THREE.MeshLambertMaterial({
      color: getPalette(worldType).ocean,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; // plano horizontal
    mesh.receiveShadow = true; // recibe la sombra que proyecta la isla
    // Nivel del agua justo por debajo de la cara superior de los tiles (top en y=0),
    // dejando ver el pasto arriba y la tierra de los lados antes de tocar el agua.
    mesh.position.y = -TILE_HEIGHT * 0.85;

    return mesh;
  }, [worldType]);

  return <primitive object={waterMesh} />;
};
