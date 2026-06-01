// components/BankModel.tsx
"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
// Option B: use ThreeElements if you prefer
import type { ThreeElements } from "@react-three/fiber";
type GroupLikeProps = ThreeElements["group"];

type Props = GroupLikeProps & { url?: string };

export function BankModel({ url = "/models/bank.glb", ...props }: Props) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  return (
    <group {...props}>
      <primitive object={cloned} />
    </group>
  );
}

useGLTF.preload("/models/banco.glb");
