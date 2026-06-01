export const Tail = ({ spotColor, helmetColor }: { spotColor: string; helmetColor: string }) => {
  return (
    <group position={[0, 0.1, -0.15]}>
      <mesh position={[0, 0, -0.1]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.1]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0, -0.05, -0.15]} rotation={[-1, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.1]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0, -0.1, -0.2]}>
        <boxGeometry args={[0.07, 0.07, 0.07]} />
        <meshStandardMaterial color={helmetColor} />
      </mesh>
    </group>
  );
};
