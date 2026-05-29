import * as THREE from 'three';

export function applyBlinkEffect(group: THREE.Group, time: number, blinking: boolean, color?: string) {
  const opacity = 0.5 + 0.3 * Math.sin(time); // entre 0.2 y 0.8

  if (blinking) {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material;

        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.transparent = true;
          mat.opacity = opacity;
          mat.emissive = new THREE.Color(color ? color : mat.color.getHex());
          mat.emissiveIntensity = 0.4 + 0.4 * Math.sin(time);
        }
      }
    });
  } else {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material;

        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.transparent = false;
          mat.opacity = 1;
          mat.emissiveIntensity = 0;
        }
      }
    });
  }
}
