import { MapObject } from '@/core-ui/types';
import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import {
  getSharedBoxGeometry,
  getSharedConeGeometry,
  getSharedCylinderGeometry,
  getSharedSphereGeometry,
  getToonGradientMap,
} from '@/core-ui/components/map/tiles/recipe';
import { BuildContext } from '@/core-ui/components/map/types';
import { toonBox, toonMesh } from './toon-mesh';

// ---------------------------------------------------------------------------
// Monumento "Summit Sao Paulo 2026". Estilo toon: losa oscura de la que
// emerge una flecha dorada en zigzag ascendente, placa negra con borde y
// texto dorado/blanco al frente, bandera de Brasil en un mástil, rocas y
// florcitas sobre el pasto. Estático. El frente (placa) mira a −Z.
// Ver well.ts para el patrón de edificio toon.
// ---------------------------------------------------------------------------

const GOLD = '#F6CE3B';
const SLAB = '#45464C';
const SLAB_DK = '#33343A';
const PLAQUE = '#1B1C1E';
const TEXT = '#F2EFE6';
const POLE = '#C9CDD2';
const FLAG_GREEN = '#2E9E43';
const FLAG_YELLOW = '#F7D117';
const FLAG_BLUE = '#2A4B9B';
const STONE = '#B9B4A6';
const STONE_DK = '#9C9689';
const FLOWER = '#FFF7E8';
const FLOWER_CORE = '#FFD95C';

const cyl = getSharedCylinderGeometry;
const sphere = getSharedSphereGeometry;

/**
 * Caja toon SIN contorno inverted-hull, para detalles finos sobre otra cara
 * (marco y mini-flecha de la placa): en piezas de ~0.02 el hull agrega 0.02
 * por lado y sobresale de la placa como un tubo negro que cruza el texto.
 */
const flatBox = (w: number, h: number, d: number, color: string): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    getSharedBoxGeometry(w, h, d, 0, true),
    new THREE.MeshToonMaterial({ color, gradientMap: getToonGradientMap(), vertexColors: true })
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
};

/** Tramo del zigzag entre dos puntos del plano XY (a profundidad z). */
const arrowSegment = (x0: number, y0: number, x1: number, y1: number, z: number): THREE.Group => {
  const length = Math.hypot(x1 - x0, y1 - y0);
  // Se alarga un poco para que las esquinas del zigzag queden llenas (sin
  // exagerar: demasiado solape esconde el quiebre del zigzag).
  const segment = toonBox(length + 0.09, 0.15, 0.13, GOLD, 0.028);
  segment.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  segment.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  return segment;
};

/** Flor mínima: pompón blanco con centro amarillo, apoyada en el pasto. */
const buildFlower = (x: number, z: number): THREE.Group => {
  const flower = new THREE.Group();
  flower.add(toonMesh(sphere(0.045, 8, 6), FLOWER, 0, 0, 0, 1.1));
  flower.add(toonMesh(sphere(0.02, 6, 5), FLOWER_CORE, 0, 0.035, 0, 1.15));
  flower.position.set(x, 0.03, z);
  return flower;
};

/** Roca toon: esfera achatada semihundida en el pasto. */
const buildRock = (x: number, z: number, radius: number, color: string): THREE.Group => {
  const rock = toonMesh(sphere(radius, 8, 6), color, 0, 0, 0, 1.05);
  rock.position.set(x, radius * 0.35, z);
  rock.scale.y = 0.7;
  return rock;
};

