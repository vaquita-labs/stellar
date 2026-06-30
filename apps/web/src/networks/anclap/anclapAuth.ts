'use client';

import { create } from 'zustand';

/**
 * JWT SEP-10 de Anclap compartido en toda la app. Antes vivía en el estado
 * local de cada modal, así que el historial sólo aparecía en el modal donde se
 * había autenticado. Al centralizarlo, cualquier flujo (send u receive) que
 * obtenga el JWT lo deja disponible para ambos historiales.
 */
interface AnclapAuthState {
  jwt: string | null;
  setJwt: (jwt: string | null) => void;
  clearJwt: () => void;
}

export const useAnclapAuthStore = create<AnclapAuthState>((set) => ({
  jwt: null,
  setJwt: (jwt) => set({ jwt }),
  clearJwt: () => set({ jwt: null }),
}));
