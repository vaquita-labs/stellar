import { MapObject } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { BuildContext } from '../../types';
import { getPalette } from '../palette';
import { addBoxes, addTerrainTile, BoxSpec, OUTLINE_COLOR } from '../recipe';

// Variantes: [alto de la losa, alto del pilar de esquina (opcional)],
// como fracción de TILE_HEIGHT. El índice del array es el `variant`.
const ROCK_VARIANTS: Array<[number, number?]> = [
  [0.3],
  [0.6],
  [0.9],
  [0.1, 0.35],
  [0.4, 0.65],
  [0.7, 0.95],
];

// Mismo estilo toon del árbol (ver objects/tree.ts): cel-shading + tonos por
// cara + contorno inverted-hull, pieza levantada del suelo y zócalo 'basic'
// que dibuja la línea de base (el hull no genera silueta contra el suelo).
const OUTLINE = 0.02;
const LIFT = 0.015;
const TOON = { material: 'toon', faceShade: true, receiveShadow: false } as const;

const rockRecipe = (slabHeight: number, pillarHeight: number | undefined, color: string): BoxSpec[] => {
  const slab = slabHeight * TILE_HEIGHT;
  const specs: BoxSpec[] = [
    {
      // zócalo INSET (más angosto que la losa, al revés que el del tronco):
      // el bisel inferior ya expone bastante negro; ancho completo + volado
      // en el borde del mapa se veía como una plancha negra muy pesada.
      size: [TILE_SIZE - 2 * OUTLINE, 0.03, TILE_SIZE - 2 * OUTLINE],
      at: [0, 0.005, 0],
      color: OUTLINE_COLOR,
      material: 'basic',
      castShadow: false,
      receiveShadow: false,
    },
    {
      ...TOON,
      size: [TILE_SIZE, slab, TILE_SIZE],
      at: [0, slab / 2 + LIFT, 0],
      color,
      // en losas bajas el radio del bisel no puede acercarse a la mitad del alto
      bevel: Math.min(0.08, slab / 3),
      outline: OUTLINE,
    },
  ];
  if (pillarHeight !== undefined) {
    // El pilar NO atraviesa la losa: apoya sobre su tope con un hueco menor
    // que el hull, que lo llena de negro y dibuja la línea de base del pilar
    // sobre la losa (enterrado, el inverted hull no genera silueta).
    const gap = 0.008;
    const bottom = slab + LIFT + gap;
    const top = pillarHeight * TILE_HEIGHT + LIFT;
    specs.push({
      ...TOON,
      size: [TILE_SIZE * 0.4, top - bottom, TILE_SIZE * 0.4],
      at: [-0.2, (bottom + top) / 2, -0.2],
      color,
      bevel: 0.06,
      outline: OUTLINE,
    });
  }
  return specs;
};

export const getRockGroup = ({ position: [x, , z], variant }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();

  addTerrainTile(group, x, z, palette.rock, ctx);

  const spec = ROCK_VARIANTS[variant];
  if (spec) {
    addBoxes(group, [x, 0, z], rockRecipe(spec[0], spec[1], palette.rock));
  }

  return group;
};
