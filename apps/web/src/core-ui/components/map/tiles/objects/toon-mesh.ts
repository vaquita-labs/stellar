import * as THREE from 'three';
import { getSharedBoxGeometry, getToonGradientMap, OUTLINE_COLOR } from '@/core-ui/components/map/tiles/recipe';

// ---------------------------------------------------------------------------
// Helpers toon compartidos por los edificios (windmill/well/lamp...). Cada uno
// devuelve un THREE.Group con el mesh cel-shaded + su contorno inverted-hull
// (copia escalada BackSide). Antes estaban duplicados en cada archivo.
// ---------------------------------------------------------------------------

const OUTLINE = 0.02;

/**
 * Mesh toon para una geometría YA preparada (con faceShade horneado, p.ej. las
 * de getSharedCylinder/Cone/Torus/SphereGeometry). Devuelve un grupo ubicado en
 * (x,y,z); el caller puede rotarlo. `outlineScale` engorda el contorno.
 */
export const toonMesh = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, outlineScale = 1.04): THREE.Group => {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color, gradientMap: getToonGradientMap(), vertexColors: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  group.add(mesh);
  const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }));
  outline.scale.setScalar(outlineScale);
  outline.castShadow = false;
  outline.receiveShadow = false;
  group.add(outline);
  group.position.set(x, y, z);
  return group;
};

/**
 * Caja toon redondeada (geometría compartida + faceShade) + contorno, SIN
 * posicionar (el caller la ubica/rota). El contorno engorda OUTLINE por lado.
 */
export const toonBox = (w: number, h: number, d: number, color: string, bevel = 0.03): THREE.Group => {
  const geo = getSharedBoxGeometry(w, h, d, bevel, true);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color, gradientMap: getToonGradientMap(), vertexColors: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  group.add(mesh);
  const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }));
  outline.scale.set((w + 2 * OUTLINE) / w, (h + 2 * OUTLINE) / h, (d + 2 * OUTLINE) / d);
  outline.castShadow = false;
  outline.receiveShadow = false;
  group.add(outline);
  return group;
};
