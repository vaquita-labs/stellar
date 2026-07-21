import { MapObjectType } from '@/core-ui/types';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE_HEIGHT, TILE_SIZE } from '../constants';
import { BuildContext } from '../types';
import { getPalette } from './palette';

// Una "receta" describe un objeto del mapa como una lista de cajas (tamaño,
// offset, color). Los builders en objects/* componen recetas en vez de crear
// meshes a mano: agregar una variante nueva es agregar datos, no código.
export interface BoxSpec {
  /** [ancho, alto, profundidad] */
  size: [number, number, number];
  /** offset respecto del origen que recibe addBoxes */
  at: [number, number, number];
  color: string;
  /**
   * 'standard' reacciona mejor a la luz; 'lambert' es más barato; 'toon' es
   * cel-shading (la luz se corta en bandas planas por cara); 'basic' ignora
   * la luz (color plano, para trazos dibujados). Default: 'standard'.
   */
  material?: 'standard' | 'lambert' | 'toon' | 'basic';
  /** radio de biselado de esquinas en unidades de mundo (esquinas redondeadas) */
  bevel?: number;
  /**
   * hornea un tono fijo por cara en la geometría (vertex colors): tope claro,
   * caras laterales en dos tonos, base oscura. Garantiza el look cel-shaded
   * desde cualquier ángulo de cámara/sol, independiente de la luz de escena.
   */
  faceShade?: boolean;
  /**
   * grosor en unidades de mundo del contorno oscuro: una copia de la caja
   * apenas más grande con caras invertidas (inverted hull), que dibuja la
   * silueta del objeto según el ángulo de cámara.
   */
  outline?: number;
  /** default true */
  castShadow?: boolean;
  /** default true */
  receiveShadow?: boolean;
}

export const OUTLINE_COLOR = '#1f1a12';

// Gradient map compartido del cel-shading: 3 bandas de luz (sombra, media,
// plena). NearestFilter es lo que corta la luz en escalones en vez de
// interpolarla. Singleton de sesión: material.dispose() no dispone texturas,
// así que sobrevive a los rebuilds del mapa.
let toonGradientMap: THREE.DataTexture | null = null;
const getToonGradientMap = (): THREE.DataTexture => {
  if (!toonGradientMap) {
    const bands = new Uint8Array([120, 190, 255]);
    toonGradientMap = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
    toonGradientMap.minFilter = THREE.NearestFilter;
    toonGradientMap.magFilter = THREE.NearestFilter;
    toonGradientMap.needsUpdate = true;
  }
  return toonGradientMap;
};

// Cache global de BoxGeometry por dimensiones. Las geometrías nunca se mutan
// (la posición vive en el mesh), así que compartirlas entre tiles es seguro y
// evita crear/disponer cientos de geometrías idénticas en cada rebuild del
// mapa. disposeObject (helpers.ts) las respeta vía userData.shared.
const geometryCache = new Map<string, THREE.BoxGeometry>();

// Tonos por cara del faceShade. Caras x y z distintas para que cualquier vista
// en esquina muestre siempre dos laterales de tono diferente, como en el
// cel-shading de referencia. En los biseles el normal interpola y el tono
// transiciona suave.
const SHADE_TOP = 1.0;
const SHADE_X = 0.78;
const SHADE_Z = 0.9;
const SHADE_BOTTOM = 0.55;

const applyFaceShade = (geometry: THREE.BufferGeometry) => {
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const nx = Math.abs(normals.getX(i));
    const ny = normals.getY(i);
    const nz = Math.abs(normals.getZ(i));
    const side = nx + nz > 0 ? (nx * SHADE_X + nz * SHADE_Z) / (nx + nz) : SHADE_X;
    const shade = ny >= 0 ? side + (SHADE_TOP - side) * ny : side + (SHADE_BOTTOM - side) * -ny;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
};

