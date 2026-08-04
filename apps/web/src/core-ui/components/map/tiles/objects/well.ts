import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { addBoxes, BoxSpec, getSharedCylinderGeometry, getSharedTorusGeometry } from '@/core-ui/components/map/tiles/recipe';
import { toonBox, toonMesh } from './toon-mesh';

// ---------------------------------------------------------------------------
// Pozo (edificio). Estilo toon: brocal circular de piedra con borde de piedra
// (toro) y agua adentro, balde de madera colgando, dos postes con rodillo +
// manivela, y techo a dos aguas con tejas rojas. Todo estático. El frente
// (manivela) mira a −Z. Ver windmill.ts para el patrón de edificio toon.
// ---------------------------------------------------------------------------

const TOON = { material: 'toon', faceShade: true, receiveShadow: false } as const;

const STONE = '#DBD5C7';
const STONE_DK = '#C1BAA6';
const WATER = '#4FA6D4';
const WOOD = '#9B6B3E';
const WOOD_DK = '#79512F';
const ROOF = '#CB5A3C';
const ROOF_DK = '#A6432A';

const cyl = getSharedCylinderGeometry;

/** Un faldón del techo: losa roja + tejas (líneas oscuras) proud en la cara sup. */
const buildSlope = (): THREE.Group => {
  const s = new THREE.Group();
  s.add(toonBox(0.94, 0.06, 0.46, ROOF, 0.03));
  for (const zz of [-0.15, 0, 0.15]) {
    const course = toonBox(0.94, 0.022, 0.05, ROOF_DK, 0);
    course.position.set(0, 0.04, zz);
    s.add(course);
  }
  return s;
};

/** Pozo construido en el origen (frente = −Z). Estático. */
export function getWellGroup(_: MapObject, __: WorldType): THREE.Group {
  const g = new THREE.Group();
  const pz = 0;

  // Brocal de piedra + borde (toro, deja ver el agua) + agua.
  g.add(toonMesh(cyl(0.42, 0.45, 0.44, 20), STONE, 0, 0.22, pz, 1.03));
  const rim = toonMesh(getSharedTorusGeometry(0.4, 0.075, 10, 22), STONE_DK, 0, 0.45, pz, 1.03);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  g.add(toonMesh(cyl(0.38, 0.38, 0.05, 20), WATER, 0, 0.44, pz, 1.0));

  // Balde de madera sobre el agua + cuerda.
  g.add(toonMesh(cyl(0.1, 0.115, 0.15, 12), WOOD, 0, 0.53, pz, 1.05));
  g.add(toonMesh(cyl(0.088, 0.088, 0.02, 12), WOOD_DK, 0, 0.61, pz, 1.06));
  addBoxes(g, [0, 0, 0], [{ ...TOON, size: [0.02, 0.14, 0.02], at: [0, 0.72, pz], color: WOOD_DK, bevel: 0, outline: 0 } as BoxSpec]);

  // Postes + rodillo (eje a lo largo de X) + manivela en +X.
  const px = 0.36;
  g.add(toonMesh(cyl(0.055, 0.06, 0.9, 12), WOOD, -px, 0.75, pz, 1.05));
  g.add(toonMesh(cyl(0.055, 0.06, 0.9, 12), WOOD, px, 0.75, pz, 1.05));
  const roller = toonMesh(cyl(0.05, 0.05, 0.7, 12), WOOD_DK, 0, 0.9, pz, 1.05);
  roller.rotation.z = Math.PI / 2;
  g.add(roller);
  const crank = toonBox(0.14, 0.05, 0.05, WOOD, 0.02);
  crank.position.set(px + 0.13, 0.9, pz);
  g.add(crank);
  g.add(toonMesh(cyl(0.035, 0.035, 0.13, 8), WOOD_DK, px + 0.19, 0.83, pz, 1.06));

  // Techo a dos aguas simétrico sobre los postes + cumbrera de madera.
  const ridgeY = 1.34;
  const sy = ridgeY - 0.14;
  const sd = 0.19;
  const ang = 0.62;
  const sf = buildSlope();
  sf.position.set(0, sy, pz - sd);
  sf.rotation.x = -ang;
  g.add(sf);
  const sb = buildSlope();
  sb.position.set(0, sy, pz + sd);
  sb.rotation.x = ang;
  g.add(sb);
  const ridge = toonMesh(cyl(0.05, 0.05, 1.05, 10), WOOD, 0, ridgeY, pz, 1.05);
  ridge.rotation.z = Math.PI / 2;
  g.add(ridge);

  return g;
}
