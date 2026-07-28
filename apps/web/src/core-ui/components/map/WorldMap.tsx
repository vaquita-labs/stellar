'use client';

import { Billboard, Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useProfileStreak, useRestProfile, useVaquitaMood } from '../../hooks';
import { useMapStore, useConfigStore, useSyncMapObjects, isWalkableType } from '../../stores';
import { DepositSummaryResponseDTO, DepositWithdrawalState, WorldType } from '../../types';
import { useModalPresence } from '../molecules/AppModal';
import { DailyRewardModal, MoodMessageModal, VaquitasListModal } from '../organisms';
import { MapObjects } from './buildings/MapObjects';
import { SceneCamera } from './scene/SceneCamera';
import { SceneControls } from './scene/SceneControls';
import { WaterBackground } from './scene/WaterBackground';
import { DayCycleSky } from './scene/DayCycleSky';
import { EditGrid } from './edit/EditGrid';
import { Ground } from './tiles/Ground';
import { getMapCenter } from './helpers';
import { ObjectGlow } from './edit/ObjectGlow';
import { SpotlightPositionUpdater } from './edit/SpotlightPositionUpdater';
import { TileSpotlightUpdater } from './edit/TileSpotlightUpdater';
import { Vaquita } from './vaquita';

const PLACEHOLDER_VAQUITA: DepositSummaryResponseDTO = {
  id: 0,
  state: DepositWithdrawalState.DEPOSIT_SUCCESS,
  amount: 0,
  tokenSymbol: '',
  inLockPeriod: false,
  lockPeriod: 0,
  vaquitaContractAddress: '',
};

interface MapProps {
  walletAddress?: string;
  isLeaderboard?: boolean | false;
  worldType: WorldType;
  isAvailable: boolean;
  /** Tutorial: solo mover/ver el mapa; los clicks de objetos se ignoran. */
  interactionsDisabled?: boolean;
}

