import { forwardRef } from 'react';

export const RightLeg = forwardRef(function RightLegCmp(
  { baseColor, hoofColor }: { baseColor: string; hoofColor: string },
  rightLegRef
) {
  return (
    <group ref={rightLegRef} position={[0.15, -0.1, 0]}>
      <mesh>
        <boxGeometry args={[0.2, 0.5, 0.2]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[0.22, 0.1, 0.22]} />
        <meshStandardMaterial color={hoofColor} />
      </mesh>
    </group>
  );
});
