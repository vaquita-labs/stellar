'use client';

import { TILE_HEIGHT } from '@/core-ui/components/map/constants';
import { getFallStreaksTexture } from '@/core-ui/components/map/tiles/objects/water';
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
// Vetas de las cascadas cayendo MUY lento (el ciclo de la textura abarca 3
// alturas de cara: 0.013 ≈ cruzar una cara cada ~25 s).
const FALL_STREAK_SPEED = 0.013;

// ---------------------------------------------------------------------------
// Olas del mar de fondo: trazos de espuma sobre el plano del océano, que van
// a la deriva MUY lento (el mar tiene que sentirse vivo, no correr). Es una
// capa transparente sobre el plano; el patrón cubre RIPPLE_SPAN unidades de
// mundo y se repite con RepeatWrapping.
// ---------------------------------------------------------------------------

/** unidades de mundo (≈ tiles) que cubre el patrón antes de repetirse */
const RIPPLE_SPAN = 9;
/** deriva del patrón, en ciclos por segundo (un ciclo = RIPPLE_SPAN unidades) */
const RIPPLE_DRIFT_U = 0.006;
const RIPPLE_DRIFT_V = 0.004;
/** respiración de la espuma: aparece y se desvanece sin cortar el bucle */
const RIPPLE_FADE_SPEED = 0.55;
const RIPPLE_OPACITY_MIN = 0.3;
const RIPPLE_OPACITY_MAX = 0.55;

// [centro u, centro v, largo (0..1 del patrón), grosor (0..1), giro en grados]:
// irregulares a mano para que la repetición no se lea como una grilla. Los
// pares cercanos (un trazo largo con uno corto al lado) son los que hacen la
// lectura de "ola"; el giro chico evita que TODOS los trazos salgan paralelos
// (con ángulo único el mar se leía como lluvia, no como olas).
const RIPPLES: Array<[number, number, number, number, number]> = [
  [0.12, 0.08, 0.1, 0.012, -6],
  [0.19, 0.12, 0.05, 0.01, 4],
  [0.42, 0.05, 0.08, 0.011, 9],
  [0.68, 0.14, 0.11, 0.013, -3],
  [0.75, 0.19, 0.05, 0.01, -11],
  [0.9, 0.09, 0.07, 0.011, 6],
  [0.05, 0.31, 0.09, 0.012, 12],
  [0.31, 0.27, 0.12, 0.013, -5],
  [0.38, 0.32, 0.06, 0.01, 2],
  [0.57, 0.36, 0.08, 0.011, -9],
  [0.83, 0.29, 0.1, 0.012, 7],
  [0.16, 0.48, 0.11, 0.013, -2],
  [0.23, 0.53, 0.05, 0.01, 10],
  [0.47, 0.44, 0.07, 0.011, -12],
  [0.71, 0.52, 0.09, 0.012, 3],
  [0.94, 0.47, 0.06, 0.01, -7],
  [0.09, 0.66, 0.08, 0.011, 5],
  [0.35, 0.71, 0.1, 0.012, -10],
  [0.43, 0.76, 0.05, 0.01, 8],
  [0.62, 0.63, 0.11, 0.013, -4],
  [0.87, 0.69, 0.07, 0.011, 11],
  [0.03, 0.85, 0.09, 0.012, -8],
  [0.27, 0.91, 0.06, 0.01, 1],
  [0.52, 0.88, 0.1, 0.012, -6],
  [0.59, 0.93, 0.05, 0.01, 9],
  [0.79, 0.83, 0.08, 0.011, -3],
];

