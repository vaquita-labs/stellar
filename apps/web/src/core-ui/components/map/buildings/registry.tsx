import { MapObject, MapObjectType, WorldType } from '@/core-ui/types';
import { ComponentType } from 'react';
import { getBankGroup, getBarnGroup, getLeaderboardGroup } from '../tiles/objects';
import { ObjectBuilder } from '../types';
import Coin from './Coin';

// ---------------------------------------------------------------------------
// Registro único de edificios/infraestructura del mapa.
//
// Para agregar un edificio nuevo:
//   1. Crear su geometría en tiles/objects/<nombre>.ts (un builder que devuelve
//      un THREE.Group construido en el origen).
//   2. Agregar UNA entrada acá. Con eso queda integrado en el render normal
//      (MapObjects/Building), el modo edición (Ground), las rotaciones y los
//      snapshots del leaderboard.
// Si el edificio necesita UI propia (monedas, contadores, animación React),
// se le agrega un componente `Extras` en su entrada.
// ---------------------------------------------------------------------------

export interface BuildingDefinition {
  /** Geometría del edificio; la misma en modo normal, edición y snapshots. */
  build: ObjectBuilder;
  /**
   * Orientación base para que el edificio "mire" bien (la geometría se
   * construye mirando a un eje fijo). Se compone con la rotación del usuario.
   */
  baseRotation: [number, number, number];
  /** Contenido React extra renderizado dentro del grupo del edificio. */
  Extras?: ComponentType;
}

// Moneda "a cobrar" sobre el techo del banco. Hoy no hay monedas que cobrar
// desde el banco (el flujo vive en la vaquita), por eso el contador es 0 y no
// se renderiza; para reactivarla basta con conectar el contador real.
const BANK_COINS_TO_COLLECT = 0;

const BankExtras = () => {
  if (BANK_COINS_TO_COLLECT <= 0) return null;
  // Altura del techo del banco (ver getBankGroup) + offset para que se vea.
  const roofTopY = 0.01 + 0.16 + 0.3 + 0.1 + 0.06 + 0.06 + 0.3 + 0.6;
  return <Coin position={[0, roofTopY, 0]} size={0.25} counter={BANK_COINS_TO_COLLECT} isLoading={false} />;
};

export const BUILDINGS: Partial<Record<MapObjectType, BuildingDefinition>> = {
  [MapObjectType.BANK]: {
    build: (o, { worldType, font }) => getBankGroup(o, worldType, font ?? null),
    baseRotation: [0, Math.PI, 0],
    Extras: BankExtras,
  },
  [MapObjectType.BARN]: {
    // 4.7 ≈ 3π/2: el granero quedaba enterrado/mal orientado con 0
    build: (o, { worldType }) => getBarnGroup(o, worldType),
    baseRotation: [0, 4.7, 0],
  },
  [MapObjectType.LEADERBOARD]: {
    build: (o, { worldType, font }) => getLeaderboardGroup(o, worldType, font ?? null),
    baseRotation: [0, 0, 0],
  },
};

export const isBuildingType = (type: MapObjectType): boolean => type in BUILDINGS;

// Combina la orientación base del edificio con la rotación del usuario
// (guardada en el tile). Así la rotación es persistente y la misma en el mapa
// normal, el modo edición y los snapshots.
export function composeBuildingRotation(
  type: MapObjectType,
  userRotation: [number, number, number] | undefined
): [number, number, number] {
  const base = BUILDINGS[type]?.baseRotation ?? [0, 0, 0];
  const [ux, uy, uz] = userRotation ?? [0, 0, 0];
  return [base[0] + ux, base[1] + uy, base[2] + uz];
}

// Los edificios se construyen hoy con la paleta FOREST sin importar el mundo
// (los builders de edificios ignoran worldType); centralizado acá por si en el
// futuro cada mundo tiene sus propias variantes.
export const BUILDING_WORLD = WorldType.FOREST;

export type BuildingMapObject = Pick<MapObject, 'position' | 'rotation' | 'type'>;
