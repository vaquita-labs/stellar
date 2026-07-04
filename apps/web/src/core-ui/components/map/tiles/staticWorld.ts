import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildTileObject, EDIT_ONLY_TYPES } from './registry';

// ---------------------------------------------------------------------------
// Versión estática del terreno para el modo normal (sin edición).
//
// El mapa son ~200 tiles × varios meshes = cientos de draw calls por frame
// para una escena que no cambia nunca fuera del modo edición. Acá se agrupan
// todos los meshes que comparten (geometría, material) en un InstancedMesh:
// mismo resultado visual, ~10-20× menos draw calls (también en el shadow pass).
//
// En modo edición NO se usa: ahí cada tile necesita ser interactivo (hover,
// highlight por mutación de material), así que Ground construye grupos
// individuales como siempre. El toggle de modo reconstruye el mapa completo,
// por lo que ambas representaciones nunca conviven.
// ---------------------------------------------------------------------------

interface InstanceBucket {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  castShadow: boolean;
  receiveShadow: boolean;
  matrices: THREE.Matrix4[];
}

const materialSignature = (material: THREE.Material | THREE.Material[]): string => {
  const materials = Array.isArray(material) ? material : [material];
  return materials
    .map((m) => {
      const color = 'color' in m ? (m as THREE.MeshStandardMaterial).color.getHexString() : '';
      return `${m.type}:${color}:${m.transparent ? m.opacity : 1}`;
    })
    .join(',');
};