/** Monumento construido en el origen (frente = −Z). Estático. */
export function getSummitGroup(_: MapObject, ctx: BuildContext): THREE.Group {
  const g = new THREE.Group();

  // Losa oscura de la que sale la flecha, apenas reclinada hacia atrás.
  const slab = toonBox(0.62, 0.78, 0.14, SLAB, 0.03);
  slab.position.set(-0.06, 0.4, 0.14);
  slab.rotation.x = 0.1;
  g.add(slab);
  const slabBase = toonBox(0.72, 0.12, 0.24, SLAB_DK, 0.03);
  slabBase.position.set(-0.06, 0.06, 0.14);
  g.add(slabBase);

  // Flecha dorada en zigzag ascendente, en el plano XY delante de la losa.
  // El frente mira a −Z, así que el ESPECTADOR ve x invertido: el zigzag se
  // construye espejado (de +x a −x) para que se lea subiendo a la DERECHA,
  // como en el logo del Summit.
  const az = 0.02;
  g.add(arrowSegment(0.44, 0.3, 0.2, 0.6, az));
  g.add(arrowSegment(0.2, 0.6, 0.04, 0.4, az));
  g.add(arrowSegment(0.04, 0.4, -0.28, 0.78, az));
  // Punta: pirámide (cono de 4 lados) apuntando en la dirección del último tramo.
  const tipAngle = Math.atan2(0.78 - 0.4, -0.28 - 0.04);
  const tip = toonMesh(getSharedConeGeometry(0.17, 0.3, 4), GOLD, -0.39, 0.91, az, 1.05);
  tip.rotation.z = tipAngle - Math.PI / 2;
  tip.rotation.y = Math.PI / 4;
  g.add(tip);

  // Placa negra reclinada al frente, con marco dorado y texto en relieve.
  const plaque = new THREE.Group();
  plaque.add(toonBox(0.66, 0.46, 0.05, PLAQUE, 0.02));
  // Marco: cuatro listones dorados finos, apenas salidos de la cara frontal.
  // Sin contorno (flatBox): con hull, el tubo negro cruzaba el texto.
  const frameX = flatBox(0.56, 0.02, 0.012, GOLD);
  frameX.position.set(0, 0.19, -0.028);
  plaque.add(frameX);
  const frameXBottom = flatBox(0.56, 0.02, 0.012, GOLD);
  frameXBottom.position.set(0, -0.19, -0.028);
  plaque.add(frameXBottom);
  const frameYLeft = flatBox(0.02, 0.4, 0.012, GOLD);
  frameYLeft.position.set(-0.27, 0, -0.028);
  plaque.add(frameYLeft);
  const frameYRight = flatBox(0.02, 0.4, 0.012, GOLD);
  frameYRight.position.set(0.27, 0, -0.028);
  plaque.add(frameYRight);

  // Texto (si la fuente todavía no cargó, la placa sale sin letras y el
  // próximo rebuild con font las agrega — mismo comportamiento que el podio).
  if (ctx.font) {
    const textMat = new THREE.MeshToonMaterial({ color: TEXT, gradientMap: getToonGradientMap() });
    const addLine = (label: string, size: number, y: number, material: THREE.Material, x = 0) => {
      const geometry = new TextGeometry(label, { font: ctx.font!, size, depth: 0.02, curveSegments: 6, bevelEnabled: false });
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox!;
      const mesh = new THREE.Mesh(geometry, material);
      // La cara frontal de la placa está en z=-0.025 (mira a −Z): el texto se
      // apoya ahí y se rota para leerse desde el frente.
      mesh.rotation.y = Math.PI;
      mesh.position.set(x + (bbox.max.x + bbox.min.x) / 2, y - (bbox.max.y + bbox.min.y) / 2, -0.028);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.raycast = () => undefined;
      plaque.add(mesh);
    };
    addLine('SUMMIT', 0.095, 0.115, textMat);
    addLine('Sao Paulo', 0.052, 0.005, textMat);
    addLine('2026', 0.092, -0.11, textMat);
  }
  plaque.position.set(0, 0.24, -0.33);
  plaque.rotation.x = -0.28;
  g.add(plaque);

  // Bandera de Brasil ADELANTE (rincón frontal, a la izquierda del
  // espectador: x local positivo por el espejado del frente en −Z) — atrás
  // quedaba tapada por la losa.
  const flagX = 0.44;
  const flagZ = -0.3;
  g.add(toonMesh(cyl(0.02, 0.024, 0.66, 10), POLE, flagX, 0.33, flagZ, 1.08));
  g.add(toonMesh(sphere(0.04, 8, 6), FLAG_YELLOW, flagX, 0.68, flagZ, 1.1));
  const flag = new THREE.Group();
  flag.add(toonBox(0.3, 0.19, 0.024, FLAG_GREEN, 0.01));
  const diamond = toonBox(0.1, 0.1, 0.028, FLAG_YELLOW, 0.005);
  diamond.rotation.z = Math.PI / 4;
  flag.add(diamond);
  const circle = toonMesh(cyl(0.034, 0.034, 0.034, 12), FLAG_BLUE, 0, 0, 0, 1.06);
  circle.rotation.x = Math.PI / 2;
  flag.add(circle);
  flag.position.set(flagX - 0.16, 0.545, flagZ);
  g.add(flag);

  // Rocas y flores repartidas por el pasto.
  g.add(buildRock(0.28, -0.4, 0.09, STONE));
  g.add(buildRock(0.18, -0.42, 0.055, STONE_DK));
  g.add(buildRock(-0.4, -0.28, 0.11, STONE));
  g.add(buildRock(-0.42, 0.14, 0.07, STONE_DK));
  g.add(buildRock(0.42, 0.06, 0.06, STONE));
  g.add(buildFlower(0.42, -0.14));
  g.add(buildFlower(-0.3, -0.42));
  g.add(buildFlower(-0.44, 0.34));

  return g;
}
