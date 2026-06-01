import { forwardRef } from 'react';

export const LeftArm = forwardRef(function LeftArmCmp(
  { baseColor, hoofColor }: { baseColor: string; hoofColor: string },
  leftArmRef
) {
  return (
    <group ref={leftArmRef} position={[-0.4, 0.5, 0]}>
      <mesh>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[0.12, 0.1, 0.12]} />
        <meshStandardMaterial color={hoofColor} />
      </mesh>
    </group>
  );
});