export const WorldMap = ({ walletAddress, isAvailable, worldType, interactionsDisabled = false }: MapProps) => {
  const router = useRouter();
  const isEditMode = useMapStore((store) => store.editMode);
  const currentTiles = useMapStore((store) => store.currentTiles);
  // Sin ningún tile pisable (mapa recién creado, todo EMPTY) la vaquita no
  // tiene dónde pararse: no se renderiza en vez de flotar sobre el agua.
  const hasWalkableTile = useMemo(() => currentTiles.some((tile) => isWalkableType(tile.type)), [currentTiles]);
  // Con walletAddress (vista de leaderboard) se carga el mapa de ESE perfil;
  // sin él, el del usuario logueado.
  const { isLoaded: mapLoaded } = useSyncMapObjects(walletAddress);
  const [showVaquitasListModal, setShowVaquitasListModal] = useState(false);
  const [showDailyRewardModal, setShowDailyRewardModal] = useState(false);
  const [dailyRewardCoins, setDailyRewardCoins] = useState(0);
  const [dailyRewardExperience, setDailyRewardExperience] = useState(0);
  const [showMoodModal, setShowMoodModal] = useState(false);
  // Mantienen el modal montado mientras corre la animación de salida.
  const vaquitasListModalMounted = useModalPresence(showVaquitasListModal);
  const dailyRewardModalMounted = useModalPresence(showDailyRewardModal);
  const moodModalMounted = useModalPresence(showMoodModal);
  const userWalletAddress = useConfigStore((store) => store.walletAddress);
  const center = useMemo(() => getMapCenter(currentTiles), [currentTiles]);

  // Chrome limita ~16 contextos WebGL por pestaña: al crear uno de más, mata
  // el más viejo y ese canvas queda muerto (carita triste). Si el contexto del
  // mapa se pierde, se remonta el Canvas vía key para crear uno nuevo; al
  // desmontar se libera el contexto de inmediato con forceContextLoss para no
  // agotar el cupo navegando entre pantallas.
  const [canvasKey, setCanvasKey] = useState(0);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      glRef.current?.forceContextLoss();
      glRef.current = null;
    };
  }, []);

  // Mapa de otro jugador (vista de leaderboard): la vaquita es solo decorativa.
  // El humor y el modal de estado son datos del ESPECTADOR y no tienen sentido
  // sobre la vaquita de otra persona.
  const isOwnMap = !walletAddress || walletAddress === userWalletAddress;
  const { mood, canCollect, goldCoinsToCollect, experienceToCollect } = useVaquitaMood();
  const { data: streak } = useProfileStreak();
  const { goldDailyCollect } = useRestProfile();
  const queryClient = useQueryClient();

  const currentStreakDays = (streak?.yesterdayStreak ?? 0) + (streak?.todayStreak ? 1 : 0);

  const handleBarnClick = () => {
    if (interactionsDisabled) return;
    if (userWalletAddress) {
      setShowVaquitasListModal(true);
    }
  };

  const handleBankClick = () => {
    if (interactionsDisabled) return;
    if (userWalletAddress) {
      setShowVaquitasListModal(true);
    }
  };

  const handleLeaderBoardClick = () => {
    if (interactionsDisabled) return;
    router.push('/leaderboard');
  };

  const handleVaquitaClick = () => {
    if (interactionsDisabled) return;
    if (canCollect) {
      setDailyRewardCoins(goldCoinsToCollect);
      setDailyRewardExperience(experienceToCollect);
      setShowDailyRewardModal(true);
      return;
    }
    setShowMoodModal(true);
  };

  const handleCollectDailyReward = async () => {
    // Solo esperamos a que la recompensa se otorgue: en cuanto resuelve, el
    // modal muestra la pantalla de premio. La invalidación de la caché corre en
    // segundo plano (fire-and-forget) para no colgar el modal si un refetch de
    // ['profile'] se demora (staleTime: Infinity refetchea todas las activas).
    await goldDailyCollect();
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  return (
    <div
      className="relative w-full flex-1 h-full"
      style={isAvailable ? undefined : { filter: 'grayscale(70%) brightness(100%)', opacity: 0.4 }}
    >
      <Canvas
        key={canvasKey}
        camera={{ fov: 50 }}
        // "percentage" = PCFShadowMap: three deprecó PCFSoftShadowMap y ya
        // cae en PCFShadowMap igual, pero logueando un warning por cada
        // render del shadow map.
        shadows="percentage"
        gl={{ antialias: true }}
        // El fill-rate escala con el CUADRADO del dpr: a 2 son 4× los píxeles
        // de 1, y el antialias los multiplica otra vez — es lo más caro de la
        // escena, más que cualquier shader. Con esta paleta plana el tope en
        // 1.5 casi no se nota y recorta ~45% de píxeles. Se prefiere bajar el
        // dpr antes que apagar el antialias: sin él los bordes duros de los
        // tiles quedan escalonados.
        dpr={[1, 1.5]}
        onCreated={({ gl }) => {
          glRef.current = gl;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFShadowMap;
          // El shadow map no se re-renderiza solo cada frame: DayCycleSky lo
          // marca needsUpdate a intervalos (la luz se mueve muy lento).
          gl.shadowMap.autoUpdate = false;
          gl.shadowMap.needsUpdate = true;
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            // Sin preventDefault el navegador da el contexto por perdido de
            // forma definitiva y no permite crear el reemplazo.
            event.preventDefault();
            if (!unmountedRef.current) {
              setCanvasKey((key) => key + 1);
            }
          });
        }}
        // h-full (not h-dvh): the canvas must track its container, so screens
        // that stack a header above the map (leaderboard detail) don't scroll.
        className="h-full"
      >
        <DayCycleSky />
        {/* Montar la cámara cuando el mapa ya cargó (aunque venga vacío — los
            perfiles nuevos arrancan sin tiles): se inicializa una única vez y
            debe hacerlo con el centro real (o el centro de la grilla). */}
        {mapLoaded && <SceneCamera center={center} />}
        <EditGrid />
        {/* <FloatingIslandBase /> */}
        <WaterBackground worldType={worldType} center={center} />
        <Ground mapObjects={currentTiles} worldType={worldType} />
        {!isEditMode && (
          <MapObjects
            objects={currentTiles}
            onBarnClick={handleBarnClick}
            onBankClick={handleBankClick}
            onLeaderBoardClick={handleLeaderBoardClick}
            hasWallet={!!userWalletAddress}
          />
        )}
        {!isEditMode && hasWalkableTile && (
          <Vaquita
            vaquita={PLACEHOLDER_VAQUITA}
            mood={isOwnMap ? mood : 'normal'}
            onSelect={isOwnMap ? handleVaquitaClick : undefined}
          />
        )}
        {!isAvailable && (
          <Billboard>
            <Text fontWeight="bold" position={[0, 1, 3]} fontSize={2} color="black" anchorX="center" anchorY="middle">
              Soon...
            </Text>
          </Billboard>
        )}
        <SceneControls center={center} />
        <SpotlightPositionUpdater />
        <TileSpotlightUpdater />
        <ObjectGlow />
      </Canvas>
      {vaquitasListModalMounted && (
        <VaquitasListModal open={showVaquitasListModal} onOpenChange={() => setShowVaquitasListModal(false)} />
      )}
      {dailyRewardModalMounted && (
        <DailyRewardModal
          open={showDailyRewardModal}
          onOpenChange={() => setShowDailyRewardModal(false)}
          coinsToCollect={dailyRewardCoins}
          experienceToCollect={dailyRewardExperience}
          streakDays={currentStreakDays}
          onCollect={handleCollectDailyReward}
        />
      )}
      {moodModalMounted && (
        <MoodMessageModal open={showMoodModal} onOpenChange={() => setShowMoodModal(false)} mood={mood} />
      )}
    </div>
  );
};
