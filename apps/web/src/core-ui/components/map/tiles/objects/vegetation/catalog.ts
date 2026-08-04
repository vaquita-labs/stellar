import { WorldType } from '@/core-ui/types';
import { makeCatalog, Variant } from '../catalog-kit';
import { bigCactus } from './shapes/bigCactus';
import { cactus } from './shapes/cactus';
import { crownTree } from './shapes/crownTree';
import { deadTree } from './shapes/deadTree';
import { doubleCrownTree } from './shapes/doubleCrownTree';
import { palmTree } from './shapes/palmTree';
import { roundTree } from './shapes/roundTree';
// La calabaza es un ítem ESTACIONAL (su forma vive en seasonal/), pero por ahora
// se sirve como variante de TREE para no migrar la DB (ver categories.ts). Al
// re-tipar a SEASONAL, se saca de acá y queda solo en seasonal/catalog.ts.
import { pumpkin } from '../seasonal/shapes/pumpkin';

// Catálogo de VEGETACIÓN. Para agregar una forma: creá shapes/miForma.ts,
// sumá una entrada en VARIANTS, y su nombre AL FINAL del array del mundo.

const VARIANTS = {
  crownTree: (p) => crownTree(p.trunk, p.leaf),
  roundTree: (p) => roundTree(p.trunk, p.leaf),
  doubleCrown: (p) => doubleCrownTree(p.trunk, p.leaf),
  cactus: (p) => cactus(p.cactus),
  sandCactus: (p) => cactus(p.sand),
  palm: (p) => palmTree(p.trunk, p.leafDark, p.deadWood),
  sandPalm: (p) => palmTree(p.sand, p.leaf, p.deadWood),
  bigCactus: (p) => bigCactus(p.cactus),
  sandBigCactus: (p) => bigCactus(p.trunk),
  jackOLantern: (p) => pumpkin(p.pumpkin, p.dark, p.leafDark, true),
  plainPumpkin: (p) => pumpkin(p.pumpkin, p.dark, p.leafDark, false),
  deadTree: (p) => deadTree(p.deadWood),
} satisfies Record<string, Variant>;

// El ÍNDICE del array = el `variant` guardado en el mapa. NO reordenar/borrar.
const ORDER: Partial<Record<WorldType, (keyof typeof VARIANTS)[]>> = {
  [WorldType.FOREST]: ['crownTree', 'roundTree', 'doubleCrown', 'cactus', 'palm', 'bigCactus', 'jackOLantern', 'deadTree'],
  [WorldType.DESERT]: ['sandCactus', 'sandPalm', 'sandBigCactus'],
  [WorldType.VOLCANO]: ['plainPumpkin', 'deadTree', 'deadTree'],
};

export const getTreeRecipe = makeCatalog(VARIANTS, ORDER);
