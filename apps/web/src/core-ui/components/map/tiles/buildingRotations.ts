import { MapObjectType } from '@/core-ui/types';

// Orientación base de los edificios especiales para que miren hacia la cámara/calle.
// La geometría se construye en el origen mirando a un eje fijo; este offset la deja
// "bien orientada". Debe usarse tanto en el render normal como en modo edición para
// que ambas vistas coincidan.
const BUILDING_BASE_ROTATION: Partial<Record<MapObjectType, [number, number, number]>> = {
  [MapObjectType.BANK]: [0, Math.PI, 0],
  // 4.7 ≈ 3π/2: el granero quedaba enterrado/mal con 0
  [MapObjectType.BARN]: [0, 4.7, 0],
  [MapObjectType.LEADERBOARD]: [0, 0, 0],
};

export function getBuildingBaseRotation(type: MapObjectType): [number, number, number] {
  return BUILDING_BASE_ROTATION[type] ?? [0, 0, 0];
}

// Combina la orientación base del edificio con la rotación del usuario (guardada en el tile).
// Así la rotación es persistente y la misma en el mapa normal y en modo edición.
export function composeBuildingRotation(
  type: MapObjectType,
  userRotation: [number, number, number] | undefined
): [number, number, number] {
  const base = getBuildingBaseRotation(type);
  const [ux, uy, uz] = userRotation ?? [0, 0, 0];
  return [base[0] + ux, base[1] + uy, base[2] + uz];
}
