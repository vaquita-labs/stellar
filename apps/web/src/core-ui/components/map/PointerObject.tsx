'use client';

import { getObjectGroup } from '@/core-ui/components/map/helpers';
import { getTileTopY } from '@/core-ui/helpers/map';
import { MapObjectType } from '@/core-ui/types';
import { WorldType } from '@/core-ui/types/map';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface GhostTreeProps {
  worldType: WorldType;
  onPlace: (position: [number, number, number], rotation: number) => void;
  isValidPosition: (x: number, z: number) => boolean;
  type: MapObjectType;
  variant: number;
}

export default function PointerObject({ worldType, onPlace, isValidPosition, type, variant }: GhostTreeProps) {
  const { camera, gl, raycaster } = useThree();
  const positionRef = useRef<[number, number, number] | null>(null);
  const hasPositionRef = useRef(false);
  const mousePosition = useRef({ x: 0, y: 0 });
  const groupRef = useRef<THREE.Group>(null);
  const treeGroupRef = useRef<THREE.Group>(null);
  const indicatorRef = useRef<THREE.Group>(null);
  const baseY = getTileTopY() - 0.49; // Posición base del cuadro (ligeramente sobre el suelo)
  const rotation = 0;

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      mousePosition.current = { x, y };
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY !== 0) {
        event.preventDefault();
        // setRotation((prev) => prev + (event.deltaY > 0 ? Math.PI / 4 : -Math.PI / 4));
      }
    };

    gl.domElement.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('wheel', handleWheel);
    };
  }, [gl.domElement]);

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0

  useFrame(() => {
    raycaster.setFromCamera(new THREE.Vector2(mousePosition.current.x, mousePosition.current.y), camera);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, point);

    if (!point) {
      return;
    }

    const x = Math.round(point.x);
    const z = Math.round(point.z);

    if (z >= 0 && z < 14 && x >= 0 && x < 14) {
      const y = getTileTopY();

      positionRef.current = [x, y, z];
      hasPositionRef.current = true;

      if (groupRef.current) {
        groupRef.current.position.set(x, y, z);
        groupRef.current.visible = true;
      }
      if (indicatorRef.current) {
        indicatorRef.current.position.set(x, baseY, z);
        indicatorRef.current.visible = true;
      }
    } else {
      positionRef.current = null;
      hasPositionRef.current = false;

      if (groupRef.current) {
        groupRef.current.visible = false;
      }
      if (indicatorRef.current) {
        indicatorRef.current.visible = false;
      }
    }
    const isValid = isValidPosition(x, z);
    gl.domElement.style.cursor = !!positionRef.current && isValid ? 'pointer' : 'not-allowed';

    if (groupRef.current) {
      const opacity = !!positionRef.current && isValid ? 0.9 : 0.4;
      groupRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mat = mesh.material;
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.transparent = true;
            mat.opacity = opacity;
          }
        }
      });
    }
  });

  const handleClick = () => {
    if (positionRef.current) {
      onPlace(positionRef.current, rotation);
    }
  };

  return (
    <group
      ref={groupRef}
      onClick={handleClick}
      onPointerOut={() => {
        gl.domElement.style.cursor = 'default';
      }}
    >
      <group ref={treeGroupRef} rotation={[0, rotation, 0]}>
        <primitive
          object={getObjectGroup(
            {
              type,
              variant,
              position: [0, 0, 0],
              rotation: [0, 0, 0],
            },
            worldType
          )}
        />
      </group>
    </group>
  );
}
