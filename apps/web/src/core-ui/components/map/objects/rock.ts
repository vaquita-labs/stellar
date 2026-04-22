import { getAddMesh, getY_0, getY_1 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, WorldType } from '@/core-ui/types';
import { BoxGeometry, Group, MeshStandardMaterial } from 'three';

const colorPalettes = {
  [WorldType.FOREST]: {
    rock: '#A4876A',
  },
  [WorldType.DESERT]: {
    rock: '#A4876A',
  },
  [WorldType.VOLCANO]: {
    rock: '#A4876A',
  },
};

export const getRockGroup = ({ position: [x, , z], variant }: MapObject, worldType: WorldType) => {
  const palette = colorPalettes[worldType] || colorPalettes[WorldType.FOREST];

  const group = new Group();

  const rockMaterial = new MeshStandardMaterial({ color: palette.rock });

  const addMesh = getAddMesh(group);
  addMesh(new BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE), rockMaterial, [x, getY_0(TILE_HEIGHT), z]);

  switch (variant) {
    case 0: {
      const height = TILE_HEIGHT * 0.3;
      addMesh(new BoxGeometry(TILE_SIZE, height, TILE_SIZE), rockMaterial, [x, getY_1(height), z]);
      break;
    }

    case 1: {
      const height = TILE_HEIGHT * 0.6;
      addMesh(new BoxGeometry(TILE_SIZE, height, TILE_SIZE), rockMaterial, [x, getY_1(height), z]);
      break;
    }

    case 2: {
      const height = TILE_HEIGHT * 0.9;
      addMesh(new BoxGeometry(TILE_SIZE, height, TILE_SIZE), rockMaterial, [x, getY_1(height), z]);
      break;
    }
    case 3: {
      const g = new Group();
      g.position.set(x, 1, z);
      const addG = getAddMesh(g);
      const height1 = TILE_HEIGHT * 0.1;
      addG(new BoxGeometry(TILE_SIZE, height1, TILE_SIZE), rockMaterial, [0, getY_0(height1), 0]);

      const height2 = TILE_HEIGHT * 0.35;
      addG(new BoxGeometry(TILE_SIZE * 0.4, height2, TILE_SIZE * 0.4), rockMaterial, [-0.2, getY_0(height2), -0.2]);
      group.add(g);
      break;
    }

    case 4: {
      const g = new Group();
      g.position.set(x, 1, z);
      const addG = getAddMesh(g);
      const height1 = TILE_HEIGHT * 0.4;
      addG(new BoxGeometry(TILE_SIZE, height1, TILE_SIZE), rockMaterial, [0, getY_0(height1), 0]);

      const height2 = TILE_HEIGHT * 0.65;
      addG(new BoxGeometry(TILE_SIZE * 0.4, height2, TILE_SIZE * 0.4), rockMaterial, [-0.2, getY_0(height2), -0.2]);
      group.add(g);
      break;
    }

    case 5: {
      const g = new Group();
      g.position.set(x, 1, z);
      const addG = getAddMesh(g);
      const height1 = TILE_HEIGHT * 0.7;
      addG(new BoxGeometry(TILE_SIZE, height1, TILE_SIZE), rockMaterial, [0, getY_0(height1), 0]);

      const height2 = TILE_HEIGHT * 0.95;
      addG(new BoxGeometry(TILE_SIZE * 0.4, height2, TILE_SIZE * 0.4), rockMaterial, [-0.2, getY_0(height2), -0.2]);
      group.add(g);
      break;
    }
  }

  return group;
};
