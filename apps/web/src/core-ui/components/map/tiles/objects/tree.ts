import { getTileTopY } from '@/core-ui/helpers/map';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { BuildContext } from '../../types';
import { getPalette, WorldPalette } from '../palette';
import { addBoxes, addTerrainTile, BoxSpec, OUTLINE_COLOR } from '../recipe';

// ---------------------------------------------------------------------------
// Formas: cada función devuelve la receta (lista de cajas) de una silueta de
// árbol, parametrizada por color. Los offsets son relativos al tope del tile.
// ---------------------------------------------------------------------------

// Estilo toon de la vegetación: cel-shading + contorno oscuro + copas
// biseladas.
const TRUNK_OUTLINE = 0.02;
const LEAF_OUTLINE = 0.02;
const LEAF_BEVEL = 0.1;

// El tronco flota apenas sobre el tile: el hull del contorno sobresale por
// debajo y llena ese hueco de negro, dibujando la línea de base contra el
// suelo (el inverted hull no genera silueta donde una caja se hunde en otra).
const TRUNK_LIFT = 0.015;

// receiveShadow apagado: el shadow map de la escena mete acné (moteado) en
// las caras planas del cel-shading; el volumen ya lo dan faceShade + toon.
const TOON = { material: 'toon', faceShade: true, receiveShadow: false } as const;

/**
 * Tronco de un solo color apoyado sobre el tile. `height` permite alargarlo
 * para que siempre penetre en la copa (si copa y tronco apenas se tocan, el
 * contorno de la copa los hace ver como piezas separadas). El zócalo negro
 * dibuja la línea de base contra el suelo: el hull solo da silueta y desde
 * ángulos bajos esa base se veía como mancha, no como trazo.
 */
const toonTrunk = (trunk: string, height = 0.5): BoxSpec[] => [
  {
    size: [0.18 + 2 * TRUNK_OUTLINE, 0.04, 0.18 + 2 * TRUNK_OUTLINE],
    at: [0, -0.485, 0],
    color: OUTLINE_COLOR,
    material: 'basic',
    castShadow: false,
    receiveShadow: false,
  },
  { ...TOON, size: [0.18, height, 0.18], at: [0, height / 2 - 0.5 + TRUNK_LIFT, 0], color: trunk, outline: TRUNK_OUTLINE },
];

/** Árbol clásico: tronco + copa cúbica biselada. */
const crownTree = (trunk: string, leaf: string): BoxSpec[] => [
  ...toonTrunk(trunk),
  { ...TOON, size: [0.75, 0.65, 0.75], at: [0, 0.18, 0], color: leaf, bevel: LEAF_BEVEL, outline: LEAF_OUTLINE },
];

/** Árbol redondo: como el clásico pero más alto y de copa angosta. */
const roundTree = (trunk: string, leaf: string): BoxSpec[] => [
  ...toonTrunk(trunk, 0.62),
  { ...TOON, size: [0.6, 0.58, 0.6], at: [0, 0.3, 0], color: leaf, bevel: 0.09, outline: LEAF_OUTLINE },
];

/**
 * Árbol de copa doble (asimétrico). La copa chica NO se entierra en la grande:
 * cuelga justo debajo de su borde con un hueco menor que el grosor del hull,
 * que lo llena de negro y dibuja la línea de unión entre copas (mismo truco
 * que TRUNK_LIFT — enterradas no hay silueta).
 */
