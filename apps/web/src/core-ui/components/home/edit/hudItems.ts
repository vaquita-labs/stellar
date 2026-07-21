import { MapObjectType } from '../../../types';

/**
 * Ítems de la tienda que NO se colocan en el mapa: comprarlos desbloquea algo
 * del HUD (por ahora, el reloj de la hora de juego sobre el mapa). Se compran
 * una sola vez, así que el catálogo los esconde una vez comprados, no ofrecen
 * "colocar ahora" y no aparecen en la colección (que es lo colocable).
 */
export const HUD_ITEM_TYPES: readonly MapObjectType[] = [MapObjectType.CLOCK];

export const isHudItem = (type: MapObjectType) => HUD_ITEM_TYPES.includes(type);
