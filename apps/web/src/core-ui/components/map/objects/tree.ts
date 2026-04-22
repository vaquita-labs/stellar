import { getAddMesh, getY_0 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { getTileTopY } from '@/core-ui/helpers/map';
import { MapObject } from '@/core-ui/types';
import { WorldType } from '@/core-ui/types/map';
import * as THREE from 'three';
import { MeshStandardMaterial } from 'three';

const colorPalettes = {
  [WorldType.FOREST]: {
    treeTerrain: '#C35838',
  },
  [WorldType.DESERT]: {
    treeTerrain: '#8B6F47',
  },
  [WorldType.VOLCANO]: {
    treeTerrain: '#C2583B',
  },
};

export const getTreeGroup = ({ position: [x, , z], variant }: MapObject, worldType: WorldType) => {
  const palette = colorPalettes[worldType] || colorPalettes[WorldType.FOREST];

  const group = new THREE.Group();

  const baseY = getTileTopY();

  const addMesh = getAddMesh(group);

  addMesh(
    new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE),
    new MeshStandardMaterial({ color: palette.treeTerrain }),
    [x, getY_0(TILE_HEIGHT), z]
  );

  if (worldType === WorldType.FOREST) {
    const brown = new THREE.MeshStandardMaterial({ color: 'brown' });
    const green = new THREE.MeshStandardMaterial({ color: '#9FFD53' });
    const green2 = new THREE.MeshStandardMaterial({ color: '#4CAF50' });
    const green3 = new THREE.MeshStandardMaterial({ color: '#5CA904' });

    switch (variant) {
      case 0: {
        addMesh(new THREE.BoxGeometry(0.2, 1, 0.2), brown, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), green, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), green, [x, baseY + 0.3, z]);
        addMesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), green, [x, baseY + 0.6, z]);
        break;
      }

      case 1: {
        addMesh(new THREE.BoxGeometry(0.2, 1, 0.2), brown, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), green, [x, baseY + 0.2, z]);
        break;
      }

      case 2: {
        addMesh(new THREE.BoxGeometry(0.2, 1, 0.2), brown, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), green, [x, baseY + 0.2, z]);
        addMesh(new THREE.BoxGeometry(0.4, 0.7, 0.5), green, [x + 0.2, baseY + 0.4, z + 0.2]);
        break;
      }

      case 3: {
        addMesh(new THREE.BoxGeometry(0.2, 1, 0.2), green2, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), green2, [x + 0.2, baseY + 0.2, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), green2, [x - 0.2, baseY + 0.15, z]);
        addMesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), green2, [x, baseY, z]);
        break;
      }

      case 4: {
        addMesh(new THREE.BoxGeometry(0.15, 1, 0.15), brown, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.2, 0.05, 0.5), green3, [x, baseY + 0.5, z + 0.25]);
        addMesh(new THREE.BoxGeometry(0.2, 0.05, 0.5), green3, [x, baseY + 0.5, z - 0.25]);
        addMesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), green3, [x + 0.25, baseY + 0.5, z]);
        addMesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), green3, [x - 0.25, baseY + 0.5, z]);
        break;
      }

      case 5: {
        addMesh(new THREE.BoxGeometry(0.3, 1, 0.3), green2, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), green2, [x + 0.3, baseY + 0.2, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), green2, [x - 0.3, baseY - 0.1, z]);
        addMesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), green2, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), green2, [x, baseY - 0.5, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), green2, [x, baseY - 0.5, z]);
        break;
      }

      case 6: {
        const pumpkin = new THREE.Group();
        pumpkin.scale.set(0.8, 0.8, 0.8);
        pumpkin.position.set(x, baseY - 0.65, z);

        const orange = new THREE.MeshStandardMaterial({ color: '#FF6B1A' });
        const black = new THREE.MeshStandardMaterial({ color: '#000000' });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), orange);
        body.castShadow = true;
        pumpkin.add(body);

        const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.01), black);
        leftEye.position.set(-0.2, 0.18, 0.35);
        pumpkin.add(leftEye);

        const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.01), black);
        rightEye.position.set(0.15, 0.18, 0.35);
        pumpkin.add(rightEye);

        group.add(pumpkin);
        break;
      }

      case 7: {
        const gray = new THREE.MeshStandardMaterial({ color: '#5C4F47' });

        addMesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), gray, [x, baseY - 0.65, z]);
        addMesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), gray, [x + 0.2, baseY - 0.35, z]);
        addMesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), gray, [x - 0.2, baseY - 0.5, z]);
        addMesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), gray, [x + 0.05, baseY - 0.15, z]);
        break;
      }
    }

    return group;
  }

  // ============================================================
  // ======================= DESERT ==============================
  // ============================================================
  if (worldType === WorldType.DESERT) {
    const brown = new THREE.MeshStandardMaterial({ color: 'brown' });
    const green = new THREE.MeshStandardMaterial({ color: '#9FFD53' });
    const desert2 = new THREE.MeshStandardMaterial({ color: '#A4876A' });

    switch (variant) {
      case 0:
        // reuse renderVariant3
        addMesh(new THREE.BoxGeometry(0.2, 1, 0.2), desert2, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), desert2, [x + 0.2, baseY + 0.2, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), desert2, [x - 0.2, baseY + 0.15, z]);
        addMesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), desert2, [x, baseY, z]);
        break;

      case 1:
        addMesh(new THREE.BoxGeometry(0.15, 1, 0.15), desert2, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.2, 0.05, 0.5), green, [x, baseY + 0.5, z + 0.25]);
        addMesh(new THREE.BoxGeometry(0.2, 0.05, 0.5), green, [x, baseY + 0.5, z - 0.25]);
        addMesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), green, [x + 0.25, baseY + 0.5, z]);
        addMesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), green, [x - 0.25, baseY + 0.5, z]);
        break;

      case 2:
        // reuse renderVariant5
        addMesh(new THREE.BoxGeometry(0.3, 1, 0.3), brown, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), brown, [x + 0.3, baseY + 0.2, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), brown, [x - 0.3, baseY - 0.1, z]);
        addMesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), brown, [x, baseY, z]);
        addMesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), brown, [x, baseY - 0.5, z]);
        addMesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), brown, [x, baseY - 0.5, z]);
        break;
    }

    return group;
  }

  // ============================================================
  // ======================= VOLCANO =============================
  // ============================================================
  if (worldType === WorldType.VOLCANO) {
    const orange = new THREE.MeshStandardMaterial({ color: '#FF6B1A' });
    const gray = new THREE.MeshStandardMaterial({ color: '#5C4F47' });

    switch (variant) {
      case 0: {
        const pumpkin = new THREE.Group();
        pumpkin.scale.set(0.8, 0.8, 0.8);
        pumpkin.position.set(x, baseY - 0.65, z);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), orange);
        body.castShadow = true;
        pumpkin.add(body);

        group.add(pumpkin);
        break;
      }

      case 1:
      case 2:
        addMesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), gray, [x, baseY - 0.65, z]);
        addMesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), gray, [x + 0.2, baseY - 0.35, z]);
        addMesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), gray, [x - 0.2, baseY - 0.5, z]);
        addMesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), gray, [x + 0.05, baseY - 0.15, z]);
        break;
    }

    return group;
  }

  return group;
};
