'use client';

import { useFrame } from '@react-three/fiber';
import { EventHandlers } from '@react-three/fiber/dist/declarations/src/core/events';
import { ReactNode, useEffect, useRef } from 'react';
import * as THREE from 'three';

interface EditableObjectGroupProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  isEditing: boolean;
  onClick?: EventHandlers['onClick'];
  onPointerEnter?: EventHandlers['onPointerEnter'];
  onPointerLeave?: EventHandlers['onPointerLeave'];
  children: ReactNode;
}

export const EditableObjectGroup = ({
  position,
  rotation = [0, 0, 0],
  isEditing,
  onClick,
  onPointerEnter,
  onPointerLeave,
  children,
}: EditableObjectGroupProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const originalColorsRef = useRef<Map<THREE.Material, THREE.Color>>(new Map());
  const originalEmissiveRef = useRef<Map<THREE.Material, THREE.Color>>(new Map());

  // Función para aplicar el efecto de selección a cualquier material con color
  const applyEditingEffect = (mat: THREE.Material) => {
    // Verificar si el material tiene propiedades de color
    if (!('color' in mat) || !mat.color) return;

    // Guardar color y emisión originales la primera vez (usando el material como clave)
    if (!originalColorsRef.current.has(mat)) {
      originalColorsRef.current.set(mat, (mat.color as THREE.Color).clone());
      if ('emissive' in mat && mat.emissive) {
        originalEmissiveRef.current.set(mat, (mat.emissive as THREE.Color).clone());
      } else {
        originalEmissiveRef.current.set(mat, new THREE.Color(0x000000));
      }
    }

    if (isEditing) {
      // Aplicar efecto de selección: mantener el color original pero más brillante
      const originalColor = originalColorsRef.current.get(mat)!;

      // Convertir a HSL para manipular el color
      const hsl = { h: 0, s: 0, l: 0 };
      originalColor.getHSL(hsl);

      // Mantener el matiz original (hue) y aumentar luminosidad y saturación moderadamente
      // para hacerlo más brillante sin volverlo blanco
      hsl.l = Math.min(0.75, hsl.l * 1.4); // Aumentar luminosidad pero no demasiado
      hsl.s = Math.min(1.0, hsl.s * 1.2); // Aumentar saturación para mantener el color vibrante

      // Aplicar el color más brillante manteniendo el color original
      (mat.color as THREE.Color).setHSL(hsl.h, hsl.s, hsl.l);

      // Agregar emisión usando el color original para el efecto de brillo luminoso
      // Solo si el material soporta emisión (MeshStandardMaterial, MeshPhongMaterial, etc.)
      if ('emissive' in mat) {
        const emissiveColor = originalColor.clone();
        const emissiveHsl = { h: 0, s: 0, l: 0 };
        emissiveColor.getHSL(emissiveHsl);
        emissiveHsl.l = Math.min(0.6, emissiveHsl.l * 1.3); // Emisión moderada
        emissiveHsl.s = Math.min(1.0, emissiveHsl.s * 1.1); // Mantener saturación
        emissiveColor.setHSL(emissiveHsl.h, emissiveHsl.s, emissiveHsl.l);
        // Para MeshLambertMaterial, solo podemos establecer emissive, no emissiveIntensity
        if (mat.emissive) {
          (mat.emissive as THREE.Color).copy(emissiveColor);
        } else {
          // Si no tiene emissive, intentar agregarlo (solo funciona para algunos materiales)
          try {
            mat.emissive = emissiveColor;
          } catch (e) {
            console.warn(e);
            // Si el material no soporta emisión, continuar sin ella
          }
        }
        // Solo establecer emissiveIntensity si el material lo soporta
        if ('emissiveIntensity' in mat) {
          mat.emissiveIntensity = 0.2; // Intensidad moderada para efecto luminoso
        }
      }
    } else {
      // Restaurar color y emisión originales
      const originalColor = originalColorsRef.current.get(mat);
      const originalEmissive = originalEmissiveRef.current.get(mat);

      if (originalColor) {
        (mat.color as THREE.Color).copy(originalColor);
      }
      if (originalEmissive && 'emissive' in mat) {
        if (mat.emissive) {
          (mat.emissive as THREE.Color).copy(originalEmissive);
        }
        if ('emissiveIntensity' in mat) {
          mat.emissiveIntensity = 0;
        }
      }
    }
  };

  // Reaplicar el efecto en cada frame cuando está en modo edición para asegurar que persista
  useFrame(() => {
    if (!groupRef.current || !isEditing) return;

    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material;

        // Manejar materiales simples y arrays de materiales
        if (Array.isArray(mat)) {
          mat.forEach((m) => applyEditingEffect(m));
        } else {
          applyEditingEffect(mat);
        }
      }
    });
  });

  // Cambiar el color cuando isEditing cambia
  useEffect(() => {
    if (!groupRef.current) return;

    const meshes: THREE.Mesh[] = [];
    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });

    meshes.forEach((mesh) => {
      const mat = mesh.material;

      // Manejar materiales simples y arrays de materiales
      if (Array.isArray(mat)) {
        mat.forEach((m) => applyEditingEffect(m));
      } else {
        applyEditingEffect(mat);
      }
    });

    // Limpiar cuando el componente se desmonta o cuando isEditing cambia a false
    return () => {
      if (!isEditing && groupRef.current) {
        groupRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material;

            // Manejar materiales simples y arrays de materiales
            const materials = Array.isArray(mat) ? mat : [mat];
            materials.forEach((material) => {
              if ('color' in material && material.color && material instanceof THREE.Material) {
                const originalColor = originalColorsRef.current.get(material);
                const originalEmissive = originalEmissiveRef.current.get(material);

                if (originalColor) {
                  (material.color as THREE.Color).copy(originalColor);
                }
                if (originalEmissive && 'emissive' in material) {
                  if (material.emissive) {
                    (material.emissive as THREE.Color).copy(originalEmissive);
                  }
                  if ('emissiveIntensity' in material) {
                    material.emissiveIntensity = 0;
                  }
                }
              }
            });
          }
        });
      }
    };
  }, [isEditing]);

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </group>
  );
};
