import { describe, expect, it, vi } from 'vitest';
import {
  isWalletRecoveryRequired,
  WalletCreateFailedError,
  WalletNotReadyError,
  WalletRecoveryRequiredError,
  waitForWalletReady,
  type WalletProvisioning,
  type WalletReadyClient,
} from './walletReady';

function clientThat(replay: WalletProvisioning | null, later?: () => void): WalletReadyClient & { emit: (value: WalletProvisioning) => void; stopped: () => boolean } {
  let emit: (value: WalletProvisioning) => void = () => {};
  let stopped = false;
  return {
    onWalletStateChange(cb) {
      emit = cb;
      if (replay) cb(replay);
      later?.();
      return () => {
        stopped = true;
      };
    },
    emit: (value) => emit(value),
    stopped: () => stopped,
  };
}

describe('isWalletRecoveryRequired', () => {
  it('reconoce el código de una billetera sin método de recuperación', () => {
    expect(isWalletRecoveryRequired(new WalletRecoveryRequiredError())).toBe(true);
    expect(isWalletRecoveryRequired({ code: 'SDK_WALLET_RECOVERY_REQUIRED' })).toBe(true);
    expect(isWalletRecoveryRequired('Authentication required. — SDK_WALLET_RECOVERY_REQUIRED')).toBe(true);
    expect(isWalletRecoveryRequired('The nickname is already in use.')).toBe(false);
  });
});

describe('waitForWalletReady', () => {
  it('resuelve de inmediato cuando la cuenta ya está lista', async () => {
    const client = clientThat('READY');
    await waitForWalletReady(client, 50);
    await Promise.resolve();
    expect(client.stopped()).toBe(true);
  });

  it('espera mientras la cuenta se está creando y sigue cuando queda lista', async () => {
    const client = clientThat('CREATING');
    const pending = waitForWalletReady(client, 1_000);
    client.emit('READY');
    await pending;
  });

  it('no trata NONE como una cuenta que ya puede firmar', async () => {
    const client = clientThat('NONE');
    const pending = waitForWalletReady(client, 1_000);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    client.emit('READY');
    await pending;
  });

  it('falla si la creación de la cuenta falla', async () => {
    const client = clientThat('FAILED');
    await expect(waitForWalletReady(client, 50)).rejects.toBeInstanceOf(WalletCreateFailedError);
  });

  it('vuelve a preguntar el estado y sigue cuando esa lectura lo deja listo', async () => {
    vi.useFakeTimers();
    const client = clientThat('CREATING');
    const refresh = vi.fn(async () => {
      client.emit('READY');
    });
    const pending = waitForWalletReady(client, 10_000, { refresh, refreshEveryMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(refresh).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('falla si la cuenta no queda lista a tiempo', async () => {
    vi.useFakeTimers();
    const client = clientThat('CREATING');
    const pending = waitForWalletReady(client, 90);
    const assertion = expect(pending).rejects.toBeInstanceOf(WalletNotReadyError);
    await vi.advanceTimersByTimeAsync(90);
    await assertion;
    vi.useRealTimers();
  });
});
