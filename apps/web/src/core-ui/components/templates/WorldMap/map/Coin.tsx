'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';

interface CoinProps {
  position: [number, number, number];
  size?: number;
  counter: number;
  isLoading?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isMaterial = (b: any): b is { material: { opacity: number; transparent: true } } => {
  return !!b.material;
};

export default function Coin({ position, size = 0.2, counter, isLoading = false }: CoinProps) {
  const coinRef = useRef<THREE.Group>(null);
  const [font, setFont] = useState<Font | null>(null);

  const coinRadius = size;
  const coinThickness = size * 0.15;
  const isTransparent = counter === 0;
  const opacity = isTransparent ? 0.2 : 1.0;

  useEffect(() => {
    const loader = new FontLoader();
    loader.load(
      '/font/helvetiker_bold.typeface.json',
      (loadedFont) => {
        setFont(loadedFont);
      },
      undefined,
      (error) => {
        console.error('Error loading font:', error);
      }
    );
  }, []);

  // Crear el texto del número
  const numberText = useMemo(() => {
    if (!font || counter === 0) return null;

    const textGeometry = new TextGeometry(counter.toString(), {
      font: font,
      size: size * 1,
      depth: size * 0.4, // Aumentar el grosor del texto
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: size * 0.03,
      bevelSize: size * 0.02,
      bevelOffset: 0,
      bevelSegments: 5,
    });

    textGeometry.computeBoundingBox();
    const bbox = textGeometry.boundingBox!;
    // Calcular el centro del bounding box para centrar correctamente cualquier número
    const centerX = (bbox.min.x + bbox.max.x) / 2;
    const centerY = (bbox.min.y + bbox.max.y) / 2;

    const textMaterial = new THREE.MeshLambertMaterial({
      color: '#1A1A1A',
      transparent: true,
      opacity: opacity,
    });

    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    // Centrar el texto en la cara superior de la moneda
    // La moneda está rotada [Math.PI / 2, 0, 0], así que:
    // - X sigue siendo X (horizontal en la cara de la moneda)
    // - Y original se convierte en Z visual (profundidad)
    // - Z original se convierte en Y visual (vertical)
    // Centramos usando el centro del bounding box para que funcione con cualquier número
    textMesh.position.set(-centerX, -0.05, centerY);
    // Rotar el texto -90 grados sobre X para que quede plano en la cara de la moneda
    textMesh.rotation.x = -Math.PI / 2;
    // Evitar que el texto capture eventos de pointer
    textMesh.raycast = () => undefined;

    return textMesh;
  }, [font, counter, size, opacity]);

  // Animación: rotación normal y efecto de "loading" cuando isLoading es true
  useFrame((state) => {
    if (!coinRef.current) return;

    if (isLoading) {
      const t = state.clock.getElapsedTime();

      // Rotación más rápida mientras carga
      coinRef.current.rotation.y += 0.15;

      // Pequeño "latido" / pulso en escala
      const scale = 1 + 0.1 * Math.sin(t * 4);
      coinRef.current.scale.set(scale, scale, scale);

      // Reducir opacidad mientras carga
      coinRef.current.traverse((child) => {
        if (isMaterial(child)) {
          child.material.opacity = 0.6;
          child.material.transparent = true;
        }
      });
    } else {
      // Animación normal: rotación suave y escala por defecto
      coinRef.current.rotation.y += 0.02;
      coinRef.current.scale.set(1, 1, 1);

      // Restaurar opacidad normal
      coinRef.current.traverse((child) => {
        if (isMaterial(child)) {
          child.material.opacity = 1.0;
          child.material.transparent = true;
        }
      });
    }
  });

  return (
    <group position={position}>
      {/* Grupo que rota para la animación */}
      <group ref={coinRef}>
        {/* Grupo interno con la orientación inicial de la moneda */}
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[coinRadius, coinRadius, coinThickness, 32]} />
            <meshLambertMaterial color="#B2B2B2" transparent={true} opacity={opacity} />
          </mesh>

          <mesh>
            <cylinderGeometry args={[coinRadius * 0.95, coinRadius * 0.95, coinThickness + 0.01, 16]} />
            <meshLambertMaterial color="#CBCACB" transparent={true} opacity={opacity} />
          </mesh>

          {/* Mostrar el número en la moneda */}
          {numberText && <primitive object={numberText} />}
        </group>
      </group>
    </group>
  );
}