export const buildStaticWorld = (
  mapObjects: MapObject[],
  worldType: WorldType
): THREE.Group => {
  // 1. Construir cada tile como siempre y posicionarlo en su lugar del mundo
  //    (misma matemática que aplica EditableObjectGroup en modo edición).
  const source = new THREE.Group();
  for (const mapObject of mapObjects) {
    if (EDIT_ONLY_TYPES.has(mapObject.type)) continue;
    const { position, rotation } = mapObject;
    const object = buildTileObject({ ...mapObject, position: [0, position[1], 0] }, { worldType });
    if (!object) continue;

    const userRotation: [number, number, number] =
      rotation && Array.isArray(rotation) && rotation.length === 3
        ? [rotation[0] || 0, rotation[1] || 0, rotation[2] || 0]
        : [0, 0, 0];

    const wrapper = new THREE.Group();
    wrapper.position.set(position[0], position[1], position[2]);
    wrapper.rotation.set(userRotation[0], userRotation[1], userRotation[2]);
    wrapper.add(object);
    source.add(wrapper);
  }
  source.updateMatrixWorld(true);

  // 2. Agrupar los meshes por (geometría, material, flags de sombra).
  const buckets = new Map<string, InstanceBucket>();
  const surplusMaterials: THREE.Material[] = [];
  source.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const key = `${mesh.geometry.uuid}|${materialSignature(mesh.material)}|${mesh.castShadow}|${mesh.receiveShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        geometry: mesh.geometry,
        material: mesh.material,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
        matrices: [],
      };
      buckets.set(key, bucket);
    } else {
      // El material de este mesh es un duplicado del template del bucket
      // (los builders crean materiales por tile); se libera de inmediato.
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      surplusMaterials.push(...materials);
    }
    bucket.matrices.push(mesh.matrixWorld.clone());
  });
  surplusMaterials.forEach((material) => material.dispose());

  // 3. Un InstancedMesh por bucket.
  const root = new THREE.Group();
  root.name = 'static-world';
  for (const bucket of buckets.values()) {
    const instanced = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.matrices.length);
    bucket.matrices.forEach((matrix, index) => instanced.setMatrixAt(index, matrix));
    instanced.instanceMatrix.needsUpdate = true;
    instanced.castShadow = bucket.castShadow;
    instanced.receiveShadow = bucket.receiveShadow;
    // El bounding por defecto sería el de la geometría en el origen; sin esto
    // el frustum culling recortaría instancias que sí están en pantalla.
    instanced.computeBoundingSphere();
    root.add(instanced);
  }
  return root;
};

// ---------------------------------------------------------------------------
// Fusión de un grupo estático individual (edificios en modo normal).
//
// Un edificio son decenas de cajas que comparten 5-8 materiales; fusionar sus
// geometrías por material lo baja a un draw call por material. Se usa para
// grupos que aparecen UNA vez (para tiles repetidos conviene el instancing de
// arriba). El grupo resultante es nuevo: el llamador es dueño de ambos y debe
// liberar el fusionado con disposeObject (las geometrías fusionadas no son
// compartidas, así que se liberan normalmente).
// ---------------------------------------------------------------------------

export const mergeStaticGroup = (source: THREE.Object3D): THREE.Group => {
  source.updateMatrixWorld(true);

  interface MergeBucket {
    material: THREE.Material;
    castShadow: boolean;
    receiveShadow: boolean;
    geometries: THREE.BufferGeometry[];
  }
  const buckets = new Map<string, MergeBucket>();
  const passthrough: THREE.Mesh[] = [];
  const surplusMaterials: THREE.Material[] = [];

  source.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Los meshes con material por cara no se fusionan; se copian tal cual.
    if (Array.isArray(mesh.material)) {
      passthrough.push(mesh);
      return;
    }
    // Las geometrías indexadas y no-indexadas (TextGeometry) no se pueden
    // fusionar entre sí, por eso el flag forma parte de la clave del bucket.
    const key = `${materialSignature(mesh.material)}|${mesh.castShadow}|${mesh.receiveShadow}|${!!mesh.geometry.index}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        material: mesh.material,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
        geometries: [],
      };
      buckets.set(key, bucket);
    } else {
      surplusMaterials.push(mesh.material);
    }
    // Clonar antes de transformar: la geometría original puede ser compartida.
    const geometry = mesh.geometry.clone();
    delete geometry.userData.shared;
    geometry.applyMatrix4(mesh.matrixWorld);
    bucket.geometries.push(geometry);
  });
  surplusMaterials.forEach((material) => material.dispose());

  const merged = new THREE.Group();
  const addMesh = (geometry: THREE.BufferGeometry, bucket: MergeBucket) => {
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    merged.add(mesh);
  };
  for (const bucket of buckets.values()) {
    const geometry = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries);
    if (geometry) {
      if (bucket.geometries.length > 1) {
        bucket.geometries.forEach((g) => g.dispose());
      }
      addMesh(geometry, bucket);
    } else {
      // Fusión imposible (atributos incompatibles): conservar los meshes sueltos.
      bucket.geometries.forEach((g) => addMesh(g, bucket));
    }
  }
  for (const mesh of passthrough) {
    // Copia con la transformación horneada (reusa geometría clonada + material).
    const geometry = mesh.geometry.clone();
    delete geometry.userData.shared;
    geometry.applyMatrix4(mesh.matrixWorld);
    const copy = new THREE.Mesh(geometry, mesh.material);
    copy.castShadow = mesh.castShadow;
    copy.receiveShadow = mesh.receiveShadow;
    merged.add(copy);
  }
  // El grupo fuente ya no se usa: liberar sus geometrías no compartidas (las
  // fusionadas son copias nuevas y los materiales templates se reusan).
  source.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry?.userData?.shared) {
      mesh.geometry?.dispose();
    }
  });
  return merged;
};

export const disposeStaticWorld = (root: THREE.Group) => {
  root.traverse((child) => {
    const instanced = child as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh) return;
    // Libera el buffer de matrices de instancia.
    instanced.dispose();
    // Las geometrías vienen del cache compartido (recipe.ts) y NO se liberan.
    if (!instanced.geometry?.userData?.shared) {
      instanced.geometry?.dispose();
    }
    const materials = Array.isArray(instanced.material) ? instanced.material : [instanced.material];
    materials.forEach((material) => material?.dispose());
  });
};
