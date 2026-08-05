import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { BuildContext } from '@/core-ui/components/map/types';
import { getPalette, WorldPalette } from '@/core-ui/components/map/tiles/palette';
import { addBoxes, addFixedTerrainTile, BoxSpec, OUTLINE_COLOR } from '@/core-ui/components/map/tiles/recipe';

// ---------------------------------------------------------------------------
// Formas: cada función devuelve la receta de una silueta de arbusto o de un
// parche de flores. Mismo estilo toon que los árboles (tree.ts): cel-shading,
// contorno inverted-hull y volúmenes biselados. Offsets relativos al tope del
// tile (y = 0).
// ---------------------------------------------------------------------------

const BUSH_OUTLINE = 0.02;
const FLOWER_OUTLINE = 0.012;

// Igual que TRUNK_LIFT en tree.ts: los volúmenes flotan apenas sobre el tile
// para que el hull del contorno sobresalga por debajo, y un zócalo negro
// dibuja la línea de base contra el suelo.
const LIFT = 0.015;

const TOON = { material: 'toon', faceShade: true, receiveShadow: false } as const;

/** Blob de follaje: caja biselada toon apoyada (con LIFT) sobre el tile. */
const blob = (color: string, size: [number, number, number], at: [number, number, number], bevel: number): BoxSpec => ({
  ...TOON,
  size,
  at,
  color,
  bevel,
  outline: BUSH_OUTLINE,
});

/**
 * Blob apoyado en el suelo con su zócalo negro (la línea de base contra el
 * tile). El zócalo se ajusta a la cara de apoyo real del blob (ancho − 2·bisel
 * + un reborde fino): con el ancho completo se leía como placa negra bajo el
 * arbusto, porque el bisel curva la base hacia adentro.
 */
const groundedBlob = (color: string, size: [number, number, number], [dx, dz]: [number, number], bevel: number): BoxSpec[] => {
  const [w, h, d] = size;
  return [
    {
      size: [w - 2 * bevel + 0.1, 0.045, d - 2 * bevel + 0.1],
      at: [dx, 0.0125, dz],
      color: OUTLINE_COLOR,
      material: 'basic',
      castShadow: false,
      receiveShadow: false,
    },
    blob(color, size, [dx, h / 2 + LIFT, dz], bevel),
  ];
};

/**
 * Cabeza de flor: cruz plana de 4 pétalos + centro. `s` escala la especie
 * completa; los pétalos se hunden apenas bajo el centro para leerse como una
 * sola pieza.
 */
const flowerHead = (petal: string, center: string, [dx, dy, dz]: [number, number, number], s = 1): BoxSpec[] => {
  const petalSize: [number, number, number] = [0.12 * s, 0.05 * s, 0.12 * s];
  // Los pétalos se hunden bien en el centro: con un solape menor al grosor
  // del contorno, el hull dibuja líneas negras internas entre las piezas.
  const r = 0.09 * s;
  const petalAt: Array<[number, number, number]> = [
    [dx + r, dy, dz],
    [dx - r, dy, dz],
    [dx, dy, dz + r],
    [dx, dy, dz - r],
  ];
  // El bisel escala con la flor: uno fijo mayor que la mitad del grosor del
  // pétalo genera geometría rota (RoundedBox con radio imposible).
  return [
    ...petalAt.map((at): BoxSpec => ({ ...TOON, size: petalSize, at, color: petal, bevel: 0.015 * s, outline: FLOWER_OUTLINE })),
    { ...TOON, size: [0.11 * s, 0.07 * s, 0.11 * s], at: [dx, dy + 0.015 * s, dz], color: center, bevel: 0.02 * s, outline: FLOWER_OUTLINE },
  ];
};

/** Cuerpo del arbusto redondo: blob ancho + copete, como los de referencia. */
const roundBushBody = (leaf: string): BoxSpec[] => [
  ...groundedBlob(leaf, [0.68, 0.36, 0.68], [0, 0], 0.12),
  blob(leaf, [0.46, 0.28, 0.46], [0.02, 0.46 + LIFT, -0.02], 0.1),
];

// Las flores apoyan SOBRE el follaje (hundidas ~0.01 apenas): medio enterradas
// solo asoman fragmentos de pétalo y el contorno se lee como manchas negras.
/** Arbusto redondo con una flor asomando en el copete. */
const roundBush = (leaf: string, petal: string, center: string): BoxSpec[] => [
  ...roundBushBody(leaf),
  ...flowerHead(petal, center, [0.05, 0.63 + LIFT, -0.04], 0.9),
];

/** Arbusto doble asimétrico: dos matas, un retoño y una flor por mata. */
const doubleBush = (leaf: string, leafDark: string, petal: string, petalAlt: string, center: string): BoxSpec[] => [
  ...groundedBlob(leaf, [0.44, 0.36, 0.44], [-0.16, 0.06], 0.1),
  ...groundedBlob(leafDark, [0.36, 0.28, 0.36], [0.2, -0.14], 0.09),
  ...groundedBlob(leaf, [0.22, 0.16, 0.22], [0.08, 0.28], 0.06),
  ...flowerHead(petal, center, [-0.13, 0.39 + LIFT, 0.09], 0.7),
  ...flowerHead(petalAlt, center, [0.22, 0.303 + LIFT, -0.11], 0.55),
];