let rippleTexture: THREE.DataTexture | null = null;
const getRipplesTexture = (): THREE.DataTexture => {
  if (!rippleTexture) {
    // Mismo criterio que las vetas de la cascada: DataTexture a mano con TODO
    // el RGB en blanco y el dibujo solo en el alfa, para que el filtrado no
    // pinte un halo oscuro alrededor de cada trazo.
    const W = 512;
    const H = 512;
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
    const wrap = (v: number, n: number) => ((v % n) + n) % n;
    for (const [u, v, length, thickness, angle] of RIPPLES) {
      const halfLen = Math.max(2, (length * W) / 2);
      const halfThick = Math.max(1, (thickness * H) / 2);
      const cx = u * W;
      const cy = v * H;
      const cos = Math.cos((angle * Math.PI) / 180);
      const sin = Math.sin((angle * Math.PI) / 180);
      for (let dx = -halfLen; dx <= halfLen; dx++) {
        // extremos afinados: el trazo termina en punta, no cortado
        const taper = Math.sin((Math.PI * (dx + halfLen)) / (2 * halfLen)) ** 0.7;
        // medio píxel de paso para que el trazo girado no quede con huecos
        for (let dy = -halfThick; dy <= halfThick; dy += 0.5) {
          const across = 1 - (Math.abs(dy) / halfThick) ** 2;
          const alpha = Math.round(255 * taper * Math.max(0, across));
          if (alpha <= 0) continue;
          const px = cx + dx * cos - dy * sin;
          const py = cy + dx * sin + dy * cos;
          const idx = (wrap(Math.round(py), H) * W + wrap(Math.round(px), W)) * 4 + 3;
          data[idx] = Math.max(data[idx], alpha);
        }
      }
    }
    rippleTexture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    rippleTexture.wrapS = THREE.RepeatWrapping;
    rippleTexture.wrapT = THREE.RepeatWrapping;
    rippleTexture.magFilter = THREE.LinearFilter;
    rippleTexture.minFilter = THREE.LinearMipmapLinearFilter;
    rippleTexture.generateMipmaps = true;
    rippleTexture.needsUpdate = true;
  }
  return rippleTexture;
};

const OCEAN_SIZE = 1000;
const OCEAN_Y = -TILE_HEIGHT * 0.85;

interface WaterBackgroundProps {
  worldType?: WorldType;
}

export const WaterBackground = ({ worldType = WorldType.FOREST }: WaterBackgroundProps) => {
  const { waterMesh, rippleMesh } = useMemo(() => {
    const palette = getPalette(worldType);
    // Océano de la misma familia que el agua de los tiles (palette.water) para
    // que no se lean dos aguas distintas, pero un paso más profundo y aún
    // distinto del cielo para que se note el "sobre agua".
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, 2, 1),
      new THREE.MeshLambertMaterial({
        color: palette.ocean,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      })
    );
    water.rotation.x = -Math.PI / 2; // plano horizontal
    water.receiveShadow = true; // recibe la sombra que proyecta la isla
    // Nivel del agua justo por debajo de la cara superior de los tiles (top en y=0),
    // dejando ver el pasto arriba y la tierra de los lados antes de tocar el agua.
    water.position.y = OCEAN_Y;

    // Capa de olas: mismo plano, apenas por encima. depthWrite off para que no
    // pelee con el mar, y Lambert + receiveShadow para que la espuma se
    // oscurezca bajo la sombra de la isla como lo hace el mar.
    const rippleGeometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE);
    const texture = getRipplesTexture();
    texture.repeat.set(OCEAN_SIZE / RIPPLE_SPAN, OCEAN_SIZE / RIPPLE_SPAN);
    const ripples = new THREE.Mesh(
      rippleGeometry,
      new THREE.MeshLambertMaterial({
        color: palette.foam,
        map: texture,
        transparent: true,
        opacity: RIPPLE_OPACITY_MAX,
        depthWrite: false,
      })
    );
    ripples.rotation.x = -Math.PI / 2;
    ripples.receiveShadow = true;
    ripples.position.y = OCEAN_Y + 0.006;

    return { waterMesh: water, rippleMesh: ripples };
  }, [worldType]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    WAVE_MOTION.value = Math.sin(t * WAVE_MOTION_SPEED) * WAVE_MOTION_AMPLITUDE;
    // offset.y creciente = el patrón de trazos baja; RepeatWrapping lo
    // envuelve (desaparecen al pie y reaparecen arriba).
    getFallStreaksTexture().offset.y = t * FALL_STREAK_SPEED;

    // Deriva en diagonal + respiración de la opacidad: sin el fade, la deriva
    // sola se lee como una textura desplazándose; con él parecen olas que
    // aparecen y se deshacen.
    const texture = getRipplesTexture();
    texture.offset.set(t * RIPPLE_DRIFT_U, t * RIPPLE_DRIFT_V);
    const material = rippleMesh.material as THREE.MeshLambertMaterial;
    const pulse = (Math.sin(t * RIPPLE_FADE_SPEED) + 1) / 2;
    material.opacity = RIPPLE_OPACITY_MIN + (RIPPLE_OPACITY_MAX - RIPPLE_OPACITY_MIN) * pulse;
  });

  return (
    <>
      <primitive object={waterMesh} />
      <primitive object={rippleMesh} />
    </>
  );
};
