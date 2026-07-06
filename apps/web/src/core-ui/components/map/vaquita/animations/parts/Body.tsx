export const Body = ({ bodyColor, spotColor }: { bodyColor: string; spotColor: string }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Torso */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.7, 0.8, 0.4]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>

      {/* Front spots */}
      <mesh position={[0.18, 0.45, 0.21]} castShadow>
        <boxGeometry args={[0.22, 0.28, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[-0.2, 0.7, 0.21]} castShadow>
        <boxGeometry args={[0.12, 0.1, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[-0.15, 0.25, 0.21]} castShadow>
        <boxGeometry args={[0.1, 0.1, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>

      {/* Back spots */}
      <mesh position={[-0.2, 0.55, -0.21]} castShadow>
        <boxGeometry args={[0.18, 0.22, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0.18, 0.3, -0.21]} castShadow>
        <boxGeometry args={[0.14, 0.14, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0.15, 0.75, -0.21]} castShadow>
        <boxGeometry args={[0.1, 0.08, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>

      {/* Side spots — left */}
      <mesh position={[-0.36, 0.55, 0.05]} castShadow>
        <boxGeometry args={[0.01, 0.18, 0.16]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[-0.36, 0.3, -0.1]} castShadow>
        <boxGeometry args={[0.01, 0.1, 0.1]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>

      {/* Side spots — right */}
      <mesh position={[0.36, 0.6, -0.08]} castShadow>
        <boxGeometry args={[0.01, 0.16, 0.14]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0.36, 0.3, 0.08]} castShadow>
        <boxGeometry args={[0.01, 0.1, 0.1]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
    </group>
  );
};
