'use client';

import { useSyncExternalStore } from 'react';

// Chrome/Edge/Brave fire `beforeinstallprompt` ONCE, shortly after load. It must
// be captured at module scope (this file is imported from Providers) — a
// listener registered when the settings screen mounts would already have missed
// it and the install button would never appear.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const subscribers = new Set<() => void>();

const notify = () => subscribers.forEach((cb) => cb());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress Chrome's mini-infobar; we prompt from our own button
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

const subscribe = (cb: () => void) => {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
};

// Snapshot must be referentially stable, so encode state as a primitive.
const getSnapshot = () => (installed ? 'installed' : deferredPrompt ? 'installable' : 'idle');
const getServerSnapshot = () => 'idle';

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari legacy flag
    (window.navigator as { standalone?: boolean }).standalone === true);

const isIOS = () =>
  typeof window !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    // iPadOS reports itself as Mac but has touch
    (window.navigator.userAgent.includes('Mac') && 'ontouchend' in document));

const isMobile = () =>
  typeof window !== 'undefined' &&
  (isIOS() || /android|mobile|iphone|ipad|ipod/i.test(window.navigator.userAgent));

export function useInstallApp() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    const evt = deferredPrompt;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    // The event is single-use: once prompted it can't be reused, regardless of outcome.
    deferredPrompt = null;
    notify();
    return outcome;
  };

  const standalone = isStandalone();
  return {
    /** Running as an installed app (home-screen shortcut) right now. */
    isStandalone: standalone,
    /** Native one-click install prompt is available (Chrome/Edge/Brave). */
    canInstall: state === 'installable' && !standalone,
    /** Installed during this session (or already standalone). */
    isInstalled: state === 'installed' || standalone,
    /** iOS has no install API — show manual Add-to-Home-Screen instructions. */
    isIOS: isIOS(),
    /** Phone/tablet — where a home-screen shortcut actually makes sense. */
    isMobile: isMobile(),
    promptInstall,
  };
}
