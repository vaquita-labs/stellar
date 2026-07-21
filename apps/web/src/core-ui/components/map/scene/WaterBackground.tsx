'use client';

import { TILE_HEIGHT } from '@/core-ui/components/map/constants';
import { getFallStreaksTexture } from '@/core-ui/components/map/tiles/objects/water';
import { getPalette } from '@/core-ui/components/map/tiles/palette';
import { WAVE_MOTION } from '@/core-ui/components/map/tiles/recipe';
import { WorldType } from '@/core-ui/types';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Sube-y-baja de las olas contra el acantilado: amplitud chica (que apenas se
// note) y ciclo lento. El signo alterna cresta/valle vía el atributo aWave.
const WAVE_MOTION_AMPLITUDE = 0.012;
const WAVE_MOTION_SPEED = 1.3;
// Vetas de las cascadas cayendo MUY lento (el ciclo de la textura abarca 3
// alturas de cara: 0.013 ≈ cruzar una cara cada ~25 s).
const FALL_STREAK_SPEED = 0.013;

// ---------------------------------------------------------------------------
// Mar de fondo: NO son trazos de espuma dibujados encima (eso se leía como
// líneas blancas / lluvia). El color del propio mar varía:
//   - bajío: el agua cercana a la isla es más clara (mismo tono que el agua de
//     los tiles), y se va a hondo al alejarse;
//   - oleaje: bandas anchas y de MUY poco contraste que se alejan de la isla y
//     se cruzan con una diagonal lenta — se lee movimiento, no rayas.
// Va inyectado en el MeshLambertMaterial (onBeforeCompile) en vez de un
// ShaderMaterial propio para no perder la sombra que la isla proyecta al mar.
// ---------------------------------------------------------------------------

/** distancias (en tiles desde el centro de la isla) donde el bajío se apaga */
const SHALLOW_FROM = 6.5;
const SHALLOW_TO = 15;
/** ancho de las bandas de oleaje y su velocidad de avance */
const RING_FREQ = 0.85;
const RING_SPEED = 0.5;
const CROSS_FREQ = 0.22;
const CROSS_SPEED = 0.18;
/** distancias donde el oleaje se apaga (evita el moiré del horizonte) */
const WAVE_FADE_FROM = 45;
const WAVE_FADE_TO = 90;
/** cuánto aclara la cresta (0..1 del color de espuma). Muy poco a propósito. */
const CREST_DEEP = 0.05;
const CREST_SHALLOW = 0.14;

const OCEAN_SIZE = 1000;
const OCEAN_Y = -TILE_HEIGHT * 0.85;

interface WaterBackgroundProps {
  worldType?: WorldType;
  /** centro de la isla: el bajío y las olas irradian desde acá */
  center?: [number, number, number];
}

export const WaterBackground = ({ worldType = WorldType.FOREST, center }: WaterBackgroundProps) => {
  const [cx, , cz] = center ?? [0, 0, 0];

  const { waterMesh, uniforms } = useMemo(() => {
    const palette = getPalette(worldType);
    const shaderUniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2(cx, cz) },
      // El bajío es el agua de los tiles pero aclarada hacia la espuma: con el
      // tono crudo la diferencia contra el mar hondo casi no se veía.
      uShallow: { value: new THREE.Color(palette.water).lerp(new THREE.Color(palette.foam), 0.35) },
      uFoam: { value: new THREE.Color(palette.foam) },
    };

    // Hondo = palette.ocean (color base del material); bajío = palette.water,
    // el MISMO tono que el agua de los tiles, para que la isla se vea rodeada
    // de su propia agua y no de dos aguas distintas.
    const material = new THREE.MeshLambertMaterial({
      color: palette.ocean,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shaderUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vWorldPos;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\tvWorldPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          [
            'varying vec3 vWorldPos;',
            'uniform float uTime;',
            'uniform vec2 uCenter;',
            'uniform vec3 uShallow;',
            'uniform vec3 uFoam;',
            'void main() {',
          ].join('\n')
        )
        .replace(
          '#include <color_fragment>',
          [
            '#include <color_fragment>',
            '{',
            '\tfloat dist = length( vWorldPos.xz - uCenter );',
            `\tfloat shallow = 1.0 - smoothstep( ${SHALLOW_FROM.toFixed(1)}, ${SHALLOW_TO.toFixed(1)}, dist );`,
            '\tdiffuseColor.rgb = mix( diffuseColor.rgb, uShallow, shallow * 0.75 );',
            // dos ondas que se cruzan: anillos que salen de la isla + una
            // diagonal lenta. La suma nunca es un borde duro (todo smoothstep
            // ancho), así que el mar respira en vez de dibujar líneas.
            `\tfloat rings = sin( dist * ${RING_FREQ.toFixed(2)} - uTime * ${RING_SPEED.toFixed(2)} );`,
            `\tfloat sway = sin( ( vWorldPos.x + vWorldPos.z * 0.6 ) * ${CROSS_FREQ.toFixed(2)} + uTime * ${CROSS_SPEED.toFixed(2)} );`,
            '\tfloat crest = smoothstep( 0.1, 1.0, rings * 0.55 + sway * 0.45 );',
            // Lejos, un ciclo de ola mide menos que un píxel y el patrón hace
            // moiré (no hay mipmap que lo filtre: es matemática, no textura).
            // Se apaga con la distancia, donde igual manda la niebla.
            `\tcrest *= 1.0 - smoothstep( ${WAVE_FADE_FROM.toFixed(1)}, ${WAVE_FADE_TO.toFixed(1)}, dist );`,
            `\tfloat amount = mix( ${CREST_DEEP.toFixed(2)}, ${CREST_SHALLOW.toFixed(2)}, shallow );`,
            '\tdiffuseColor.rgb = mix( diffuseColor.rgb, uFoam, crest * amount );',
            '}',
          ].join('\n')
        );
    };
    // Sin la key, three reusa el programa compilado de otro Lambert idéntico
    // (mismas defines) y el mar saldría plano.
    material.customProgramCacheKey = () => 'ocean-shallow-waves';

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, 2, 1), material);
    mesh.rotation.x = -Math.PI / 2; // plano horizontal
    mesh.receiveShadow = true; // recibe la sombra que proyecta la isla
    // Nivel del agua justo por debajo de la cara superior de los tiles (top en y=0),
    // dejando ver el pasto arriba y la tierra de los lados antes de tocar el agua.
    mesh.position.y = OCEAN_Y;

    return { waterMesh: mesh, uniforms: shaderUniforms };
  }, [worldType, cx, cz]);

  // El mesh se rearma al cambiar de mundo/centro: soltar el anterior (mismo
  // criterio que disposeObject en Ground).
  useEffect(
    () => () => {
      waterMesh.geometry.dispose();
      (waterMesh.material as THREE.Material).dispose();
    },
    [waterMesh]
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    WAVE_MOTION.value = Math.sin(t * WAVE_MOTION_SPEED) * WAVE_MOTION_AMPLITUDE;
    // offset.y creciente = el patrón de trazos baja; RepeatWrapping lo
    // envuelve (desaparecen al pie y reaparecen arriba).
    getFallStreaksTexture().offset.y = t * FALL_STREAK_SPEED;
    uniforms.uTime.value = t;
  });

  return <primitive object={waterMesh} />;
};
