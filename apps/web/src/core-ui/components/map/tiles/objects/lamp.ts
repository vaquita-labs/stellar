import { MapObject } from '@/core-ui/types';
import * as THREE from 'three';
import { BuildContext } from '@/core-ui/components/map/types';
import {
  getSharedConeGeometry,
  getSharedCylinderGeometry,
  getSharedSphereGeometry,
  getToonGradientMap,
  OUTLINE_COLOR,
} from '@/core-ui/components/map/tiles/recipe';
import { toonMesh } from './toon-mesh';

// ---------------------------------------------------------------------------
// Farol de calle (decoración que SE PRENDE DE NOCHE). Poste de metal oscuro con
// base de bronce y una linterna hexagonal con vidrio cálido arriba. El vidrio
// GLOW y una PointLight se encienden de noche: eso reacciona al ciclo día/noche
// (dayProgress) así que vive en el componente Extras `LampGlow` (registry.tsx).
// En preview/edición (sin React) el vidrio va estático (apagado). El buje/marco
// metálico es siempre estático. Radialmente simétrico → baseRotation no importa.
// ---------------------------------------------------------------------------

const METAL = '#3B3F46';
const METAL_DK = '#2A2D33';
const BRONZE = '#9B6B3E';
const GLASS = '#F5D98F';
export const LAMP_GLOW = '#FFB733';

/** Altura (local) del centro del vidrio de la linterna. */
export const LAMP_GLASS_Y = 0.98;

const cyl = getSharedCylinderGeometry;

/**
 * El vidrio de la linterna (centrado en el origen), con material emissive
 * (apagado por defecto). `userData.glassMat` expone el material para que Extras
 * suba la emisión de noche. Se usa tanto para el vidrio estático (preview) como
 * para el animado (mapa normal).
 */
export const buildLampGlass = (): THREE.Group => {
  const geo = cyl(0.1, 0.135, 0.24, 6); // geometría compartida (faceShade ya horneado)
  const mat = new THREE.MeshToonMaterial({
    color: GLASS,
    gradientMap: getToonGradientMap(),
    vertexColors: true,
    emissive: new THREE.Color(LAMP_GLOW),
    emissiveIntensity: 0,
  });
  const grp = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  grp.add(mesh);
  const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }));
  outline.scale.setScalar(1.04);
  grp.add(outline);
  grp.userData.glassMat = mat;
  return grp;
};

/**
 * Farol construido en el origen. Incluye el vidrio ESTÁTICO (apagado) salvo que
 * `ctx.animated` (mapa normal): ahí lo omite porque lo enciende `LampGlow`.
 */
export function getLampGroup(_: MapObject, ctx: BuildContext): THREE.Group {
  const g = new THREE.Group();
  // Base + collar de bronce.
  g.add(toonMesh(cyl(0.15, 0.17, 0.08, 16), METAL, 0, 0.04, 0, 1.04));
  g.add(toonMesh(cyl(0.11, 0.13, 0.07, 16), BRONZE, 0, 0.11, 0, 1.05));
  // Poste + collar bajo la linterna.
  g.add(toonMesh(cyl(0.045, 0.05, 0.62, 12), METAL, 0, 0.44, 0, 1.05));
  g.add(toonMesh(cyl(0.08, 0.09, 0.06, 12), BRONZE, 0, 0.77, 0, 1.05));
  // Marco inferior (hex) + barras verticales del marco + marco superior.
  g.add(toonMesh(cyl(0.14, 0.15, 0.05, 6), METAL_DK, 0, 0.83, 0, 1.05));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(toonMesh(cyl(0.014, 0.014, 0.24, 6), METAL, Math.cos(a) * 0.125, LAMP_GLASS_Y, Math.sin(a) * 0.125, 1.08));
  }
  g.add(toonMesh(cyl(0.15, 0.13, 0.05, 6), METAL_DK, 0, 1.12, 0, 1.05));
  // Tapa cónica + remate esférico.
  g.add(toonMesh(getSharedConeGeometry(0.18, 0.14, 6), METAL, 0, 1.22, 0, 1.05));
  g.add(toonMesh(getSharedSphereGeometry(0.035, 10, 8), METAL_DK, 0, 1.32, 0, 1.06));

  if (!ctx.animated) {
    const glass = buildLampGlass();
    glass.position.y = LAMP_GLASS_Y;
    g.add(glass);
  }
  return g;
}
