export const Tail = ({ spotColor }: { spotColor: string; helmetColor?: string }) => {
  return (
    <group position={[0, 0.35, -0.2]}>
      <mesh position={[0, 0, -0.07]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.14]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0, -0.14, -0.12]} castShadow>
        <boxGeometry args={[0.08, 0.2, 0.08]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0, -0.28, -0.12]} castShadow>
        <boxGeometry args={[0.11, 0.1, 0.11]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
    </group>
  );
};
