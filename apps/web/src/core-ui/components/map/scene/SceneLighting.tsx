'use client';

import { getShadowMapSize } from './deviceTier';

export const SceneLighting = () => {
  // Rendering the shadow map costs a full pass over the scene at this
  // resolution, so it follows the device's budget.
  const shadowMapSize = getShadowMapSize();

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight
        castShadow
        intensity={1.2}
        position={[2, 10, -10]}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-far={20}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
    </>
  );
};
