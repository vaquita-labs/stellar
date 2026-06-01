"use client";
import { OrbitControls } from "@react-three/drei";

interface Props {
  center: [number, number, number];
}

export const SceneControls = ({ center }: Props) => {
  return (
    <OrbitControls
      enablePan={false}
      enableZoom={true}
      enableRotate={true}
      target={center}
      minPolarAngle={0.2 * Math.PI}
      maxPolarAngle={0.45 * Math.PI}
      minDistance={10}
      maxDistance={20}
    />
  );
};
