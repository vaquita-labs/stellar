import { MapObject, MapObjectType, WorldType } from '@/core-ui/types';
import { useDayCycleStore } from '@/core-ui/stores';
import { useFrame } from '@react-three/fiber';
import { ComponentType, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { disposeObject } from '../helpers';
import { getPalette } from '../tiles/palette';
import { addTerrainTile } from '../tiles/recipe';
import {
  buildLampGlass,
  buildWindmillSails,
  getBankGroup,
  getBarnGroup,
  getLampGroup,
  getLeaderboardGroup,
  getSummitGroup,
  getWellGroup,
  getWindmillGroup,
  LAMP_GLASS_Y,
  LAMP_GLOW,
  WINDMILL_HUB,
} from '../tiles/objects';
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

/**
 * Cuánto se levanta el edificio sobre la cara de pasto. Apoyado justo en y=0
 * el primer escalón se hunde en la capa de pasto y se pisa con la costura de
 * tierra; este offset lo deja limpio encima.
 */
const BUILDING_LIFT = 0.06;

/**
 * Los edificios no traen su propio bloque de terreno (antes cada uno metía un
 * cubo gris/marrón a modo de pedestal): se apoyan sobre el MISMO tile de pasto
 * que el resto del mapa, contorno de costa incluido.
 */
const withGrassTerrain =
  (type: MapObjectType, build: ObjectBuilder): ObjectBuilder =>
  (mapObject, ctx) => {
    const group = new THREE.Group();

    const terrain = new THREE.Group();
    const palette = getPalette(ctx.worldType);
    const checker = ctx.tileXZ ? (ctx.tileXZ[0] + ctx.tileXZ[1]) % 2 !== 0 : false;
    addTerrainTile(terrain, 0, 0, checker ? palette.grassTopAlt : palette.grassTop, ctx);
    // El grupo entero se rota (baseRotation + rotación del usuario), pero las
    // piezas de costa del terreno son direccionales: se contra-rota para que
    // sigan alineadas con la grilla y calcen con los tiles vecinos.
    terrain.rotation.y = -composeBuildingRotation(type, mapObject.rotation)[1];
    group.add(terrain);

    const building = build(mapObject, ctx);
    building.position.y += BUILDING_LIFT;
    group.add(building);

    return group;
  };

// Aspas del molino girando (R3F): en el mapa normal se animan aparte de la
// geometría fusionada (getWindmillGroup las omite con ctx.animated). La posición
// suma BUILDING_LIFT porque el edificio va levantado sobre el pasto (ver
// withGrassTerrain) y las aspas deben calzar con la torre.
const WindmillSails = () => {
  const ref = useRef<THREE.Group>(null);
  const sails = useMemo(() => buildWindmillSails(), []);
  useEffect(() => () => disposeObject(sails), [sails]);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.7;
  });
  return (
    <group ref={ref} position={[WINDMILL_HUB[0], WINDMILL_HUB[1] + BUILDING_LIFT, WINDMILL_HUB[2]]}>
      <primitive object={sails} />
    </group>
  );
};

// Farol encendiéndose de noche (R3F): lee dayProgress y sube la emisión del
// vidrio + una PointLight cálida cuando oscurece. El vidrio va aparte de la
// geometría fusionada (getLampGroup lo omite con ctx.animated). La luz suma
// BUILDING_LIFT como el resto del edificio.
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const LampGlow = () => {
  const lightRef = useRef<THREE.PointLight>(null);
  const glass = useMemo(() => buildLampGlass(), []);
  const mat = glass.userData.glassMat as THREE.MeshToonMaterial;
  useEffect(() => () => disposeObject(glass), [glass]);
  useFrame(() => {
    // day ≈ 1 entre el amanecer (~0.25) y el atardecer (~0.75); night = 1 − day.
    const p = useDayCycleStore.getState().dayProgress;
    const day = smoothstep(0.22, 0.3, p) * (1 - smoothstep(0.7, 0.8, p));
    const night = 1 - day;
    mat.emissiveIntensity = night * 1.4;
    if (lightRef.current) lightRef.current.intensity = night * 2.2;
  });
  return (
    <group position={[0, LAMP_GLASS_Y + BUILDING_LIFT, 0]}>
      <primitive object={glass} />
      <pointLight ref={lightRef} color={LAMP_GLOW} distance={3.0} decay={2} intensity={0} castShadow={false} />
    </group>
  );
};

export const BUILDINGS: Partial<Record<MapObjectType, BuildingDefinition>> = {
  [MapObjectType.BANK]: {
    build: withGrassTerrain(MapObjectType.BANK, getBankGroup),
    baseRotation: [0, Math.PI, 0],
    Extras: BankExtras,
  },
  [MapObjectType.BARN]: {
    // 4.7 ≈ 3π/2: el granero quedaba enterrado/mal orientado con 0
    build: withGrassTerrain(MapObjectType.BARN, (o, { worldType }) => getBarnGroup(o, worldType)),
    baseRotation: [0, 4.7, 0],
  },
  [MapObjectType.WINDMILL]: {
    // Frente (aspas/puerta) en −Z; misma orientación que el granero para que
    // la fachada mire a la cámara. Las aspas giran vía Extras (WindmillSails).
    build: withGrassTerrain(MapObjectType.WINDMILL, (o, ctx) => getWindmillGroup(o, ctx)),
    baseRotation: [0, 4.7, 0],
    Extras: WindmillSails,
  },
  [MapObjectType.WELL]: {
    // Frente (manivela) en −Z, mirando a la cámara como el resto.
    build: withGrassTerrain(MapObjectType.WELL, (o, { worldType }) => getWellGroup(o, worldType)),
    baseRotation: [0, 4.7, 0],
  },
  [MapObjectType.LAMP]: {
    // Simétrico (baseRotation no importa). El vidrio se enciende de noche via
    // LampGlow (Extras); getLampGroup lo omite en el mapa normal (ctx.animated).
    build: withGrassTerrain(MapObjectType.LAMP, (o, ctx) => getLampGroup(o, ctx)),
    baseRotation: [0, 0, 0],
    Extras: LampGlow,
  },
  [MapObjectType.SUMMIT]: {
    // Frente (placa y flecha) en −Z, mirando a la cámara como el pozo.
    build: withGrassTerrain(MapObjectType.SUMMIT, (o, ctx) => getSummitGroup(o, ctx)),
    baseRotation: [0, 4.7, 0],
  },
  [MapObjectType.LEADERBOARD]: {
    build: withGrassTerrain(MapObjectType.LEADERBOARD, (o, { worldType, font }) =>
      getLeaderboardGroup(o, worldType, font ?? null)
    ),
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
