'use client';

import { Billboard, Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDeposits, useMap } from '../../../hooks';
import { useNetworkConfigStore, useResizeStore } from '../../../stores';
import { DepositSummaryResponseDTO, WorldType } from '../../../types';
import { BankAPYModal, VaquitaModal, VaquitasListModal } from '../../organisms';
import { competitiveMap } from './map/competitiveMap';
import { Ground } from './map/Ground';
import { getMapCenter } from './map/helpers';
import { MapObjects } from './map/MapObjects';
import { SceneCamera } from './map/SceneCamera';
import { SceneControls } from './map/SceneControls';
import { SceneLighting } from './map/SceneLighting';
import { Vaquita } from './vaquita';

interface MapProps {
  walletAddress?: string;
  isLeaderboard?: boolean | false;
  worldType: WorldType;
  period: number;
  isAvailable: boolean;
}

export const WorldMap = ({ walletAddress, isLeaderboard, isAvailable, worldType, period }: MapProps) => {
  const router = useRouter();
  const { tiles } = useMap(competitiveMap);
  const [selectedCow, setSelectedCow] = useState<DepositSummaryResponseDTO | null>(null);
  const [showVaquitasListModal, setShowVaquitasListModal] = useState(false);
  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const { walletAddress: userWalletAddress, token, lockPeriod } = useNetworkConfigStore((store) => store);
  const { data } = useDeposits(walletAddress ?? userWalletAddress);
  const center = useMemo(() => getMapCenter(tiles), [tiles]);
  const { height, width } = useResizeStore((store) => store);
  const deposits = isLeaderboard
    ? (data?.deposits ?? [])
    : lockPeriod === period
      ? (data?.deposits ?? []).filter(
          ({ lockPeriod, tokenSymbol }) => lockPeriod === period && tokenSymbol === token?.symbol
        )
      : [];

  const handleBarnClick = () => {
    if (userWalletAddress) {
      setShowVaquitasListModal(true);
    }
  };

  const handleBankClick = () => {
    setShowBankAPYModal(true);
  };

  const handleLeaderBoardClick = () => {
    router.push('/leaderboard');
  };

  return (
    <div
      className="relative w-full flex-1 h-full"
      style={isAvailable ? undefined : { filter: 'grayscale(70%) brightness(100%)', opacity: 0.4 }}
    >
      <Canvas camera={{ fov: 50 }} shadows className="h-[100dvh]" key={`${width} + ${height}`}>
        <SceneLighting />
        <SceneCamera center={center} />
        <Ground tiles={tiles} styleMap={worldType} />
        <MapObjects
          tiles={tiles}
          styleMap={worldType}
          onBarnClick={handleBarnClick}
          onBankClick={handleBankClick}
          onLeaderBoardClick={handleLeaderBoardClick}
          hasWallet={!!userWalletAddress}
        />
        {/*TODO: be used later */}
        {/* <BankModel position={[4, 0, 5]} scale={0.4} /> */}
        {token &&
          deposits.map((vaquita) => {
            return (
              <Vaquita
                key={vaquita.id}
                vaquita={vaquita}
                onSelect={() => setSelectedCow(vaquita)}
                tokenSymbol={token.symbol}
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
        {/* TODO: Check this later @Gauss */}
        {/*<VaquitasInstanced*/}
        {/*  deposits={deposits}*/}
        {/*  onSelect={(vaquita) => setSelectedCow(vaquita)}*/}
        {/*  tokenSymbol={tokenSymbol}*/}
        {/*/>*/}
        <SceneControls center={center} />
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
      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}
    </div>
  );
};