export const getSharedBoxGeometry = (width: number, height: number, depth: number, bevel = 0, faceShade = false): THREE.BoxGeometry => {
  const key = `${width}|${height}|${depth}|${bevel}|${faceShade}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    // RoundedBoxGeometry extiende BoxGeometry; 4 segmentos alcanzan para que
    // el bisel se lea redondeado a la escala de un tile.
    geometry = bevel > 0 ? new RoundedBoxGeometry(width, height, depth, 4, bevel) : new THREE.BoxGeometry(width, height, depth);
    if (faceShade) applyFaceShade(geometry);
    geometry.userData.shared = true;
    geometryCache.set(key, geometry);
  }
  return geometry;
};

// Radio en planta de las esquinas de la costa (donde el terreno dobla).
export const TILE_CORNER_RADIUS = 0.24;

// Geometría de tile con esquinas redondeadas EN PLANTA solo donde la costa
// dobla (bits del mask: 1=+x+z, 2=+x-z, 4=-x-z, 8=-x+z). Los lados rectos
// quedan al ras del tile vecino — sin surcos —, y la curva solo aparece en la
// silueta de la isla/orillas, como el diseño de la app. El sólido ocupa
// y ∈ [-height, 0] respecto del origen del mesh.
const roundedTileCache = new Map<string, THREE.BufferGeometry>();
export const getSharedRoundedTileGeometry = (height: number, mask: number, faceShade: boolean): THREE.BufferGeometry => {
  const key = `${height}|${mask}|${faceShade}`;
  let geometry = roundedTileCache.get(key);
  if (!geometry) {
    const hw = TILE_SIZE / 2;
    const r = TILE_CORNER_RADIUS;
    const r1 = mask & 1 ? r : 0; // esquina (+x, +z)
    const r2 = mask & 2 ? r : 0; // esquina (+x, -z)
    const r4 = mask & 4 ? r : 0; // esquina (-x, -z)
    const r8 = mask & 8 ? r : 0; // esquina (-x, +z)
    // Shape en el plano (x, z); la extrusión se rota para crecer hacia -y.
    const shape = new THREE.Shape();
    shape.moveTo(-hw + r4, -hw);
    shape.lineTo(hw - r2, -hw);
    if (r2) shape.quadraticCurveTo(hw, -hw, hw, -hw + r2);
    shape.lineTo(hw, hw - r1);
    if (r1) shape.quadraticCurveTo(hw, hw, hw - r1, hw);
    shape.lineTo(-hw + r8, hw);
    if (r8) shape.quadraticCurveTo(-hw, hw, -hw, hw - r8);
    shape.lineTo(-hw, -hw + r4);
    if (r4) shape.quadraticCurveTo(-hw, -hw, -hw + r4, -hw);
    geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 5 });
    // (x, y, 0..h) → (x, 0..-h, z): la cara del shape queda como tope en y=0.
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();
    if (faceShade) applyFaceShade(geometry);
    geometry.userData.shared = true;
    roundedTileCache.set(key, geometry);
  }
  return geometry;
};

// Agrega las cajas de una receta al grupo. Los materiales se comparten por
// color DENTRO del grupo, nunca globalmente: el modo edición muta color y
// emissive del material al hacer hover (EditableObjectGroup), y un material
// global contagiaría el highlight a todos los tiles del mismo color.
export const addBoxes = (group: THREE.Group, origin: [number, number, number], specs: readonly BoxSpec[]) => {
  const materials = new Map<string, THREE.Material>();
  const getMaterial = (key: string, create: () => THREE.Material): THREE.Material => {
    let material = materials.get(key);
    if (!material) {
      material = create();
      materials.set(key, material);
    }
    return material;
  };
  for (const spec of specs) {
    const kind = spec.material ?? 'standard';
    const vertexColors = spec.faceShade ?? false;
    const material = getMaterial(`${kind}|${spec.color}|${vertexColors}`, () => {
      if (kind === 'lambert') return new THREE.MeshLambertMaterial({ color: spec.color, vertexColors });
      if (kind === 'toon') return new THREE.MeshToonMaterial({ color: spec.color, gradientMap: getToonGradientMap(), vertexColors });
      if (kind === 'basic') return new THREE.MeshBasicMaterial({ color: spec.color, vertexColors });
      return new THREE.MeshStandardMaterial({ color: spec.color, vertexColors });
    });
    const geometry = getSharedBoxGeometry(...spec.size, spec.bevel ?? 0, vertexColors);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = spec.castShadow ?? true;
    mesh.receiveShadow = spec.receiveShadow ?? true;
    mesh.position.set(origin[0] + spec.at[0], origin[1] + spec.at[1], origin[2] + spec.at[2]);
    group.add(mesh);

    if (spec.outline) {
      // Contorno inverted-hull: misma geometría compartida escalada en el mesh
      // (nunca se muta la geometría) para engordar `outline` unidades de mundo
      // por lado, con solo las caras traseras visibles.
      const [w, h, d] = spec.size;
      const t = spec.outline;
      const outlineMaterial = getMaterial('outline', () => new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }));
      const outlineMesh = new THREE.Mesh(geometry, outlineMaterial);
      outlineMesh.scale.set((w + 2 * t) / w, (h + 2 * t) / h, (d + 2 * t) / d);
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      outlineMesh.position.copy(mesh.position);
      group.add(outlineMesh);
    }
  }
};

// Relleno de esquina: la lúnula entre la esquina cuadrada del tile y la curva
// de la costa (mismo bezier que getSharedRoundedTileGeometry). Cuando la costa
// dobla contra agua, un relleno color agua ocupa ese recorte para que el agua
// siga la forma del terreno. Construida para la esquina (+x, +z); las demás se
// obtienen rotando el mesh en pasos de 90°. Ocupa y ∈ [-height, 0].
const cornerFillerCache = new Map<string, THREE.BufferGeometry>();
export const getSharedCornerFillerGeometry = (height: number): THREE.BufferGeometry => {
  const key = `${height}`;
  let geometry = cornerFillerCache.get(key);
  if (!geometry) {
    const hw = TILE_SIZE / 2;
    const r = TILE_CORNER_RADIUS;
    const shape = new THREE.Shape();
    shape.moveTo(hw - r, hw);
    shape.lineTo(hw, hw);
    shape.lineTo(hw, hw - r);
    shape.quadraticCurveTo(hw, hw, hw - r, hw);
    geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 5 });
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();
    geometry.userData.shared = true;
    cornerFillerCache.set(key, geometry);
  }
  return geometry;
};

// Las bandas del contorno (costura, olas, falda) ABRAZAN la cara del muro:
// con un offset grande se veían flotando, despegadas del elemento.
const BAND_OFFSET = 0.006;
// La línea de ola va apenas más afuera que la falda, para dibujarse sobre ella.
const LINE_OFFSET = BAND_OFFSET + 0.003;
// Franja de la costura pasto/tierra, subida hacia la banda verde: borde
// inferior del pasto, apenas solapada bajo el límite para no dejar filo.
const SEAM_TOP = -TILE_HEIGHT * 0.2 + 0.05;
const SEAM_BOTTOM = -TILE_HEIGHT * 0.2 - 0.005;
// Línea de flotación del océano sobre el acantilado (WaterBackground está en
// y = -0.85; las piezas del contorno viven a y = -0.005): ondulada, como olas
// lamiendo la isla. Período de media tile: el coseno vale lo mismo en ambas
// juntas del tile, así la ola empalma continua entre tubos vecinos.
const WAVE_AMPLITUDE = 0.025;
// La ola sube por el acantilado bien por encima de la superficie del mar
// (WaterBackground en y=-0.85): una "falda" color océano trepa siguiendo la
// onda para dar la impresión de que la isla flota sobre el agua, y la línea
// negra la bordea por arriba.
const OCEAN_LINE = -TILE_HEIGHT * 0.85 + 0.005 + 0.06;
const WAVE_PERIOD = TILE_SIZE / 2;
const WAVE_BAND = 0.035;
// La falda baja hasta hundirse bajo el mar, abrazando la cara del muro.
const SKIRT_BOTTOM = -TILE_HEIGHT * 0.85 + 0.005 - 0.06;
const SKIRT_OFFSET = BAND_OFFSET;
const waveTop = (along: number) => OCEAN_LINE + WAVE_AMPLITUDE * Math.cos((2 * Math.PI * along) / WAVE_PERIOD);

// Movimiento de las olas: sube-y-baja sutil, SIN desplazamiento lateral. El
// factor por vértice (atributo aWave) es una onda de período UN TILE: una
// cresta sube mientras la vecina baja, empalma continuo entre tiles y vale
// ~0 donde los tubos tocan las esquinas (los arcos quedan quietos). El valor
// del uniform lo anima WaterBackground por frame (amplitud × sin(t)).
export const WAVE_MOTION = { value: 0 };
const waveFactor = (along: number) => Math.cos((2 * Math.PI * along) / TILE_SIZE);
const addWaveMotion = (material: THREE.Material) => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWave = WAVE_MOTION;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWave;\nuniform float uWave;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += uWave * aWave;');
  };
};
const pushQuad = (
  positions: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number]
) => {
  positions.push(...a, ...b, ...c, ...a, ...c, ...d);
};

const toGeometry = (positions: number[], upNormals = false, waves?: number[]): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  if (upNormals) {
    // Normales todas hacia arriba aunque la superficie sea vertical: un
    // material iluminado se sombrea igual que el plano horizontal del mar.
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1;
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  }
  if (waves) geometry.setAttribute('aWave', new THREE.BufferAttribute(new Float32Array(waves), 1));
  geometry.userData.shared = true;
  return geometry;
};

/** pushQuad + factor de movimiento de ola por esquina del quad. */
const pushQuadWave = (
  positions: number[],
  waves: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  [fa, fb, fc, fd]: [number, number, number, number]
) => {
  pushQuad(positions, a, b, c, d);
  waves.push(fa, fb, fc, fa, fc, fd);
};

// El contorno del terreno enmarca SOLO la franja de tierra — el pasto queda
// sin líneas. Todas las piezas son cintas DoubleSide que abrazan la cara del
// muro (costura pasto/tierra, línea de olas, falda, filo de esquina): un solo
// trazo continuo por borde. Nada de paredes BackSide ni solapes: sus extremos
// asomaban como aletas en los flancos de las esquinas. Los tramos rectos son
// tubos ABIERTOS (sin caras en los extremos): una caja cerrada dibuja un tic
// vertical en cada junta entre tiles. Construidos a lo largo de x, centrados,
// tope en y=0 (crecen hacia -y); empalman con los arcos a tope exacto (misma
// bézier, mismos offsets → juntas estancas).

const edgeBandsCache = new Map<string, THREE.BufferGeometry>();
const getSharedEdgeBandsGeometry = (length: number): THREE.BufferGeometry => {
  const key = `${length}`;
  let geometry = edgeBandsCache.get(key);
  if (!geometry) {
    const hl = length / 2;
    const t = BAND_OFFSET;
    const positions: number[] = [];
    // Costura pasto/tierra en ambos planos del tubo (el interno queda
    // enterrado; el externo dibuja la línea en el frente). En orillas contra
    // agua es la única banda: asoma apenas sobre la superficie y dibuja la
    // línea de flotación del pasto.
    for (const zPlane of [t, -t]) {
      pushQuad(positions, [-hl, SEAM_BOTTOM, zPlane], [hl, SEAM_BOTTOM, zPlane], [hl, SEAM_TOP, zPlane], [-hl, SEAM_TOP, zPlane]);
    }
    geometry = toGeometry(positions);
    edgeBandsCache.set(key, geometry);
  }
  return geometry;
};

// Línea de flotación ondulada, bordeando la falda de olas por arriba. La fase
// se mide desde el centro del tile (la geometría está centrada en el tubo,
// corrido `mid`), para que la ola empalme entre vecinos. Lleva aWave para el
// movimiento vertical (viaja junto con el tope de la falda).
const edgeWaveLineCache = new Map<string, THREE.BufferGeometry>();
const getSharedEdgeWaveLineGeometry = (length: number, mid: number): THREE.BufferGeometry => {
  const key = `${length}|${mid}`;
  let geometry = edgeWaveLineCache.get(key);
  if (!geometry) {
    const hl = length / 2;
    const t = LINE_OFFSET;
    const positions: number[] = [];
    const waves: number[] = [];
    const segments = Math.max(4, Math.ceil(length / 0.05));
    for (const zPlane of [t, -t]) {
      for (let i = 0; i < segments; i++) {
        const x0 = -hl + (length * i) / segments;
        const x1 = -hl + (length * (i + 1)) / segments;
        const top0 = waveTop(x0 + mid);
        const top1 = waveTop(x1 + mid);
        const f0 = waveFactor(x0 + mid);
        const f1 = waveFactor(x1 + mid);
        pushQuadWave(
          positions,
          waves,
          [x0, top0, zPlane],
          [x1, top1, zPlane],
          [x1, top1 + WAVE_BAND, zPlane],
          [x0, top0 + WAVE_BAND, zPlane],
          [f0, f1, f1, f0]
        );
      }
    }
    geometry = toGeometry(positions, false, waves);
    edgeWaveLineCache.set(key, geometry);
  }
  return geometry;
};

// Falda de olas: franja color océano que trepa el acantilado siguiendo la
// misma onda que la línea negra, hundida bajo el mar en su base.
const edgeSkirtCache = new Map<string, THREE.BufferGeometry>();
const getSharedEdgeSkirtGeometry = (length: number, mid: number): THREE.BufferGeometry => {
  const key = `${length}|${mid}`;
  let geometry = edgeSkirtCache.get(key);
  if (!geometry) {
    const hl = length / 2;
    const positions: number[] = [];
    const segments = Math.max(4, Math.ceil(length / 0.05));
    // Winding con el frente hacia AFUERA en cada plano: con DoubleSide el
    // material iluminado invierte la normal en las caras traseras, y la cara
    // visible quedaría oscura.
    const waves: number[] = [];
    for (const zPlane of [SKIRT_OFFSET, -SKIRT_OFFSET]) {
      for (let i = 0; i < segments; i++) {
        const s0 = zPlane > 0 ? i : i + 1;
        const s1 = zPlane > 0 ? i + 1 : i;
        const x0 = -hl + (length * s0) / segments;
        const x1 = -hl + (length * s1) / segments;
        // La base (sumergida) no se mueve; el tope ondula con la línea.
        pushQuadWave(
          positions,
          waves,
          [x0, SKIRT_BOTTOM, zPlane],
          [x1, SKIRT_BOTTOM, zPlane],
          [x1, waveTop(x1 + mid), zPlane],
          [x0, waveTop(x0 + mid), zPlane],
          [0, 0, waveFactor(x1 + mid), waveFactor(x0 + mid)]
        );
      }
    }
    geometry = toGeometry(positions, true, waves);
    edgeSkirtCache.set(key, geometry);
  }
  return geometry;
};

// ---------------------------------------------------------------------------
// Esquinas del contorno (reconstruidas por partes). Pieza 1: cordón de la
// costura. Reglas aprendidas a fuerza de iteraciones (ver memoria):
// - La curva de costa es la BÉZIER CUADRÁTICA del tile (no un arco circular).
// - El cordón es un TUBO (una cinta plana envolviendo la curva, vista de
//   canto, se proyecta como cuña negra).
// - El eje va SOBRE la superficie (más afuera z-fightea en ángulo rasante).
// - Las puntas se hunden en la tierra (la boca abierta del tubo asoma como
//   gancho) y NADA se prolonga sobre las caras planas (muñones en paralaje).
// - Fijo, sin movimiento de olas.
// ---------------------------------------------------------------------------

/** Punto y normal exterior de la bézier de la esquina (+x,+z). */
const cornerBezier = (t: number): { px: number; pz: number; nx: number; nz: number } => {
  const hw = TILE_SIZE / 2;
  const r = TILE_CORNER_RADIUS;
  const u = 1 - t;
  // B(t) con P0=(hw, hw−r), C=(hw, hw), P2=(hw−r, hw)
  const px = (u * u + 2 * u * t) * hw + t * t * (hw - r);
  const pz = u * u * (hw - r) + (2 * u * t + t * t) * hw;
  const dx = -2 * t * r;
  const dz = 2 * u * r;
  const norm = Math.hypot(dx, dz);
  // normal exterior = tangente rotada −90°
  return { px, pz, nx: dz / norm, nz: -dx / norm };
};

// Sección ELÍPTICA achatada: alta como la banda a la que empalma pero
// saliendo poco de la pared — un cordón redondo se leía demasiado grueso.
const CORD_DEPTH = 0.012;
// Altura del valle de la ola: los tramos rectos llegan a las esquinas ahí
// (cos(2π·0.26/0.5) ≈ −1), y el cordón de flotación empalma a esa cota. FIJO,
// sin movimiento, como todo lo de la esquina.
const WAVE_TROUGH = OCEAN_LINE + WAVE_AMPLITUDE * Math.cos((2 * Math.PI * (TILE_SIZE / 2 - TILE_CORNER_RADIUS)) / WAVE_PERIOD);
const cornerCordCache = new Map<string, THREE.BufferGeometry>();
const getSharedCornerCordGeometry = (y: number, halfHeight: number): THREE.BufferGeometry => {
  const key = `${y}|${halfHeight}`;
  let geometry = cornerCordCache.get(key);
  if (!geometry) {
    const steps = 16;
    const radial = 10;
    // anillos elípticos orientados por la normal de la bézier
    const rings: Array<Array<[number, number, number]>> = [];
    const centers: Array<[number, number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      const { px, pz, nx, nz } = cornerBezier(i / steps);
      centers.push([px, y, pz]);
      const ring: Array<[number, number, number]> = [];
      for (let j = 0; j < radial; j++) {
        const phi = (2 * Math.PI * j) / radial;
        const out = CORD_DEPTH * Math.cos(phi);
        ring.push([px + nx * out, y + halfHeight * Math.sin(phi), pz + nz * out]);
      }
      rings.push(ring);
    }
    const positions: number[] = [];
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < radial; j++) {
        const k = (j + 1) % radial;
        pushQuad(positions, rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]);
      }
    }
    // Remate RECTO en cada extremo (hundir las puntas en la tierra las hacía
    // terminar "en espada"): tapa plana justo en el plano donde arranca la
    // cinta del tramo recto.
    for (const end of [0, steps]) {
      for (let j = 0; j < radial; j++) {
        const k = (j + 1) % radial;
        positions.push(...centers[end], ...rings[end][j], ...rings[end][k]);
      }
    }
    geometry = toGeometry(positions);
    cornerCordCache.set(key, geometry);
  }
  return geometry;
};

// Trozo de agua de la esquina: superficie color océano que cubre la tierra
// bajo el cordón de flotación, siguiendo la bézier, hundida bajo el mar. El
// cordón le tapa el borde superior (sin él se leía como parche suelto).
let cornerSkirtGeometry: THREE.BufferGeometry | null = null;
const getSharedCornerSkirtGeometry = (): THREE.BufferGeometry => {
  if (!cornerSkirtGeometry) {
    const top = WAVE_TROUGH + WAVE_BAND / 2;
    const steps = 16;
    const positions: number[] = [];
    for (let i = 0; i < steps; i++) {
      const a = cornerBezier(i / steps);
      const b = cornerBezier((i + 1) / steps);
      const pa: [number, number] = [a.px + a.nx * SKIRT_OFFSET, a.pz + a.nz * SKIRT_OFFSET];
      const pb: [number, number] = [b.px + b.nx * SKIRT_OFFSET, b.pz + b.nz * SKIRT_OFFSET];
      // Winding con el frente hacia AFUERA: con DoubleSide, Lambert invierte
      // la normal (hacia-arriba) en las caras traseras y el agua se ve oscura.
      pushQuad(
        positions,
        [pb[0], SKIRT_BOTTOM, pb[1]],
        [pa[0], SKIRT_BOTTOM, pa[1]],
        [pa[0], top, pa[1]],
        [pb[0], top, pb[1]]
      );
    }
    // normales hacia arriba: se sombrea igual que el plano del mar
    cornerSkirtGeometry = toGeometry(positions, true);
  }
  return cornerSkirtGeometry;
};

// Bloque base que ocupa el tile completo bajo un objeto, con la misma
// estructura que el tile de pasto: capa superior del color del objeto y
// tierra debajo, para que en los bordes de la isla se lea igual que el resto
// del terreno.
export const addTerrainTile = (group: THREE.Group, x: number, z: number, color: string, ctx: BuildContext) => {
  const capHeight = TILE_HEIGHT * 0.2;
  const dirtHeight = TILE_HEIGHT - capHeight;
  const palette = getPalette(ctx.worldType);

  // Esquinas de costa: donde dos lados adyacentes están expuestos (borde de
  // isla, hueco u orilla de agua), el terreno dobla y se redondea en planta.
  const isExposed = (neighbor?: MapObjectType) =>
    neighbor === undefined || neighbor === MapObjectType.EMPTY || neighbor === MapObjectType.WATER;
  const isVoid = (neighbor?: MapObjectType) => neighbor === undefined || neighbor === MapObjectType.EMPTY;
  let cornerMask = 0;
  const fillers: Array<{ rotation: number; color: string }> = [];
  // Piezas del contorno de la isla: tubos por lado expuesto y arcos en las
  // esquinas redondeadas. deep = baja todo el acantilado (da al vacío); si da
  // al agua solo baja hasta hundirse bajo la superficie.
  const tubes: Array<{ axis: 'x' | 'z'; sign: number; mid: number; length: number; deep: boolean }> = [];
  const cornerArcs: Array<{ rotation: number; deep: boolean }> = [];
  if (ctx.tileXZ && ctx.neighborTypeAt) {
    const [tx, tz] = ctx.tileXZ;
    const typePX = ctx.neighborTypeAt(tx + 1, tz);
    const typeNX = ctx.neighborTypeAt(tx - 1, tz);
    const typePZ = ctx.neighborTypeAt(tx, tz + 1);
    const typeNZ = ctx.neighborTypeAt(tx, tz - 1);
    const corners: Array<[number, MapObjectType | undefined, MapObjectType | undefined, number]> = [
      [1, typePX, typePZ, 0],
      [2, typePX, typeNZ, Math.PI / 2],
      [4, typeNX, typeNZ, Math.PI],
      [8, typeNX, typePZ, -Math.PI / 2],
    ];
    for (const [bit, sideA, sideB, rotation] of corners) {
      if (!isExposed(sideA) || !isExposed(sideB)) continue;
      cornerMask |= bit;
      // deep (cordón de flotación + trozo de agua) en toda esquina con un
      // lado al vacío — incluidas las bocas de cascada, para que la línea de
      // abajo doble la curva igual que en las esquinas de pura tierra.
      cornerArcs.push({ rotation, deep: isVoid(sideA) || isVoid(sideB) });
      // La costa dobla contra agua: el agua rellena la esquina recortada.
      // Solo en esquinas interiores (agua+tierra): en las bocas de cascada
      // (agua+vacío) el relleno quedaba expuesto como un triángulo de agua
      // superpuesto a la tierra.
      if ((sideA === MapObjectType.WATER || sideB === MapObjectType.WATER) && !isVoid(sideA) && !isVoid(sideB)) {
        fillers.push({ rotation, color: palette.water });
      }
    }

    // Extremo del tubo a lo largo de un borde: si la esquina es convexa
    // (redondeada) se acorta hasta donde arranca el arco; si el borde
    // continúa en el tile lateral termina al ras de la junta (el tubo vecino
    // lo prolonga, y al ser abierto no hay costura); si dobla en cóncavo se
    // prolonga enterrado dentro del bloque del tile diagonal.
    const endOffset = (cornerBit: number, diagonal: MapObjectType | undefined) =>
      cornerMask & cornerBit ? TILE_SIZE / 2 - TILE_CORNER_RADIUS : isExposed(diagonal) ? TILE_SIZE / 2 : TILE_SIZE / 2 + 0.24;
    const typePP = ctx.neighborTypeAt(tx + 1, tz + 1);
    const typePN = ctx.neighborTypeAt(tx + 1, tz - 1);
    const typeNP = ctx.neighborTypeAt(tx - 1, tz + 1);
    const typeNN = ctx.neighborTypeAt(tx - 1, tz - 1);
    // [tipo del lado, eje de la cara, signo, bit/diagonal de cada extremo]
    const sides: Array<[MapObjectType | undefined, 'x' | 'z', number, number, MapObjectType | undefined, number, MapObjectType | undefined]> = [
      [typePX, 'x', 1, 1, typePP, 2, typePN],
      [typeNX, 'x', -1, 8, typeNP, 4, typeNN],
      [typePZ, 'z', 1, 1, typePP, 8, typeNP],
      [typeNZ, 'z', -1, 2, typePN, 4, typeNN],
    ];
    for (const [sideType, axis, sign, bitPos, diagPos, bitNeg, diagNeg] of sides) {
      if (!isExposed(sideType)) continue;
      const endPos = endOffset(bitPos, diagPos);
      const endNeg = endOffset(bitNeg, diagNeg);
      tubes.push({ axis, sign, mid: (endPos - endNeg) / 2, length: endPos + endNeg, deep: isVoid(sideType) });
    }

    // Bordes secos (previews de las cards): el tile va suelto sobre un fondo
    // plano, no flotando en el mar. Se queda el contorno negro y se descarta
    // todo lo que representa agua — falda del acantilado, línea de flotación y
    // relleno de las esquinas.
    if (ctx.dryEdges) {
      for (const tube of tubes) tube.deep = false;
      for (const arc of cornerArcs) arc.deep = false;
      fillers.length = 0;
    }
  }

  // Contorno de la isla con la lógica de los árboles: piezas negras BackSide
  // que solo se ven donde sobresalen de la silueta según el ángulo de cámara.
  // El tope queda apenas bajo la superficie (si asomara por encima se verían
  // líneas de grilla); hacia abajo, los bordes al vacío rebasan la base de la
  // isla para dibujar también el contorno inferior de la tierra.
  if (tubes.length) {
    const bandsMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.DoubleSide });
    // Lambert como el mar (WaterBackground) y recibiendo la sombra de la
    // isla: con material sin luz la falda se veía más clara que el océano.
    const skirtMat = new THREE.MeshLambertMaterial({ color: palette.ocean, side: THREE.DoubleSide });
    addWaveMotion(skirtMat);
    const waveLineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.DoubleSide });
    addWaveMotion(waveLineMat);
    const hullTop = -0.005;
    const place = (mesh: THREE.Mesh, px: number, pz: number, rotationY = 0) => {
      mesh.rotation.y = rotationY;
      mesh.position.set(px, hullTop, pz);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
    };
    for (const { axis, sign, mid, length, deep } of tubes) {
      // El tubo se construye a lo largo de x; -π/2 mapea su +x local a +z.
      const rotationY = axis === 'x' ? -Math.PI / 2 : 0;
      const px = axis === 'x' ? x + sign * (TILE_SIZE / 2) : x + mid;
      const pz = axis === 'x' ? z + mid : z + sign * (TILE_SIZE / 2);
      // En orillas contra agua todo lo bajo la costura queda sumergido: solo
      // se coloca la banda de costura (la línea de flotación del pasto).
      if (deep) {
        const skirt = new THREE.Mesh(getSharedEdgeSkirtGeometry(length, mid), skirtMat);
        place(skirt, px, pz, rotationY);
        skirt.receiveShadow = true;
        place(new THREE.Mesh(getSharedEdgeWaveLineGeometry(length, mid), waveLineMat), px, pz, rotationY);
      }
      place(new THREE.Mesh(getSharedEdgeBandsGeometry(length), bandsMat), px, pz, rotationY);
    }
    // Esquinas por partes: cordón de costura (todas) + cordón de flotación
    // (solo al vacío: las orillas interiores no tienen línea de olas). La
    // falda no dobla la esquina: la tierra entra directo al mar en la curva.
    for (const { rotation, deep } of cornerArcs) {
      place(new THREE.Mesh(getSharedCornerCordGeometry((SEAM_TOP + SEAM_BOTTOM) / 2, 0.028), bandsMat), x, z, rotation);
      if (deep) {
        const skirt = new THREE.Mesh(getSharedCornerSkirtGeometry(), skirtMat);
        place(skirt, x, z, rotation);
        skirt.receiveShadow = true;
        place(new THREE.Mesh(getSharedCornerCordGeometry(WAVE_TROUGH + WAVE_BAND / 2, WAVE_BAND / 2), bandsMat), x, z, rotation);
      }
    }
  }

  const dirtMat = new THREE.MeshLambertMaterial({ color: palette.dirt });
  if (cornerMask) {
    // Capa de color + tierra con las esquinas de costa redondeadas.
    const capMat = new THREE.MeshLambertMaterial({ color, vertexColors: true });
    const capMesh = new THREE.Mesh(getSharedRoundedTileGeometry(capHeight, cornerMask, true), capMat);
    capMesh.castShadow = true;
    capMesh.receiveShadow = true;
    capMesh.position.set(x, 0, z);
    group.add(capMesh);

    const dirtMesh = new THREE.Mesh(getSharedRoundedTileGeometry(dirtHeight, cornerMask, false), dirtMat);
    dirtMesh.castShadow = true;
    dirtMesh.receiveShadow = true;
    dirtMesh.position.set(x, -capHeight, z);
    group.add(dirtMesh);

    // El agua ocupa las esquinas recortadas contra ella (desde su superficie
    // en y=-0.2 hasta el fondo del bloque de agua vecino).
    for (const { rotation, color: fillerColor } of fillers) {
      const filler = new THREE.Mesh(
        getSharedCornerFillerGeometry(TILE_HEIGHT * 0.8),
        new THREE.MeshLambertMaterial({ color: fillerColor })
      );
      filler.rotation.y = rotation;
      filler.position.set(x, -capHeight, z);
      filler.castShadow = false;
      filler.receiveShadow = true;
      group.add(filler);
    }
  } else {
    addBoxes(group, [x, 0, z], [
      { size: [TILE_SIZE, capHeight, TILE_SIZE], at: [0, -capHeight / 2, 0], color, material: 'lambert', faceShade: true },
    ]);

    // Tierra bajo la capa de color: materiales por cara (lados tierra, base
    // oscura), por eso no usa el formato de receta.
    const dirtBottomMat = new THREE.MeshLambertMaterial({ color: palette.dirtDark });
    const dirtMesh = new THREE.Mesh(getSharedBoxGeometry(TILE_SIZE, dirtHeight, TILE_SIZE), [
      dirtMat,
      dirtMat,
      dirtMat,
      dirtBottomMat,
      dirtMat,
      dirtMat,
    ]);
    dirtMesh.castShadow = true;
    dirtMesh.receiveShadow = true;
    dirtMesh.position.set(x, -TILE_HEIGHT + dirtHeight / 2, z);
    group.add(dirtMesh);
  }

};