const doubleCrownTree = (trunk: string, leaf: string): BoxSpec[] => [
  ...toonTrunk(trunk, 0.62),
  // copa principal un poco más chica que la de roundTree y arrancando más
  // arriba (y=0.08), para que la secundaria — pegada bajo su borde — quede
  // alta sin agrandar el árbol.
  { ...TOON, size: [0.56, 0.48, 0.56], at: [0, 0.32, 0], color: leaf, bevel: 0.09, outline: LEAF_OUTLINE },
  // copa secundaria colgando bajo la esquina de la principal, con tope en
  // y=0.054: hueco de 0.026 < su outline (0.03, más grueso que LEAF_OUTLINE
  // para que el hull siga llenando la ranura de negro con el arbusto un poco
  // más abajo — pegado a la copa los dos contornos se pellizcaban). La línea
  // de unión es el propio contorno del arbusto cerrándose en la ranura, no
  // una pieza aparte. Clave: su meseta superior plana (footprint − bevel)
  // queda TODA bajo la copa (|0.13|+0.13 ≤ 0.28); si asoma, se ve una franja
  // verde iluminada entre la copa y la línea. Solo sobresalen los hombros
  // curvos, cuyo hull sí dibuja silueta.
  { ...TOON, size: [0.42, 0.3, 0.42], at: [0.13, -0.096, 0.13], color: leaf, bevel: 0.08, outline: 0.03 },
];

/** Cactus chico con dos brazos. */
const cactus = (color: string): BoxSpec[] => [
  { size: [0.2, 1, 0.2], at: [0, 0, 0], color },
  { size: [0.1, 0.5, 0.1], at: [0.2, 0.2, 0], color },
  { size: [0.1, 0.4, 0.1], at: [-0.2, 0.15, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0, 0, 0], color },
];

// Escalones de cada fronda de palmera: se alejan del centro y bajan, para que
// la hoja se lea como un arco que cae (droop voxel) y no como una cruz plana.
const FROND_STEPS: Array<{ dist: number; y: number; long: number; wide: number; thick: number }> = [
  { dist: 0.2, y: 0.5, long: 0.3, wide: 0.2, thick: 0.07 },
  { dist: 0.43, y: 0.455, long: 0.26, wide: 0.17, thick: 0.06 },
  { dist: 0.6, y: 0.41, long: 0.2, wide: 0.14, thick: 0.05 },
];

// Contorno fino para piezas chicas (frondas, cocos): con LEAF_OUTLINE el hull
// engordaba casi tanto como la pieza.
const FROND_OUTLINE = 0.012;

