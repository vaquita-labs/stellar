'use client';

import { Billboard, Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { useAnalytics, useProfileStreak, useRestProfile, useVaquitaMood } from '../../hooks';
import { useMapStore, useConfigStore, useSyncMapObjects, isWalkableType, useIsTabVisible } from '../../stores';
import { Button } from '../atoms';
import { DepositSummaryResponseDTO, DepositWithdrawalState, WorldType } from '../../types';
import { useModalPresence } from '../molecules/AppModal';
import { DailyRewardModal, MoodMessageModal } from '../organisms';
import { MapObjects } from './buildings/MapObjects';
import { AdaptiveResolution } from './scene/AdaptiveResolution';
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
import { getMaxDpr, prefersAntialias } from './scene/deviceTier';
import { useWebGLRecovery, type MapIssue } from './scene/useWebGLRecovery';
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
  const [showDailyRewardModal, setShowDailyRewardModal] = useState(false);
  const [dailyRewardCoins, setDailyRewardCoins] = useState(0);
  const [dailyRewardExperience, setDailyRewardExperience] = useState(0);
  const [showMoodModal, setShowMoodModal] = useState(false);
  // Mantienen el modal montado mientras corre la animación de salida.
  const dailyRewardModalMounted = useModalPresence(showDailyRewardModal);
  const moodModalMounted = useModalPresence(showMoodModal);
  const userWalletAddress = useConfigStore((store) => store.walletAddress);
  const center = useMemo(() => getMapCenter(currentTiles), [currentTiles]);

  const { t } = useTranslation();
  // The scene renders only while the tab is in front. Running in the background
  // it spends GPU on frames nobody sees, and that pressure is what leads mobile
  // browsers and Chrome to reclaim the map's WebGL context.
  const isTabVisible = useIsTabVisible();
  const { trackUserAction } = useAnalytics();

  const handleContextLost = useCallback(
    (attempt: number, willRetry: boolean) => {
      trackUserAction('map_context_lost', { attempt, willRetry, tabVisible: isTabVisible });
    },
    [trackUserAction, isTabVisible],
  );

  // Every way the map has gone blank was silent, so the state of the map itself
  // is reported: what it was measured to be, and how long it stayed that way.
  const handleIssue = useCallback(
    (issue: MapIssue, detail: { canvas: string; container: string }) => {
      trackUserAction('map_not_visible', { issue, canvas: detail.canvas, container: detail.container });
    },
    [trackUserAction],
  );

  const handleRecovered = useCallback(
    (issue: MapIssue, seconds: number) => {
      trackUserAction('map_visible_again', { issue, seconds });
    },
    [trackUserAction],
  );

  const { canvasKey, exhausted, registerRenderer, retry } = useWebGLRecovery({
    onContextLost: handleContextLost,
    onIssue: handleIssue,
    onRecovered: handleRecovered,
  });

  // Mapa de otro jugador (vista de leaderboard): la vaquita es solo decorativa.
  // El humor y el modal de estado son datos del ESPECTADOR y no tienen sentido
  // sobre la vaquita de otra persona.
  const isOwnMap = !walletAddress || walletAddress === userWalletAddress;
  const { mood, canCollect, goldCoinsToCollect, experienceToCollect } = useVaquitaMood();
  const { data: streak } = useProfileStreak();
  const { goldDailyCollect } = useRestProfile();
  const queryClient = useQueryClient();

  const currentStreakDays = (streak?.yesterdayStreak ?? 0) + (streak?.todayStreak ? 1 : 0);

  // Granero y banco abren la lista de posiciones (todos los plazos y estados)
  // navegando a /portafolio: la ruta la intercepta @modal y se pinta como
  // overlay sobre el mundo 3D, que queda montado detrás.
  const openPositions = () => {
    if (interactionsDisabled) return;
    if (userWalletAddress) {
      router.push('/portafolio?period=all');
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
      // `data-pull-ignore`: el mundo 3D hace paneo con el mismo arrastre hacia
      // abajo que el pull-to-refresh, así que el gesto no puede empezar acá.
      data-pull-ignore
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
        // Fill rate is the most expensive thing on screen, more than any shader,
        // and it scales with the SQUARE of the dpr — at 2 that is 4x the pixels
        // of 1, which antialias then multiplies again. Both are context creation
        // settings, so the device tier decides them here: full detail where
        // there is budget for it, and on low-end devices the flat palette gives
        // up little by rendering at 1x without antialias.
        gl={{ antialias: prefersAntialias() }}
        dpr={[1, getMaxDpr()]}
        // Hidden tabs get no frames at all: the browser already throttles the
        // loop there, and the frames it does hand out are spent on a scene
        // nobody is looking at.
        frameloop={isTabVisible ? 'always' : 'never'}
        onCreated={({ gl }) => {
          registerRenderer(gl);
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFShadowMap;
          // El shadow map no se re-renderiza solo cada frame: DayCycleSky lo
          // marca needsUpdate a intervalos (la luz se mueve muy lento).
          gl.shadowMap.autoUpdate = false;
          gl.shadowMap.needsUpdate = true;
        }}
        // h-full (not h-dvh): the canvas must track its container, so screens
        // that stack a header above the map (leaderboard detail) don't scroll.
        className="h-full"
      >
        <AdaptiveResolution />
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
            onBarnClick={openPositions}
            onBankClick={openPositions}
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
      {/* Every automatic rebuild was spent, so the canvas stays blank: say so
          and hand the reload over instead of showing an empty rectangle. */}
      {exhausted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
          <p className="text-sm text-black/70">{t('home.map.unavailable', 'The map could not be loaded.')}</p>
          <Button size="sm" variant="white" onPress={retry}>
            {t('home.map.reload', 'Reload map')}
          </Button>
        </div>
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
      {moodModalMounted && <MoodMessageModal open={showMoodModal} onOpenChange={() => setShowMoodModal(false)} mood={mood} />}
    </div>
  );
};
