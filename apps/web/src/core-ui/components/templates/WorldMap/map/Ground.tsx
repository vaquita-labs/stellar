import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapTile, WorldType } from '@/core-ui/types/map';
import { useMemo } from 'react';
import * as THREE from 'three';

export const Ground = ({ tiles, styleMap }: { tiles: MapTile[]; styleMap: WorldType }) => {
  const grid = useMemo(() => {
    const group = new THREE.Group();

    for (const tile of tiles) {
      const { position, terrain, object } = tile;
      const [x, , z] = position;

      // Definir paletas de colores por estilo de mapa
      const colorPalettes = {
        [WorldType.FOREST]: {
          water: '#6FF2F1',
          road: '#000',
          goal: '#FF9B00',
          tree: '#C35838',
          rock: '#A4876A',
          bush: '#C6E646',
          grass: '#A1CD5A',
          brick: '#FF9B00',
        },
        [WorldType.DESERT]: {
          water: '#4DB8E8',
          road: '#000',
          goal: '#FF9B00',
          tree: '#8B6F47',
          rock: '#A4876A',
          bush: '#FFB24A',
          grass: '#FFE49A',
          brick: '#FF9B00',
        },
        [WorldType.VOLCANO]: {
          water: '#FF9C1C',
          road: '#000',
          goal: '#FF9B00',
          tree: '#C2583B',
          rock: '#A4876A',
          bush: '#7B4F50',
          grass: '#624D4A',
          brick: '#FF9B00',
        },
      };

      const palette = colorPalettes[styleMap] || colorPalettes[WorldType.FOREST];

      const isWater = terrain === 'water';
      const isRoad = terrain === 'road';

      let color: string;

      if (isWater) {
        color = palette.water;
      } else if (isRoad) {
        color = palette.road;
      } else if (object === 'tree') {
        color = palette.tree;
      } else if (object === 'rock') {
        color = palette.rock;
      } else if (object === 'bush') {
        color = palette.bush;
      } else {
        color = palette.grass;
      }

      const height = isWater ? TILE_HEIGHT * 0.8 : TILE_HEIGHT;
      const y = isWater ? -TILE_HEIGHT / 2 - 0.1 : -TILE_HEIGHT / 2;

      const tileMesh = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE),
        new THREE.MeshLambertMaterial({ color })
      );

      tileMesh.receiveShadow = !isWater;
      tileMesh.position.set(x, y, z);
      group.add(tileMesh);
    }

    return group;
  }, [tiles, styleMap]);

  return <primitive object={grid} />;
};
