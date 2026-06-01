export const Body = ({ bodyColor, spotColor }: { bodyColor: string; spotColor: string }) => {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.7, 0.8, 0.4]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0.25, 0.5, 0.21]}>
        <boxGeometry args={[0.15, 0.4, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0.1, 0.5, 0.21]}>
        <boxGeometry args={[0.15, 0.2, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[-0.2, 0.5, -0.21]}>
        <boxGeometry args={[0.15, 0.4, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[-0.1, 0.5, -0.21]}>
        <boxGeometry args={[0.15, 0.2, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0.2, 0.5, -0.21]}>
        <boxGeometry args={[0.15, 0.2, 0.01]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
    </group>
  );
};
