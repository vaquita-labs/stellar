import { getY_0 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';

const colorPalettes = {
  [WorldType.FOREST]: {
    bushTerrain: '#C6E646',
    bushBranch: '#72924C',
  },
  [WorldType.DESERT]: {
    bushTerrain: '#FFB24A',
    bushBranch: '#72924C',
  },
  [WorldType.VOLCANO]: {
    bushTerrain: '#7B4F50',
    bushBranch: '#72924C',
  },
};

export const getBushGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = colorPalettes[worldType] || colorPalettes[WorldType.FOREST];

  const group = new THREE.Group();

  const flooring = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE),
    new THREE.MeshStandardMaterial({ color: palette.bushTerrain })
  );
  flooring.castShadow = true;
  flooring.receiveShadow = true;
  flooring.position.set(x, getY_0(TILE_HEIGHT), z);

  group.add(flooring);

  if (worldType === WorldType.FOREST) {
    const material = new THREE.MeshLambertMaterial({ color: palette.bushBranch });

    const bushData: { pos: [number, number]; height: number }[] = [
      { pos: [-0.22, -0.18], height: 0.45 },
      { pos: [0.03, -0.2], height: 0.5 },
      { pos: [0.18, 0.1], height: 0.6 },
      { pos: [-0.15, 0.2], height: 0.55 },
      { pos: [0.3, 0.3], height: 0.5 },
      { pos: [0.4, 0.1], height: 0.6 },
    ];

    const baseY = 0;

    for (const { pos, height } of bushData) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, height, 0.1), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.position.set(x + pos[0], baseY + height / 2, z + pos[1]);
      group.add(mesh);
    }
  } else if (worldType === WorldType.DESERT) {
    const mat1 = new THREE.MeshLambertMaterial({ color: '#A4876A' });
    const mat2 = new THREE.MeshLambertMaterial({ color: '#8B7355' });

    const baseY = 0;

    const rock1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), mat1);
    rock1.position.set(x, baseY - 0.155, z);
    group.add(rock1);

    const rock2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), mat2);
    rock2.position.set(x + 0.25, baseY - 0.15, z + 0.15);
    group.add(rock2);

    const rock3 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.15), mat1);
    rock3.position.set(x - 0.2, baseY - 0.15, z + 0.2);
    group.add(rock3);
  } else if (worldType === WorldType.VOLCANO) {
    const skullGroup = new THREE.Group();
    const bone = new THREE.MeshLambertMaterial({ color: '#E8E8E8' });
    const dark = new THREE.MeshLambertMaterial({ color: '#000000' });

    const baseY = 0;

    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), bone);
    skull.position.set(x, baseY, z);
    skullGroup.add(skull);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), dark);
    eyeL.position.set(x - 0.1, baseY, z + 0.21);
    skullGroup.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), dark);
    eyeR.position.set(x + 0.1, baseY, z + 0.21);
    skullGroup.add(eyeR);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.05), dark);
    nose.position.set(x, baseY - 0.1, z + 0.21);
    skullGroup.add(nose);

    group.add(skullGroup);
  }

  return group;
};
