import { composeBuildingRotation } from '@/core-ui/components/map/buildingRotations';
import { getObjectGroup } from '@/core-ui/components/map/helpers';
import { MapObject, MapObjectType, WorldType } from '@/core-ui/types';
import * as THREE from 'three';

/**
 * Renders a player's map to a static PNG (data URL) once, off-screen, through a
 * SINGLE reused WebGL context. The card then shows that image as a plain <img>,
 * so the preview scrolls natively glued to the card — no overlay canvas, no
 * compositor desync. The map is static, so a bitmap looks identical to a live
 * scene while being far cheaper and perfectly anchored.
 */

const BASE_W = 480;
const BASE_H = 270; // 16:9
const ISO_DIRECTION = new THREE.Vector3(1, 1.15, 1).normalize();
/** Match MapMiniPreview's framing: fill the tile, crop the diamond tips. */
const FILL = 1.4;
const SPECIAL_BUILDINGS: MapObjectType[] = [
  MapObjectType.BANK,
  MapObjectType.BARN,
  MapObjectType.LEADERBOARD,
];

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(BASE_W, BASE_H, false);

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const dir = new THREE.DirectionalLight(0xffffff, 1.7);
  dir.position.set(8, 16, 8);
  scene.add(dir);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb08d57, 0.45));

  camera = new THREE.PerspectiveCamera(14, BASE_W / BASE_H, 0.1, 1000);
}

/** Frame the whole board into the 16:9 image (projection-based, like FitCamera). */
function fitCamera(cam: THREE.PerspectiveCamera, target: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(target);
  if (box.isEmpty()) return;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius || 1;
  const center = sphere.center;

  cam.up.set(0, 1, 0);
  let distance = radius / Math.sin((cam.fov * Math.PI) / 180 / 2);
  const place = () => {
    cam.position.copy(center).addScaledVector(ISO_DIRECTION, distance);
    cam.lookAt(center);
    cam.near = Math.max(0.1, distance - radius * 2);
    cam.far = distance + radius * 2;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  };
  place();

  let hx = 0;
  let hy = 0;
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z
    );
    corner.project(cam);
    hx = Math.max(hx, Math.abs(corner.x));
    hy = Math.max(hy, Math.abs(corner.y));
  }
  const zoom = (1 / hx + 1 / hy) * FILL;
  if (zoom > 0 && Number.isFinite(zoom)) {
    distance /= zoom;
    place();
  }
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
}

function renderSnapshot(objects: MapObject[], worldType: WorldType): string {
  ensureRenderer();

  const root = new THREE.Group();
  for (const o of objects) {
    if (o.type === MapObjectType.EMPTY) continue;
    // Build at the origin then place the wrapper — same as Ground.tsx so the
    // coordinates/rotations match the real map.
    const group = getObjectGroup({ ...o, position: [0, o.position[1], 0] }, worldType);
    const userRotation: [number, number, number] =
      Array.isArray(o.rotation) && o.rotation.length === 3
        ? [o.rotation[0] || 0, o.rotation[1] || 0, o.rotation[2] || 0]
        : [0, 0, 0];
    const rotation = SPECIAL_BUILDINGS.includes(o.type)
      ? composeBuildingRotation(o.type, userRotation)
      : userRotation;
    const wrapper = new THREE.Group();
    wrapper.position.set(o.position[0], o.position[1], o.position[2]);
    wrapper.rotation.set(rotation[0], rotation[1], rotation[2]);
    wrapper.add(group);
    root.add(wrapper);
  }

  scene!.add(root);
  fitCamera(camera!, root);
  renderer!.render(scene!, camera!);
  const url = renderer!.domElement.toDataURL('image/png');

  scene!.remove(root);
  disposeGroup(root);
  return url;
}

/* ------------------------------------------------------------------ */
/* Cache + one-per-frame queue (so a screenful of cards doesn't hitch)  */
/* ------------------------------------------------------------------ */

const cache = new Map<string, string>();
const MAX_CACHE = 80;
const queue: Array<() => void> = [];
let pumping = false;

/**
 * Cheap content hash (FNV-1a) of the placed objects, so the cache key changes
 * whenever the player edits their map — the preview then regenerates on its own
 * instead of serving a stale image until a hard reload.
 */
function hashObjects(objects: MapObject[]): string {
  let h = 2166136261;
  for (const o of objects) {
    const s = `${o.type}|${o.variant}|${o.position[0]},${o.position[1]},${o.position[2]}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(36);
}

function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    queue.shift()?.();
    if (queue.length) requestAnimationFrame(step);
    else pumping = false;
  };
  requestAnimationFrame(step);
}

/**
 * Request the snapshot for a wallet's current map. Keyed by wallet + map
 * content, so editing the map yields a fresh image automatically. Returns
 * synchronously from cache, otherwise renders on a future frame and calls
 * `onReady`. Returns a cancel fn.
 */
export function requestMapSnapshot(
  walletAddress: string,
  objects: MapObject[],
  worldType: WorldType,
  onReady: (url: string) => void
): () => void {
  const cacheKey = `${walletAddress}:${hashObjects(objects)}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    onReady(cached);
    return () => {};
  }

  let cancelled = false;
  queue.push(() => {
    if (cancelled) return;
    const url = renderSnapshot(objects, worldType);
    cache.set(cacheKey, url);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
    onReady(url);
  });
  pump();

  return () => {
    cancelled = true;
  };
}
