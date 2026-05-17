import { create } from 'zustand';

/**
 * Tracks whether `PollarClient.ready()` has resolved at least once.
 *
 * The PollarClient does its initial session restore asynchronously (read DPoP
 * key, validate refresh token, possibly hit /auth/refresh). Until that finishes
 * we don't actually know whether the user is logged in or not — `isAuthenticated`
 * starts false and only flips to true after restore succeeds. The auth gate in
 * `Providers.tsx` reads from the Zustand wallet store and would otherwise bounce
 * the user to /login during this window, so we gate it on this flag instead.
 *
 * `PollarBridge` flips `ready` to `true` once and never resets it — restore
 * happens exactly once per PollarClient instance.
 */
export const usePollarReadyStore = create<{
  ready: boolean;
  setReady: (ready: boolean) => void;
}>((set) => ({
  ready: false,
  setReady: (ready) => set({ ready }),
}));