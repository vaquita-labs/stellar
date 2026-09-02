import { describe, expect, it } from 'vitest';
import {
  isInstallPromptEnabled,
  isPassiveVaultEnabled,
  isPostHogEnabled,
  isSessionReplayEnabled,
  posthogHost,
} from './featureFlags';

describe('isPassiveVaultEnabled', () => {
  it('is off by default when the env flag is unset (dark launch)', () => {
    // vitest.config.ts intentionally leaves NEXT_PUBLIC_PASSIVE_VAULT_ENABLED unset.
    expect(isPassiveVaultEnabled()).toBe(false);
  });
});

describe('isInstallPromptEnabled', () => {
  it('is off when the env flag is unset, so the install screen never blocks', () => {
    // vitest.config.ts intentionally leaves NEXT_PUBLIC_INSTALL_PROMPT_ENABLED unset.
    expect(isInstallPromptEnabled()).toBe(false);
  });
});

describe('isPostHogEnabled', () => {
  // Éste es el estado real de un entorno recién desplegado cuyo panel de
  // Dokploy todavía no se llenó, y el modo de falla más probable: si acá diera
  // `true`, `posthog.init(undefined)` arrancaría la librería contra un proyecto
  // que no existe. vitest.config.ts deja las dos variables sin setear.
  it('is off when neither the flag nor the key is set', () => {
    expect(isPostHogEnabled()).toBe(false);
  });
});

describe('isSessionReplayEnabled', () => {
  // Se graba la pantalla del usuario, con su saldo y su dirección: el default
  // tiene que ser "no" y quedarse en "no" hasta que /privacy lo diga.
  it('is off when the env flag is unset', () => {
    expect(isSessionReplayEnabled()).toBe(false);
  });
});

describe('posthogHost', () => {
  // Sin override apunta al rewrite del propio dominio: mandar los eventos
  // directo a i.posthog.com es lo que los bloqueadores cortan.
  it('defaults to the same-origin proxy path', () => {
    expect(posthogHost()).toBe('/ingest');
  });
});
