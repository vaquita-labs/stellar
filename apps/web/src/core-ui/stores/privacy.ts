import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Cada bloque de plata que se puede tapar por su cuenta, además del interruptor
 * global. Los nombres con punto NO son una ruta: son sólo el nombre del bloque,
 * y quién cuelga de quién lo dice `PRIVACY_PARENT` y nada más.
 */
export type PrivacySection = 'positions' | 'positions.list';

/**
 * Tapar un bloque tapa todo lo que tiene adentro. El portafolio (/portafolio) no
 * tiene bloques propios: su único ojo es el global, el mismo del home.
 */
const PRIVACY_PARENT: Record<PrivacySection, PrivacySection | null> = {
  positions: null,
  'positions.list': 'positions',
};

type Sections = Record<PrivacySection, boolean>;

const NO_SECTIONS_HIDDEN: Sections = {
  positions: false,
  'positions.list': false,
};

/** Recorre para arriba desde `scope` (incluyéndolo) buscando un ojo cerrado. */
const hiddenFrom = (sections: Sections, scope: PrivacySection | null): boolean => {
  let current = scope;
  while (current) {
    if (sections[current]) return true;
    current = PRIVACY_PARENT[current];
  }
  return false;
};

/**
 * Preferencias de privacidad del usuario. Se persisten en localStorage para que
 * la elección sobreviva a un reload. Para leerlas usá `useIsHidden(scope?)` y
 * pasá cualquier importe por `maskAmount`.
 *
 * `hideBalance` es el ámbito GLOBAL y se deja tal cual estaba: ya está
 * persistido bajo `vq:privacy` y ya lo leen `PrivacySettingsPage` y
 * `HeaderStats`. `sections` se suma al lado, y como `persist` mezcla el estado
 * guardado por encima del inicial, un usuario que ya tenía `vq:privacy` guardado
 * estrena las secciones abiertas sin migración de por medio.
 */
type PrivacyState = {
  hideBalance: boolean;
  sections: Sections;
  setHideBalance: (value: boolean) => void;
  toggleHideBalance: () => void;
  toggleSection: (id: PrivacySection) => void;
};

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set, get) => ({
      hideBalance: false,
      sections: NO_SECTIONS_HIDDEN,
      setHideBalance: (value) => set({ hideBalance: value }),
      toggleHideBalance: () => set({ hideBalance: !get().hideBalance }),
      toggleSection: (id) => set({ sections: { ...get().sections, [id]: !get().sections[id] } }),
    }),
    {
      name: 'vq:privacy',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const useHideBalance = () => usePrivacyStore((s) => s.hideBalance);

/**
 * Si hay que tapar la plata de este bloque: porque está el interruptor global,
 * porque está cerrado el ojo del bloque, o porque lo está el de alguno de
 * arriba. Sin `scope` pregunta sólo por el global.
 *
 * Devuelve un booleano y no un objeto: el selector corre en cada cambio del
 * store y devolver algo nuevo cada vez haría re-renderizar de más.
 */
export const useIsHidden = (scope?: PrivacySection): boolean =>
  usePrivacyStore((s) => s.hideBalance || hiddenFrom(s.sections, scope ?? null));

/**
 * Si algo POR ENCIMA de `scope` ya está tapando. Con esto el ojo de un bloque
 * hijo desaparece en vez de quedarse ahí sin hacer nada visible: con las
 * posiciones enteras tapadas, el ojo de la lista no tiene nada que tapar ni destapar.
 *
 * Sin `scope` es siempre `false`: el interruptor global no tiene a nadie encima,
 * y contarlo a él mismo escondería para siempre el único ojo que puede destapar.
 */
export const useIsHiddenAbove = (scope?: PrivacySection): boolean =>
  usePrivacyStore((s) => (scope ? s.hideBalance || hiddenFrom(s.sections, PRIVACY_PARENT[scope]) : false));

/** Render `••••` when balance hiding is on, otherwise pass through. */
export const maskAmount = (display: string, hide: boolean) => (hide ? '••••' : display);
