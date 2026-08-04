import { MapObject } from '@/core-ui/types';
import * as THREE from 'three';
import { BuildContext } from '@/core-ui/components/map/types';
import { addBoxes, BoxSpec, getSharedConeGeometry, getSharedCylinderGeometry } from '@/core-ui/components/map/tiles/recipe';
import { toonMesh } from './toon-mesh';

// ---------------------------------------------------------------------------
// Molino de viento (edificio). Estilo toon: torre cónica de piedra + techo
// rojo + 4 aspas en X. El frente mira a −Z. getWindmillGroup arma todo (con las
// aspas en reposo) y se fusiona (mergeStaticGroup); así se ve igual en el mapa,
// el modo edición y el preview del catálogo. `buildWindmillSails` queda
// exportado por si en el futuro se quieren animar girando (habría que sacarlas
// de la geometría fusionada y moverlas a un componente R3F con useFrame, y dar
// una versión estática al preview/edición para que no queden sin aspas).
// ---------------------------------------------------------------------------

const TOON = { material: 'toon', faceShade: true, receiveShadow: false } as const;
const OUT = 0.02;

// Paleta del molino.
const STONE = '#E6DCC6';
const STONE_DARK = '#D2C6AC';
const ROOF_RED = '#C0472F';
const ROOF_DARK = '#9E3A25';
const WOOD = '#8B5A34';
const WOOD_DARK = '#6B4526';
const GLASS = '#39332A';
const FRAME = '#D8CBB0';
const SAIL = '#F2EAD9';

/** Caja toon redondeada con contorno. */
const B = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, bevel = 0.06): BoxSpec => ({
  ...TOON,
  size: [w, h, d],
  at: [x, y, z],
  color,
  bevel,
  outline: OUT,
});

// Geometría de la torre (cilindro tapered) para calcular la cara frontal.
const TOWER_B = 0.16; // altura de la base de piedra
const TOWER_H = 0.86;
const RADIUS_BOTTOM = 0.42;
const RADIUS_TOP = 0.3;
const TOWER_TOP = TOWER_B + TOWER_H;
/** Radio de la torre (que se afina hacia arriba) a una altura y. */
const towerRadius = (y: number): number => {
  const f = Math.max(0, Math.min(1, (y - TOWER_B) / TOWER_H));
  return RADIUS_BOTTOM + (RADIUS_TOP - RADIUS_BOTTOM) * f;
};
/** z de la cara frontal (−Z) de la torre a una altura y. */
const frontZ = (y: number): number => -(towerRadius(y) + 0.01);

// Buje (eje) donde nacen las aspas, en el frente de la torre.
const HUB_Y = 0.66;
const HUB_Z = frontZ(HUB_Y);
/** Posición del centro de las aspas (Extras) en coords locales del edificio. */
export const WINDMILL_HUB: [number, number, number] = [0, HUB_Y, HUB_Z - 0.12];

/** Un aspa apuntando +Y desde el centro (viga de madera + panel de rejilla). */
const buildArm = (): THREE.Group => {
  const arm = new THREE.Group();
  addBoxes(arm, [0, 0, 0], [B(0.05, 0.58, 0.05, 0, 0.3, 0, WOOD, 0.02)]); // viga radial
  addBoxes(arm, [0, 0, 0], [B(0.16, 0.44, 0.02, 0.11, 0.33, 0.01, SAIL, 0.02)]); // panel (offset = molinete)
  for (const yy of [0.16, 0.31, 0.46]) {
    addBoxes(arm, [0, 0, 0], [{ ...TOON, size: [0.16, 0.022, 0.01], at: [0.11, yy, 0.02], color: WOOD_DARK, bevel: 0, outline: 0 }]);
  }
  return arm;
};

/** Grupo de las 4 aspas (en reposo forman una X). Lo anima Extras rotándolo en Z. */
export const buildWindmillSails = (): THREE.Group => {
  const sails = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const arm = buildArm();
    arm.rotation.z = (k * Math.PI) / 2;
    sails.add(arm);
  }
  addBoxes(sails, [0, 0, 0], [B(0.15, 0.15, 0.12, 0, 0, 0.02, WOOD_DARK, 0.05)]); // buje central
  sails.rotation.z = Math.PI / 4; // reposo en X
  return sails;
};

/**
 * Molino construido en el origen. Incluye las aspas EN REPOSO salvo que
 * `ctx.animated` (mapa normal): ahí las omite porque las anima el componente
 * WindmillSails (registry.tsx). En edición/preview van estáticas.
 */
export function getWindmillGroup(_: MapObject, ctx: BuildContext): THREE.Group {
  const g = new THREE.Group();

  // Base de piedra (plataforma cuadrada redondeada).
  addBoxes(g, [0, 0, 0], [B(0.92, 0.16, 0.92, 0, 0.08, 0, STONE_DARK, 0.06)]);
  // Torre cónica de piedra + alero + techo cónico rojo + remate de madera.
  g.add(toonMesh(getSharedCylinderGeometry(RADIUS_TOP, RADIUS_BOTTOM, TOWER_H, 18), STONE, 0, TOWER_B + TOWER_H / 2, 0, 1.03));
  g.add(toonMesh(getSharedCylinderGeometry(0.4, 0.46, 0.1, 18), ROOF_DARK, 0, TOWER_TOP + 0.05, 0, 1.03));
  g.add(toonMesh(getSharedConeGeometry(0.44, 0.42, 18), ROOF_RED, 0, TOWER_TOP + 0.31, 0, 1.04));
  g.add(toonMesh(getSharedCylinderGeometry(0.04, 0.07, 0.1, 12), WOOD_DARK, 0, TOWER_TOP + 0.52, 0, 1.05));

  // Ventana (arriba, bajo el techo).
  const wy = 0.82;
  const wz = frontZ(wy);
  addBoxes(g, [0, 0, 0], [B(0.2, 0.22, 0.05, 0, wy, wz, FRAME, 0.05)]);
  addBoxes(g, [0, 0, 0], [B(0.13, 0.15, 0.03, 0, wy, wz - 0.02, GLASS, 0.03)]);
  addBoxes(g, [0, 0, 0], [{ ...TOON, size: [0.13, 0.02, 0.02], at: [0, wy, wz - 0.03], color: FRAME, bevel: 0, outline: 0 }]);
  addBoxes(g, [0, 0, 0], [{ ...TOON, size: [0.02, 0.15, 0.02], at: [0, wy, wz - 0.03], color: FRAME, bevel: 0, outline: 0 }]);

  // Puerta arqueada (abajo).
  const dy = 0.34;
  const dz = frontZ(dy);
  addBoxes(g, [0, 0, 0], [B(0.28, 0.4, 0.05, 0, dy, dz + 0.02, FRAME, 0.06)]);
  addBoxes(g, [0, 0, 0], [B(0.22, 0.34, 0.05, 0, dy - 0.02, dz, WOOD, 0.09)]);

  // Buje (siempre) + aspas en reposo (salvo en el mapa normal, que las anima).
  addBoxes(g, [0, 0, 0], [B(0.14, 0.14, 0.12, 0, HUB_Y, HUB_Z - 0.02, WOOD_DARK, 0.05)]);
  if (!ctx.animated) {
    const sails = buildWindmillSails();
    sails.position.set(...WINDMILL_HUB);
    g.add(sails);
  }

  return g;
}