/** Seto de tres dedos redondeados que brotan de una mata baja. */
const hedgeBush = (leaf: string): BoxSpec[] => [
  ...groundedBlob(leaf, [0.62, 0.18, 0.36], [0, 0], 0.06),
  blob(leaf, [0.2, 0.36, 0.2], [-0.19, 0.22 + LIFT, 0.02], 0.07),
  blob(leaf, [0.2, 0.5, 0.2], [0, 0.28 + LIFT, -0.03], 0.07),
  blob(leaf, [0.2, 0.42, 0.2], [0.19, 0.24 + LIFT, 0.03], 0.07),
];

/** Arbusto florecido: arbusto redondo con una flor grande y otra al hombro. */
const bloomingBush = (leaf: string, petal: string, center: string): BoxSpec[] => [
  ...roundBushBody(leaf),
  ...flowerHead(petal, center, [0.02, 0.635 + LIFT, -0.02], 1.15),
  ...flowerHead(petal, center, [0.26, 0.38 + LIFT, 0.2], 0.8),
];

// Parche de flores: [dx, dz, alto del tallo, escala de la cabeza] de cada flor.
const PATCH_STEMS: Array<[number, number, number, number]> = [
  [-0.2, -0.14, 0.24, 1],
  [0.18, 0.08, 0.32, 1.1],
  [-0.04, 0.24, 0.18, 0.85],
];

/** Parche de flores: tallos con mata de hojas al pie y cabeza en cruz. */
const flowerPatch = (leaf: string, stem: string, petal: string, center: string): BoxSpec[] =>
  PATCH_STEMS.flatMap(([dx, dz, height, s]): BoxSpec[] => [
    { ...TOON, size: [0.05, height, 0.05], at: [dx, height / 2 + LIFT, dz], color: stem, outline: FLOWER_OUTLINE },
    ...groundedBlob(leaf, [0.14, 0.1, 0.14], [dx, dz], 0.04),
    ...flowerHead(petal, center, [dx, height + 0.03 + LIFT, dz], s),
  ]);

// Piedritas del desierto (sin sombras, como el original).
const desertRocks = (sand: string, sandDark: string): BoxSpec[] => [
  { size: [0.3, 0.25, 0.3], at: [0, -0.155, 0], color: sand, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.2, 0.18, 0.2], at: [0.25, -0.15, 0.15], color: sandDark, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.15, 0.12, 0.15], at: [-0.2, -0.15, 0.2], color: sand, material: 'lambert', castShadow: false, receiveShadow: false },
];

// Calavera del volcán (sin sombras, como el original).
const skull = (bone: string, dark: string): BoxSpec[] => [
  { size: [0.4, 0.4, 0.4], at: [0, 0, 0], color: bone, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.1, 0.1, 0.05], at: [-0.1, 0, 0.21], color: dark, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.1, 0.1, 0.05], at: [0.1, 0, 0.21], color: dark, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.08, 0.12, 0.05], at: [0, -0.1, 0.21], color: dark, material: 'lambert', castShadow: false, receiveShadow: false },
];

// ---------------------------------------------------------------------------
// Variantes por mundo: el índice del array es el `variant` del MapObject.
// ---------------------------------------------------------------------------

const BUSH_VARIANTS: Record<WorldType, (p: WorldPalette) => BoxSpec[][]> = {
  [WorldType.FOREST]: (p) => [
    roundBush(p.leaf, p.flowerWarm, p.flowerCore),
    doubleBush(p.leaf, p.leafDark, p.flowerLight, p.flowerWarm, p.flowerCore),
    hedgeBush(p.leafDark),
    bloomingBush(p.leaf, p.flowerWarm, p.flowerCore),
    flowerPatch(p.leaf, p.leafDark, p.flowerWarm, p.flowerCore),
    flowerPatch(p.leaf, p.leafDark, p.flowerLight, p.flowerCore),
  ],
  [WorldType.DESERT]: (p) => [desertRocks(p.sand, p.sandDark)],
  [WorldType.VOLCANO]: (p) => [skull(p.bone, p.dark)],
};

export const getBushGroup = ({ position: [x, , z], variant, rotation }: MapObject, ctx: BuildContext) => {
  const { worldType } = ctx;
  const palette = getPalette(worldType);
  const group = new THREE.Group();

  // Terreno fijo a la grilla; solo el arbusto rota.
  addFixedTerrainTile(group, x, z, palette.bushTerrain, ctx, rotation?.[1] ?? 0);

  const variants = (BUSH_VARIANTS[worldType] || BUSH_VARIANTS[WorldType.FOREST])(palette);
  const recipe = variants[variant] ?? variants[0];
  addBoxes(group, [x, 0, z], recipe);

  return group;
};
