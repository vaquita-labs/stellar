import { Eyes } from './Eyes';

export const Head = ({
  baseColor,
  noseColor,
  spotColor,
  helmetColor,
  isCrying = false,
  isHelmet = true,
}: {
  baseColor: string;
  noseColor: string;
  spotColor: string;
  helmetColor: string;
  isCrying?: boolean;
  isHelmet?: boolean;
}) => {
  return (
    <group position={[0, 1.15, 0]}>
      {/* Head */}
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.6, 0.5]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>
      {/* Eyes */}
      <Eyes isCrying={isCrying} />

      {/* Nose */}
      <group position={[0, -0.05, 0]}>
        <mesh position={[0, -0.1, 0.3]} castShadow>
          <boxGeometry args={[0.5, 0.22, 0.1]} />
          <meshStandardMaterial color={noseColor} />
        </mesh>

        <mesh position={[-0.12, -0.1, 0.35]} castShadow>
          <boxGeometry args={[0.05, 0.05, 0.01]} />
          <meshStandardMaterial color="black" />
        </mesh>

        <mesh position={[0.12, -0.1, 0.35]} castShadow>
          <boxGeometry args={[0.05, 0.05, 0.01]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>
      {/* Ears */}
      <mesh position={[-0.3, 0.12, 0]} castShadow>
        <boxGeometry args={[0.2, 0.15, 0.1]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0.3, 0.1, 0]} castShadow>
        <boxGeometry args={[0.2, 0.15, 0.1]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>

      {/* Helmet */}
      {isHelmet && (
        <group position={[0, 0.15, 0]}>
          <mesh position={[0, 0.1, 0.07]} castShadow>
            <boxGeometry args={[0.55, 0.11, 0.65]} />
            <meshStandardMaterial color={helmetColor} />
          </mesh>

          <mesh position={[0, 0.2, 0.03]} castShadow>
            <boxGeometry args={[0.55, 0.25, 0.55]} />
            <meshStandardMaterial color={helmetColor} />
          </mesh>
        </group>
      )}
    </group>
  );
};
