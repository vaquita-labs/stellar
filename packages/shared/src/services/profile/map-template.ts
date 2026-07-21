import { MapObjectType, type ProfileMapObjectsResponseDTO } from '../../types';

/**
 * Mapa inicial: absolutamente vacío. Las 196 celdas arrancan en EMPTY (no se
 * renderiza terreno) y lo único que hay es el banco al centro. El usuario
 * arranca sin piezas en la colección y va construyendo su isla desde cero con
 * lo que compra o gana.
 */
export const friendlyStandardMap: ProfileMapObjectsResponseDTO['objects'] = [
  // Fila 0
  { position: [ 0, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 0 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 1
  { position: [ 0, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 1 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 2
  { position: [ 0, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 2 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 3
  { position: [ 0, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 3 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 4
  { position: [ 0, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 4 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 5
  { position: [ 0, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 5 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 6
  { position: [ 0, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 6 ], type: MapObjectType.BANK, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 6 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 7
  { position: [ 0, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 7 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 8
  { position: [ 0, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 8 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 9
  { position: [ 0, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 9 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 10
  { position: [ 0, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 10 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 11
  { position: [ 0, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 11 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 12
  { position: [ 0, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 12 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  
  // Fila 13
  { position: [ 0, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 1, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 2, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 3, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 4, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 5, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 6, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 7, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 8, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 9, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 10, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 11, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 12, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
  { position: [ 13, 0, 13 ], type: MapObjectType.EMPTY, variant: 0, rotation: [ 0, 0, 0 ] },
];

/**
 * Inventario que respalda cada objeto del template inicial: todo lo que está
 * en el mapa es un bien del usuario, así quitarlo del mapa lo devuelve a su
 * colección en vez de perderse. Derivado del template para no quedar fuera
 * de sync al editarlo.
 */
export const mapTemplateInventory = (): Array<{ type: string; variant: number; quantity: number }> => {
  const counts = new Map<string, { type: string; variant: number; quantity: number }>();
  for (const { type, variant } of friendlyStandardMap) {
    if (type === MapObjectType.EMPTY) continue;
    const key = `${type}|${variant}`;
    const entry = counts.get(key);
    if (entry) {
      entry.quantity += 1;
    } else {
      counts.set(key, { type, variant, quantity: 1 });
    }
  }
  return Array.from(counts.values());
};
