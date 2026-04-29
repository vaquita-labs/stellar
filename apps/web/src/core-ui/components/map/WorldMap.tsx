'use client';

import { Billboard, Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { formatTimeDeposit } from '../../helpers';
import { useDeposits } from '../../hooks';
import { useMapStore, useNetworkConfigStore, useResizeStore, useSyncMapObjects } from '../../stores';
import { DepositSummaryResponseDTO, WorldType } from '../../types';
import { VaquitaModal, VaquitasListModal } from '../organisms';
import { MapObjects } from '../templates/WorldMap/map/MapObjects';
import { SceneCamera } from '../templates/WorldMap/map/SceneCamera';
import { SceneControls } from '../templates/WorldMap/map/SceneControls';
// import { CloudSkybox } from './CloudSkybox';
import { DayCycleSky } from './DayCycleSky';
import { EditGrid } from './EditGrid';
import { FloatingIslandBase } from './FloatingIslandBase';
import { Ground } from './Ground';
import { getMapCenter } from './helpers';
import { ObjectGlow } from './ObjectGlow';
import { SpotlightPositionUpdater } from './SpotlightPositionUpdater';
import { TileSpotlightUpdater } from './TileSpotlightUpdater';
import { Vaquita } from './vaquita';
import { Waterfall } from './Waterfall';

interface MapProps {
  walletAddress?: string;
  isLeaderboard?: boolean | false;
  worldType: WorldType;
  isAvailable: boolean;
}

export const WorldMap = ({ walletAddress, isLeaderboard, isAvailable, worldType }: MapProps) => {
  const router = useRouter();
  const isEditMode = useMapStore((store) => store.editMode);
  const { tiles, currentTiles } = useMapStore();
  useSyncMapObjects();
  const [selectedCow, setSelectedCow] = useState<DepositSummaryResponseDTO | null>(null);
  const [showVaquitasListModal, setShowVaquitasListModal] = useState(false);
  const { walletAddress: userWalletAddress, token } = useNetworkConfigStore((store) => store);
  const { data } = useDeposits(walletAddress ?? userWalletAddress);
  const center = useMemo(() => getMapCenter(currentTiles), [currentTiles]);
  const { height, width } = useResizeStore((store) => store);
  const deposits = data?.deposits ?? [];

  const handleBarnClick = () => {
    if (userWalletAddress) {
      setShowVaquitasListModal(true);
    }
  };

  const handleLeaderBoardClick = () => {
    router.push('/leaderboard');
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
        <FloatingIslandBase />
        <Ground mapObjects={currentTiles} worldType={worldType} />
        {!isEditMode && (
          <MapObjects
            objects={currentTiles}
            onBarnClick={handleBarnClick}
            onLeaderBoardClick={handleLeaderBoardClick}
            hasWallet={!!userWalletAddress}
          />
        )}
        {!isEditMode &&
          token &&
          deposits.map((vaquita) => {
            return (
              <Vaquita
                key={vaquita.id}
                vaquita={vaquita}
                onSelect={() => setSelectedCow(vaquita)}
                headLabel={`${vaquita.amount} ${token.symbol} (${formatTimeDeposit(vaquita.lockPeriod)})`}
              />
            );
          })}
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
      {selectedCow && (
        <VaquitaModal
          vaquitaSummary={selectedCow}
          isOpen={!!selectedCow}
          onClose={() => setSelectedCow(null)}
          isLeaderboard={isLeaderboard}
        />
      )}
      {showVaquitasListModal && (
        <VaquitasListModal open={showVaquitasListModal} onOpenChange={() => setShowVaquitasListModal(false)} />
      )}
    </div>
  );
};
