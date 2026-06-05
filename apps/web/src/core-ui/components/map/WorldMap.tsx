'use client';

import { Billboard, Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { useProfileStreak, useRestProfile, useVaquitaMood } from '../../hooks';
import { useMapStore, useConfigStore, useResizeStore, useSyncMapObjects } from '../../stores';
import { DepositSummaryResponseDTO, DepositWithdrawalState, WorldType } from '../../types';
import { DailyRewardModal, MoodMessageModal, VaquitasListModal } from '../organisms';
import { MapObjects } from '../templates/WorldMap/map/MapObjects';
import { SceneCamera } from '../templates/WorldMap/map/SceneCamera';
import { SceneControls } from '../templates/WorldMap/map/SceneControls';
// import { CloudSkybox } from './CloudSkybox';
import { DayCycleSky } from './DayCycleSky';
import { EditGrid } from './EditGrid';
import { Ground } from './Ground';
import { getMapCenter } from './helpers';
import { ObjectGlow } from './ObjectGlow';
import { SpotlightPositionUpdater } from './SpotlightPositionUpdater';
import { TileSpotlightUpdater } from './TileSpotlightUpdater';
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
}

export const WorldMap = ({ isAvailable, worldType }: MapProps) => {
  const router = useRouter();
  const isEditMode = useMapStore((store) => store.editMode);
  const { tiles, currentTiles } = useMapStore();
  useSyncMapObjects();
  const [showVaquitasListModal, setShowVaquitasListModal] = useState(false);
  const [showDailyRewardModal, setShowDailyRewardModal] = useState(false);
  const [dailyRewardCoins, setDailyRewardCoins] = useState(0);
  const [dailyRewardExperience, setDailyRewardExperience] = useState(0);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const { walletAddress: userWalletAddress } = useConfigStore((store) => store);
  const center = useMemo(() => getMapCenter(currentTiles), [currentTiles]);
  const { height, width } = useResizeStore((store) => store);
  const { mood, canCollect, goldCoinsToCollect, experienceToCollect } = useVaquitaMood();
  const { data: streak } = useProfileStreak();
  const { goldDailyCollect } = useRestProfile();
  const queryClient = useQueryClient();

  const currentStreakDays = (streak?.yesterdayStreak ?? 0) + (streak?.todayStreak ? 1 : 0);

  const handleBarnClick = () => {
    if (userWalletAddress) {
      setShowVaquitasListModal(true);
    }
  };

  const handleBankClick = () => {
    if (userWalletAddress) {
      setShowVaquitasListModal(true);
    }
  };

  const handleLeaderBoardClick = () => {
    router.push('/leaderboard');
  };

  const handleVaquitaClick = () => {
    if (canCollect) {
      setDailyRewardCoins(goldCoinsToCollect);
      setDailyRewardExperience(experienceToCollect);
      setShowDailyRewardModal(true);
      return;
    }
    setShowMoodModal(true);
  };

  const handleCollectDailyReward = async () => {
    await goldDailyCollect();
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  return (
    <div
      className="relative w-full flex-1 h-full"
      style={isAvailable ? undefined : { filter: 'grayscale(70%) brightness(100%)', opacity: 0.4 }}
    >
      <Canvas
        camera={{ fov: 50 }}
        shadows
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
        className="h-dvh"
        key={`${width}_${height}_${JSON.stringify(tiles || [])}`}
      >
        {/* TODO: Check this later, maybe we can remove it */}
        {/* <CloudSkybox /> */}
        {/* <Waterfall mapObjects={currentTiles} worldType={worldType} /> */}
        <DayCycleSky />
        <SceneCamera center={center} />
        <EditGrid />
        {/* <FloatingIslandBase /> */}
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
        {!isEditMode && <Vaquita vaquita={PLACEHOLDER_VAQUITA} mood={mood} onSelect={handleVaquitaClick} />}
        {!isAvailable && (
          <Billboard>
            <Text fontWeight="bold" position={[0, 1, 3]} fontSize={2} color="black" anchorX="center" anchorY="middle">
              Soon...
            </Text>
          </Billboard>
        )}
        {/* TODO: Check this later */}
        {/*<VaquitasInstanced*/}
        {/*  deposits={deposits}*/}
        {/*  onSelect={(vaquita) => setSelectedCow(vaquita)}*/}
        {/*  tokenSymbol={tokenSymbol}*/}
        {/*/>*/}
        <SceneControls center={center} />
        <SpotlightPositionUpdater />
        <TileSpotlightUpdater />
        <ObjectGlow />
      </Canvas>
      {showVaquitasListModal && (
        <VaquitasListModal open={showVaquitasListModal} onOpenChange={() => setShowVaquitasListModal(false)} />
      )}
      {showDailyRewardModal && (
        <DailyRewardModal
          open={showDailyRewardModal}
          onOpenChange={() => setShowDailyRewardModal(false)}
          coinsToCollect={dailyRewardCoins}
          experienceToCollect={dailyRewardExperience}
          streakDays={currentStreakDays}
          onCollect={handleCollectDailyReward}
        />
      )}
      {showMoodModal && (
        <MoodMessageModal open={showMoodModal} onOpenChange={() => setShowMoodModal(false)} mood={mood} />
      )}
    </div>
  );
};