/** Palmera: tronco alto + penacho con frondas que caen en escalones + cocos. */
const palmTree = (trunk: string, leaf: string, coconut: string): BoxSpec[] => {
  const fronds: BoxSpec[] = [];
  for (const [ux, uz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (const s of FROND_STEPS) {
      fronds.push({
        ...TOON,
        size: ux !== 0 ? [s.long, s.thick, s.wide] : [s.wide, s.thick, s.long],
        at: [ux * s.dist, s.y, uz * s.dist],
        color: leaf,
        bevel: 0.02,
        outline: FROND_OUTLINE,
      });
    }
  }
  return [
    ...toonTrunk(trunk, 0.95),
    // penacho central del que nacen las frondas
    { ...TOON, size: [0.26, 0.14, 0.26], at: [0, 0.52, 0], color: leaf, bevel: 0.05, outline: LEAF_OUTLINE },
    ...fronds,
    // cocos colgando bajo el penacho, hundidos apenas en el tronco
    { ...TOON, size: [0.11, 0.11, 0.11], at: [0.1, 0.4, 0.08], color: coconut, bevel: 0.03, outline: FROND_OUTLINE },
    { ...TOON, size: [0.11, 0.11, 0.11], at: [-0.09, 0.4, -0.07], color: coconut, bevel: 0.03, outline: FROND_OUTLINE },
  ];
};

/** Cactus grande con base en cruz. */
const bigCactus = (color: string): BoxSpec[] => [
  { size: [0.3, 1, 0.3], at: [0, 0, 0], color },
  { size: [0.1, 0.5, 0.1], at: [0.3, 0.2, 0], color },
  { size: [0.1, 0.2, 0.1], at: [-0.3, -0.1, 0], color },
  { size: [0.7, 0.1, 0.1], at: [0, 0, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0, -0.5, 0], color },
  { size: [0.1, 0.1, 0.4], at: [0, -0.5, 0], color },
];

const PUMPKIN_OUTLINE = 0.02;

/**
 * Calabaza toon: tres gajos verticales redondeados (uno central + dos
 * laterales más bajos), TODOS de la misma profundidad y con la base apoyada en
 * la superficie del tile (recipe-local y = −0.5). Al compartir profundidad la
 * silueta de costado queda limpia (un solo contorno) y los surcos entre gajos
 * se leen tanto de frente como desde arriba. Tallo verde embutido en el tope y
 * —en bosque— carita tallada. Diseño validado renderizándolo con el mismo
 * pipeline toon (gradient map + faceShade + inverted-hull) de recipe.ts.
 */
const pumpkin = (body: string, dark: string, stem: string, withEyes: boolean): BoxSpec[] => {
  const depth = 0.72;
  // Un gajo: caja redondeada toon apoyada en la superficie (bottom = −0.5).
  const lobe = (w: number, h: number, dx: number): BoxSpec => ({
    ...TOON,
    size: [w, h, depth],
    at: [dx, -0.5 + h / 2, 0],
    color: body,
    bevel: 0.12,
    outline: PUMPKIN_OUTLINE,
  });
  const specs: BoxSpec[] = [
    lobe(0.36, 0.58, 0), // gajo central (más alto y ancho)
    lobe(0.3, 0.48, 0.29), // gajo derecho
    lobe(0.3, 0.48, -0.29), // gajo izquierdo
    // Tallo verde embutido en el tope del gajo central (top ≈ 0.08).
    { ...TOON, size: [0.12, 0.16, 0.12], at: [0, 0.13, 0], color: stem, bevel: 0.03, outline: PUMPKIN_OUTLINE },
  ];
  if (withEyes) {
    // Ojos tallados: parches negros planos sobre la cara frontal del gajo
    // central (z = 0.38, apenas por delante de la cara en depth/2 = 0.36).
    const z = depth / 2 + 0.02;
    specs.push(
      { size: [0.1, 0.12, 0.02], at: [-0.11, -0.16, z], color: dark, material: 'basic', castShadow: false, receiveShadow: false },
      { size: [0.1, 0.12, 0.02], at: [0.11, -0.16, z], color: dark, material: 'basic', castShadow: false, receiveShadow: false }
    );
  }
  return specs;
};

/** Tronco seco con ramas quebradas. */
const deadTree = (color: string): BoxSpec[] => [
  { size: [0.2, 0.8, 0.2], at: [0, -0.65, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0.2, -0.35, 0], color },
  { size: [0.3, 0.1, 0.1], at: [-0.2, -0.5, 0], color },
  { size: [0.15, 0.2, 0.15], at: [0.05, -0.15, 0], color },
];

// ---------------------------------------------------------------------------
// Variantes por mundo: el índice del array es el `variant` del MapObject.
// ---------------------------------------------------------------------------

const TREE_VARIANTS: Record<WorldType, (p: WorldPalette) => BoxSpec[][]> = {
  [WorldType.FOREST]: (p) => [
    crownTree(p.trunk, p.leaf),
    roundTree(p.trunk, p.leaf),
    doubleCrownTree(p.trunk, p.leaf),
    cactus(p.cactus),
    palmTree(p.trunk, p.leafDark, p.deadWood),
    bigCactus(p.cactus),
    pumpkin(p.pumpkin, p.dark, p.leafDark, true),
    deadTree(p.deadWood),
  ],
  [WorldType.DESERT]: (p) => [cactus(p.sand), palmTree(p.sand, p.leaf, p.deadWood), bigCactus(p.trunk)],
  [WorldType.VOLCANO]: (p) => [pumpkin(p.pumpkin, p.dark, p.leafDark, false), deadTree(p.deadWood), deadTree(p.deadWood)],
};

export const getTreeGroup = ({ position: [x, , z], variant }: MapObject, ctx: BuildContext) => {
  const { worldType } = ctx;
  const palette = getPalette(worldType);
  const group = new THREE.Group();

  addTerrainTile(group, x, z, palette.treeTerrain, ctx);

  const variants = (TREE_VARIANTS[worldType] || TREE_VARIANTS[WorldType.FOREST])(palette);
  const recipe = variants[variant];
  if (recipe) {
    addBoxes(group, [x, getTileTopY(), z], recipe);
  }

  return group;
};
